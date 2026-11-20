import express from 'express';
import { getNwsAlertsService } from '../nwsAlerts.js';

const router = express.Router();

// Active NWS alerts for the Basin. 200 with a list (empty when the NWS says there are none),
// or 503 with `alerts: null` when we could not find out. The two are different answers, and a
// caller that only checks `response.ok` still cannot mistake an outage for quiet weather.
router.get('/weather-alerts', async (req, res) => {
    const result = await getNwsAlertsService().getBasinAlerts();
    res.status(result.status === 'ok' ? 200 : 503).json({
        status: result.status,
        fetchedAt: result.fetchedAt,
        alerts: result.alerts,
        message: result.status === 'ok' ? null : 'National Weather Service alerts are unavailable right now',
    });
});

export default router;
