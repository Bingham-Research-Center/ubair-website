import express from 'express';
import RoadWeatherService from '../roadWeatherService.js';

const router = express.Router();
const roadWeatherService = new RoadWeatherService();

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

router.get('/road-weather/conditions', async (req, res) => {
    try {
        const conditions = await roadWeatherService.fetchUDOTRoadConditions();
        res.json(conditions);
    } catch (error) {
        console.error('Error fetching road conditions:', error);
        res.status(500).json({ 
            error: 'Failed to fetch road conditions',
            message: error.message 
        });
    }
});

// Keep the old endpoint for backward compatibility
router.get('/road-weather/stations', async (req, res) => {
    try {
        const conditions = await roadWeatherService.fetchUDOTRoadConditions();
        res.json(conditions);
    } catch (error) {
        console.error('Error fetching road conditions:', error);
        res.status(500).json({ 
            error: 'Failed to fetch road conditions',
            message: error.message 
        });
    }
});

router.get('/road-weather/nws/:lat/:lon', async (req, res) => {
    try {
        const { lat, lon } = req.params;
        const forecast = await roadWeatherService.fetchNWSData(lat, lon);
        res.json(forecast);
    } catch (error) {
        console.error('Error fetching NWS data:', error);
        res.status(500).json({ 
            error: 'Failed to fetch NWS forecast',
            message: error.message 
        });
    }
});

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

// Debug endpoint to check coordinate accuracy
router.get('/road-weather/debug/coordinates', async (req, res) => {
    try {
        const data = await roadWeatherService.getCompleteRoadData();
        
        const debugData = data.segments.map(segment => ({
            name: segment.name,
            route: segment.route,
            type: segment.type,
            coordCount: segment.coordinates.length,
            firstCoord: segment.coordinates[0],
            lastCoord: segment.coordinates[segment.coordinates.length - 1],
            boundingBox: {
                north: Math.max(...segment.coordinates.map(c => c[0])),
                south: Math.min(...segment.coordinates.map(c => c[0])),
                east: Math.max(...segment.coordinates.map(c => c[1])),
                west: Math.min(...segment.coordinates.map(c => c[1]))
            }
        }));

        res.json({
            totalRoads: debugData.length,
            roads: debugData,
            basinBounds: {
                north: 40.8,
                south: 39.7,
                east: -108.8,
                west: -110.7
            }
        });
    } catch (error) {
        console.error('Error in debug coordinates:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;