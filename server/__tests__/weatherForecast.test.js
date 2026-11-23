import fs from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';
import { jest } from '@jest/globals';
import app from '../server.js';
import { precipByHour, snowLineAt } from '../statusLights.js';
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

describe('precipByHour, place by place', () => {
    test('every forecast point once, highest first, with its type in each hour', () => {
        const result = precipByHour({ forecast: FORECAST, now: NOW });
        // Seventeen points in the file; Roosevelt and Starvation are each on two routes.
        expect(result.places).toHaveLength(15);
        const heights = result.places.map((place) => place.elevationFt);
        expect([...heights].sort((a, b) => b - a)).toEqual(heights);
        expect(result.places[0]).toMatchObject({ name: 'Indian Canyon Summit', elevationFt: 9090 });
        expect(result.places.at(-1)).toMatchObject({ name: 'Ouray', elevationFt: 4800 });
        for (const place of result.places) {
            expect(place.types).toHaveLength(result.hours.length);
            for (const type of place.types) expect(['snow', 'rain', 'mix', 'dry', null]).toContain(type);
        }
        expect(result.snowLine).toHaveLength(result.hours.length);
    });

    test('a kind of ice that is not snow counts as a mix; "none" is dry', () => {
        const hours = [1, 2, 3].map((h) => new Date(NOW + h * 3600000).toISOString());
        const forecast = { init_time: '2026-11-20T04:00:00Z', points: [{
            name: 'Vernal', lat: 40.45, lon: -109.53, elevation_m: 1609,
            forecasts: ['freezing_rain', 'ice_pellets', 'none'].map((precip_type, i) => ({ valid_time: hours[i], precip_type })),
        }] };
        expect(precipByHour({ forecast, now: NOW }).places[0].types).toEqual(['mix', 'mix', 'dry']);
    });
});

describe('snowLineAt: where rain turns to snow', () => {
    const point = (elevationFt, type) => ({ elevationFt, type });

    test('between two points when rain lies wholly below snow', () => {
        expect(snowLineAt([point(8000, 'snow'), point(6700, 'snow'), point(5750, 'rain'), point(5200, 'mix'), point(4800, 'dry')]))
            .toEqual({ kind: 'between', lowFt: 5750, highFt: 6700 });
    });

    test('a zone when snow reaches lower at one place than rain does at another', () => {
        // The real hour of 1 AM on 20 Nov 2026: snow at Maeser, rain at Duchesne above it.
        expect(snowLineAt([point(6700, 'snow'), point(5850, 'mix'), point(5750, 'rain'), point(5290, 'snow'), point(5250, 'snow'), point(4800, 'rain')]))
            .toEqual({ kind: 'zone', lowFt: 5250, highFt: 5850 });
        expect(snowLineAt([point(5280, 'snow'), point(5280, 'rain')])).toEqual({ kind: 'zone', lowFt: 5280, highFt: 5280 });
    });

    test('all snow, all rain, or nothing falling', () => {
        expect(snowLineAt([point(8000, 'snow'), point(5200, 'snow'), point(4800, 'dry')])).toEqual({ kind: 'snow', downToFt: 5200 });
        expect(snowLineAt([point(8000, 'dry'), point(5200, 'rain'), point(6000, 'mix')])).toEqual({ kind: 'rain', upToFt: 6000 });
        expect(snowLineAt([point(8000, 'dry'), point(5200, null)])).toBeNull();
        expect(snowLineAt([])).toBeNull();
        expect(snowLineAt(null)).toBeNull();
    });

    test('it is always a range between forecast points, never one height', () => {
        for (const line of precipByHour({ forecast: FORECAST, now: NOW }).snowLine.filter(Boolean)) {
            expect(['between', 'zone', 'snow', 'rain']).toContain(line.kind);
            expect(Object.keys(line)).not.toContain('ft');
        }
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
        expect(res.body.places).toHaveLength(15);
        expect(res.body.snowLine).toHaveLength(res.body.hours.length);
    });

    describe('observed', () => {
        const HOUR = 3600000;
        const stamp = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/T(\d{4}).*/, '_$1Z');
        const obsName = (ms) => `observations/map_obs_${stamp(ms)}.json`;
        let init;

        beforeEach(() => {
            init = Math.floor(Date.now() / HOUR) * HOUR - 3 * HOUR;
            write(`forecasts/forecast_hrrr_waypoints_us40_dense_${stamp(init)}.json`, {
                init_time: new Date(init).toISOString(),
                stations: [
                    { id: 'myton', name: 'Myton', reference_stid: 'UTMYT' },
                    { id: 'vernal', name: 'Vernal', reference_stid: 'QV4' },
                    { id: 'split_mountain', name: 'Split Mountain', reference_stid: 'SPMU1' },
                ],
            });
            write('metadata/map_obs_meta_20261120_0000Z.json', [{ stid: 'KVEL', name: 'Vernal Airport', elevation: 5262 }]);
            const reading = (stid, ms, value) => ({ stid, variable: 'air_temp', value, units: 'Celsius', date_time: new Date(ms).toISOString() });
            // Before the run: not wanted, and not read.
            write(obsName(init - 2 * HOUR), [reading('KVEL', init - 2 * HOUR, 9)]);
            write(obsName(init + 10 * 60000), [reading('KVEL', init + 5 * 60000, 2), reading('UTMYT', init + 10 * 60000, 1), reading('QV4', init, 7)]);
            // The next file repeats KVEL's reading and adds a new one.
            write(obsName(init + 20 * 60000), [reading('KVEL', init + 5 * 60000, 2), reading('KVEL', init + 15 * 60000, 1.5)]);
        });

        test('200 with each town\'s station and its readings since the run began', async () => {
            const res = await request(app).get('/api/weather-forecast/observed').expect(200);
            expect(res.headers['cache-control']).toBe('no-store');
            expect(res.body).toMatchObject({ status: 'ok', run: new Date(init).toISOString() });
            expect(Object.keys(res.body.towns)).toEqual(['myton', 'vernal', 'split_mountain']);
            // Vernal is held against the airport, not the town station the run names.
            expect(res.body.towns.vernal).toMatchObject({ stid: 'KVEL', name: 'Vernal Airport', elevationFt: 5262 });
            expect(res.body.towns.vernal.air_temp.points.map(([, value]) => value)).toEqual([2, 1.5]);
            expect(res.body.towns.myton.air_temp.points).toHaveLength(1);
            // No station in the feed: no series, and no invented one.
            expect(res.body.towns.split_mountain).toMatchObject({ stid: 'SPMU1', name: null, air_temp: null });
        });

        test('the answer is kept for five minutes: a second visitor costs no file reads', async () => {
            await request(app).get('/api/weather-forecast/observed').expect(200);
            const read = jest.spyOn(fs.promises, 'readFile');
            const again = await request(app).get('/api/weather-forecast/observed').expect(200);
            expect(again.body.towns.vernal.air_temp.points).toHaveLength(2);
            // Other parts of the app read files of their own on any request (the visitor
            // count, for one): what must not happen is a second read of the route's data.
            const dataReads = read.mock.calls.map(([file]) => String(file)).filter((file) => file.startsWith(staticRoot));
            expect(dataReads).toEqual([]);
        });

        test('one unreadable observation file loses its ten minutes, not the whole answer', async () => {
            jest.spyOn(console, 'warn').mockImplementation(() => {});
            fs.writeFileSync(path.join(staticRoot, obsName(init + 30 * 60000)), '{half');
            const res = await request(app).get('/api/weather-forecast/observed').expect(200);
            expect(res.body.towns.vernal.air_temp.points).toHaveLength(2);
        });

        test('503 when there is no run, or the newest is more than a day old', async () => {
            fs.rmSync(path.join(staticRoot, 'forecasts'), { recursive: true });
            _resetWeatherForecastForTests();
            const none = await request(app).get('/api/weather-forecast/observed');
            expect([404, 503]).toContain(none.status);
            expect(none.body).toMatchObject({ status: 'unavailable', towns: {} });

            _resetWeatherForecastForTests();
            write('forecasts/forecast_hrrr_waypoints_us40_dense_20261101_0000Z.json', { init_time: '2026-11-01T00:00:00Z', stations: [] });
            const old = await request(app).get('/api/weather-forecast/observed').expect(503);
            expect(old.body).toEqual({ status: 'unavailable', message: 'The newest town forecast is too old to compare with observations', towns: {} });
        });
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
