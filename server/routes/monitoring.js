/**
 * Monitoring API Routes
 *
 * Provides endpoints for checking pipeline health and data freshness
 */

import express from 'express';
import { getMonitor } from '../monitoring/dataMonitor.js';

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
 * GET /api/monitoring/uploads
 * Upload statistics
 */
router.get('/monitoring/uploads', (req, res) => {
    try {
        const monitor = getMonitor();
        const stats = monitor.getUploadStats();
        res.json({
            timestamp: new Date().toISOString(),
            stats
        });
    } catch (error) {
        res.status(500).json({
            error: 'Failed to get upload stats',
            message: error.message
        });
    }
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
 * Clear all alerts
 */
router.post('/monitoring/alerts/clear', (req, res) => {
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
