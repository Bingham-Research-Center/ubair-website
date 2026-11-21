import fs from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';
import app from '../server.js';
import {
    checkIngestReadiness,
    envFileProblem,
    lastUploadAgeMinutes,
    noteAcceptedUpload,
    seedLastUpload,
    UPLOAD_DATA_TYPES,
    UPLOAD_STALE_MINUTES,
    _resetIngestReadinessForTests,
} from '../ingestReadiness.js';

const { R_OK, W_OK, X_OK } = fs.constants;

// Root passes every access() check, so denials are faked through the injected `access` rather
// than chmod-ed: the suite has to mean the same thing on a root shell and in CI.
const yes = () => true;
const no = () => false;
const allowAll = () => {};
const denyIf = predicate => (p, mode) => {
    if (predicate(p, mode)) throw Object.assign(new Error('EACCES'), { code: 'EACCES' });
};

beforeEach(() => _resetIngestReadinessForTests());

describe('envFileProblem', () => {
    test('flags a .env that exists but cannot be read (the 2026-10-26 www-data copy)', () => {
        expect(envFileProblem({ envPath: '/x/.env', exists: yes, access: denyIf(yes) }))
            .toBe('.env exists but is not readable by this process');
    });

    test('a missing .env is not a problem here: CI and laptops run without one', () => {
        expect(envFileProblem({ envPath: '/x/.env', exists: no, access: denyIf(yes) })).toBeNull();
    });

    test('a readable .env is not a problem', () => {
        expect(envFileProblem({ envPath: '/x/.env', exists: yes, access: allowAll })).toBeNull();
    });
});

describe('checkIngestReadiness', () => {
    const base = { envPath: '/x/.env', staticRoot: '/x/static', exists: yes, access: allowAll, isFile: yes };
    const env = { DATA_UPLOAD_API_KEY: 'k' };

    test('ready when the key is set and every upload directory and index is writable', () => {
        expect(checkIngestReadiness({ ...base, env })).toEqual({ ready: true, problems: [] });
    });

    test('reproduces the outage: unreadable .env, no key, five unwritable directories', () => {
        const writable = new Set(['/x/static/observations', '/x/static/outlooks']);
        const result = checkIngestReadiness({
            ...base,
            env: {},
            // The seven dataTypes that existed on the day of the outage.
            dataTypes: UPLOAD_DATA_TYPES.slice(0, 7),
            access: denyIf(p => p === '/x/.env' || (!writable.has(p) && !p.endsWith('.json'))),
        });
        expect(result.ready).toBe(false);
        expect(result.problems).toEqual([
            '.env exists but is not readable by this process',
            'DATA_UPLOAD_API_KEY is not set',
            'upload directories lack read/write/search permission: metadata, llm_outlooks, images, forecasts, road-forecast',
        ]);
    });

    test('directories need read, write and search permission, files only write', () => {
        const calls = [];
        checkIngestReadiness({ ...base, env, access: (p, mode) => calls.push([p, mode]) });
        expect(calls).toContainEqual(['/x/.env', R_OK]);
        expect(calls).toContainEqual(['/x/static/metadata', R_OK | W_OK | X_OK]);
        expect(calls).toContainEqual(['/x/static/road-forecast/latest.json', W_OK]);
    });

    test('a directory that is writable but not searchable is not ready', () => {
        const result = checkIngestReadiness({
            ...base,
            env,
            access: denyIf((p, mode) => p === '/x/static/images' && (mode & X_OK)),
        });
        expect(result.problems).toEqual(['upload directories lack read/write/search permission: images']);
    });

    test('an observations directory that cannot be listed is not ready (the upload index and /api/filelist list it)', () => {
        const result = checkIngestReadiness({
            ...base,
            env,
            access: denyIf((p, mode) => p === '/x/static/observations' && (mode & R_OK)),
        });
        expect(result.problems).toEqual(['upload directories lack read/write/search permission: observations']);
    });

    test('a directory where a replaced file should be is not ready (W_OK passes, the rename EISDIRs)', () => {
        const result = checkIngestReadiness({
            ...base,
            env,
            isFile: p => p !== '/x/static/road-forecast/latest.json',
        });
        expect(result.problems).toEqual(['files rewritten on upload are not writable: road-forecast/latest.json']);
    });

    test('a read-only file the upload route replaces is not ready', () => {
        const result = checkIngestReadiness({
            ...base,
            env,
            access: denyIf(p => p === '/x/static/road-forecast/latest.json'),
        });
        expect(result.ready).toBe(false);
        expect(result.problems).toEqual(['files rewritten on upload are not writable: road-forecast/latest.json']);
    });

    test('observations/filelist.json is no longer one of them: nothing writes it since 1.7.9', () => {
        const calls = [];
        checkIngestReadiness({ ...base, env, access: (p, mode) => calls.push([p, mode]) });
        expect(calls.map(([p]) => p)).not.toContain('/x/static/observations/filelist.json');
    });

    test('a missing directory only needs a writable parent, since the upload creates it', () => {
        const checked = [];
        const result = checkIngestReadiness({
            ...base,
            env,
            exists: p => p !== '/x/static/images',
            access: p => checked.push(p),
        });
        expect(result.ready).toBe(true);
        expect(checked).toContain('/x/static');
        expect(checked).not.toContain('/x/static/images');
    });

    test('covers every dataType the upload route writes', () => {
        expect(UPLOAD_DATA_TYPES).toEqual([
            'observations', 'metadata', 'outlooks', 'llm_outlooks', 'images', 'forecasts', 'road-forecast',
            'llm_forecasts', 'aircraft',
        ]);
    });
});

describe('lastUploadAgeMinutes', () => {
    test('is null until an upload is known', () => {
        expect(lastUploadAgeMinutes()).toBeNull();
    });

    test('is seeded at startup with the arrival time of the newest file on disk', () => {
        const now = Date.now();
        seedLastUpload(now - 40 * 60000);
        expect(lastUploadAgeMinutes(now)).toBe(40);
    });

    test('an empty box seeds no time', () => {
        seedLastUpload(null);
        expect(lastUploadAgeMinutes()).toBeNull();
        seedLastUpload(undefined);
        expect(lastUploadAgeMinutes()).toBeNull();
    });

    test('a fully successful upload overrides the seed', () => {
        const now = Date.now();
        seedLastUpload(now - 90 * 60000);
        noteAcceptedUpload(now - 2 * 60000);
        expect(lastUploadAgeMinutes(now)).toBe(2);
    });
});

describe('health and upload routes', () => {
    const originalCwd = process.cwd();
    const originalKey = process.env.DATA_UPLOAD_API_KEY;
    let root;

    beforeEach(() => {
        // The defaults resolve .env and public/api/static against the working directory,
        // exactly as dotenv and the upload route do, so a scratch cwd is a scratch box.
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'ingest-route-'));
        fs.mkdirSync(path.join(root, 'public', 'api', 'static', 'observations'), { recursive: true });
        process.chdir(root);
    });

    afterEach(() => {
        process.chdir(originalCwd);
        if (originalKey === undefined) delete process.env.DATA_UPLOAD_API_KEY;
        else process.env.DATA_UPLOAD_API_KEY = originalKey;
    });

    const upload = dataType => request(app)
        .post(`/api/upload/${dataType}`)
        .set('x-api-key', 'k')
        .set('x-client-hostname', 'notchpeak1.int.chpc.utah.edu')
        .attach('file', Buffer.from('{"ok":true}'), 'probe_20261027_0000Z.json');

    test('/api/health reports ingest but stays 200 + success for producers', async () => {
        delete process.env.DATA_UPLOAD_API_KEY;
        const res = await request(app).get('/api/health').expect(200);
        expect(res.body.success).toBe(true);
        expect(res.body.ingest).toEqual({ ready: false, problems: ['DATA_UPLOAD_API_KEY is not set'] });
    });

    test('/api/health/ingest is 503 with reasons when the key is missing', async () => {
        delete process.env.DATA_UPLOAD_API_KEY;
        noteAcceptedUpload();
        const res = await request(app).get('/api/health/ingest').expect(503);
        expect(res.body.ok).toBe(false);
        expect(res.body.ready).toBe(false);
        expect(res.body.reasons).toEqual(['DATA_UPLOAD_API_KEY is not set']);
    });

    test('/api/health/ingest is 503 when nothing has succeeded for too long', async () => {
        process.env.DATA_UPLOAD_API_KEY = 'k';
        noteAcceptedUpload(Date.now() - (UPLOAD_STALE_MINUTES + 5) * 60000);
        const res = await request(app).get('/api/health/ingest').expect(503);
        expect(res.body.ready).toBe(true);
        expect(res.body.lastUploadMinutes).toBe(UPLOAD_STALE_MINUTES + 5);
        expect(res.body.reasons).toEqual([`last accepted upload was ${UPLOAD_STALE_MINUTES + 5} min ago`]);
    });

    test('a successful upload turns /api/health/ingest green', async () => {
        process.env.DATA_UPLOAD_API_KEY = 'k';
        await request(app).get('/api/health/ingest').expect(503);
        await upload('metadata').expect(200);
        const res = await request(app).get('/api/health/ingest').expect(200);
        expect(res.body).toMatchObject({ ok: true, ready: true, lastUploadMinutes: 0, reasons: [] });
    });

    test('an upload that fails after the file landed does not count as accepted', async () => {
        process.env.DATA_UPLOAD_API_KEY = 'k';
        // latest.json as a directory makes the copy made after a road-forecast upload throw,
        // even as root.
        const dir = path.join(root, 'public', 'api', 'static', 'road-forecast');
        fs.mkdirSync(path.join(dir, 'latest.json'), { recursive: true });
        await upload('road-forecast').expect(500);
        const res = await request(app).get('/api/health/ingest').expect(503);
        expect(res.body.lastUploadMinutes).toBeNull();
        // Nothing temporary is left behind by the failure.
        expect(fs.readdirSync(dir).sort()).toEqual(['latest.json', 'probe_20261027_0000Z.json']);
    });
});
