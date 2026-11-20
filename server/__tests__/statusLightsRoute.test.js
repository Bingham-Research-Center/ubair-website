import fs from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';
import { jest } from '@jest/globals';
import app from '../server.js';
import { NwsAlertsService, _setNwsAlertsServiceForTests } from '../nwsAlerts.js';
import { _resetStatusLightsForTests, buildStatusLights, setStatusLightServices } from '../routes/statusLights.js';

// GET /api/status-lights (issue #403): the route gathers the inputs and the rules in
// statusLights.js decide. What matters here is that one broken source greys one tile.

const fixture = (name) => JSON.parse(fs.readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
const SEGMENTS = fixture('udot_roads_20261120.json');
const STATIONS = fixture('udot_stations_20261120.json');
const FORECAST = fixture('road_forecast_20261120.json');
const NOW = Date.parse('2026-11-20T05:25:00Z');

const originalCwd = process.cwd();
let staticRoot;
let roadWeather;
let trafficEvents;

const write = (relative, content) => {
    const file = path.join(staticRoot, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content));
};

beforeEach(() => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'status-lights-'));
    staticRoot = path.join(root, 'public', 'api', 'static');
    process.chdir(root);

    write('observations/map_obs_20261120_0510Z.json', []);
    write('observations/map_obs_20261120_0521Z.json', [
        { stid: 'KVEL', variable: 'wind_speed', value: 3, units: 'm/s', date_time: '2026-11-20T05:15:00Z' },
    ]);
    write('observations/filelist.json', []);
    write('metadata/map_obs_meta_20261120_0520Z.json', [{ stid: 'KVEL', name: 'Vernal Airport', elevation: 5262 }]);
    write('outlooks/outlook_20261118_0900.md',
        '### Day 1–5 (x):\nLOW RISK OF ELEVATED OZONE\n### Day 6–10 (x):\nSOME RISK OF ELEVATED OZONE\n');
    write('outlooks/outlook_20261112_0337.md', '### Day 1–5 (x):\nHIGH RISK OF ELEVATED OZONE\n');
    write('outlooks/template-2025-2026.md', '### Day 1–5 (x):\nHIGH RISK OF ELEVATED OZONE\n');
    write('road-forecast/latest.json', FORECAST);

    roadWeather = {
        fetchUDOTRoadConditions: jest.fn().mockResolvedValue(SEGMENTS),
        fetchUDOTWeatherStations: jest.fn().mockResolvedValue(STATIONS),
    };
    trafficEvents = { fetchUDOTTrafficEvents: jest.fn().mockResolvedValue([]), feedStatus: { events: { feedUnavailable: false } } };
    setStatusLightServices({ roadWeather, trafficEvents });
    _setNwsAlertsServiceForTests(new NwsAlertsService({ fetchFeatures: async () => [], now: () => NOW }));
    _resetStatusLightsForTests();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
    process.chdir(originalCwd);
    _setNwsAlertsServiceForTests(null);
    jest.restoreAllMocks();
});

const byKey = (body) => Object.fromEntries(body.lights.map((light) => [light.key, light]));

describe('buildStatusLights', () => {
    test('reads the newest observation file, the newest outlook, the road reports and the forecast', async () => {
        const body = await buildStatusLights(NOW);
        expect(body.generatedAt).toBe('2026-11-20T05:25:00.000Z');
        expect(body.lights.map((light) => light.key)).toEqual(['weather', 'ahead', 'ozone', 'roads']);

        const lights = byKey(body);
        expect(lights.weather).toMatchObject({ level: 'green', line: 'No alerts' });
        // The 18 Nov outlook, not the older one or the template.
        expect(lights.ozone).toMatchObject({ level: 'amber', line: 'Some risk, days 6 to 10' });
        expect(lights.roads).toMatchObject({ level: 'red', line: 'Snow covered: US-191 north of Vernal' });
        expect(body.precip.bands.map((band) => band.type)).toEqual(['snow', 'mix', 'snow']);
    });

    test('the forecast tile is named from the clock and reads the same road forecast', async () => {
        write('road-forecast/latest.json', fixture('road_forecast_hazards_20261120.json'));
        const ahead = byKey(await buildStatusLights(NOW)).ahead; // 10:25 PM on 19 Nov
        expect(ahead).toMatchObject({ label: 'Tomorrow morning', href: '/forecast_weather', level: 'amber' });
        expect(ahead.line).toMatch(/of new snow near /);
    });

    test('a forecast without the fields it needs greys the forecast tile and leaves the precipitation tile alone', async () => {
        // The older fixture carries precipitation type only.
        const body = await buildStatusLights(NOW);
        expect(byKey(body).ahead).toMatchObject({ label: 'Tomorrow morning', level: 'grey', line: 'Forecast incomplete' });
        expect(body.precip.status).toBe('ok');
    });

    test('no road forecast at all: the forecast tile is grey and still named for the part of the day', async () => {
        fs.rmSync(path.join(staticRoot, 'road-forecast'), { recursive: true });
        const body = await buildStatusLights(NOW);
        expect(byKey(body).ahead).toMatchObject({ label: 'Overnight', level: 'grey', line: 'Forecast unavailable' });
        expect(body.precip.status).toBe('unavailable');
    });

    test('UDOT down: the roads tile is grey, the weather tile says gusts are unavailable, the rest stand', async () => {
        roadWeather.fetchUDOTRoadConditions.mockRejectedValue(new Error('UDOT API error: 503'));
        roadWeather.fetchUDOTWeatherStations.mockRejectedValue(new Error('UDOT API error: 503'));
        const body = await buildStatusLights(NOW);
        const lights = byKey(body);
        expect(lights.roads).toMatchObject({ level: 'grey', line: 'Road reports unavailable' });
        expect(lights.weather.level).toBe('green');
        expect(lights.weather.detail).toMatch(/road-station gusts are unavailable/);
        expect(lights.ozone.level).toBe('amber');
        expect(body.precip.status).toBe('ok');
    });

    test('an empty road list is unavailable, not "all dry"', async () => {
        roadWeather.fetchUDOTRoadConditions.mockResolvedValue([]);
        expect(byKey(await buildStatusLights(NOW)).roads.level).toBe('grey');
    });

    test('NWS down: the weather tile is grey and nothing else changes', async () => {
        _setNwsAlertsServiceForTests(new NwsAlertsService({
            fetchFeatures: async () => { throw new Error('down'); }, now: () => NOW,
        }));
        const lights = byKey(await buildStatusLights(NOW));
        expect(lights.weather).toMatchObject({ level: 'grey', line: 'Alerts unavailable' });
        expect(lights.roads.level).toBe('red');
    });

    test('no observation files: the weather tile is grey', async () => {
        fs.rmSync(path.join(staticRoot, 'observations'), { recursive: true });
        expect(byKey(await buildStatusLights(NOW)).weather).toMatchObject({ level: 'grey', line: 'Observations out of date' });
    });

    test('no outlooks directory, and no forecast file: those two tiles say so', async () => {
        fs.rmSync(path.join(staticRoot, 'outlooks'), { recursive: true });
        fs.rmSync(path.join(staticRoot, 'road-forecast'), { recursive: true });
        const body = await buildStatusLights(NOW);
        expect(byKey(body).ozone).toMatchObject({ level: 'grey', line: 'No current outlook' });
        expect(body.precip).toMatchObject({ status: 'unavailable', bands: [] });
        expect(byKey(body).roads.level).toBe('red');
    });

    test('a closure from a day-old disk snapshot of traffic events is not used', async () => {
        const closure = { isFullClosure: true, roadwayName: 'US 40', latitude: 40.3, longitude: -110.0 };
        roadWeather.fetchUDOTRoadConditions.mockResolvedValue([{
            name: 'US-40 Through Roosevelt', coordinates: [[40.3, -110.0]], roadCondition: 'Dry', weatherCondition: 'Fair', restriction: 'none',
        }]);
        trafficEvents.fetchUDOTTrafficEvents.mockResolvedValue([closure]);
        expect(byKey(await buildStatusLights(NOW)).roads).toMatchObject({ level: 'red', line: 'Closed: US-40' });

        trafficEvents.feedStatus.events.feedUnavailable = true;
        expect(byKey(await buildStatusLights(NOW)).roads).toMatchObject({ level: 'green', line: 'Major routes dry' });
    });
});

describe('GET /api/status-lights', () => {
    test('200 with four lights and the precipitation tile, not cached by the browser', async () => {
        const res = await request(app).get('/api/status-lights').expect(200);
        expect(res.headers['cache-control']).toBe('no-store');
        expect(res.body.lights).toHaveLength(4);
        for (const light of res.body.lights) {
            expect(Object.keys(light).sort()).toEqual(['asOf', 'detail', 'href', 'key', 'label', 'level', 'line']);
            expect(['red', 'amber', 'green', 'grey']).toContain(light.level);
        }
        expect(res.body.precip).toMatchObject({ key: 'precip', label: 'Precip next 6 h' });
    });

    test('one answer is shared for a minute, so a busy homepage does not re-read everything', async () => {
        await Promise.all([request(app).get('/api/status-lights'), request(app).get('/api/status-lights')]);
        await request(app).get('/api/status-lights').expect(200);
        expect(roadWeather.fetchUDOTRoadConditions).toHaveBeenCalledTimes(1);
    });
});
