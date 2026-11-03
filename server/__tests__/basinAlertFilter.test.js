import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { alertLocation, filterBasinAlerts, isAlertRelevantToBasin } from '../basinAlertFilter.js';

const fetchMock = jest.fn();
const memoryCache = new Map();
jest.unstable_mockModule('node-fetch', () => ({ default: fetchMock }));
jest.unstable_mockModule('node-cache', () => ({ default: class {
    get(key) { return memoryCache.get(key); }
    set(key, value) { memoryCache.set(key, value); }
} }));
const { default: TrafficEventsService } = await import('../trafficEventsService.js');

const now = Date.parse('2026-11-02T18:00:00Z');
const bluff = {
    id: 2666,
    message: 'Road Weather Update: SR-163 is closed from MP 41 (US-191 Jct, South of Bluff) to MP 25 (SR-211 Jct) due to flooding. Delay travel or use an alternate route.',
    regions: ['Southeastern Utah'],
    startTime: '2026-11-02T11:54:00.000Z',
    endTime: '2026-11-03T11:53:00.000Z'
};
const basin = { id: 1, message: 'US-40 near Roosevelt has lane closures.', regions: ['Northeastern Utah'] };

describe('Basin alert coverage', () => {
    it.each([
        [{ regions: ['Uintah County'], message: 'Wind advisory.' }],
        [{ Regions: ['Duchesne'], Message: 'Wind advisory.' }],
        [{ county: 'UINTAH', message: 'Road closure.' }],
        [{ regions: 'Northeastern Utah', message: 'Snow is reducing visibility.' }],
        [{ regions: ['Uinta Basin'], message: 'Snow is reducing visibility.' }],
        [{ regions: [{ Name: 'Duchesne County' }], message: 'Road closure.' }],
        [{ message: 'SR-35 closed near Tabiona.' }],
        [{ message: 'SR-35 closed.', regions: ['Northeastern Utah'] }],
        [{ message: 'Wind restrictions.', notes: 'US-40 near Heber City.' }],
        [{ message: 'Wind restrictions.', location: 'US-191 near Price' }],
        [{ message: 'US-40 snow at Strawberry Reservoir.', regions: ['Wasatch County'] }],
        [{ message: 'U.S. 40 restrictions in Heber City.', regions: ['Wasatch Back'] }],
        [{ roadwayName: 'US 40', county: 'Wasatch', message: 'Snow at MP 30.' }],
        [{ message: 'US-191 restrictions in Indian Canyon.', regions: ['Southeastern Utah'] }],
        [{ message: 'Highway 191 near Price is closed.', regions: ['Southeastern Utah'] }],
        [{ message: 'US-6 at Helper has delays.', regions: ['Southeastern Utah'] }],
        [{ message: 'US–191 at MP 275 is closed.', regions: ['Southeastern Utah'] }],
        [{ message: 'US-40 closed between MP 10 and Heber City.' }],
        [{ message: 'SR 121 lane closure.' }],
        [{ roadwayName: 'State Route 121', message: 'Road work.' }],
        [{ routeName: 'US-191', message: 'Chain restrictions.' }],
        [{ message: 'US-40 winter driving conditions.' }]
    ])('includes Basin counties and supported approaches: %j', alert => {
        expect(isAlertRelevantToBasin(alert)).toBe(true);
    });

    it.each([
        [bluff],
        [{ message: 'SR-163 flooding; use US-191 as an alternate route.', regions: ['Southeastern Utah'] }],
        [{ message: 'US 191 closure near Moab.', regions: ['Southeastern Utah'] }],
        [{ message: 'US-191 closed at MP 120.' }],
        [{ message: 'US-191 at MP 390 is closed.' }],
        [{ message: 'US-191 restriction.', county: 'San Juan' }],
        [{ message: 'US-191 restrictions.', regions: ['Southeastern Utah'] }],
        [{ message: 'US-40 is closed at MP 4.' }],
        [{ message: 'US-40 closed near Park City.' }],
        [{ message: 'US-40 closed.', county: 'Summit' }],
        [{ message: 'I-80 at the US-40 junction is closed.' }],
        [{ message: 'US-6 closed at Soldier Summit.', regions: ['Central Utah'] }],
        [{ message: 'SR-1210 road work.' }],
        [{ message: 'SR-162 reopened in Montezuma Creek.', regions: ['Southeastern Utah'] }],
        [{ regions: ['Southern Utah'], message: 'Winter weather.' }],
        [{ message: 'Road closure.', regions: null }],
        [null]
    ])('excludes unrelated locations and incidental route names: %j', alert => {
        expect(isAlertRelevantToBasin(alert)).toBe(false);
    });

    it.each([
        ['Vernal', 40.4555, -109.5287, true],
        ['Duchesne', 40.1633, -110.4029, true],
        ['western Duchesne County', 40.39, -110.81, true],
        ['Heber US-40', 40.507, -111.412, true],
        ['Strawberry US-40', 40.24469, -111.18724, true],
        ['Indian Canyon', 39.80863, -110.77888, true],
        ['Price approach', 39.60203, -110.82821, true],
        ['Bluff', 37.284, -109.552, false],
        ['Moab', 38.5733, -109.5498, false],
        ['Park City', 40.65485, -111.45729, false],
        ['Provo', 40.2338, -111.6585, false],
        ['Dutch John', 40.93, -109.4, false],
        ['Wellington', 39.5425, -110.7354, false],
        ['Wasatch County away from US-40', 40.40, -111.55, false]
    ])('uses coordinates for %s', (_name, latitude, longitude, expected) => {
        expect(isAlertRelevantToBasin({ latitude, longitude, message: 'Road closure.' })).toBe(expected);
    });

    it('gives coordinates precedence over a broad region and preserves raw coordinate fields', () => {
        const raw = { Latitude: '37.284', Longitude: '-109.552', Regions: ['Uintah County'], RoadwayName: 'US-191' };
        expect(alertLocation(raw)).toMatchObject({ latitude: '37.284', longitude: '-109.552', roadwayName: 'US-191' });
        expect(isAlertRelevantToBasin(raw)).toBe(false);
        expect(isAlertRelevantToBasin({ ...raw, LatitudeSecondary: 40.4555, LongitudeSecondary: -109.5287 })).toBe(true);
        expect(isAlertRelevantToBasin({ latitude: '', longitude: null, regions: ['Uintah County'] })).toBe(true);
    });

    it('re-evaluates cached start/end times instead of trusting stale isActive flags', () => {
        const alerts = [
            { ...basin, id: 'active', isActive: false },
            { ...basin, id: 'expired', isActive: true, endTime: '2026-11-01T00:00:00Z' },
            { ...basin, id: 'future', startTime: '2026-12-01T00:00:00Z' },
            { ...basin, id: 'raw-expired', EndTime: now / 1000 - 1 },
            bluff
        ];
        expect(filterBasinAlerts(alerts, now).map(alert => alert.id)).toEqual(['active']);
        expect(filterBasinAlerts(null, now)).toEqual([]);
    });
});

describe('Basin filtering on every alert cache path', () => {
    let service;
    const cached = [basin, bluff, { ...basin, id: 3, endTime: '2026-01-01T00:00:00Z' }];

    beforeEach(() => {
        jest.spyOn(Date, 'now').mockReturnValue(now);
        jest.spyOn(console, 'log').mockImplementation(() => {});
        memoryCache.clear();
        service = new TrafficEventsService();
        jest.spyOn(service, 'loadFromDiskCache').mockResolvedValue(null);
        jest.spyOn(service, 'saveToDiskCache').mockResolvedValue(undefined);
        fetchMock.mockReset();
    });

    afterEach(() => jest.restoreAllMocks());

    it('filters memory cache hits', async () => {
        memoryCache.set('udot_alerts', cached);
        expect(await service.fetchUDOTAlerts()).toEqual([basin]);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('filters disk cache hits', async () => {
        service.loadFromDiskCache.mockResolvedValue(cached);
        expect(await service.fetchUDOTAlerts()).toEqual([basin]);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('filters the stale cache used during rate limiting', async () => {
        service.lastApiCalls.set('alerts', now);
        service.loadFromDiskCache.mockResolvedValueOnce(null).mockResolvedValueOnce(cached);
        expect(await service.fetchUDOTAlerts()).toEqual([basin]);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('filters a fresh UDOT response and retains optional location fields', async () => {
        const raw = {
            Id: 42, Message: 'Wind restrictions.', Regions: ['Southeastern Utah'],
            Latitude: 39.80863, Longitude: -110.77888, RoadwayName: 'US 191',
            StartTime: now / 1000 - 60, EndTime: now / 1000 + 3600
        };
        fetchMock.mockResolvedValue({ ok: true, json: async () => [raw, { ...raw, Id: 43, Latitude: 37.284, Longitude: -109.552 }] });
        const alerts = await service.fetchUDOTAlerts();
        expect(alerts).toHaveLength(1);
        expect(alerts[0]).toMatchObject({ id: 42, latitude: raw.Latitude, longitude: raw.Longitude, roadwayName: 'US 191' });
        expect(service.saveToDiskCache).toHaveBeenCalledWith('udot_alerts', alerts);
    });
});
