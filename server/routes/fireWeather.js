import express from 'express';
import FireWeatherService from '../fireWeatherService.js';

const router = express.Router();
let fireWeatherService = new FireWeatherService();

export function setFireWeatherService(service) {
    fireWeatherService = service;
}

router.get('/fire-weather', async (req, res) => {
    try {
        const snapshot = await fireWeatherService.getBasinFireWeatherSnapshot();
        res.json(snapshot);
    } catch (error) {
        console.error('Error in /fire-weather endpoint:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to build fire weather snapshot',
            message: error.message
        });
    }
});

router.get('/fire-weather/alerts', async (req, res) => {
    try {
        const alerts = await fireWeatherService.fetchRedFlagAlerts();
        res.json({
            success: true,
            timestamp: new Date().toISOString(),
            totalAlerts: alerts.length,
            alerts
        });
    } catch (error) {
        console.error('Error fetching fire alerts:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch fire alerts',
            message: error.message
        });
    }
});

router.get('/fire-weather/hotspots', async (req, res) => {
    try {
        const hotspots = await fireWeatherService.fetchFIRMSHotspots();
        res.json({
            success: true,
            timestamp: new Date().toISOString(),
            totalHotspots: hotspots.length,
            hotspots
        });
    } catch (error) {
        console.error('Error fetching FIRMS hotspots:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch FIRMS hotspots',
            message: error.message
        });
    }
});

router.get('/fire-weather/forecast/:lat/:lon', async (req, res) => {
    try {
        const lat = parseFloat(req.params.lat);
        const lon = parseFloat(req.params.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
            return res.status(400).json({ success: false, error: 'Invalid lat/lon' });
        }
        const forecast = await fireWeatherService.fetchNWSFireWeatherForecast(lat, lon);
        if (!forecast) {
            return res.status(502).json({ success: false, error: 'NWS forecast unavailable' });
        }
        res.json({
            success: true,
            timestamp: new Date().toISOString(),
            ...forecast
        });
    } catch (error) {
        console.error('Error fetching NWS fire forecast:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch NWS fire forecast',
            message: error.message
        });
    }
});

export default router;
