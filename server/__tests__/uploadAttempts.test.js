import {
    recordUploadAttempt,
    getRecentUploadAttempts,
    countUploadAttempts,
    MAX_ATTEMPTS,
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
