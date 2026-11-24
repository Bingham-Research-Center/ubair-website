import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { beforeEach, afterEach, describe, expect, it, jest } from '@jest/globals';
import { buildCorridorRows, corridorRoads, corridorForecast, forecastStatus } from '../roads/CorridorTable.js';

// Exercise the table against the same classic-script helpers used by the page.
// UnitsSystem reads the page type (#332: whole-degree temperatures on /roads).
const context = vm.createContext({
    localStorage: { getItem: () => null },
    document: { body: { dataset: { pageType: 'roads' } } }
});
for (const name of ['UnitsSystem', 'utils', 'RouteConditions']) {
    vm.runInContext(readFileSync(new URL(`../roads/${name}.js`, import.meta.url), 'utf8'), context);
}
for (const name of ['basinRoads', 'filterStationsForRoad', 'getCorridorConditions', 'determineSurfaceCondition', 'determineTravelStatus', 'unitsSystem']) {
    globalThis[name] = vm.runInContext(name, context);
}

function point(name, lat, lon, gust = 4) {
    return { name, lat, lon, forecasts: {
        temp_2m: [8, 8, 8, 8], wind_gust: [gust, gust, gust, gust],
        visibility: [20, 20, 20, 20], precip_1hr: [0, 0, 0, 0],
        precip_type: ['none', 'none', 'none', 'none']
    } };
}

function forecast() {
    return {
        forecast_hours: [1, 3, 6, 12],
        valid_times: [1, 3, 6, 12].map(hour => `2026-11-02T${String(hour).padStart(2, '0')}:00:00Z`),
        routes: {
            us40: { name: 'US-40', waypoints: [point('Vernal', 40.46, -109.53)] },
            us191: { name: 'US-191', waypoints: [point('Indian Canyon', 39.9, -110.4, 21)] },
            basin_roads: { name: 'Local roads', waypoints: [point('Starvation Dam', 40.19, -110.45, 15)] }
        }
    };
}

beforeEach(() => { unitsSystem.isMetric = false; });
afterEach(() => jest.restoreAllMocks());

describe('corridor summary presentation', () => {
    it('excludes future and expired cached events before computing status, counts and order', () => {
        jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-11-03T18:00:00Z'));
        const active = { roadwayName: 'US-40', eventType: 'Construction', startDate: '2026-11-03T17:00:00Z' };
        const data = { stations: [{ name: 'Vernal', lat: 40.46, lng: -109.53, surfaceTemp: 50 }], events: { events: [
            { roadwayName: 'US-40', isFullClosure: true, startDate: '2026-11-04T18:00:00Z' },
            { roadwayName: 'US-40', isFullClosure: true, cached: true, startDate: '2026-11-01T18:00:00Z', plannedEndDate: '2026-11-02T18:00:00Z' },
            active,
            { roadwayName: 'US-191', isFullClosure: true, startDate: '2026-11-03T17:00:00Z' }
        ] } };
        const before = JSON.stringify(data);
        const rows = buildCorridorRows(data, null);
        expect(rows[0].road.id).toBe('us191');
        const us40 = rows.find(row => row.road.id === 'us40');
        expect(us40.events).toEqual([active]);
        expect(us40.now.text).toBe('Travel caution');
        expect(us40.incidents.text).toBe('1 roadwork');
        expect(JSON.stringify(data)).toBe(before);
    });

    it.each([
        [{ startDate: '2026-11-03T18:00:00Z' }, 1],
        [{ startDate: '2026-11-03T18:00:00.001Z' }, 0],
        [{ startDate: '2026-11-01T18:00:00Z', plannedEndDate: '2026-11-03T18:00:00Z' }, 1],
        [{ plannedEndDate: '2026-11-03T17:59:59.999Z' }, 0],
        [{}, 1]
    ])('respects event boundaries without hiding an undated closure: %j', (dates, count) => {
        jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-11-03T18:00:00Z'));
        const rows = buildCorridorRows({ stations: [], events: { events: [{ roadwayName: 'US-40', isFullClosure: true, ...dates }] } }, null);
        expect(rows.find(row => row.road.id === 'us40').events).toHaveLength(count);
    });

    it('keeps all eight roads visible with no feeds and does not label missing data clear', () => {
        const rows = buildCorridorRows(null, null);
        expect(rows.map(row => row.road.shortName)).toEqual([
            'US-40', 'US-191', 'SR-87', 'SR-121', 'US-45', 'Naples Rd', 'Red Canyon', 'Strawberry'
        ]);
        rows.forEach(row => {
            expect(row.now.level).toBe('unavailable');
            expect(row.incidents.level).toBe('unavailable');
            expect(row.periods.map(period => forecastStatus(period).text)).toEqual(Array(4).fill('No data'));
        });
    });

    it('matches nearby model locations separately for local roads, leaving distant roads unavailable', () => {
        const rows = buildCorridorRows(null, forecast());
        const sr87 = rows.find(row => row.road.id === 'sr87');
        const sr121 = rows.find(row => row.road.id === 'sr121');
        const us45 = rows.find(row => row.road.id === 'us45');
        expect(sr87.pointNames).toContain('Starvation Dam');
        expect(sr87.pointNames).not.toContain('Vernal');
        expect(sr121.pointNames).toContain('Vernal');
        expect(sr121.pointNames).not.toContain('Starvation Dam');
        expect(forecastStatus(sr121.periods[0])).toMatchObject({ level: 'clear', text: 'Clear' });
        expect(us45.periods[0].hazard.level).toBe('unavailable');
    });

    it('preserves explicitly supplied road groups and does not mutate the forecast', () => {
        const source = forecast();
        source.routes.sr87 = { name: 'SR-87', waypoints: [point('SR-87', 40.1, -110.4)] };
        const before = JSON.stringify(source);
        const road = corridorRoads().find(road => road.id === 'sr87');
        expect(corridorForecast(source, road).routes.sr87).toBe(source.routes.sr87);
        expect(JSON.stringify(source)).toBe(before);
    });

    it('sorts by current hazards rather than forecast hazards, keeping no-data rows last', () => {
        const data = {
            stations: [
                { name: 'Vernal', lat: 40.46, lng: -109.53, airTemperature: '55', surfaceTemp: '50' },
                { name: 'Duchesne', lat: 40.16, lng: -110.4, airTemperature: '28', surfaceTemp: '25' }
            ],
            events: { events: [{ roadwayName: 'US-40', eventType: 'Construction' }] }
        };
        const rows = buildCorridorRows(data, forecast());
        expect(rows[0].road.id).toBe('us191');
        expect(rows[0].now.level).toBe('danger');
        const us40 = rows.find(row => row.road.id === 'us40');
        expect(us40.now.level).toBe('caution');
        expect(us40.incidents.text).toBe('1 roadwork');
        const ranks = { danger: 2, caution: 1, clear: 0, unavailable: -1 };
        const levels = rows.map(row => ranks[row.now.level]);
        expect(levels).toEqual([...levels].sort((a, b) => b - a));
        expect(rows.at(-1).now.level).toBe('unavailable');
    });

    it('shows a reported closure as a current hazard even without station readings', () => {
        const rows = buildCorridorRows({ stations: [], events: { events: [
            { roadwayName: 'US-40', isFullClosure: true }
        ] } }, null);
        expect(rows[0]).toMatchObject({ road: { id: 'us40' }, now: { level: 'danger', text: 'Road closed' } });
        expect(rows[0].incidents).toEqual({ level: 'danger', text: '1 closure' });
    });

    it('never puts a nearby lead hour under an incorrect fixed column heading', () => {
        const source = forecast();
        source.forecast_hours = [1, 2, 4, 8];
        const row = buildCorridorRows(null, source)[0];
        expect(row.periods.map(period => period.hour)).toEqual([1, 3, 6, 12]);
        expect(row.periods.slice(1).every(period => period.hazard.level === 'unavailable')).toBe(true);
    });

    it('keeps HRRR classifications and formats the short gust label in the selected units', () => {
        const row = buildCorridorRows(null, forecast()).find(row => row.road.id === 'us191');
        expect(forecastStatus(row.periods[0])).toMatchObject({ level: 'danger', text: 'Gusts 47 mph' });
        unitsSystem.isMetric = true;
        expect(forecastStatus(row.periods[0])).toMatchObject({ level: 'danger', text: 'Gusts 76 km/h' });
    });
});
