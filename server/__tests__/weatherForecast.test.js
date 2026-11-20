import fs from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';
import { jest } from '@jest/globals';
import app from '../server.js';
import { precipByHour } from '../statusLights.js';
import { _resetWeatherForecastForTests } from '../routes/weatherForecast.js';

// Data routes for the weather forecast page (issue #407), and gzip for JSON.

const FORECAST = JSON.parse(fs.readFileSync(new URL('./fixtures/road_forecast_20261120.json', import.meta.url), 'utf8'));
const NOW = Date.parse('2026-11-20T05:25:00Z');

describe('precipByHour', () => {
    test('one type per band for each hour still ahead in the run', () => {
        const result = precipByHour({ forecast: FORECAST, now: NOW });
        expect(result.status).toBe('ok');
        expect(result.asOf).toBe('2026-11-20T04:00:00Z');
        // The 04Z run reaches 16Z; at 05:25Z the hours from 06Z on are ahead.
        expect(result.hours[0]).toBe('2026-11-20T06:00:00Z');
        expect(result.hours.at(-1)).toBe('2026-11-20T16:00:00Z');
        expect(result.bands.map((band) => band.key)).toEqual(['passes', 'benches', 'floor']);
        for (const band of result.bands) {
            expect(band.types).toHaveLength(result.hours.length);
            for (const type of band.types) expect(['snow', 'rain', 'mix', 'dry']).toContain(type);
        }
        // It snowed on the passes all night.
        expect(new Set(result.bands[0].types)).toEqual(new Set(['snow']));
        expect(result.bands[0].places).toEqual(['Daniels Summit', 'Strawberry', 'Indian Canyon Summit']);
        expect(result.detail).toMatch(/^HRRR forecast run at 9 PM: .* not a measurement\.$/);
    });

    test('a band says null for an hour the model gives it no type', () => {
        const forecast = { init_time: '2026-11-20T04:00:00Z', points: [{
            name: 'Vernal', lat: 40.45, lon: -109.53, elevation_m: 1609,
            forecasts: [1, 2, 3].map((h) => ({ valid_time: new Date(NOW + h * 3600000).toISOString(), precip_type: h === 2 ? null : 'none' })),
        }] };
        const bands = Object.fromEntries(precipByHour({ forecast, now: NOW }).bands.map((band) => [band.key, band.types]));
        expect(bands.floor).toEqual(['dry', null, 'dry']);
        expect(bands.passes).toEqual([null, null, null]);
    });

    test('unavailable when there is no file, or the run has fewer than three hours left', () => {
        expect(precipByHour({ forecast: null, now: NOW })).toMatchObject({ status: 'unavailable', hours: [], bands: [] });
        expect(precipByHour({ forecast: FORECAST, now: NOW + 9.2 * 3600000 }).status).toBe('unavailable');
    });
});

describe('weather forecast routes', () => {
    const originalCwd = process.cwd();
    let staticRoot;
    const write = (relative, content) => {
        const file = path.join(staticRoot, relative);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, JSON.stringify(content));
    };

    beforeEach(() => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'weather-forecast-'));
        staticRoot = path.join(root, 'public', 'api', 'static');
        fs.mkdirSync(staticRoot, { recursive: true });
        process.chdir(root);
        _resetWeatherForecastForTests();
        jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        process.chdir(originalCwd);
        jest.restoreAllMocks();
    });

    test('towns: the newest waypoints run, passed through as sent', async () => {
        write('forecasts/forecast_hrrr_waypoints_us40_dense_20261120_0100Z.json', { init_time: '2026-11-20T01:00:00Z' });
        write('forecasts/forecast_hrrr_waypoints_us40_dense_20261120_0200Z.json', { init_time: '2026-11-20T02:00:00Z', stations: [] });
        write('forecasts/forecast_hrrr_surface_layers_20261120_0300Z.json', { init_time: '2026-11-20T03:00:00Z' });
        write('forecasts/forecast_hrrr_kvel_crosswind_20261120_0400Z.json', { init_time: '2026-11-20T04:00:00Z' });
        const res = await request(app).get('/api/weather-forecast/towns').expect(200);
        expect(res.body).toEqual({
            status: 'ok',
            filename: 'forecast_hrrr_waypoints_us40_dense_20261120_0200Z.json',
            forecast: { init_time: '2026-11-20T02:00:00Z', stations: [] },
        });
        expect(res.headers['cache-control']).toBe('no-store');
    });

    test('towns: 404, not a server fault, when no run has been received', async () => {
        const none = await request(app).get('/api/weather-forecast/towns').expect(404);
        expect(none.body).toEqual({ status: 'unavailable', message: 'No HRRR town forecast has been received yet' });

        _resetWeatherForecastForTests();
        write('forecasts/forecast_hrrr_surface_layers_20261120_0300Z.json', {});
        await request(app).get('/api/weather-forecast/towns').expect(404);
    });

    test('towns: 500 when the newest file cannot be parsed', async () => {
        fs.mkdirSync(path.join(staticRoot, 'forecasts'), { recursive: true });
        fs.writeFileSync(path.join(staticRoot, 'forecasts', 'forecast_hrrr_waypoints_us40_dense_20261120_0200Z.json'), '{half');
        const res = await request(app).get('/api/weather-forecast/towns').expect(500);
        expect(res.body.status).toBe('unavailable');
    });

    test('precip: 503 with no bands when there is no road forecast', async () => {
        const res = await request(app).get('/api/weather-forecast/precip').expect(503);
        expect(res.body).toMatchObject({ status: 'unavailable', hours: [], bands: [] });
    });

    test('precip: 200 with the hourly bands when the file is fresh', async () => {
        // Re-stamp the real run so that it starts an hour before the test runs.
        const shift = Math.floor(Date.now() / 3600000) * 3600000 - Date.parse(FORECAST.init_time);
        const fresh = JSON.parse(JSON.stringify(FORECAST));
        fresh.init_time = new Date(Date.parse(FORECAST.init_time) + shift).toISOString();
        for (const point of fresh.points) {
            for (const entry of point.forecasts) entry.valid_time = new Date(Date.parse(entry.valid_time) + shift).toISOString();
        }
        write('road-forecast/latest.json', fresh);
        const res = await request(app).get('/api/weather-forecast/precip').expect(200);
        expect(res.body.status).toBe('ok');
        expect(res.body.bands).toHaveLength(3);
        expect(res.body.hours.length).toBeGreaterThanOrEqual(11);
    });
});

describe('gzip', () => {
    test('a JSON answer over 1 kB is compressed for a browser that accepts it', async () => {
        const res = await request(app).get('/api/health').set('Accept-Encoding', 'gzip');
        // /api/health is small: sent as is.
        expect(res.headers['content-encoding']).toBeUndefined();

        const big = await request(app).get('/public/css/main.css').set('Accept-Encoding', 'gzip').expect(200);
        expect(big.headers['content-encoding']).toBe('gzip');
        expect(big.headers.vary).toMatch(/Accept-Encoding/);
        expect(big.text).toContain('.headline-item');
    });

    test('and sent whole to a client that does not', async () => {
        const res = await request(app).get('/public/css/main.css').set('Accept-Encoding', 'identity').expect(200);
        expect(res.headers['content-encoding']).toBeUndefined();
    });
});
