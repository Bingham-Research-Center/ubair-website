import 'dotenv/config';
import express from 'express';
import path from 'path';
import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';
import { createServer } from 'http';

// JRL - this is the data route
import dataUploadRoutes from './routes/dataUpload.js';
import roadWeatherRoutes, { setRoadWeatherService } from './routes/roadWeather.js';
import trafficEventsRoutes, { setTrafficEventsService } from './routes/trafficEvents.js';
import synopticAPIRoutes from './routes/synopticAPI.js';
import fireWeatherRoutes from './routes/fireWeather.js';
import fireRestrictionsRoutes from './routes/fireRestrictions.js';
import monitoringRoutes from './routes/monitoring.js';
import BackgroundRefreshService from './backgroundRefresh.js';
import analyticsMiddleware, { getAnalyticsStats, handleEngagementBeacon } from './middleware/analytics.js';
import { getPipelineStats } from './middleware/pipelineAnalytics.js';
import { getMonitor } from './monitoring/dataMonitor.js';
import ReportEmailService from './reportEmailService.js';

const app = express();
const PORT = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize background refresh service (includes camera analysis scheduler)
const backgroundRefresh = new BackgroundRefreshService();
const reportEmailService = new ReportEmailService({
    getStatusReport: () => getMonitor().getStatusReport(),
    getBackgroundStats: () => backgroundRefresh.getStats(),
    getCameraStats: () => backgroundRefresh.cameraAnalysisScheduler.getStats()
});

// Share service instances with routes so they use the background refresh's
// shared cache and rate limiter, rather than creating their own.
setRoadWeatherService(backgroundRefresh.roadWeatherService);
setTrafficEventsService(backgroundRefresh.trafficEventsService);

// Only parse JSON for application/json content-type (skip multipart/form-data uploads).
//
// `limit` is stated explicitly at body-parser's own default rather than left implicit. Data
// uploads are multipart and go through multer (10 MB ceiling), so they never touch this
// parser; every JSON body the app legitimately receives is small. Leaving the limit invisible
// cost real time on 2026-08-25, when a 1.5 MB JSON probe of the upload path returned 500 and
// looked like a server fault instead of a body-size rejection.
app.use(express.json({ type: 'application/json', limit: '100kb' }));

// Analytics middleware (tracks page visits anonymously)
app.use(analyticsMiddleware);

// Routes in dataUpload.js will be prefixed with ...
app.use('/api', dataUploadRoutes);
app.use('/api', roadWeatherRoutes);
app.use('/api', trafficEventsRoutes);
app.use('/api', synopticAPIRoutes);
app.use('/api', fireWeatherRoutes);
app.use('/api', fireRestrictionsRoutes);
// Pipeline freshness/health for CHPC operators verifying their cron jobs.
app.use('/api', monitoringRoutes);
app.use('/api/static', express.static(path.join(__dirname, '../public/api/static')));

// Analytics endpoints
app.get('/api/analytics/stats', getAnalyticsStats);
app.get('/api/analytics/pipeline', getPipelineStats);
// Unauthenticated by necessity (called from every visitor's browser). Cap the body hard —
// the handler rate-limits per IP and validates every field, but there is no reason to parse
// more than a few hundred bytes here.
app.post('/api/analytics/engagement', express.json({ limit: '2kb' }), handleEngagementBeacon);

// Single static files middleware with all headers
app.use('/public', express.static('public', {
    setHeaders: (res, path) => {
        if (path.endsWith('.js')) {
            res.setHeader('Content-Type', 'application/javascript');
            res.setHeader('Cache-Control', 'no-cache');
        }
    }
}));

// HTML Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../views/index.html'));
});

app.get('/live_aq', (req, res) => {
    res.sendFile(path.join(__dirname, '../views/live_aq.html'));
});

app.get('/forecast_outlooks', (req, res) => {
    res.sendFile(path.join(__dirname, '../views/forecast_outlooks.html'));
});

app.get('/forecast_air_quality', (req, res) => {
    res.sendFile(path.join(__dirname, '../views/forecast_air_quality.html'));
});

app.get('/forecast_weather', (req, res) => {
    res.sendFile(path.join(__dirname, '../views/forecast_weather.html'));
});

app.get('/sports', (req, res) => {
    res.sendFile(path.join(__dirname, '../views/sports.html'));
});

app.get('/agriculture', (req, res) => {
    res.sendFile(path.join(__dirname, '../views/agriculture.html'));
});

app.get('/roads', (req, res) => {
    res.sendFile(path.join(__dirname, '../views/roads.html'));
});

app.get('/aviation', (req, res) => {
    res.sendFile(path.join(__dirname, '../views/aviation.html'));
});

app.get('/water', (req, res) => {
    res.sendFile(path.join(__dirname, '../views/water.html'));
});

app.get('/fire', (req, res) => {
    res.sendFile(path.join(__dirname, '../views/fire.html'));
});


app.get('/webcam-viewer', (req, res) => {
    res.sendFile(path.join(__dirname, '../views/webcam-viewer.html'));
});

app.get('/kiosk', (req, res) => {
    res.sendFile(path.join(__dirname, '../views/kiosk.html'));
});

app.get('/portrait-kiosk', (req, res) => {
    res.sendFile(path.join(__dirname, '../views/kiosk-portrait.html'));
});

app.get('/kiosk-portrait', (req, res) => {
    res.sendFile(path.join(__dirname, '../views/kiosk-portrait.html'));
});

app.get('/test-viz', (req, res) => {
    res.sendFile(path.join(__dirname, '../views/test-viz.html'));
});

app.get('/about/:page', (req, res) => {
    res.sendFile(path.join(__dirname, `../views/about/${req.params.page}.html`));
});

// NOTE: The legacy /api/filelist.json route was removed in 2026-04 — it
// served a deploy-time fossil (./public/api/static/filelist.json) that
// nothing ever regenerated, so it pinned operators to stale snapshots
// during diagnostics. Use /api/filelist/:dataType below (dynamic
// fs.readdir on the per-type directory) instead.

app.get('/api/filelist/:dataType', async (req, res) => {
    const { dataType } = req.params;
    try {
        const dataDir = path.join(__dirname, '../public/api/static', dataType);
        const files = await fs.readdir(dataDir);
        const allowedFiles = files.filter(f => f.endsWith('.json') || f.endsWith('.md') || f.endsWith('.png') || f.endsWith('.pdf'));
        res.json(allowedFiles);
    } catch (error) {
        // A directory that was never created means "this producer has never uploaded here",
        // which is a 404, not a server fault. Collapsing both into 500 cost real diagnostic
        // time on linode-dev, where timeseries/llm_outlooks/images 500ed and read as broken
        // code rather than an idle dataType. Keep the two distinguishable.
        if (error.code === 'ENOENT') {
            return res.status(404).json({
                error: `No uploads received yet for ${dataType}`,
                dataType,
                reason: 'directory-missing'
            });
        }
        console.error(`filelist failed for ${dataType}:`, error);
        res.status(500).json({ error: `Failed to list files for ${dataType}` });
    }
});

app.get('/api/live-observations', async (req, res) => {
    try {
        // Get the latest observation file from the observations subdirectory
        const staticDir = path.join(__dirname, '../public/api/static');
        const observationsDir = path.join(staticDir, 'observations');
        const fileListPath = path.join(observationsDir, 'filelist.json');

        if (!await fs.access(fileListPath).then(() => true).catch(() => false)) {
            return res.status(404).json({ error: 'No data files available' });
        }

        const fileList = JSON.parse(await fs.readFile(fileListPath, 'utf8'));
        const obsFiles = fileList.filter(f => f.includes('map_obs_') && !f.includes('meta'));

        if (obsFiles.length === 0) {
            return res.status(404).json({ error: 'No observation files found' });
        }

        // Get the latest file (assuming filename contains timestamp)
        const latestFile = obsFiles.sort().reverse()[0];
        const latestFilePath = path.join(observationsDir, latestFile);
        
        const data = await fs.readFile(latestFilePath, 'utf8');
        const parsedData = JSON.parse(data);
        
        // Add metadata about the file
        res.json({
            timestamp: new Date().toISOString(),
            filename: latestFile,
            totalObservations: parsedData.length,
            data: parsedData
        });
        
    } catch (error) {
        console.error('Live observations error:', error);
        res.status(500).json({ error: 'Failed to fetch live observations' });
    }
});

// Create HTTP server
const server = createServer(app);

server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log('Data upload API available at /api/data/upload/:dataType');
    console.log('');

    // Skip background jobs for preview instances (feature-branch worktrees)
    if (process.env.PREVIEW_MODE === 'true') {
        console.log('PREVIEW_MODE=true — background refresh and report emails disabled.');
    } else {
        backgroundRefresh.start();
        reportEmailService.start();
    }
});

let isShuttingDown = false;
const shutdown = async (signal, options = {}) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log(`\nReceived ${signal}. Shutting down services...`);

    const shutdownContext = {
        signal,
        reason: options.reason || 'graceful_shutdown',
        pid: process.pid,
        uptimeSeconds: Math.round(process.uptime()),
        exitCode: options.exitCode ?? 0
    };

    if (options.error) {
        shutdownContext.error = options.error.stack || options.error.message || String(options.error);
    }

    try {
        await Promise.race([
            reportEmailService.sendShutdownNotification(shutdownContext),
            new Promise((resolve) => setTimeout(resolve, 4000))
        ]);
    } catch (error) {
        console.error(`Failed to send shutdown report email: ${error.message}`);
    }

    reportEmailService.stop();
    backgroundRefresh.stop();

    server.close(() => {
        console.log('Server shutdown complete');
        process.exit(options.exitCode ?? 0);
    });

    setTimeout(() => {
        console.error('Forced shutdown after timeout');
        process.exit(1);
    }, 10000).unref();
};

process.on('SIGINT', () => {
    void shutdown('SIGINT', { reason: 'interrupt_signal', exitCode: 0 });
});

process.on('SIGTERM', () => {
    void shutdown('SIGTERM', { reason: 'terminate_signal', exitCode: 0 });
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
    void shutdown('uncaughtException', {
        reason: 'uncaught_exception',
        error,
        exitCode: 1
    });
});

process.on('unhandledRejection', (reason) => {
    const rejectionError = reason instanceof Error ? reason : new Error(String(reason));
    console.error('Unhandled rejection:', rejectionError);
    void shutdown('unhandledRejection', {
        reason: 'unhandled_rejection',
        error: rejectionError,
        exitCode: 1
    });
});

// Error handling middleware.
//
// body-parser raises typed errors for things the *client* got wrong — an oversized body,
// malformed JSON. Answering those with 500 plus a stack dump is wrong twice: the caller is
// told the server broke when in fact their request was rejected, and pm2's error log fills
// with stack traces for routine client noise. Keep 500 for genuine faults only.
app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);

    if (err?.type === 'entity.too.large') {
        return res.status(413).json({
            error: 'Request body too large',
            limit: err.limit,
            length: err.length,
            hint: 'Data uploads use multipart/form-data on /api/upload/:dataType, not a JSON body.'
        });
    }

    if (err?.type === 'entity.parse.failed' || (err instanceof SyntaxError && 'body' in err)) {
        return res.status(400).json({ error: 'Malformed JSON body' });
    }

    console.error(err.stack);
    res.status(500).send('Something broke!');
});

async function checkDirectoryStructure() {
    const dirs = [
        '../../public/css',
        '../../public/api/static',
        '../../public/api/static/outlooks',
        '../../public/api/static/observations',
        '../../public/api/static/metadata',
        '../../public/content',
        '../../public/images',
        '../../public/js',
        '../../public/partials',
    ];

    for (const dir of dirs) {
        try {
            await fs.access(path.join(__dirname, dir));
        } catch {
            await fs.mkdir(path.join(__dirname, dir), { recursive: true });
        }
    }
}

// Start server
async function generateOutlooksList() {
    try {
        const directory = path.join(__dirname, '../public/api/static/outlooks');
        const files = await fs.readdir(directory);

        const outlooks = files
            .filter(file => /^outlook_\d{8}_\d{4}\.md$/.test(file))  // Only outlook_YYYYMMDD_HHMM.md
            .map(filename => {
                // Extract date from filename (format: outlook_YYYYMMDD_HHMM.md)
                const match = filename.match(/outlook_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})\.md/);
                const [_, year, month, day, hour, minute] = match;
                const date = new Date(`${year}-${month}-${day}T${hour}:${minute}:00`).toISOString();
                const formattedDate = new Date(date).toLocaleString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true
                });
                return { filename, date, formattedDate };
            })
            .sort((a, b) => new Date(b.date) - new Date(a.date));

        // Write to outlooks_list.json (not file_list.json)
        await fs.writeFile(
            path.join(directory, 'outlooks_list.json'),
            JSON.stringify(outlooks, null, 2)
        );

        return outlooks;
    } catch (error) {
        console.error('Error generating outlooks list:', error);
        return [];
    }
}

// Update the server startup and intervals
checkDirectoryStructure()
    .then(() => {
        generateOutlooksList(); // Initial generation
        // Refresh every 5 minutes (300000ms) instead of 1 hour
        setInterval(generateOutlooksList, 300000);
    })
    .catch(err => {
        console.error('Failed to verify directory structure:', err);
        process.exit(1);
    });
