import fs from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';
import app from '../server.js';
import { _resetUploadIndexForTests } from '../uploadIndex.js';
import { _resetUploadAttemptsForTests, getRecentUploadAttempts } from '../monitoring/uploadAttempts.js';

// The upload route and the routes that answer "which file is newest?", end to end on a
// scratch box. What changed in 1.7.9: a file is written under a temporary name and renamed
// when it has passed every check; no upload lists a directory; pages ask for one name.

describe('uploads and the upload index', () => {
    const originalCwd = process.cwd();
    const saved = { key: process.env.DATA_UPLOAD_API_KEY, hosts: process.env.UPLOAD_ALLOWED_HOSTS };
    let root;
    let staticRoot;

    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'upload-index-route-'));
        staticRoot = path.join(root, 'public', 'api', 'static');
        fs.mkdirSync(path.join(staticRoot, 'observations'), { recursive: true });
        process.chdir(root);
        process.env.DATA_UPLOAD_API_KEY = 'k';
        delete process.env.UPLOAD_ALLOWED_HOSTS;
        _resetUploadIndexForTests();
        _resetUploadAttemptsForTests();
    });

    afterEach(() => {
        process.chdir(originalCwd);
        for (const [name, envName] of [['key', 'DATA_UPLOAD_API_KEY'], ['hosts', 'UPLOAD_ALLOWED_HOSTS']]) {
            if (saved[name] === undefined) delete process.env[envName];
            else process.env[envName] = saved[name];
        }
        fs.rmSync(root, { recursive: true, force: true });
    });

    const post = (dataType, name, body = '[{"stid":"KVEL"}]') => request(app)
        .post(`/api/upload/${dataType}`)
        .set('x-api-key', 'k')
        .set('x-client-hostname', 'notchpeak1.int.chpc.utah.edu')
        .attach('file', Buffer.from(body), name);

    const names = (dataType) => fs.readdirSync(path.join(staticRoot, dataType)).sort();
    const latest = (dataType, prefix) => request(app).get(`/api/latest/${dataType}`).query({ prefix });

    test('a file lands under its own name, and nothing else is written', async () => {
        const res = await post('observations', 'map_obs_20261121_0755Z.json').expect(200);
        expect(res.body).toMatchObject({
            success: true,
            filename: 'map_obs_20261121_0755Z.json',
            path: '/api/static/observations/map_obs_20261121_0755Z.json',
        });
        // No temporary file left, and no filelist.json: nothing rebuilds a list on upload.
        expect(names('observations')).toEqual(['map_obs_20261121_0755Z.json']);
        expect(fs.readFileSync(path.join(staticRoot, 'observations', 'map_obs_20261121_0755Z.json'), 'utf8')).toBe('[{"stid":"KVEL"}]');
    });

    test('an upload to another dataType does not touch the observations directory', async () => {
        await post('forecasts', 'forecast_hrrr_kvel_crosswind_20261121_0500Z.json', '{}').expect(200);
        expect(names('observations')).toEqual([]);
    });

    test('a refused re-send of a fixed-name file leaves the good copy alone', async () => {
        // The surface-layers index has one name for ever. Until 1.7.9 the upload was written
        // over it first and checked afterwards, so a truncated re-send deleted the index.
        const index = 'forecast_hrrr_surface_layers_index.json';
        await post('forecasts', index, '{"runs":[1,2,3]}').expect(200);
        const res = await post('forecasts', index, '{"runs":[1,2').expect(400);
        expect(res.body.message).toBe('Invalid JSON file');
        expect(names('forecasts')).toEqual([index]);
        expect(fs.readFileSync(path.join(staticRoot, 'forecasts', index), 'utf8')).toBe('{"runs":[1,2,3]}');
    });

    test('a good re-send replaces the file whole', async () => {
        const index = 'forecast_hrrr_surface_layers_index.json';
        await post('forecasts', index, '{"runs":[1]}').expect(200);
        await post('forecasts', index, '{"runs":[1,2]}').expect(200);
        expect(names('forecasts')).toEqual([index]);
        expect(fs.readFileSync(path.join(staticRoot, 'forecasts', index), 'utf8')).toBe('{"runs":[1,2]}');
    });

    test('a file type the dataType does not take leaves nothing behind, temporary or otherwise', async () => {
        await post('llm_forecasts', 'llm_forecast_ffion_20261203_1210Z.md', '# no').expect(400);
        expect(names('llm_forecasts')).toEqual([]);
    });

    test('a name that starts with a dot is refused: those are the route\'s own temporary files', async () => {
        const res = await post('forecasts', '.hidden_20261121_0500Z.json', '{}').expect(400);
        expect(res.body.message).toBe('Invalid file name');
        expect(names('forecasts')).toEqual([]);
        expect(getRecentUploadAttempts(1)[0]).toMatchObject({ status: 400, detail: 'invalid file name' });
    });

    test('road-forecast keeps latest.json in step, as a whole file', async () => {
        await post('road-forecast', 'road_forecast_20261121_0722Z.json', '{"init_time":"2026-11-21T06:00:00Z"}').expect(200);
        expect(names('road-forecast')).toEqual(['latest.json', 'road_forecast_20261121_0722Z.json']);
        expect(JSON.parse(fs.readFileSync(path.join(staticRoot, 'road-forecast', 'latest.json'), 'utf8')))
            .toEqual({ init_time: '2026-11-21T06:00:00Z' });
    });

    describe('GET /api/latest/:dataType', () => {
        test('names the newest file of a product, whatever order the files arrived in', async () => {
            await post('observations', 'map_obs_20261121_0755Z.json').expect(200);
            let res = await latest('observations', 'map_obs_').expect(200);
            expect(res.body).toEqual({ dataType: 'observations', prefix: 'map_obs_', filename: 'map_obs_20261121_0755Z.json' });
            expect(res.headers['cache-control']).toBe('no-store');

            await post('observations', 'map_obs_20261121_0800Z.json').expect(200);
            await post('observations', 'map_obs_20261121_0750Z.json').expect(200); // sent late
            res = await latest('observations', 'map_obs_').expect(200);
            expect(res.body.filename).toBe('map_obs_20261121_0800Z.json');
        });

        test('knows files that were on disk before the app started', async () => {
            fs.writeFileSync(path.join(staticRoot, 'observations', 'map_obs_20261120_2355Z.json'), '[]');
            fs.mkdirSync(path.join(staticRoot, 'metadata'));
            fs.writeFileSync(path.join(staticRoot, 'metadata', 'map_obs_meta_20261121_0446Z.json'), '[]');
            expect((await latest('observations', 'map_obs_').expect(200)).body.filename).toBe('map_obs_20261120_2355Z.json');
            expect((await latest('metadata', 'map_obs_meta_').expect(200)).body.filename).toBe('map_obs_meta_20261121_0446Z.json');
        });

        test('each product in a shared directory has its own newest file', async () => {
            await post('forecasts', 'forecast_hrrr_kvel_crosswind_20261121_0500Z.json', '{}').expect(200);
            await post('forecasts', 'forecast_hrrr_waypoints_us40_dense_20261121_0400Z.json', '{}').expect(200);
            await post('forecasts', 'forecast_hrrr_surface_layers_index.json', '{}').expect(200);
            expect((await latest('forecasts', 'forecast_hrrr_kvel_crosswind_')).body.filename)
                .toBe('forecast_hrrr_kvel_crosswind_20261121_0500Z.json');
            expect((await latest('forecasts', 'forecast_hrrr_waypoints_us40_dense_')).body.filename)
                .toBe('forecast_hrrr_waypoints_us40_dense_20261121_0400Z.json');
        });

        test('"no such file yet" is an ordinary answer, not a 404 in a visitor\'s console', async () => {
            const res = await latest('forecasts', 'forecast_hrrr_kvel_crosswind_').expect(200);
            expect(res.body).toEqual({ dataType: 'forecasts', prefix: 'forecast_hrrr_kvel_crosswind_', filename: null });
        });

        test('an unknown dataType is 404 and a prefix that is not the start of a name is 400', async () => {
            await request(app).get('/api/latest/timeseries').query({ prefix: 'x_' }).expect(404);
            await request(app).get('/api/latest/..%2F..').query({ prefix: 'x_' }).expect(404);
            await request(app).get('/api/latest/observations').expect(400);
            await latest('observations', '../map_obs_').expect(400);
            await latest('observations', 'map_obs_*').expect(400);
        });
    });

    describe('GET /api/filelist/:dataType', () => {
        beforeEach(() => {
            const dir = path.join(staticRoot, 'forecasts');
            fs.mkdirSync(dir);
            for (const name of [
                'forecast_clustering_summary_20261120_1200Z.json',
                'forecast_clustering_summary_20261120_1800Z.json',
                'forecast_hrrr_kvel_crosswind_20261121_0500Z.json',
                '.upload-1-abcdefabcdef.part',
                'notes.docx',
            ]) fs.writeFileSync(path.join(dir, name), '{}');
        });

        test('lists a dataType as before', async () => {
            const res = await request(app).get('/api/filelist/forecasts').expect(200);
            expect(res.body.sort()).toEqual([
                'forecast_clustering_summary_20261120_1200Z.json',
                'forecast_clustering_summary_20261120_1800Z.json',
                'forecast_hrrr_kvel_crosswind_20261121_0500Z.json',
            ]);
        });

        test('?prefix= sends one family of files, not the whole directory', async () => {
            const res = await request(app).get('/api/filelist/forecasts').query({ prefix: 'forecast_clustering_summary_' }).expect(200);
            expect(res.body.sort()).toEqual([
                'forecast_clustering_summary_20261120_1200Z.json',
                'forecast_clustering_summary_20261120_1800Z.json',
            ]);
            await request(app).get('/api/filelist/forecasts').query({ prefix: '../' }).expect(400);
        });

        test('only an upload directory is listed, however the name is spelt', async () => {
            // Express decodes %2F inside the parameter: "..%2F.." was public/ until 1.7.9.
            fs.writeFileSync(path.join(root, 'public', 'secret.json'), '{}');
            for (const name of ['..%2F..', '..%2F..%2F..', 'forecasts%2F..%2F..', 'timeseries']) {
                const res = await request(app).get(`/api/filelist/${name}`).expect(404);
                expect(res.body.reason).toBe('unknown-dataType');
            }
        });

        test('a dataType nobody has uploaded to is still a 404 that says so', async () => {
            const res = await request(app).get('/api/filelist/aircraft').expect(404);
            expect(res.body.reason).toBe('directory-missing');
        });
    });

    test('GET /api/live-observations hands over the newest observation file', async () => {
        await request(app).get('/api/live-observations').expect(404);
        await post('observations', 'map_obs_20261121_0755Z.json', '[{"stid":"KVEL"},{"stid":"QV4"}]').expect(200);
        await post('observations', 'map_obs_20261121_0750Z.json', '[{"stid":"KVEL"}]').expect(200);
        const res = await request(app).get('/api/live-observations').expect(200);
        expect(res.body).toMatchObject({ filename: 'map_obs_20261121_0755Z.json', totalObservations: 2 });
    });

    test('GET /api/monitoring/freshness is answered from the index, product by product', async () => {
        await post('observations', 'map_obs_20261121_0755Z.json').expect(200);
        await post('forecasts', 'forecast_hrrr_waypoints_us40_dense_20261121_0500Z.json', '{}').expect(200);
        const res = await request(app).get('/api/monitoring/freshness').expect(200);
        expect(res.body.freshness.observations).toMatchObject({
            status: 'fresh', latestFile: 'map_obs_20261121_0755Z.json', ageMinutes: 0, expectedFreqMinutes: 5, totalFiles: 1,
        });
        expect(res.body.freshness.forecasts.products.hrrr_waypoints).toMatchObject({ status: 'fresh', totalFiles: 1 });
        expect(res.body.freshness.forecasts.products.hrrr_surface_layers.status).toBe('no_data');
    });
});
