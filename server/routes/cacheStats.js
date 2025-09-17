import express from 'express';
import { getCacheStats, clearAllCaches } from '../utils/apiOptimizer.js';

const router = express.Router();

// Get comprehensive cache statistics
router.get('/cache-stats', async (req, res) => {
    try {
        const stats = getCacheStats();
        res.json({
            success: true,
            timestamp: new Date().toISOString(),
            stats: stats
        });
    } catch (error) {
        console.error('Error fetching cache stats:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch cache statistics',
            message: error.message
        });
    }
});

// Clear all caches (admin endpoint)
router.post('/cache-clear', async (req, res) => {
    try {
        await clearAllCaches();
        res.json({
            success: true,
            message: 'All caches cleared successfully',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error clearing caches:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to clear caches',
            message: error.message
        });
    }
});

// API usage health check
router.get('/api-health', async (req, res) => {
    try {
        const stats = getCacheStats();
        const apiQuota = stats.apiQuota;
        
        // Calculate API usage health
        const hourlyQuotaHealth = {
            status: apiQuota.hourlyCallCount < 50 ? 'healthy' : 
                   apiQuota.hourlyCallCount < 100 ? 'warning' : 'critical',
            usage: apiQuota.hourlyCallCount,
            threshold: {
                warning: 50,
                critical: 100
            }
        };
        
        const dailyQuotaHealth = {
            status: apiQuota.dailyCallCount < 500 ? 'healthy' : 
                   apiQuota.dailyCallCount < 1000 ? 'warning' : 'critical',
            usage: apiQuota.dailyCallCount,
            threshold: {
                warning: 500,
                critical: 1000
            }
        };
        
        const cacheEfficiency = {
            memoryHitRate: stats.memory.hits / (stats.memory.hits + stats.memory.misses),
            memoryCacheKeys: stats.memory.keys,
            pendingRequests: stats.pendingRequests
        };
        
        res.json({
            success: true,
            timestamp: new Date().toISOString(),
            health: {
                hourlyQuota: hourlyQuotaHealth,
                dailyQuota: dailyQuotaHealth,
                cache: cacheEfficiency,
                overall: (hourlyQuotaHealth.status === 'healthy' && 
                         dailyQuotaHealth.status === 'healthy') ? 'healthy' : 'degraded'
            }
        });
    } catch (error) {
        console.error('Error checking API health:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to check API health',
            message: error.message
        });
    }
});

export default router;