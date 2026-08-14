/**
 * Data pipeline analytics — tracks CHPC upload health separately from page analytics.
 *
 * Logs to: /logs/analytics/pipeline.log
 * Summary: /logs/analytics/pipeline_summary.json
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOG_DIR = path.join(__dirname, '../../logs/analytics');
const PIPELINE_LOG = path.join(LOG_DIR, 'pipeline.log');
const PIPELINE_SUMMARY = path.join(LOG_DIR, 'pipeline_summary.json');

// Top-level await: an unguarded throw here fails the module import and takes the whole
// server down at startup. Log-directory creation is not worth that.
await fs.mkdir(LOG_DIR, { recursive: true }).catch(err =>
    console.error('[Pipeline] Could not create log dir:', err.message));

async function rotateIfNeeded(filepath) {
    try {
        const stats = await fs.stat(filepath);
        if (stats.size / (1024 * 1024) > 10) {
            const ts = new Date().toISOString().replace(/[:.]/g, '-');
            const ext = path.extname(filepath);
            const base = path.basename(filepath, ext);
            await fs.rename(filepath, path.join(LOG_DIR, `${base}_${ts}${ext}`));
        }
    } catch { /* file doesn't exist yet */ }
}

// Same read-modify-write hazard as page analytics: concurrent uploads can interleave, and a
// non-atomic write can be read half-finished, which silently resets the day's counters.
// Serialise the cycle and write via temp-file + rename.
let summaryQueue = Promise.resolve();

function withSummaryLock(fn) {
    const run = summaryQueue.then(fn, fn);
    summaryQueue = run.then(() => undefined, () => undefined);
    return run;
}

async function loadSummary(today) {
    try {
        const data = await fs.readFile(PIPELINE_SUMMARY, 'utf-8');
        const existing = JSON.parse(data);
        if (existing.date === today) {
            // Never trust the on-disk shape — a summary written by an older build is missing
            // whatever counters that build lacked, and every call site increments nested
            // fields. Same failure mode that crashed page analytics on 2026-08-13.
            const base = emptyPipelineSummary(today);
            return {
                ...base,
                ...existing,
                uploads: { ...base.uploads, ...(existing.uploads || {}) },
                byType: (existing.byType && typeof existing.byType === 'object' &&
                         !Array.isArray(existing.byType)) ? existing.byType : {},
                errors: Array.isArray(existing.errors) ? existing.errors : [],
                totalBytes: typeof existing.totalBytes === 'number' ? existing.totalBytes : 0,
                date: today,
            };
        }
    } catch (err) {
        if (err.code !== 'ENOENT') {
            console.error('[Pipeline] summary unreadable, starting fresh:', err.message);
        }
    }
    return emptyPipelineSummary(today);
}

function emptyPipelineSummary(today) {
    return {
        date: today,
        uploads: { total: 0, success: 0, failed: 0 },
        byType: {},
        totalBytes: 0,
        lastUpload: null,
        errors: [],
    };
}

/**
 * Log a data pipeline event (call after upload completes).
 */
// Called from the upload route. It must never throw and never reject: a rejection here is an
// unhandledRejection on the CHPC ingest path, which would terminate the process on every
// upload. Observability is strictly less important than staying up.
export async function logPipelineEvent(event) {
    try {
        await withSummaryLock(() => recordPipelineEvent(event));
    } catch (err) {
        console.error('[Pipeline] logPipelineEvent failed:', err.message);
    }
}

async function recordPipelineEvent({ dataType, filename, size, success, error }) {
    const now = new Date();
    const entry = {
        timestamp: now.toISOString(),
        type: 'upload',
        data_type: dataType,
        filename,
        size_bytes: size || 0,
        success: !!success,
        error: error || null,
    };

    try {
        await fs.appendFile(PIPELINE_LOG, JSON.stringify(entry) + '\n');
        await rotateIfNeeded(PIPELINE_LOG);
    } catch (err) {
        console.error('[Pipeline] Failed to write log:', err);
    }

    // Update daily summary
    const today = now.toISOString().split('T')[0];
    const summary = await loadSummary(today);

    summary.uploads.total++;
    if (success) {
        summary.uploads.success++;
    } else {
        summary.uploads.failed++;
        if (error) summary.errors.push({ time: entry.timestamp, error, dataType });
        // Keep only last 20 errors
        if (summary.errors.length > 20) summary.errors = summary.errors.slice(-20);
    }

    if (!summary.byType[dataType]) {
        summary.byType[dataType] = { count: 0, bytes: 0, lastFile: null, lastTime: null };
    }
    summary.byType[dataType].count++;
    summary.byType[dataType].bytes += entry.size_bytes;
    summary.byType[dataType].lastFile = filename;
    summary.byType[dataType].lastTime = entry.timestamp;

    summary.totalBytes += entry.size_bytes;
    summary.lastUpload = entry.timestamp;

    const tmp = `${PIPELINE_SUMMARY}.tmp`;
    try {
        await fs.writeFile(tmp, JSON.stringify(summary, null, 2));
        await fs.rename(tmp, PIPELINE_SUMMARY);
    } catch (err) {
        console.error('[Pipeline] Failed to update summary:', err.message);
        await fs.unlink(tmp).catch(() => {});
    }
}

/**
 * GET endpoint for pipeline health stats.
 */
export async function getPipelineStats(req, res) {
    try {
        const data = await fs.readFile(PIPELINE_SUMMARY, 'utf-8');
        res.json(JSON.parse(data));
    } catch {
        res.status(404).json({ error: 'No pipeline data available' });
    }
}
