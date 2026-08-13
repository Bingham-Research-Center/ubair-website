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

await fs.mkdir(LOG_DIR, { recursive: true });

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

async function loadSummary(today) {
    try {
        const data = await fs.readFile(PIPELINE_SUMMARY, 'utf-8');
        const existing = JSON.parse(data);
        if (existing.date === today) return existing;
    } catch { /* missing or corrupt */ }
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
export async function logPipelineEvent({ dataType, filename, size, success, error }) {
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

    try {
        await fs.writeFile(PIPELINE_SUMMARY, JSON.stringify(summary, null, 2));
    } catch (err) {
        console.error('[Pipeline] Failed to update summary:', err);
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
