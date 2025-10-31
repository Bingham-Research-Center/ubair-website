import 'dotenv/config';
import express from 'express';
import path from 'path';
import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';
import { createServer } from 'http';

// JRL - this is the data route
import dataUploadRoutes from './routes/dataUpload.js';
import roadWeatherRoutes from './routes/roadWeather.js';
import trafficEventsRoutes from './routes/trafficEvents.js';
import synopticAPIRoutes from './routes/synopticAPI.js';
import BackgroundRefreshService from './backgroundRefresh.js';

const app = express();
const PORT = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.json());

// Routes in dataUpload.js will be prefixed with ...
app.use('/api', dataUploadRoutes);
app.use('/api', roadWeatherRoutes);
app.use('/api', trafficEventsRoutes);
app.use('/api', synopticAPIRoutes);
app.use('/api/static', express.static(path.join(__dirname, '../public/api/static')));

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

app.get('/test-viz', (req, res) => {
    res.sendFile(path.join(__dirname, '../views/test-viz.html'));
});

app.get('/about/:page', (req, res) => {
    res.sendFile(path.join(__dirname, `../views/about/${req.params.page}.html`));
});

app.get('/api/filelist.json', async (req, res) => {
    try {
        const data = await fs.readFile('./public/api/static/filelist.json');
        res.json(JSON.parse(data));
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch file list' });
    }
});

app.get('/api/filelist/:dataType', async (req, res) => {
    try {
        const { dataType } = req.params;
        const dataDir = path.join(__dirname, '../public/api/static', dataType);
        const files = await fs.readdir(dataDir);
        const jsonFiles = files.filter(f => f.endsWith('.json') || f.endsWith('.md'));
        res.json(jsonFiles);
    } catch (error) {
        res.status(500).json({ error: `Failed to list files for ${req.params.dataType}` });
    }
});

app.get('/api/live-observations', async (req, res) => {
    try {
        // Get the latest observation file from the static directory
        const staticDir = path.join(__dirname, '../public/api/static');
        const fileListPath = path.join(staticDir, 'filelist.json');
        
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
        const latestFilePath = path.join(staticDir, latestFile);
        
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


// Initialize background refresh service
const backgroundRefresh = new BackgroundRefreshService();

server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log('Data upload API available at /api/data/upload/:dataType');
    console.log('');

    // Start background UDOT API refresh
    backgroundRefresh.start();
});

// Error handling middleware
app.use((err, req, res, next) => {
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
            .filter(file => file.endsWith('.md') && file !== 'template.md')
            .map(filename => {
                // Extract date from filename (format: outlook_YYYYMMDD_HHMM.md)
                const match = filename.match(/outlook_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})\.md/);
                if (match) {
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
                }
                return { filename, date: new Date().toISOString(), formattedDate: 'Unknown date' };
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