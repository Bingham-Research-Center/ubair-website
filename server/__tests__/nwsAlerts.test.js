import request from 'supertest';
import { jest } from '@jest/globals';
import app from '../server.js';
import {
    ALERTS_MAX_STALE_MS,
    ALERTS_RETRY_MS,
    ALERTS_TTL_MS,
    ALERTS_URL,
    BASIN_ZONES,
    BASIN_ZONE_CODES,
    NwsAlertsService,
    _setNwsAlertsServiceForTests,
    alertLevel,
    alertScope,
    fetchAlertFeatures,
    normaliseAlert,
    sortAlerts,
} from '../nwsAlerts.js';
import FireWeatherService, { _flushFireWeatherCacheForTests } from '../fireWeatherService.js';
import { setFireWeatherService } from '../routes/fireWeather.js';

// The shared NWS alerts helper (issue #404). The rule under test throughout: a failed fetch is
// "unavailable", never an empty list, because an empty list means "the NWS says all clear".

const NOW = Date.parse('2026-11-20T05:00:00Z');

// An alert as api.weather.gov returns it, cut down to the fields we read.
const feature = (overrides = {}) => ({
    id: 'https://api.weather.gov/alerts/urn:oid:1',
    properties: {
        id: 'urn:oid:1',
        event: 'Winter Weather Advisory',
        status: 'Actual',
        messageType: 'Alert',
        severity: 'Moderate',
        urgency: 'Expected',
        certainty: 'Likely',
        areaDesc: 'Eastern Uinta Basin',
        geocode: { UGC: ['UTZ024'], SAME: ['049047'] },
        onset: '2026-11-19T17:00:00-07:00',
        expires: '2026-11-20T11:00:00-07:00',
        ends: '2026-11-20T17:00:00-07:00',
        headline: 'Winter Weather Advisory until November 20 at 5:00PM MST',
        description: '* WHAT...Snow.',
        instruction: 'Slow down.',
        senderName: 'NWS Grand Junction CO',
        ...overrides,
    },
});

describe('the Basin zone list', () => {
    test('is the two floor zones, their fire zones and counties, and the high ground around them', () => {
        expect(Object.keys(BASIN_ZONES.floor)).toEqual(['UTZ024', 'UTZ114', 'UTZ486', 'UTZ482', 'UTC047', 'UTC013']);
        expect(Object.keys(BASIN_ZONES.nearby)).toEqual([
            'UTZ023', 'UTZ112', 'UTZ113', 'UTZ025', 'UTZ485', 'UTZ483', 'UTZ484', 'UTZ487',
        ]);
    });

    test('goes into one request, every code in it', () => {
        expect(BASIN_ZONE_CODES).toHaveLength(14);
        expect(new Set(BASIN_ZONE_CODES).size).toBe(14);
        for (const code of BASIN_ZONE_CODES) expect(code).toMatch(/^UT[ZC]\d{3}$/);
        expect(ALERTS_URL).toBe(`https://api.weather.gov/alerts/active?zone=${BASIN_ZONE_CODES.join(',')}`);
    });
});

describe('alertLevel and alertScope', () => {
    test('the level is the last word of the event name', () => {
        expect(alertLevel('Winter Storm Warning')).toBe('warning');
        expect(alertLevel('Red Flag Warning')).toBe('warning');
        expect(alertLevel('Winter Storm Watch')).toBe('watch');
        expect(alertLevel('Wind Advisory')).toBe('advisory');
        expect(alertLevel('Special Weather Statement')).toBe('statement');
        expect(alertLevel('Air Quality Alert')).toBe('statement');
        expect(alertLevel(undefined)).toBe('statement');
    });

    test('floor wins when an alert covers both; a zone we did not ask about is no scope', () => {
        expect(alertScope(['UTZ114'])).toBe('floor');
        expect(alertScope(['UTC047'])).toBe('floor');
        expect(alertScope(['UTZ023'])).toBe('nearby');
        expect(alertScope(['UTZ112', 'UTZ114'])).toBe('floor');
        expect(alertScope(['UTZ110'])).toBeNull();
        expect(alertScope(undefined)).toBeNull();
    });
});

describe('normaliseAlert', () => {
    test('keeps what a page shows, with times in UTC', () => {
        expect(normaliseAlert(feature(), NOW)).toEqual({
            id: 'urn:oid:1',
            event: 'Winter Weather Advisory',
            level: 'advisory',
            scope: 'floor',
            zones: ['UTZ024'],
            areaDesc: 'Eastern Uinta Basin',
            severity: 'Moderate',
            urgency: 'Expected',
            certainty: 'Likely',
            onset: '2026-11-20T00:00:00.000Z',
            ends: '2026-11-21T00:00:00.000Z',
            headline: 'Winter Weather Advisory until November 20 at 5:00PM MST',
            description: '* WHAT...Snow.',
            instruction: 'Slow down.',
            sender: 'NWS Grand Junction CO',
        });
    });

    test('uses the event end, and the message expiry only when there is no end', () => {
        expect(normaliseAlert(feature({ ends: null }), NOW).ends).toBe('2026-11-20T18:00:00.000Z');
        expect(normaliseAlert(feature({ ends: null, expires: null }), NOW).ends).toBeNull();
    });

    test('drops tests, cancellations, ended alerts and zones outside the Basin', () => {
        expect(normaliseAlert(feature({ status: 'Test' }), NOW)).toBeNull();
        expect(normaliseAlert(feature({ messageType: 'Cancel' }), NOW)).toBeNull();
        expect(normaliseAlert(feature({ ends: '2026-11-19T20:00:00-07:00' }), NOW)).toBeNull();
        expect(normaliseAlert(feature({ geocode: { UGC: ['UTZ110'] } }), NOW)).toBeNull();
        expect(normaliseAlert(feature({ event: '' }), NOW)).toBeNull();
        expect(normaliseAlert({}, NOW)).toBeNull();
        expect(normaliseAlert(null, NOW)).toBeNull();
    });
});

describe('sortAlerts', () => {
    test('floor first, then warnings before watches before advisories, then soonest to end', () => {
        const alert = (event, zone, ends) => normaliseAlert(feature({ event, ends, geocode: { UGC: [zone] } }), NOW);
        const sorted = sortAlerts([
            alert('Winter Storm Warning', 'UTZ023', '2026-11-21T00:00:00Z'),
            alert('Wind Advisory', 'UTZ114', '2026-11-22T00:00:00Z'),
            alert('Wind Advisory', 'UTZ024', '2026-11-21T00:00:00Z'),
            alert('Winter Storm Watch', 'UTZ024', '2026-11-23T00:00:00Z'),
        ]);
        expect(sorted.map((a) => `${a.scope} ${a.event} ${a.zones[0]}`)).toEqual([
            'floor Winter Storm Watch UTZ024',
            'floor Wind Advisory UTZ024',
            'floor Wind Advisory UTZ114',
            'nearby Winter Storm Warning UTZ023',
        ]);
    });
});

describe('fetchAlertFeatures', () => {
    const answering = (status, body) => jest.fn().mockResolvedValue({
        ok: status >= 200 && status < 300, status, json: async () => body,
    });

    test('returns the features of a good answer, and an empty list only when the NWS sent one', async () => {
        const fetchImpl = answering(200, { features: [feature()] });
        await expect(fetchAlertFeatures(ALERTS_URL, { fetchImpl })).resolves.toHaveLength(1);
        expect(fetchImpl.mock.calls[0][0]).toBe(ALERTS_URL);
        expect(fetchImpl.mock.calls[0][1].headers['User-Agent']).toMatch(/BasinWX/);
        await expect(fetchAlertFeatures(ALERTS_URL, { fetchImpl: answering(200, { features: [] }) })).resolves.toEqual([]);
    });

    test('throws on an error status, a body that is not an alert list, or a network error', async () => {
        await expect(fetchAlertFeatures(ALERTS_URL, { fetchImpl: answering(503, {}) }))
            .rejects.toThrow('NWS alerts answered 503');
        await expect(fetchAlertFeatures(ALERTS_URL, { fetchImpl: answering(200, { title: 'Not Found' }) }))
            .rejects.toThrow('no "features" list');
        await expect(fetchAlertFeatures(ALERTS_URL, { fetchImpl: jest.fn().mockRejectedValue(new Error('ECONNRESET')) }))
            .rejects.toThrow('ECONNRESET');
    });

    test('gives up after the timeout instead of hanging', async () => {
        const fetchImpl = (url, { signal }) => new Promise((resolve, reject) => {
            signal.addEventListener('abort', () => reject(new Error('aborted')));
        });
        await expect(fetchAlertFeatures(ALERTS_URL, { fetchImpl, timeoutMs: 20 })).rejects.toThrow('aborted');
    });
});

describe('NwsAlertsService', () => {
    let clock;
    const service = (fetchFeatures) => new NwsAlertsService({ fetchFeatures, now: () => clock });
    const quiet = () => jest.spyOn(console, 'error').mockImplementation(() => {});

    beforeEach(() => { clock = NOW; });
    afterEach(() => jest.restoreAllMocks());

    test('ok with the alerts the NWS returned', async () => {
        const result = await service(async () => [feature(), feature({ status: 'Test' })]).getBasinAlerts();
        expect(result).toMatchObject({ status: 'ok', fetchedAt: '2026-11-20T05:00:00.000Z', error: null });
        expect(result.alerts.map((a) => a.event)).toEqual(['Winter Weather Advisory']);
    });

    test('ok with an empty list when the NWS says there are none', async () => {
        await expect(service(async () => []).getBasinAlerts())
            .resolves.toMatchObject({ status: 'ok', alerts: [] });
    });

    test('unavailable, with alerts null, when the first fetch fails', async () => {
        quiet();
        const result = await service(async () => { throw new Error('NWS alerts answered 503'); }).getBasinAlerts();
        expect(result).toEqual({
            status: 'unavailable', alerts: null, fetchedAt: null, error: 'NWS alerts answered 503',
        });
    });

    test('asks the NWS once per five minutes, however many callers there are', async () => {
        const fetchFeatures = jest.fn().mockResolvedValue([feature()]);
        const s = service(fetchFeatures);
        await Promise.all([s.getBasinAlerts(), s.getBasinAlerts(), s.getBasinAlerts()]);
        clock += ALERTS_TTL_MS - 1000;
        await s.getBasinAlerts();
        expect(fetchFeatures).toHaveBeenCalledTimes(1);
        clock += 2000;
        await s.getBasinAlerts();
        expect(fetchFeatures).toHaveBeenCalledTimes(2);
    });

    test('the last good answer stands in for half an hour of failures, then it is unavailable', async () => {
        quiet();
        const fetchFeatures = jest.fn().mockResolvedValueOnce([feature()]).mockRejectedValue(new Error('timeout'));
        const s = service(fetchFeatures);
        await s.getBasinAlerts();

        clock = NOW + ALERTS_MAX_STALE_MS - 1000;
        const standIn = await s.getBasinAlerts();
        expect(standIn).toMatchObject({ status: 'ok', fetchedAt: '2026-11-20T05:00:00.000Z' });
        expect(standIn.alerts).toHaveLength(1);

        clock = NOW + ALERTS_MAX_STALE_MS + ALERTS_RETRY_MS;
        expect(await s.getBasinAlerts()).toEqual({
            status: 'unavailable', alerts: null, fetchedAt: '2026-11-20T05:00:00.000Z', error: 'timeout',
        });
    });

    test('does not ask again within a minute of a failure', async () => {
        quiet();
        const fetchFeatures = jest.fn().mockRejectedValue(new Error('down'));
        const s = service(fetchFeatures);
        await s.getBasinAlerts();
        clock += ALERTS_RETRY_MS - 1000;
        expect((await s.getBasinAlerts()).status).toBe('unavailable');
        expect(fetchFeatures).toHaveBeenCalledTimes(1);
        clock += 2000;
        await s.getBasinAlerts();
        expect(fetchFeatures).toHaveBeenCalledTimes(2);
    });

    test('recovers as soon as the NWS answers again', async () => {
        quiet();
        const fetchFeatures = jest.fn().mockRejectedValueOnce(new Error('down')).mockResolvedValue([]);
        const s = service(fetchFeatures);
        expect((await s.getBasinAlerts()).status).toBe('unavailable');
        clock += ALERTS_RETRY_MS + 1000;
        expect(await s.getBasinAlerts()).toMatchObject({ status: 'ok', alerts: [] });
    });

    test('an alert that ends between two fetches is dropped, not shown late', async () => {
        const s = service(async () => [feature({ ends: '2026-11-20T05:02:00Z' })]);
        expect((await s.getBasinAlerts()).alerts).toHaveLength(1);
        clock += 3 * 60 * 1000;
        expect((await s.getBasinAlerts()).alerts).toEqual([]);
    });
});

describe('GET /api/weather-alerts', () => {
    afterEach(() => {
        _setNwsAlertsServiceForTests(null);
        jest.restoreAllMocks();
    });

    test('200 with the list', async () => {
        _setNwsAlertsServiceForTests(new NwsAlertsService({ fetchFeatures: async () => [feature()], now: () => NOW }));
        const res = await request(app).get('/api/weather-alerts').expect(200);
        expect(res.body).toMatchObject({ status: 'ok', fetchedAt: '2026-11-20T05:00:00.000Z', message: null });
        expect(res.body.alerts[0]).toMatchObject({ event: 'Winter Weather Advisory', level: 'advisory', scope: 'floor' });
    });

    test('200 with an empty list when there are none', async () => {
        _setNwsAlertsServiceForTests(new NwsAlertsService({ fetchFeatures: async () => [], now: () => NOW }));
        const res = await request(app).get('/api/weather-alerts').expect(200);
        expect(res.body.alerts).toEqual([]);
    });

    test('503 with alerts null when the NWS cannot be asked', async () => {
        jest.spyOn(console, 'error').mockImplementation(() => {});
        _setNwsAlertsServiceForTests(new NwsAlertsService({
            fetchFeatures: async () => { throw new Error('down'); }, now: () => NOW,
        }));
        const res = await request(app).get('/api/weather-alerts').expect(503);
        expect(res.body).toEqual({
            status: 'unavailable',
            fetchedAt: null,
            alerts: null,
            message: 'National Weather Service alerts are unavailable right now',
        });
    });
});

describe('the fire page no longer reads an NWS failure as "no alerts"', () => {
    const redFlag = feature({
        event: 'Red Flag Warning', areaDesc: 'Eastern Uintah Basin', geocode: { UGC: ['UTZ486'] },
    });
    let fire;

    beforeEach(() => {
        _flushFireWeatherCacheForTests();
        fire = new FireWeatherService();
        jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        setFireWeatherService(new FireWeatherService());
        jest.restoreAllMocks();
    });

    test('fetchRedFlagAlerts is null when either request fails', async () => {
        fire.fetchAlertFeatures = jest.fn()
            .mockResolvedValueOnce([redFlag])
            .mockRejectedValueOnce(new Error('NWS alerts answered 500'));
        await expect(fire.fetchRedFlagAlerts()).resolves.toBeNull();
    });

    test('and a failure is not cached: the next call asks again', async () => {
        fire.fetchAlertFeatures = jest.fn().mockRejectedValue(new Error('down'));
        await fire.fetchRedFlagAlerts();
        fire.fetchAlertFeatures = jest.fn().mockResolvedValue([]);
        await expect(fire.fetchRedFlagAlerts()).resolves.toEqual([]);
    });

    test('it is the Basin\'s alerts when both answer, and empty only when the NWS has none', async () => {
        const elsewhere = feature({ event: 'Red Flag Warning', areaDesc: 'Salt Lake Valley' });
        fire.fetchAlertFeatures = jest.fn().mockResolvedValueOnce([redFlag, elsewhere]).mockResolvedValueOnce([]);
        const alerts = await fire.fetchRedFlagAlerts();
        expect(alerts.map((a) => `${a.event}: ${a.areaDesc}`)).toEqual(['Red Flag Warning: Eastern Uintah Basin']);
    });

    test('GET /api/fire-weather/alerts is 503 with alerts null, not 200 with an empty list', async () => {
        fire.fetchAlertFeatures = jest.fn().mockRejectedValue(new Error('down'));
        setFireWeatherService(fire);
        const res = await request(app).get('/api/fire-weather/alerts').expect(503);
        expect(res.body).toMatchObject({ success: false, status: 'unavailable', alerts: null });
    });

    test('GET /api/fire-weather/alerts is 200 with the list when the NWS answers', async () => {
        fire.fetchAlertFeatures = jest.fn().mockResolvedValueOnce([redFlag]).mockResolvedValueOnce([]);
        setFireWeatherService(fire);
        const res = await request(app).get('/api/fire-weather/alerts').expect(200);
        expect(res.body).toMatchObject({ success: true, status: 'ok', totalAlerts: 1 });
    });
});
