import { describe, it, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    toKnots,
    windComponents,
    runwayNumber,
    seriesKey,
    runwayPairs,
    summariseRunway,
    forecastComponents,
    upcomingIndices,
    stationWind,
    directionLabel,
    windLabel,
    zuluLabel,
    localLabel,
} from '../aviation.js';

// A real payload as brc-tools uploads it (KVEL, HRRR sub-hourly, init 2026-11-12 03Z).
const fixture = JSON.parse(fs.readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/forecast_hrrr_kvel_crosswind_20261112_0300Z.json'),
    'utf8',
));

describe('units', () => {
    it('converts the observation feed (m/s) to knots', () => {
        expect(toKnots(10, 'm/s')).toBeCloseTo(19.44, 2);
        expect(toKnots(10, 'knots')).toBe(10);
        expect(toKnots(10, 'mph')).toBeCloseTo(8.69, 2);
    });

    it('refuses a unit it does not know instead of mislabelling it', () => {
        expect(toKnots(10, 'furlongs/fortnight')).toBeNull();
        expect(toKnots(10, undefined)).toBeNull();
        expect(toKnots(null, 'm/s')).toBeNull();
    });
});

describe('wind components', () => {
    it('puts a wind straight down the runway entirely into headwind', () => {
        const c = windComponents(10, 359, 359);
        expect(c.head).toBeCloseTo(10, 6);
        expect(c.cross).toBeCloseTo(0, 6);
    });

    it('gives a positive crosswind for a wind from the right', () => {
        // Rolling south on 17 (179° true), the west is on the right.
        expect(windComponents(10, 269, 179).cross).toBeCloseTo(10, 6);
        expect(windComponents(10, 89, 179).cross).toBeCloseTo(-10, 6);
    });

    it("reproduces the producer's series for every step of a real run", () => {
        const s = fixture.series;
        for (const heading of fixture.runway_headings_deg) {
            fixture.valid_times.forEach((_, i) => {
                const c = windComponents(s.wind_speed_kt[i], s.wind_dir_deg[i], heading);
                // The payload rounds to 0.1 kt, after computing from unrounded speed and direction.
                expect(Math.abs(c.head - s[seriesKey('headwind', heading)][i])).toBeLessThan(0.2);
                expect(Math.abs(c.cross - s[seriesKey('crosswind', heading)][i])).toBeLessThan(0.2);
            });
        }
    });
});

describe('runways', () => {
    it('numbers runways the way the producer does (floor of heading / 10)', () => {
        expect(runwayNumber(179)).toBe('17');
        expect(runwayNumber(359)).toBe('35');
        expect(runwayNumber(89)).toBe('08');
        expect(runwayNumber(360)).toBe('36');
    });

    it('pairs the two ends of one strip', () => {
        expect(runwayPairs([359, 179])).toEqual([{ ends: [179, 359], label: '17/35' }]);
        expect(runwayPairs([179])).toEqual([{ ends: [179], label: '17' }]);
        expect(runwayPairs([179, 359, 89, 269]).map((p) => p.label)).toEqual(['08/26', '17/35']);
    });

    it('names the end with the headwind and the side the crosswind comes from', () => {
        // Step 0 of the fixture: 287° at 2.7 kt. Mostly across, a little down 35.
        const ends = [179, 359];
        const r = summariseRunway(ends, forecastComponents(fixture, ends, 0), 2.7, 2.8);
        expect(r.favoured).toBe(359);
        expect(r.head).toBeCloseTo(0.8, 1);
        expect(r.cross).toBeCloseTo(2.6, 1);
        expect(r.crossFrom).toBe('W');
        expect(r.gustCross).toBeCloseTo(2.7, 1);
    });

    it('floors a gust that comes out below the sustained wind', () => {
        // HRRR sub-hourly gusts sometimes come out below the wind (3.3 vs 3.4 kt in this run).
        expect(summariseRunway([179, 359], { head: 0, cross: 3.4 }, 3.4, 3.3).gustCross).toBeCloseTo(3.4, 6);
        expect(summariseRunway([179, 359], { head: 0, cross: 3.4 }, 3.4, null).gustCross).toBeNull();
    });

    it('scales the crosswind by the gust', () => {
        // 20 kt straight across, gusting 30: 30 kt across in the gust.
        expect(summariseRunway([179, 359], { head: 0, cross: 20 }, 20, 30).gustCross).toBeCloseTo(30, 6);
    });

    it('favours neither end when calm or straight across', () => {
        expect(summariseRunway([179, 359], { head: 0, cross: 0 }, 0.2).favoured).toBeNull();
        expect(summariseRunway([179, 359], { head: 0.1, cross: 12 }, 12).favoured).toBeNull();
    });

    it('computes the components when the producer omits a series', () => {
        const payload = { series: { wind_speed_kt: [10], wind_dir_deg: [269] } };
        const c = forecastComponents(payload, [179, 359], 0);
        expect(c.cross).toBeCloseTo(10, 6);
    });
});

describe('time window', () => {
    it('drops steps more than half a step in the past', () => {
        const now = Date.parse('2026-11-12T06:41:00Z');
        const steps = upcomingIndices(fixture.valid_times, now);
        expect(fixture.valid_times[steps[0]]).toBe('2026-11-12T06:45:00Z');
        expect(fixture.valid_times[steps.at(-1)]).toBe('2026-11-12T09:00:00Z');
    });

    it('keeps the current step until it is half over', () => {
        const now = Date.parse('2026-11-12T06:37:00Z');
        expect(fixture.valid_times[upcomingIndices(fixture.valid_times, now)[0]]).toBe('2026-11-12T06:30:00Z');
    });

    it('returns nothing once the whole run is past', () => {
        expect(upcomingIndices(fixture.valid_times, Date.parse('2026-11-12T12:00:00Z'))).toEqual([]);
    });
});

describe('observations', () => {
    const rows = [
        { stid: 'UBHSP', variable: 'wind_speed', value: 9, units: 'm/s', date_time: '2026-11-12T06:30:00.000Z' },
        { stid: 'KVEL', variable: 'wind_speed', value: 1.543, units: 'm/s', date_time: '2026-11-12T06:30:00.000Z' },
        { stid: 'KVEL', variable: 'wind_direction', value: 260, units: 'Degrees', date_time: '2026-11-12T06:30:00.000Z' },
    ];

    it('reads KVEL wind from the raw feed and converts it to knots', () => {
        const w = stationWind(rows);
        expect(w.speedKt).toBeCloseTo(3.0, 1);
        expect(w.dirDeg).toBe(260);
        expect(w.time).toBe('2026-11-12T06:30:00.000Z');
    });

    it('returns null when KVEL has no usable wind', () => {
        expect(stationWind(rows.filter((r) => r.stid !== 'KVEL'))).toBeNull();
        expect(stationWind([{ ...rows[1], units: 'mystery' }])).toBeNull();
    });
});

describe('labels', () => {
    it('rounds directions to 10 degrees and writes north as 360', () => {
        expect(directionLabel(287)).toBe('290°');
        expect(directionLabel(3)).toBe('360°');
        expect(directionLabel(87)).toBe('090°');
    });

    it('writes calm instead of a direction for no wind', () => {
        expect(windLabel(287, 0.3)).toBe('Calm');
        expect(windLabel(287, 12.4)).toBe('290° 12 kt');
    });

    it('labels times in Zulu and in Mountain time', () => {
        expect(zuluLabel('2026-11-12T03:15:00Z')).toBe('0315Z');
        expect(localLabel('2026-11-12T03:15:00Z')).toBe('8:15 PM MST');
        expect(localLabel('2026-07-01T18:00:00Z')).toBe('12:00 PM MDT');
    });
});
