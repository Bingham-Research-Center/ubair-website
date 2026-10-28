/**
 * Monitoring API Routes
 *
 * Provides endpoints for checking pipeline health and data freshness
 */

import express from 'express';
import { getMonitor } from '../monitoring/dataMonitor.js';
import { validateApiKey } from './dataUpload.js';
import { getRecentUploadAttempts, countUploadAttempts } from '../monitoring/uploadAttempts.js';

const router = express.Router();

/**
 * GET /api/monitoring/status
 * Comprehensive status report
 */
router.get('/monitoring/status', (req, res) => {
    try {
        const monitor = getMonitor();
        const report = monitor.getStatusReport();
        res.json(report);
    } catch (error) {
        res.status(500).json({
            error: 'Failed to generate status report',
            message: error.message
        });
    }
});

/**
 * GET /api/monitoring/freshness
 * Check data freshness only
 */
router.get('/monitoring/freshness', (req, res) => {
    try {
        const monitor = getMonitor();
        const freshness = monitor.checkDataFreshness();
        res.json({
            timestamp: new Date().toISOString(),
            freshness
        });
    } catch (error) {
        res.status(500).json({
            error: 'Failed to check data freshness',
            message: error.message
        });
    }
});

/**
 * GET /api/monitoring/uploads?limit=50
 * The most recent upload attempts (newest first), accepted and rejected alike, as the app
 * saw them: source IP, x-client-hostname, dataType, filename, status, one-phrase reason.
 *
 * API-key gated (same key the producer uploads with): it names CHPC hosts and addresses.
 * In-memory only — see server/monitoring/uploadAttempts.js. Replaces a parser of
 * /tmp/basinwx_upload.log, a file nothing wrote, which answered "Log file not found" on
 * both boxes from 2025 until 2026-09.
 */
router.get('/monitoring/uploads', validateApiKey, (req, res) => {
    const limit = Number.parseInt(req.query.limit, 10);
    res.json({
        timestamp: new Date().toISOString(),
        buffered: countUploadAttempts(),
        recent: getRecentUploadAttempts(Number.isFinite(limit) && limit > 0 ? limit : 50)
    });
});

/**
 * GET /api/monitoring/alerts
 * Recent alerts
 */
router.get('/monitoring/alerts', (req, res) => {
    try {
        const monitor = getMonitor();
        res.json({
            timestamp: new Date().toISOString(),
            alerts: monitor.stats.alerts
        });
    } catch (error) {
        res.status(500).json({
            error: 'Failed to get alerts',
            message: error.message
        });
    }
});

/**
 * POST /api/monitoring/alerts/clear
 * Clear all alerts. Mutates server state, so it requires the upload API key —
 * the GET endpoints above stay public for operators checking freshness.
 */
router.post('/monitoring/alerts/clear', validateApiKey, (req, res) => {
    try {
        const monitor = getMonitor();
        monitor.clearAlerts();
        res.json({
            success: true,
            message: 'Alerts cleared'
        });
    } catch (error) {
        res.status(500).json({
            error: 'Failed to clear alerts',
            message: error.message
        });
    }
});

export default router;
