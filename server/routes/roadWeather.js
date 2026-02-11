import express from 'express';
import RoadWeatherService from '../roadWeatherService.js';

const router = express.Router();
// Default instance for backwards compatibility
// Will be replaced by shared instance from server.js
let roadWeatherService = new RoadWeatherService();

// Allow setting the service instance (called from server.js)
export function setRoadWeatherService(service) {
    roadWeatherService = service;
}

router.get('/road-weather', async (req, res) => {
    try {
        const data = await roadWeatherService.getCompleteRoadData();
        res.json(data);
    } catch (error) {
        console.error('Error in /road-weather endpoint:', error);
        res.status(500).json({
            error: 'Failed to fetch road weather data',
            message: error.message
        });
    }
});

router.get('/road-weather/camera-scheduler-status', (req, res) => {
    try {
        const scheduler = roadWeatherService.cameraAnalysisScheduler;
        if (!scheduler) {
            return res.status(503).json({
                success: false,
                error: 'Camera analysis scheduler is not available'
            });
        }

        const stats = scheduler.getStats();

        res.json({
            success: true,
            timestamp: new Date().toISOString(),
            warmRestore: {
                restoredDetectionsCount: stats.warmRestore?.restoredDetectionsCount ?? 0,
                restoredSnapshotAgeMinutes: stats.warmRestore?.restoredSnapshotAgeMinutes ?? null,
                restoredFromDisk: stats.warmRestore?.restoredFromDisk ?? false
            },
            scheduler: stats
        });
    } catch (error) {
        console.error('Error fetching camera scheduler status:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch camera scheduler status',
            message: error.message
        });
    }
});

// Removed unused /road-weather/conditions endpoint

// Removed unused /road-weather/nws/:lat/:lon endpoint

router.get('/road-weather/openmeteo/:lat/:lon', async (req, res) => {
    try {
        const { lat, lon } = req.params;
        const weather = await roadWeatherService.fetchOpenMeteoData(lat, lon);
        res.json(weather);
    } catch (error) {
        console.error('Error fetching Open-Meteo data:', error);
        res.status(500).json({
            error: 'Failed to fetch Open-Meteo data',
            message: error.message
        });
    }
});

router.get('/road-weather/stations', async (req, res) => {
    try {
        const stations = await roadWeatherService.fetchUDOTWeatherStations();
        res.json(stations);
    } catch (error) {
        console.error('Error fetching weather stations:', error);
        res.status(500).json({
            error: 'Failed to fetch weather stations',
            message: error.message
        });
    }
});

// Removed unused /road-weather/camera-detections endpoint

router.get('/road-weather/snow-plows', async (req, res) => {
    try {
        const plows = await roadWeatherService.fetchSnowPlows();
        res.json({
            success: true,
            timestamp: new Date().toISOString(),
            totalPlows: plows.length,
            activePlows: plows.filter(p => p.isActive).length,
            plows: plows
        });
    } catch (error) {
        console.error('Error fetching snow plows:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch snow plow data',
            message: error.message
        });
    }
});

router.get('/road-weather/mountain-passes', async (req, res) => {
    try {
        const passes = await roadWeatherService.fetchMountainPasses();
        res.json({
            success: true,
            timestamp: new Date().toISOString(),
            totalPasses: passes.length,
            openPasses: passes.filter(p => p.status === 'open').length,
            closedPasses: passes.filter(p => p.status === 'closed').length,
            cautionPasses: passes.filter(p => ['caution', 'hazardous', 'windy'].includes(p.status)).length,
            passes: passes
        });
    } catch (error) {
        console.error('Error fetching mountain passes:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch mountain pass data',
            message: error.message
        });
    }
});

router.get('/road-weather/rest-areas', async (req, res) => {
    try {
        const restAreas = await roadWeatherService.fetchUDOTRestAreas();
        res.json({
            success: true,
            timestamp: new Date().toISOString(),
            totalRestAreas: restAreas.length,
            restAreas: restAreas
        });
    } catch (error) {
        console.error('Error fetching rest areas:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch rest areas data',
            message: error.message
        });
    }
});

router.get('/road-weather/digital-signs', async (req, res) => {
    try {
        const signs = await roadWeatherService.fetchUDOTDigitalSigns();
        res.json({
            success: true,
            timestamp: new Date().toISOString(),
            totalSigns: signs.length,
            constructionSigns: signs.filter(s => s.category === 'construction').length,
            incidentSigns: signs.filter(s => s.category === 'incident').length,
            weatherSigns: signs.filter(s => s.category === 'weather').length,
            closureSigns: signs.filter(s => s.category === 'closure').length,
            trafficSigns: signs.filter(s => s.category === 'traffic').length,
            advisorySigns: signs.filter(s => s.category === 'advisory').length,
            signs: signs
        });
    } catch (error) {
        console.error('Error fetching digital signs:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch digital signs data',
            message: error.message
        });
    }
});

export default router;
