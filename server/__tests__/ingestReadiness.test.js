import fs from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';
import app from '../server.js';
import {
    checkIngestReadiness,
    envFileProblem,
    lastUploadAgeMinutes,
    UPLOAD_DATA_TYPES,
    UPLOAD_STALE_MINUTES,
    _resetIngestReadinessForTests,
} from '../ingestReadiness.js';

// Root passes every access() check, so readability and writability are faked rather than
// chmod-ed: the suite has to mean the same thing on a root shell and in CI.
const yes = () => true;
const no = () => false;

describe('envFileProblem', () => {
    test('flags a .env that exists but cannot be read (the 2026-10-26 www-data copy)', () => {
        expect(envFileProblem({ envPath: '/x/.env', exists: yes, canRead: no }))
            .toBe('.env exists but is not readable by this process');
    });

    test('a missing .env is not a problem here: CI and laptops run without one', () => {
        expect(envFileProblem({ envPath: '/x/.env', exists: no, canRead: no })).toBeNull();
    });

    test('a readable .env is not a problem', () => {
        expect(envFileProblem({ envPath: '/x/.env', exists: yes, canRead: yes })).toBeNull();
    });
});

describe('checkIngestReadiness', () => {
    const base = { envPath: '/x/.env', staticRoot: '/x/static', exists: yes, canRead: yes, canWrite: yes };

    test('ready when the key is set and every upload directory is writable', () => {
        expect(checkIngestReadiness({ ...base, env: { DATA_UPLOAD_API_KEY: 'k' } }))
            .toEqual({ ready: true, problems: [] });
    });

    test('reproduces the outage: unreadable .env, no key, five unwritable directories', () => {
        const writable = new Set(['/x/static/observations', '/x/static/outlooks']);
        const result = checkIngestReadiness({
            ...base,
            env: {},
            canRead: no,
            canWrite: dir => writable.has(dir),
        });
        expect(result.ready).toBe(false);
        expect(result.problems).toEqual([
            '.env exists but is not readable by this process',
            'DATA_UPLOAD_API_KEY is not set',
            'upload directories not writable: metadata, llm_outlooks, images, forecasts, road-forecast',
        ]);
    });

    test('a missing directory only needs a writable parent, since the upload creates it', () => {
        const checked = [];
        const result = checkIngestReadiness({
            ...base,
            env: { DATA_UPLOAD_API_KEY: 'k' },
            exists: p => p !== '/x/static/images',
            canWrite: dir => { checked.push(dir); return true; },
        });
        expect(result.ready).toBe(true);
        expect(checked).toContain('/x/static');
        expect(checked).not.toContain('/x/static/images');
    });

    test('covers every dataType the upload route writes', () => {
        expect(UPLOAD_DATA_TYPES).toEqual([
            'observations', 'metadata', 'outlooks', 'llm_outlooks', 'images', 'forecasts', 'road-forecast',
        ]);
    });
});

describe('lastUploadAgeMinutes', () => {
    test('is the age of observations/filelist.json, which every accepted upload rewrites', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ingest-'));
        fs.mkdirSync(path.join(root, 'observations'));
        const file = path.join(root, 'observations', 'filelist.json');
        fs.writeFileSync(file, '[]');
        const now = Date.now();
        const fortyMinutesAgo = new Date(now - 40 * 60000);
        fs.utimesSync(file, fortyMinutesAgo, fortyMinutesAgo);
        expect(lastUploadAgeMinutes({ staticRoot: root, now })).toBe(40);
    });

    test('is null when nothing has ever been uploaded', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ingest-'));
        expect(lastUploadAgeMinutes({ staticRoot: root })).toBeNull();
    });
});

describe('health routes', () => {
    const originalCwd = process.cwd();
    const originalKey = process.env.DATA_UPLOAD_API_KEY;
    let root;

    beforeEach(() => {
        // The defaults resolve .env and public/api/static against the working directory,
        // exactly as dotenv and the upload route do, so a scratch cwd is a scratch box.
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'ingest-route-'));
        fs.mkdirSync(path.join(root, 'public', 'api', 'static', 'observations'), { recursive: true });
        process.chdir(root);
        _resetIngestReadinessForTests();
    });

    afterEach(() => {
        process.chdir(originalCwd);
        if (originalKey === undefined) delete process.env.DATA_UPLOAD_API_KEY;
        else process.env.DATA_UPLOAD_API_KEY = originalKey;
        _resetIngestReadinessForTests();
    });

    const touchFilelist = minutesAgo => {
        const file = path.join(root, 'public', 'api', 'static', 'observations', 'filelist.json');
        fs.writeFileSync(file, '[]');
        const when = new Date(Date.now() - minutesAgo * 60000);
        fs.utimesSync(file, when, when);
    };

    test('/api/health reports ingest but stays 200 + success for producers', async () => {
        delete process.env.DATA_UPLOAD_API_KEY;
        const res = await request(app).get('/api/health').expect(200);
        expect(res.body.success).toBe(true);
        expect(res.body.ingest).toEqual({ ready: false, problems: ['DATA_UPLOAD_API_KEY is not set'] });
    });

    test('/api/health/ingest is 503 with reasons when the key is missing', async () => {
        delete process.env.DATA_UPLOAD_API_KEY;
        touchFilelist(1);
        const res = await request(app).get('/api/health/ingest').expect(503);
        expect(res.body.ok).toBe(false);
        expect(res.body.ready).toBe(false);
        expect(res.body.reasons).toEqual(['DATA_UPLOAD_API_KEY is not set']);
    });

    test('/api/health/ingest is 503 when nothing has been accepted for too long', async () => {
        process.env.DATA_UPLOAD_API_KEY = 'k';
        touchFilelist(UPLOAD_STALE_MINUTES + 5);
        const res = await request(app).get('/api/health/ingest').expect(503);
        expect(res.body.ready).toBe(true);
        expect(res.body.lastUploadMinutes).toBe(UPLOAD_STALE_MINUTES + 5);
        expect(res.body.reasons).toEqual([`last accepted upload was ${UPLOAD_STALE_MINUTES + 5} min ago`]);
    });

    test('/api/health/ingest is 200 when ready and uploads are arriving', async () => {
        process.env.DATA_UPLOAD_API_KEY = 'k';
        touchFilelist(3);
        const res = await request(app).get('/api/health/ingest').expect(200);
        expect(res.body).toMatchObject({ ok: true, ready: true, lastUploadMinutes: 3, reasons: [] });
    });
});
