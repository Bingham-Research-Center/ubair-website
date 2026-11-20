import express from 'express';
import { promises as fs } from 'fs';
import path from 'path';
import { precipByHour } from '../statusLights.js';

// Data for the weather forecast page that the browser should not have to hunt for.
//
//   GET /api/weather-forecast/towns    the newest HRRR waypoints run (14 towns and passes)
//   GET /api/weather-forecast/precip   snow, rain or dry by elevation band, hour by hour
//
// The waypoints run is passed through as the producer sent it, in SI units: the page converts
// at display with public/js/met.js, like every other page. The route exists because finding the
// newest of 5,000 forecast files would otherwise mean sending the browser the whole list.

const router = express.Router();

const staticRoot = () => path.resolve(process.cwd(), 'public', 'api', 'static');
const WAYPOINTS_RE = /^forecast_hrrr_waypoints_us40_dense_\d{8}_\d{4}Z\.json$/;

// The forecasts directory is listed at most once a minute; a new run lands hourly.
const CACHE_MS = 60 * 1000;
let newest = null; // { atMs, name }

async function newestWaypointsFile(now) {
    if (!newest || now - newest.atMs > CACHE_MS) {
        const names = (await fs.readdir(path.join(staticRoot(), 'forecasts'))).filter((name) => WAYPOINTS_RE.test(name));
        // Fixed-width stamps: the last name in order is the newest run.
        newest = { atMs: now, name: names.length ? names.sort().at(-1) : null };
    }
    return newest.name;
}

router.get('/weather-forecast/towns', async (req, res) => {
    try {
        const name = await newestWaypointsFile(Date.now());
        if (!name) {
            return res.status(404).json({ status: 'unavailable', message: 'No HRRR town forecast has been received yet' });
        }
        const forecast = JSON.parse(await fs.readFile(path.join(staticRoot(), 'forecasts', name), 'utf8'));
        res.set('Cache-Control', 'no-store').json({ status: 'ok', filename: name, forecast });
    } catch (error) {
        // A missing directory is "nothing received yet", not a fault.
        const missing = error.code === 'ENOENT';
        if (!missing) console.error('weather forecast: town forecast failed:', error);
        res.status(missing ? 404 : 500).json({
            status: 'unavailable',
            message: missing ? 'No HRRR town forecast has been received yet' : 'The town forecast could not be read',
        });
    }
});

router.get('/weather-forecast/precip', async (req, res) => {
    let forecast = null;
    try {
        forecast = JSON.parse(await fs.readFile(path.join(staticRoot(), 'road-forecast', 'latest.json'), 'utf8'));
    } catch (error) {
        if (error.code !== 'ENOENT') console.error('weather forecast: road forecast failed:', error.message);
    }
    const body = precipByHour({ forecast, now: Date.now() });
    res.status(body.status === 'ok' ? 200 : 503).set('Cache-Control', 'no-store').json(body);
});

/** Test hook. */
export function _resetWeatherForecastForTests() {
    newest = null;
}

export default router;
