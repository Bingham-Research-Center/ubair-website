import express from 'express';
import UDOTDataService from '../udotDataService.js';

const router = express.Router();
const udotService = new UDOTDataService();

/**
 * UDOT Map Data API Routes
 * GeoJSON endpoints for Azure Maps visualization
 */

// Get UDOT cameras as GeoJSON
router.get('/udot/cameras', async (req, res) => {
    try {
        const { region } = req.query;
        const geojson = await udotService.fetchCameras(region);

        res.json({
            success: true,
            ...geojson
        });
    } catch (error) {
        console.error('Error fetching UDOT cameras:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch camera data',
            message: error.message
        });
    }
});

// Get UDOT weather stations as GeoJSON
router.get('/udot/weather-stations', async (req, res) => {
    try {
        const { region } = req.query;
        const geojson = await udotService.fetchWeatherStations(region);

        res.json({
            success: true,
            ...geojson
        });
    } catch (error) {
        console.error('Error fetching UDOT weather stations:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch weather station data',
            message: error.message
        });
    }
});

// Get UDOT road conditions as GeoJSON
router.get('/udot/road-conditions', async (req, res) => {
    try {
        const { region } = req.query;
        const geojson = await udotService.fetchRoadConditions(region);

        res.json({
            success: true,
            ...geojson
        });
    } catch (error) {
        console.error('Error fetching UDOT road conditions:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch road condition data',
            message: error.message
        });
    }
});

// Get all UDOT map data (cameras, weather stations, road conditions)
router.get('/udot/map-data/all', async (req, res) => {
    try {
        const { region } = req.query;
        const allData = await udotService.fetchAllMapData(region);

        res.json({
            success: true,
            data: allData
        });
    } catch (error) {
        console.error('Error fetching all UDOT map data:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch complete map data',
            message: error.message
        });
    }
});

// Get Provo Canyon specific data
router.get('/udot/map-data/provo-canyon', async (req, res) => {
    try {
        const provoCanyonData = await udotService.getProvoCanyonData();

        res.json({
            success: true,
            data: provoCanyonData,
            bounds: {
                description: 'US-189 Provo Canyon Corridor',
                north: 40.6,
                south: 40.2,
                east: -111.3,
                west: -111.7
            }
        });
    } catch (error) {
        console.error('Error fetching Provo Canyon data:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch Provo Canyon data',
            message: error.message
        });
    }
});

// Health check endpoint
router.get('/udot/health', (req, res) => {
    res.json({
        success: true,
        service: 'UDOT Map Data API',
        version: '1.0.0',
        endpoints: {
            cameras: '/api/udot/cameras',
            weatherStations: '/api/udot/weather-stations',
            roadConditions: '/api/udot/road-conditions',
            allData: '/api/udot/map-data/all',
            provoCanyon: '/api/udot/map-data/provo-canyon'
        },
        rateLimiting: {
            maxCallsPerMinute: 10,
            enforcedBy: 'UDOTDataService'
        }
    });
});

export default router;
