import express from 'express';
import { promises as fs } from 'fs';
import path from 'path';
import { observedByTown, pairedStations, wantedRows, wantedStids } from '../observedSeries.js';
import { precipByHour } from '../statusLights.js';

// Data for the weather forecast page that the browser should not have to hunt for.
//
//   GET /api/weather-forecast/towns      the newest HRRR waypoints run (14 towns and passes)
//   GET /api/weather-forecast/precip     snow, rain or dry by elevation band, hour by hour
//   GET /api/weather-forecast/observed   what each town's paired station has measured since
//                                        that run began, to draw against its forecast
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

// ── Observed, for the forecast-against-measured chart ──────────────────────────────────────

const OBS_FILE_RE = /^map_obs_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})Z\.json$/;
const META_FILE_RE = /^map_obs_meta_\d{8}_\d{4}Z\.json$/;
// The answer is rebuilt at most this often; observation files arrive every ten minutes.
const OBSERVED_CACHE_MS = 5 * 60 * 1000;
// A run older than this is not held against observations: the page would be comparing a
// forecast nobody is reading any more, and the window of files to read would keep growing.
const OBSERVED_MAX_WINDOW_MS = 24 * 60 * 60 * 1000;
// A station can report a few minutes before the hour the run starts.
const OBSERVED_LEAD_MS = 30 * 60 * 1000;

let observed = null;   // { atMs, body }
let observedInFlight = null;
// What was kept from each observation file already read, by file name, so that a refresh
// reads only the files that have arrived since. Pruned to the window on every build.
const observedFiles = new Map(); // name -> { stids: string, rows }

const obsFileTime = (name) => {
    const match = OBS_FILE_RE.exec(name);
    if (!match) return NaN;
    const [, year, month, day, hour, minute] = match.map(Number);
    return Date.UTC(year, month - 1, day, hour, minute);
};

async function buildObserved(now) {
    const unavailable = (message) => ({ status: 'unavailable', message, towns: {} });
    const name = await newestWaypointsFile(now);
    if (!name) return unavailable('No HRRR town forecast has been received yet');
    const forecast = JSON.parse(await fs.readFile(path.join(staticRoot(), 'forecasts', name), 'utf8'));
    const init = Date.parse(forecast?.init_time);
    if (!Number.isFinite(init) || now - init > OBSERVED_MAX_WINDOW_MS) {
        return unavailable('The newest town forecast is too old to compare with observations');
    }

    const pairs = pairedStations(forecast);
    const stids = wantedStids(pairs);
    const stidKey = [...stids].sort().join(',');
    const since = init - OBSERVED_LEAD_MS;

    const obsDir = path.join(staticRoot(), 'observations');
    // A file stamped ten minutes before the window can still hold a reading inside it.
    const names = (await fs.readdir(obsDir)).filter((file) => obsFileTime(file) >= since - 10 * 60 * 1000).sort();
    for (const cachedName of [...observedFiles.keys()]) {
        if (!names.includes(cachedName) || observedFiles.get(cachedName).stids !== stidKey) observedFiles.delete(cachedName);
    }
    for (const file of names) {
        if (observedFiles.has(file)) continue;
        try {
            const rows = JSON.parse(await fs.readFile(path.join(obsDir, file), 'utf8'));
            observedFiles.set(file, { stids: stidKey, rows: wantedRows(rows, stids) });
        } catch (error) {
            // One unreadable file is ten minutes of dots missing, not a reason to show none.
            console.warn(`weather forecast: could not read ${file} (${error.message})`);
        }
    }

    let meta = [];
    try {
        const metaDir = path.join(staticRoot(), 'metadata');
        const metaName = (await fs.readdir(metaDir)).filter((file) => META_FILE_RE.test(file)).sort().at(-1);
        if (metaName) meta = JSON.parse(await fs.readFile(path.join(metaDir, metaName), 'utf8'));
    } catch (error) {
        if (error.code !== 'ENOENT') console.warn(`weather forecast: station names unavailable (${error.message})`);
    }

    const rows = [...observedFiles.values()].flatMap((entry) => entry.rows);
    return {
        status: 'ok',
        run: forecast.init_time,
        since: new Date(since).toISOString(),
        through: names.length ? new Date(obsFileTime(names.at(-1))).toISOString() : null,
        towns: observedByTown(pairs, rows, meta, since, now),
    };
}

router.get('/weather-forecast/observed', async (req, res) => {
    const now = Date.now();
    if (!observed || now - observed.atMs > OBSERVED_CACHE_MS) {
        // Visitors who arrive while one answer is being built share it.
        observedInFlight ??= buildObserved(now)
            .then((body) => { observed = { atMs: Date.now(), body }; })
            .finally(() => { observedInFlight = null; });
        try {
            await observedInFlight;
        } catch (error) {
            const missing = error.code === 'ENOENT';
            if (!missing) console.error('weather forecast: observed series failed:', error);
            return res.status(missing ? 404 : 500).set('Cache-Control', 'no-store')
                .json({ status: 'unavailable', message: 'Station observations could not be read', towns: {} });
        }
    }
    res.status(observed.body.status === 'ok' ? 200 : 503).set('Cache-Control', 'no-store').json(observed.body);
});

/** Test hook. */
export function _resetWeatherForecastForTests() {
    newest = null;
    observed = null;
    observedInFlight = null;
    observedFiles.clear();
}

export default router;
