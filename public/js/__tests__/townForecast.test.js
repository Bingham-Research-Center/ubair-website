import fs from 'fs';
import {
    DEFAULT_TOWN,
    hourLabels,
    humidityLabel,
    precipLabel,
    runLine,
    summarySentence,
    tempLabel,
    townHours,
    townList,
    townSummary,
    windLabel,
} from '../townForecast.js';
import { firstHourFromNow, modelRunLabel, mountainClock, mountainTime, sameMountainDay } from '../mountainTime.js';

// Town forecasts on the weather page (issue #407). The fixture is a real HRRR waypoints run
// (02Z on 20 Nov 2026), cut down to four of its fourteen places.

const RUN = JSON.parse(fs.readFileSync(new URL('./fixtures/hrrr_waypoints_20261120_0200Z.json', import.meta.url), 'utf8'));
const NOW = Date.parse('2026-11-20T05:25:00Z'); // 10:25 PM MST, Thu 19 Nov

describe('mountainTime helpers', () => {
    test('say the time in Mountain time, with the day only when it differs', () => {
        expect(mountainClock(Date.parse('2026-11-20T05:00:00Z'))).toBe('10 PM');
        expect(mountainClock(Date.parse('2026-11-20T12:30:00Z'))).toBe('5:30 AM');
        expect(mountainTime(Date.parse('2026-11-20T06:00:00Z'), NOW)).toBe('11 PM');
        expect(mountainTime(Date.parse('2026-11-20T07:00:00Z'), NOW)).toBe('Fri 12 AM');
        expect(sameMountainDay(Date.parse('2026-11-20T06:59:00Z'), NOW)).toBe(true);
        expect(sameMountainDay(Date.parse('2026-11-20T07:00:00Z'), NOW)).toBe(false);
    });

    test('follow daylight saving', () => {
        // 18Z is noon MDT in July and 11 AM MST in January.
        expect(mountainClock(Date.parse('2026-07-01T18:00:00Z'))).toBe('12 PM');
        expect(mountainClock(Date.parse('2026-01-01T18:00:00Z'))).toBe('11 AM');
    });

    test('label a model run in both clocks', () => {
        expect(modelRunLabel(Date.parse('2026-11-20T02:00:00Z'))).toBe('Thu 7 PM (02Z)');
    });

    test('firstHourFromNow opens a run on the hour under way, not on its first hour', () => {
        const hours = RUN.valid_times; // 02Z to 20Z
        expect(firstHourFromNow(hours, NOW)).toBe(3);                                   // 05Z, begun 25 min ago
        expect(firstHourFromNow(hours, Date.parse('2026-11-20T05:31:00Z'))).toBe(4);    // 06Z
        expect(firstHourFromNow(hours, Date.parse('2026-11-20T01:00:00Z'))).toBe(0);    // run not started
        expect(firstHourFromNow(hours, Date.parse('2026-11-21T09:00:00Z'))).toBe(18);   // all past: the last
        expect(firstHourFromNow([], NOW)).toBe(0);
        expect(firstHourFromNow(undefined, NOW)).toBe(0);
    });
});

describe('townList', () => {
    test('lists the places in the file, west to east, with elevation in feet', () => {
        expect(townList(RUN)).toEqual([
            { id: 'daniels_summit', name: 'Daniels Summit', elevationFt: 8190 },
            { id: 'duchesne', name: 'Duchesne', elevationFt: 5520 },
            { id: 'roosevelt', name: 'Roosevelt', elevationFt: 5180 },
            { id: 'vernal', name: 'Vernal', elevationFt: 5320 },
        ]);
        expect(DEFAULT_TOWN).toBe('vernal');
    });

    test('is empty for a file with no stations', () => {
        for (const odd of [null, {}, { stations: 'x' }]) expect(townList(odd)).toEqual([]);
    });
});

describe('townHours', () => {
    test('starts at the hour under way and converts to °F, mph and inches', () => {
        const rows = townHours(RUN, 'vernal', NOW);
        // The 05Z hour began 25 minutes ago and is still "now"; the run ends at 20Z.
        expect(rows[0].time).toBe('2026-11-20T05:00:00Z');
        expect(rows.at(-1).time).toBe('2026-11-20T20:00:00Z');
        expect(rows).toHaveLength(16);
        expect(rows[0]).toMatchObject({ windFrom: 'SW', rh: 98 });
        expect(rows[0].tempF).toBeCloseTo(36.14, 2);   // 2.3 °C
        expect(rows[0].windMph).toBeCloseTo(3.13, 2);  // 1.4 m/s
        expect(rows[0].precipIn).toBeCloseTo(0.0315, 3); // 0.8 mm
    });

    test('drops the hour under way once it is more than half gone', () => {
        expect(townHours(RUN, 'vernal', Date.parse('2026-11-20T05:31:00Z'))[0].time).toBe('2026-11-20T06:00:00Z');
    });

    test('is empty for an unknown place and for a run that has run out', () => {
        expect(townHours(RUN, 'provo', NOW)).toEqual([]);
        expect(townHours(RUN, 'vernal', Date.parse('2026-11-21T00:00:00Z'))).toEqual([]);
        expect(townHours(null, 'vernal', NOW)).toEqual([]);
    });

    test('a unit it does not know gives null, never a number with the wrong label', () => {
        const kelvinish = JSON.parse(JSON.stringify(RUN));
        kelvinish.variables.temp_2m_c.units = 'degrees';
        kelvinish.variables.wind_speed_10m_ms.units = 'km/h';
        kelvinish.variables.rainfall_1h_mm.units = 'kg/m2';
        kelvinish.variables.rh_2m_pct.units = 'fraction';
        expect(townHours(kelvinish, 'vernal', NOW)[0]).toMatchObject({ tempF: null, windMph: null, precipIn: null, rh: null });
    });

    test('a missing value is null: the first hour of a run has no precipitation yet', () => {
        const first = townHours(RUN, 'vernal', Date.parse('2026-11-20T02:00:00Z'))[0];
        expect(first.time).toBe('2026-11-20T02:00:00Z');
        expect(first.precipIn).toBeNull();
        expect(first.tempF).not.toBeNull();
    });
});

describe('summary and labels', () => {
    const rows = townHours(RUN, 'vernal', NOW);

    test('townSummary finds the low, the high, the strongest wind and the wet hours', () => {
        const summary = townSummary(rows);
        expect(summary.hours).toBe(16);
        expect(summary.lowF).toBeLessThanOrEqual(summary.highF);
        expect(rows.map((row) => row.time)).toContain(summary.lowAt);
        expect(summary.maxWindMph).toBeGreaterThan(0);
        expect(summary.wetHours).toBe(rows.filter((row) => row.precipIn >= 0.01).length);
        expect(townSummary([])).toBeNull();
    });

    test('summarySentence says it plainly', () => {
        const sentence = summarySentence('Vernal', {
            hours: 15, lowF: 28, lowAt: '2026-11-20T13:00:00Z', highF: 39, highAt: '2026-11-20T20:00:00Z', maxWindMph: 12, wetHours: 5,
        }, NOW);
        expect(sentence).toBe('Vernal, next 15 hours: low 28°F around Fri 6 AM, high 39°F around Fri 1 PM. '
            + 'Wind up to 12 mph. Precipitation in 5 of the 15 hours.');
        expect(summarySentence('Myton', { hours: 6, lowF: 30, lowAt: '', highF: 30, highAt: '', maxWindMph: null, wetHours: 0 }, NOW))
            .toBe('Myton, next 6 hours: steady near 30°F. No precipitation in the model.');
        expect(summarySentence('Myton', null, NOW)).toBe('Myton: the forecast has no temperatures for the hours ahead.');
    });

    test('labels show "--" for a value that is not known', () => {
        expect([tempLabel(36.14), tempLabel(null)]).toEqual(['36°F', '--']);
        expect([humidityLabel(97.6), humidityLabel(null)]).toEqual(['98%', '--']);
        expect([windLabel(3.13, 'SW'), windLabel(0.3, 'N'), windLabel(8, null), windLabel(null, 'N')])
            .toEqual(['SW 3 mph', 'Calm', '8 mph', '--']);
        expect([precipLabel(0.0315), precipLabel(0.004), precipLabel(0), precipLabel(null)])
            .toEqual(['0.03 in', '0', '0', '--']);
    });

    test('hourLabels names the day on the first row and where the day changes', () => {
        expect(hourLabels(rows).slice(0, 4)).toEqual(['Thu 10 PM', '11 PM', 'Fri 12 AM', '1 AM']);
    });

    test('runLine says which run it is, how old, and that it is a forecast', () => {
        expect(runLine(RUN, NOW)).toBe('HRRR model run from Thu 7 PM (02Z), 3 hours old. '
            + 'A forecast for a point near each place, not a measurement. Precipitation is liquid equivalent.');
        expect(runLine({}, NOW)).toBe('HRRR model forecast.');
    });
});
