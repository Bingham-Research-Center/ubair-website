/**
 * Regression tests for cron interval parsing.
 *
 * The old parser recognised only `*​/N ...` and `0 *​/N ...` and returned a flat 60 for
 * everything else. That mis-read the manifest's forecasts schedule, `30 3,9,15,21 * * *`
 * — a 6-hourly job — as hourly. Once forecasts started flowing again (see the 2026-08-25
 * nginx 413 outage) the monitor would have reported them "stale" for ~4 hours out of every
 * 6 and raised a warning on every check.
 */

import { parseCronIntervalMinutes } from '../monitoring/dataMonitor.js';

describe('parseCronIntervalMinutes — every frequency DATA_MANIFEST.json actually uses', () => {
    test.each([
        ['*/10 * * * *',        10,   'observations'],
        ['0 */6 * * *',         360,  'metadata'],
        ['0 * * * *',           60,   'forecasts.hrrr_surface_layers'],
        ['*/30 * * * *',        30,   'images'],
        ['30 3,9,15,21 * * *',  360,  'forecasts — the one the old parser got wrong'],
    ])('%s -> %i minutes (%s)', (expr, expected) => {
        expect(parseCronIntervalMinutes(expr)).toBe(expected);
    });

    test.each([
        ['ad-hoc'],
        ['ad-hoc (proof-of-concept)'],
    ])('%s falls back to the 60-minute default', (expr) => {
        expect(parseCronIntervalMinutes(expr)).toBe(60);
    });
});

describe('parseCronIntervalMinutes — general cron forms', () => {
    test('comma lists in the minute field use the smallest gap', () => {
        expect(parseCronIntervalMinutes('0,30 * * * *')).toBe(30);
        // Uneven gaps: 0->15 is 15, 15->45 is 30, 45->next 0 is 15. Smallest wins.
        expect(parseCronIntervalMinutes('0,15,45 * * * *')).toBe(15);
    });

    test('ranges and steps', () => {
        expect(parseCronIntervalMinutes('0 9-17 * * *')).toBe(60);
        expect(parseCronIntervalMinutes('0 0-23/4 * * *')).toBe(240);
        // `N/step` means "from N onwards": 5,20,35,50 -> gap 15.
        expect(parseCronIntervalMinutes('5/15 * * * *')).toBe(15);
    });

    test('a single daily fire is 1440, and the wrap-around is measured', () => {
        expect(parseCronIntervalMinutes('30 4 * * *')).toBe(1440);
        // 23:50 and 00:10 are 20 minutes apart across midnight, not 1420.
        expect(parseCronIntervalMinutes('50 23 * * *')).toBe(1440);
        expect(parseCronIntervalMinutes('10,50 0,23 * * *')).toBe(20);
    });

    test('every minute', () => {
        expect(parseCronIntervalMinutes('* * * * *')).toBe(1);
    });

    test('day-of-week/month restrictions are ignored (conservative lower bound)', () => {
        // Only fires Mondays, but we return the within-day interval. Erring toward
        // "stale too early" is safe; erring toward "fresh" is what hid the outage.
        expect(parseCronIntervalMinutes('0 */6 * * 1')).toBe(360);
    });
});

describe('parseCronIntervalMinutes — bad input never throws', () => {
    test.each([
        [undefined], [null], [''], ['   '], [42], [{}],
        ['not a cron'], ['* * *'], ['99 * * * *'], ['0 25 * * *'],
        ['*/0 * * * *'], ['0 5-2 * * *'], ['a,b * * * *'],
    ])('%p -> 60', (input) => {
        expect(() => parseCronIntervalMinutes(input)).not.toThrow();
        expect(parseCronIntervalMinutes(input)).toBe(60);
    });
});
