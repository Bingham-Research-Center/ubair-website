import { jest } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
    recordUploadAttempt,
    getRecentUploadAttempts,
    getRecentRejectedAttempts,
    countUploadAttempts,
    countRejectedAttempts,
    enableAttemptLog,
    flushAttemptLog,
    MAX_ATTEMPTS,
    MAX_REJECTED,
    _resetUploadAttemptsForTests,
} from '../monitoring/uploadAttempts.js';

beforeEach(() => _resetUploadAttemptsForTests());

test('records the fields an operator needs and derives ok from status', () => {
    recordUploadAttempt({
        ip: '155.101.26.78', hostname: 'notchpeak1.int.chpc.utah.edu',
        dataType: 'observations', filename: 'map_obs_20260924_0440Z.json',
        status: 200, detail: 'accepted',
    });
    recordUploadAttempt({ ip: '203.0.113.9', hostname: null, dataType: 'forecasts',
        filename: null, status: 401, detail: 'bad api key' });

    const [newest, older] = getRecentUploadAttempts();
    expect(newest).toMatchObject({ status: 401, ok: false, hostname: null, filename: null });
    expect(older).toMatchObject({ status: 200, ok: true, dataType: 'observations' });
    expect(typeof newest.ts).toBe('string');
    expect(countUploadAttempts()).toBe(2);
});

test('keeps only the newest MAX_ATTEMPTS entries', () => {
    for (let i = 0; i < MAX_ATTEMPTS + 25; i++) {
        recordUploadAttempt({ ip: '::1', dataType: 'observations', filename: `f${i}`, status: 200, detail: 'accepted' });
    }
    expect(countUploadAttempts()).toBe(MAX_ATTEMPTS);
    expect(getRecentUploadAttempts(1)[0].filename).toBe(`f${MAX_ATTEMPTS + 24}`);
    expect(getRecentUploadAttempts(MAX_ATTEMPTS).at(-1).filename).toBe('f25');
});

test('limit is honoured and never exceeds the buffer', () => {
    for (let i = 0; i < 10; i++) {
        recordUploadAttempt({ ip: '::1', dataType: 'metadata', filename: `m${i}`, status: 200, detail: 'accepted' });
    }
    expect(getRecentUploadAttempts(3)).toHaveLength(3);
    expect(getRecentUploadAttempts(10_000)).toHaveLength(10);
});

const accepted = (i) => ({ ip: '155.101.26.78', hostname: 'notchpeak1.int.chpc.utah.edu', dataType: 'forecasts',
    filename: `forecast_possibility_heatmap_clyfar${String(i).padStart(3, '0')}_20261120_1800Z.json`, status: 200, detail: 'accepted' });
const refused = (detail = 'wrong api key') => ({ ip: '203.0.113.9', hostname: null, dataType: 'observations', filename: null, status: 401, detail });

test('holds two days of attempts, not three hours: a Clyfar run is 165 uploads', () => {
    expect(MAX_ATTEMPTS).toBeGreaterThanOrEqual(2000);
});

test('a refused attempt outlives any burst of accepted ones', () => {
    recordUploadAttempt(refused());
    for (let i = 0; i < MAX_ATTEMPTS + 50; i++) recordUploadAttempt(accepted(i));

    // Pushed out of the main list by the burst, as it was after every Clyfar run on .com...
    expect(getRecentUploadAttempts(MAX_ATTEMPTS).some((a) => !a.ok)).toBe(false);
    // ...but still on record.
    expect(countRejectedAttempts()).toBe(1);
    expect(getRecentRejectedAttempts()).toEqual([expect.objectContaining({ status: 401, ok: false, detail: 'wrong api key' })]);
});

test('the refused list is newest first and bounded', () => {
    for (let i = 0; i < MAX_REJECTED + 5; i++) recordUploadAttempt(refused(`reason ${i}`));
    expect(countRejectedAttempts()).toBe(MAX_REJECTED);
    expect(getRecentRejectedAttempts(2).map((a) => a.detail)).toEqual([`reason ${MAX_REJECTED + 4}`, `reason ${MAX_REJECTED + 3}`]);
});

describe('the attempt log on disk', () => {
    let dir;
    let file;

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'attempt-log-'));
        file = path.join(dir, 'logs', 'upload_attempts.log');
    });

    afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

    test('attempts survive a restart, refused ones included, in order', async () => {
        // .dev was restarted at 04:55Z on 2026-11-21 and with it went any record of why 13
        // observation cycles that week had reached .com and not .dev.
        expect(await enableAttemptLog(file)).toEqual({ loaded: 0 });
        recordUploadAttempt(accepted(1));
        recordUploadAttempt(refused('host not allowed'));
        recordUploadAttempt(accepted(2));
        await flushAttemptLog();

        _resetUploadAttemptsForTests(); // the process goes away
        expect(countUploadAttempts()).toBe(0);

        expect(await enableAttemptLog(file)).toEqual({ loaded: 3 });
        expect(getRecentUploadAttempts().map((a) => a.status)).toEqual([200, 401, 200]);
        expect(getRecentUploadAttempts()[0].filename).toMatch(/clyfar002/);
        expect(getRecentRejectedAttempts()).toEqual([expect.objectContaining({ detail: 'host not allowed' })]);
    });

    test('an attempt recorded before the log was ready is kept, after what was read back', async () => {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, `${JSON.stringify({ ts: '2026-11-21T04:00:00.000Z', status: 200, ok: true, detail: 'accepted', filename: 'old.json' })}\n`);
        recordUploadAttempt(accepted(7));
        await enableAttemptLog(file);
        await flushAttemptLog();
        expect(getRecentUploadAttempts().map((a) => a.filename)).toEqual([accepted(7).filename, 'old.json']);
        expect(fs.readFileSync(file, 'utf8').trim().split('\n')).toHaveLength(2);
    });

    test('a line cut short by a crash, or one that is not an attempt, is skipped', async () => {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, [
            JSON.stringify({ ts: '2026-11-21T04:00:00.000Z', status: 200, ok: true, detail: 'accepted' }),
            '{"ts":"2026-11-21T04:05:00.000Z","status":2',
            '"just a string"',
            JSON.stringify({ ts: '2026-11-21T04:10:00.000Z', status: 403, ok: false, detail: 'host not allowed' }),
        ].join('\n'));
        expect(await enableAttemptLog(file)).toEqual({ loaded: 2 });
        expect(countRejectedAttempts()).toBe(1);
    });

    test('the file is rotated once it is full, and both halves are read back', async () => {
        await enableAttemptLog(file, { maxBytes: 600 });
        for (let i = 0; i < 6; i++) recordUploadAttempt(accepted(i));
        await flushAttemptLog();
        expect(fs.existsSync(`${file}.1`)).toBe(true);
        expect(fs.statSync(file).size).toBeLessThan(1200);

        _resetUploadAttemptsForTests();
        const { loaded } = await enableAttemptLog(file);
        expect(loaded).toBe(6);
        expect(getRecentUploadAttempts(1)[0].filename).toMatch(/clyfar005/);
    });

    test('a log that cannot be written never gets in the way of recording', async () => {
        const error = jest.spyOn(console, 'error').mockImplementation(() => {});
        fs.writeFileSync(path.join(dir, 'logs'), 'a file where the directory should be');
        expect(await enableAttemptLog(file)).toEqual({ loaded: 0 });
        recordUploadAttempt(accepted(1));
        await flushAttemptLog();
        expect(countUploadAttempts()).toBe(1);
        error.mockRestore();
    });
});
