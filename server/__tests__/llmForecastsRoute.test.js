import fs from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';
import { jest } from '@jest/globals';
import app from '../server.js';

// GET /api/llm-forecasts/latest: what the pages that can show LLM text ask on every load.
// "No file yet" is the state of both sites until a producer sends one, and it must be an
// ordinary answer, not a 404 in every visitor's console.

const FFION = JSON.parse(fs.readFileSync(
    new URL('../../public/js/__tests__/fixtures/llm_forecasts/llm_forecast_ffion_20261203_1210Z.json', import.meta.url), 'utf8'));

describe('GET /api/llm-forecasts/latest', () => {
    const originalCwd = process.cwd();
    let dir;

    beforeEach(() => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'llm-latest-'));
        dir = path.join(root, 'public', 'api', 'static', 'llm_forecasts');
        process.chdir(root);
    });

    afterEach(() => {
        process.chdir(originalCwd);
        jest.restoreAllMocks();
    });

    test('200 with a null for each persona when nothing has ever been uploaded', async () => {
        // The folder does not exist at all: the upload route makes it on the first upload.
        const res = await request(app).get('/api/llm-forecasts/latest').expect(200);
        expect(res.body).toEqual({ status: 'ok', files: { ffion: null, rhiannon: null } });
        expect(res.headers['cache-control']).toBe('no-store');
    });

    test('hands over each persona\'s newest file as stored', async () => {
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'latest_ffion.json'), JSON.stringify(FFION));
        const res = await request(app).get('/api/llm-forecasts/latest').expect(200);
        expect(res.body.files.ffion).toEqual(FFION);
        expect(res.body.files.rhiannon).toBeNull();
    });

    test('a file that cannot be read is "none" for that persona, with one line in the log', async () => {
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'latest_ffion.json'), '{half');
        fs.writeFileSync(path.join(dir, 'latest_rhiannon.json'), JSON.stringify({ persona: 'rhiannon' }));
        const res = await request(app).get('/api/llm-forecasts/latest').expect(200);
        expect(res.body.files).toEqual({ ffion: null, rhiannon: { persona: 'rhiannon' } });
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0][0]).toMatch(/latest_ffion\.json could not be read/);
    });

    test('only the personas the site knows are answered for', async () => {
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'latest_gwen.json'), JSON.stringify({ persona: 'gwen' }));
        const res = await request(app).get('/api/llm-forecasts/latest').expect(200);
        expect(Object.keys(res.body.files)).toEqual(['ffion', 'rhiannon']);
    });
});
