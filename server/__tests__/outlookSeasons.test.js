import { describe, expect, test } from '@jest/globals';
import {
    currentSeason,
    describeOutlook,
    groupBySeason,
    mountainToDate,
    parseOutlookFilename,
    seasonOf
} from '../../public/js/outlookSeasons.js';

describe('outlook filenames', () => {
    test('reads only outlook_YYYYMMDD_HHMM.md', () => {
        expect(parseOutlookFilename('outlook_20260306_1300.md'))
            .toEqual({ year: 2026, month: 3, day: 6, hour: 13, minute: 0 });
        expect(parseOutlookFilename('template-2025-2026.md')).toBeNull();
        expect(parseOutlookFilename('outlooks_list.json')).toBeNull();
        expect(parseOutlookFilename(undefined)).toBeNull();
    });

    // outlook_20260306_1300.md says "Issued: 1.00pm Mountain Time, 6 Mar 2026"; the page used
    // to print it as 6:00 AM MT by reading 1300 as UTC.
    test('prints the issue time as the forecaster wrote it, in Mountain time', () => {
        expect(describeOutlook('outlook_20260306_1300.md')).toMatchObject({
            date: '6 Mar 2026', time: '1:00 pm MT', season: '2025–26'
        });
        expect(describeOutlook('outlook_20241230_1430.md')).toMatchObject({ time: '2:30 pm MT' });
        expect(describeOutlook('outlook_20251201_0005.md')).toMatchObject({ time: '12:05 am MT' });
    });

    test('turns Mountain wall-clock time into the right instant, daylight saving included', () => {
        // MST is UTC-7, MDT is UTC-6.
        expect(mountainToDate({ year: 2024, month: 12, day: 30, hour: 14, minute: 30 }).toISOString())
            .toBe('2024-12-30T21:30:00.000Z');
        expect(mountainToDate({ year: 2026, month: 3, day: 20, hour: 9, minute: 0 }).toISOString())
            .toBe('2026-03-20T15:00:00.000Z');
        // The morning after the 8 Mar 2026 spring-forward.
        expect(mountainToDate({ year: 2026, month: 3, day: 9, hour: 0, minute: 30 }).toISOString())
            .toBe('2026-03-09T06:30:00.000Z');
    });
});

describe('seasons', () => {
    test('run July to June, so one winter keeps one label', () => {
        expect(seasonOf({ year: 2025, month: 12 })).toBe('2025–26');
        expect(seasonOf({ year: 2026, month: 3 })).toBe('2025–26');
        expect(seasonOf({ year: 2026, month: 6 })).toBe('2025–26');
        expect(seasonOf({ year: 2026, month: 7 })).toBe('2026–27');
        expect(seasonOf({ year: 2099, month: 12 })).toBe('2099–00');
    });

    test('the current season follows Mountain time', () => {
        expect(currentSeason(new Date('2026-11-12T10:00:00Z'))).toBe('2026–27');
        // 05:00 UTC on 1 July is still 30 June in Utah.
        expect(currentSeason(new Date('2026-07-01T05:00:00Z'))).toBe('2025–26');
    });

    test('groups outlooks newest season first, newest outlook first, and drops other files', () => {
        const groups = groupBySeason([
            { filename: 'outlook_20240205_1115.md' },
            { filename: 'outlook_20251201_1130.md' },
            { filename: 'template-2025-2026.md' },
            { filename: 'outlook_20260306_1300.md' },
            { filename: 'outlook_20240315_0930.md' },
            { filename: 'outlook_20241230_1430.md' }
        ]);

        expect(groups.map((g) => [g.season, g.outlooks.map((o) => o.filename)])).toEqual([
            ['2025–26', ['outlook_20260306_1300.md', 'outlook_20251201_1130.md']],
            ['2024–25', ['outlook_20241230_1430.md']],
            ['2023–24', ['outlook_20240315_0930.md', 'outlook_20240205_1115.md']]
        ]);
    });
});
