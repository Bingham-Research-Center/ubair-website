import express from 'express';
import TrafficEventsService from '../trafficEventsService.js';

const router = express.Router();
const trafficEventsService = new TrafficEventsService();

// Get all traffic events for Uintah Basin
router.get('/traffic-events', async (req, res) => {
    try {
        const events = await trafficEventsService.fetchUDOTTrafficEvents();
        res.json({
            success: true,
            timestamp: new Date().toISOString(),
            totalEvents: events.length,
            events: events
        });
    } catch (error) {
        console.error('Error fetching traffic events:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch traffic events',
            message: error.message
        });
    }
});

// Get active traffic events only
router.get('/traffic-events/active', async (req, res) => {
    try {
        const activeEvents = await trafficEventsService.getActiveEvents();
        res.json({
            success: true,
            timestamp: new Date().toISOString(),
            activeCount: activeEvents.length,
            events: activeEvents
        });
    } catch (error) {
        console.error('Error fetching active traffic events:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch active traffic events',
            message: error.message
        });
    }
});

// Get upcoming traffic events
router.get('/traffic-events/upcoming', async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 7;
        const upcomingEvents = await trafficEventsService.getUpcomingEvents(days);
        res.json({
            success: true,
            timestamp: new Date().toISOString(),
            daysAhead: days,
            upcomingCount: upcomingEvents.length,
            events: upcomingEvents
        });
    } catch (error) {
        console.error('Error fetching upcoming traffic events:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch upcoming traffic events',
            message: error.message
        });
    }
});

// Get traffic events by type
router.get('/traffic-events/type/:eventType', async (req, res) => {
    try {
        const { eventType } = req.params;
        const validTypes = ['roadwork', 'closures', 'accidentsandincidents'];
        
        if (!validTypes.includes(eventType.toLowerCase())) {
            return res.status(400).json({
                success: false,
                error: 'Invalid event type',
                validTypes: validTypes
            });
        }

        const events = await trafficEventsService.getEventsByType(eventType);
        res.json({
            success: true,
            timestamp: new Date().toISOString(),
            eventType: eventType,
            count: events.length,
            events: events
        });
    } catch (error) {
        console.error('Error fetching traffic events by type:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch traffic events by type',
            message: error.message
        });
    }
});

// Get UDOT alerts
router.get('/alerts', async (req, res) => {
    try {
        const alerts = await trafficEventsService.fetchUDOTAlerts();
        res.json({
            success: true,
            timestamp: new Date().toISOString(),
            alertsCount: alerts.length,
            alerts: alerts
        });
    } catch (error) {
        console.error('Error fetching UDOT alerts:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch UDOT alerts',
            message: error.message
        });
    }
});

// Get complete traffic data summary
router.get('/traffic-events/summary', async (req, res) => {
    try {
        const trafficData = await trafficEventsService.getAllTrafficData();
        res.json({
            success: true,
            ...trafficData
        });
    } catch (error) {
        console.error('Error fetching traffic events summary:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch traffic events summary',
            message: error.message
        });
    }
});

// Get traffic events for map display (optimized for frontend)
router.get('/traffic-events/map', async (req, res) => {
    try {
        const allEvents = await trafficEventsService.fetchUDOTTrafficEvents();
        
        // Optimize data for map display
        const mapEvents = allEvents.map(event => ({
            id: event.id,
            name: event.name || event.description.substring(0, 50) + '...',
            latitude: event.latitude,
            longitude: event.longitude,
            eventType: event.eventType,
            isFullClosure: event.isFullClosure,
            priority: event.priority,
            displayIcon: event.displayIcon,
            displayColor: event.displayColor,
            startDate: event.startDate,
            plannedEndDate: event.plannedEndDate,
            roadwayName: event.roadwayName,
            severity: event.severity,
            shortDescription: event.description.substring(0, 100) + (event.description.length > 100 ? '...' : '')
        }));

        res.json({
            success: true,
            timestamp: new Date().toISOString(),
            totalEvents: mapEvents.length,
            events: mapEvents
        });
    } catch (error) {
        console.error('Error fetching traffic events for map:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch traffic events for map',
            message: error.message
        });
    }
});

export default router;