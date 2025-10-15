import express from 'express';
import RoadWeatherService from '../roadWeatherService.js';

const router = express.Router();
const roadWeatherService = new RoadWeatherService();

router.get('/road-weather', async (req, res) => {
    try {
        const data = await roadWeatherService.getCompleteRoadData();
        // Cache for 60 seconds to reduce server load (matches backend cache TTL)
        res.setHeader('Cache-Control', 'public, max-age=60');
        res.json(data);
    } catch (error) {
        console.error('Error in /road-weather endpoint:', error);
        res.status(500).json({
            error: 'Failed to fetch road weather data',
            message: error.message
        });
    }
});

router.get('/road-weather/openmeteo/:lat/:lon', async (req, res) => {
    try {
        const { lat, lon } = req.params;
        const weather = await roadWeatherService.fetchOpenMeteoData(lat, lon);
        res.setHeader('Cache-Control', 'public, max-age=60');
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
        res.setHeader('Cache-Control', 'public, max-age=60');
        res.json(stations);
    } catch (error) {
        console.error('Error fetching weather stations:', error);
        res.status(500).json({
            error: 'Failed to fetch weather stations',
            message: error.message
        });
    }
});

router.get('/road-weather/snow-plows', async (req, res) => {
    try {
        const plows = await roadWeatherService.fetchSnowPlows();
        // Cache for 30 seconds (snow plows update frequently)
        res.setHeader('Cache-Control', 'public, max-age=30');
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
        res.setHeader('Cache-Control', 'public, max-age=60');
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
        // Cache for 1 hour (rest areas change rarely)
        res.setHeader('Cache-Control', 'public, max-age=3600');
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
        res.setHeader('Cache-Control', 'public, max-age=60');
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

// Removed debug endpoint - not needed in production

export default router;