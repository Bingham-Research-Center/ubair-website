import express from 'express';
import { promises as fs } from 'fs';
import path from 'path';
import { getNwsAlertsService } from '../nwsAlerts.js';
import { OUTLOOK_FILE_RE, describeOutlook } from '../../public/js/outlookSeasons.js';
import { ozoneLight, precipBands, roadsLight, weatherLight } from '../statusLights.js';

// GET /api/status-lights: the homepage's four tiles in one small answer.
//
// This file only gathers inputs; every rule is in ../statusLights.js. Each input is read on its
// own, and a failed read becomes null, so one broken source greys one tile and leaves the
// others alone. Nothing here calls UDOT directly: it asks the shared services, whose caches
// the background refresh keeps warm.

const router = express.Router();

let roadWeatherService = null;
let trafficEventsService = null;

/** server.js hands over the shared instances, as it does for the roads routes. */
export function setStatusLightServices({ roadWeather, trafficEvents }) {
    roadWeatherService = roadWeather;
    trafficEventsService = trafficEvents;
}

// Resolved against the working directory, as the upload route does.
const staticRoot = () => path.resolve(process.cwd(), 'public', 'api', 'static');

// The whole answer is reused for a minute: the observations directory holds tens of thousands
// of files, and listing it once per page view would be wasteful.
const CACHE_MS = 60 * 1000;
const META_CACHE_MS = 6 * 60 * 60 * 1000;
let cached = null;   // { atMs, body }
let inFlight = null;
let metaCache = null; // { atMs, meta }

const OBS_FILE_RE = /^map_obs_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})Z\.json$/;
const META_FILE_RE = /^map_obs_meta_\d{8}_\d{4}Z\.json$/;

async function newestFile(dir, pattern) {
    const names = (await fs.readdir(dir)).filter((name) => pattern.test(name));
    // The stamps are fixed-width, so the last name in order is the newest file.
    return names.length ? names.sort().at(-1) : null;
}

const readJson = async (file) => JSON.parse(await fs.readFile(file, 'utf8'));

async function readObservations(now) {
    const dir = path.join(staticRoot(), 'observations');
    const name = await newestFile(dir, OBS_FILE_RE);
    if (!name) return null;
    const [, year, month, day, hour, minute] = OBS_FILE_RE.exec(name).map(Number);
    const rows = await readJson(path.join(dir, name));

    if (!metaCache || now - metaCache.atMs > META_CACHE_MS) {
        const metaDir = path.join(staticRoot(), 'metadata');
        const metaName = await newestFile(metaDir, META_FILE_RE);
        metaCache = { atMs: now, meta: metaName ? await readJson(path.join(metaDir, metaName)) : [] };
    }
    return { rows, meta: metaCache.meta, fileTimeMs: Date.UTC(year, month - 1, day, hour, minute) };
}

async function readNewestOutlook() {
    const dir = path.join(staticRoot(), 'outlooks');
    const outlooks = (await fs.readdir(dir))
        .filter((name) => OUTLOOK_FILE_RE.test(name))
        .map((name) => describeOutlook(name))
        .sort((a, b) => b.issued - a.issued);
    if (outlooks.length === 0) return null;
    const { filename } = outlooks[0];
    return { filename, markdown: await fs.readFile(path.join(dir, filename), 'utf8') };
}

async function readRoads() {
    const segments = await roadWeatherService.fetchUDOTRoadConditions();
    if (!Array.isArray(segments) || segments.length === 0) return { status: 'unavailable' };
    const times = segments.map((segment) => Date.parse(segment.lastUpdated)).filter(Number.isFinite);
    return {
        status: 'ok',
        segments,
        lastUpdated: times.length ? new Date(Math.max(...times)).toISOString() : null,
    };
}

async function readTrafficEvents() {
    const events = await trafficEventsService.fetchUDOTTrafficEvents();
    // A disk snapshot served during an outage can be a day old: not "now".
    if (trafficEventsService.feedStatus?.events?.feedUnavailable) return null;
    return Array.isArray(events) ? events : null;
}

/** The value of `read()`, or `fallback` if it throws. One line in the log, no stack. */
async function attempt(what, read, fallback = null) {
    try {
        return await read();
    } catch (error) {
        console.warn(`status lights: ${what} unavailable (${error.message})`);
        return fallback;
    }
}

// A rule that throws is a bug, but the tile must still say something true: grey, or for the
// precipitation tile, unavailable.
function safely(key, label, href, build) {
    try {
        return build();
    } catch (error) {
        console.error(`status lights: ${key} rule failed:`, error);
        const detail = 'This status could not be worked out just now.';
        return key === 'precip'
            ? { key, label, href, status: 'unavailable', bands: [], detail, asOf: null }
            : { key, label, href, level: 'grey', line: 'Status unavailable', detail, asOf: null };
    }
}

export async function buildStatusLights(now = Date.now()) {
    const [alerts, obs, rwis, roads, events, outlook, forecast] = await Promise.all([
        attempt('NWS alerts', () => getNwsAlertsService().getBasinAlerts()),
        attempt('observations', () => readObservations(now)),
        attempt('road weather stations', () => roadWeatherService.fetchUDOTWeatherStations()),
        attempt('road reports', readRoads, { status: 'unavailable' }),
        attempt('traffic events', readTrafficEvents),
        attempt('ozone outlook', readNewestOutlook),
        attempt('road forecast', () => readJson(path.join(staticRoot(), 'road-forecast', 'latest.json'))),
    ]);

    return {
        generatedAt: new Date(now).toISOString(),
        lights: [
            safely('weather', 'Weather now', '/forecast_weather', () => weatherLight({ alerts, obs, rwis, now })),
            safely('ozone', 'Ozone', '/forecast_outlooks', () => ozoneLight({ outlook, now })),
            safely('roads', 'Roads now', '/roads', () => roadsLight({ roads, events, now })),
        ],
        precip: safely('precip', 'Precip next 6 h', '/forecast_weather', () => precipBands({ forecast, now })),
    };
}

router.get('/status-lights', async (req, res) => {
    const now = Date.now();
    if (!cached || now - cached.atMs > CACHE_MS) {
        // Visitors who arrive while one answer is being built share it.
        inFlight ??= buildStatusLights(now)
            .then((body) => { cached = { atMs: Date.now(), body }; })
            .finally(() => { inFlight = null; });
        try {
            await inFlight;
        } catch (error) {
            console.error('status lights: could not build an answer:', error);
            return res.status(503).json({ error: 'Status lights are unavailable right now' });
        }
    }
    res.set('Cache-Control', 'no-store').json(cached.body);
});

/** Test hook. */
export function _resetStatusLightsForTests() {
    cached = null;
    inFlight = null;
    metaCache = null;
}

export default router;
