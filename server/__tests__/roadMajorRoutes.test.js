import { beforeEach, afterEach, describe, expect, it, jest } from '@jest/globals';

// Snow covering a major Basin route is red on the roads page, as it is on the homepage roads
// light (JRL, 2026-11-20). Both use roadConditionRules.js; these tests cover the roads service.

const fetch = jest.fn();
jest.unstable_mockModule('node-fetch', () => ({ default: fetch }));
let service;

beforeEach(async () => {
    jest.resetModules();
    fetch.mockReset();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const { default: RoadWeatherService } = await import('../roadWeatherService.js');
    service = new RoadWeatherService({ getCachedResults: () => [] });
    jest.spyOn(service, 'loadHRRRForecast').mockReturnValue(null);
});

afterEach(() => jest.restoreAllMocks());

// Google's polyline encoding, the form UDOT sends, for a short list of [lat, lng] points.
function encodePolyline(points) {
    const chunk = (value) => {
        let v = value < 0 ? ~(value << 1) : value << 1;
        let out = '';
        while (v >= 0x20) { out += String.fromCharCode((0x20 | (v & 0x1f)) + 63); v >>= 5; }
        return out + String.fromCharCode(v + 63);
    };
    let lastLat = 0;
    let lastLng = 0;
    return points.map(([lat, lng]) => {
        const la = Math.round(lat * 1e5);
        const ln = Math.round(lng * 1e5);
        const out = chunk(la - lastLat) + chunk(ln - lastLng);
        lastLat = la;
        lastLng = ln;
        return out;
    }).join('');
}

const udot = (name, points, roadCondition) => ({
    Id: name, RoadwayName: name, EncodedPolyline: encodePolyline(points), LastUpdated: 1795000000,
    RoadCondition: roadCondition, WeatherCondition: 'Fair', Restriction: 'none',
});

describe('major routes in the roads service', () => {
    it('marks US-40 and US-191 inside the Basin as major, and colours snow cover red there only', async () => {
        fetch.mockResolvedValue({ ok: true, json: async () => [
            udot('US-191 Vernal to Greendale Jct', [[40.47, -109.53], [40.70, -109.47]], 'snow covered'),
            udot('SR-44 Greendale Jct to Manila', [[40.88, -109.50], [40.98, -109.72]], 'snow covered'),
            udot('US-40 Mayflower Summit to Heber', [[40.65, -111.46], [40.52, -111.41]], 'snow covered'),
            udot('US-40 Through Roosevelt', [[40.30, -110.00], [40.30, -109.95]], 'Dry'),
        ] });
        const roads = Object.fromEntries((await service.fetchUDOTRoadConditions()).map((road) => [road.name, road]));

        expect(roads['US-191 Vernal to Greendale Jct']).toMatchObject({ major: true, condition: { condition: 'red', status: 'Snow Covered' } });
        expect(roads['SR-44 Greendale Jct to Manila']).toMatchObject({ major: false, condition: { condition: 'yellow' } });
        expect(roads['US-40 Mayflower Summit to Heber']).toMatchObject({ major: false, condition: { condition: 'yellow' } });
        expect(roads['US-40 Through Roosevelt']).toMatchObject({ major: true, condition: { condition: 'green' } });
    });

    it('keeps the three fields the map reads, and nothing else, on a condition', () => {
        expect(Object.keys(service.mapUDOTConditionToColor('snow covered', 'Fair', 'none', { major: true })))
            .toEqual(['condition', 'status', 'reason']);
    });
});

describe('a UDOT report of danger is not averaged away', () => {
    const source = (name, condition, weight) => ({ name, condition, status: condition, reason: '', weight });

    it('stays red when a forecast and a camera say clear', () => {
        const result = service.computeEnsembleCondition([
            source('udot', 'red', 0.5), source('hrrr', 'green', 0.25), source('camera', 'green', 0.15),
        ]);
        // The weighted score alone (1.11) would have said yellow.
        expect(result.ensembleScore).toBe(1.11);
        expect(result).toMatchObject({ condition: 'red', status: 'Dangerous' });
    });

    it('does not let a forecast alone turn a road red, or UDOT caution become red', () => {
        expect(service.computeEnsembleCondition([source('udot', 'yellow', 0.5), source('hrrr', 'red', 0.25)]).condition).toBe('yellow');
        expect(service.computeEnsembleCondition([source('udot', 'green', 0.5), source('hrrr', 'red', 0.25)]).condition).toBe('yellow');
        expect(service.computeEnsembleCondition([source('udot', 'green', 0.5), source('hrrr', 'green', 0.25)]).condition).toBe('green');
    });

    it('the whole way through: snow covered on US-191 is red on the roads page', async () => {
        fetch.mockResolvedValue({ ok: true, json: async () => [
            udot('US-191 Vernal to Greendale Jct', [[40.47, -109.53], [40.70, -109.47]], 'snow covered'),
        ] });
        jest.spyOn(service, 'fetchUDOTCameras').mockResolvedValue([]);
        jest.spyOn(service, 'fetchUDOTWeatherStations').mockResolvedValue([]);
        const data = await service.getCompleteRoadData();
        expect(data.segments[0]).toMatchObject({
            name: 'US-191 Vernal to Greendale Jct', major: true, roadCondition: 'snow covered',
            overallCondition: { condition: 'red', status: 'Dangerous' },
        });
    });
});
