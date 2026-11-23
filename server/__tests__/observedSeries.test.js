import {
    OBSERVED_VARIABLES, PREFERRED_WHEN_REPORTING, STATION_OVERRIDES, observedByTown, pairedStations, wantedRows, wantedStids,
} from '../observedSeries.js';

// What each forecast town's paired station has measured since the model run began: the dots
// on the weather page's forecast-and-measured chart. Nothing is filled in.

const FORECAST = {
    stations: [
        { id: 'myton', name: 'Myton', reference_stid: 'UTMYT' },
        { id: 'vernal', name: 'Vernal', reference_stid: 'QV4' },
        { id: 'split_mountain', name: 'Split Mountain', reference_stid: 'SPMU1' },
        { id: 'nowhere', name: 'Nowhere' },
        { name: 'No id', reference_stid: 'X' },
    ],
};
const at = (iso) => Date.parse(iso);
const row = (stid, variable, time, value, units = 'Celsius') => ({ stid, variable, value, units, date_time: time });

describe('pairedStations', () => {
    test('each town with the station the run names for it', () => {
        expect(pairedStations(FORECAST)).toEqual([
            { townId: 'myton', stid: 'UTMYT' },
            { townId: 'vernal', stid: 'KVEL' },
            { townId: 'split_mountain', stid: 'SPMU1' },
        ]);
        expect(pairedStations(null)).toEqual([]);
        expect(pairedStations({ stations: 'x' })).toEqual([]);
    });

    test('Vernal is held against the airport, as the homepage is', () => {
        expect(STATION_OVERRIDES).toEqual({ vernal: 'KVEL' });
    });
});

describe('wantedRows', () => {
    const stids = new Set(['UTMYT', 'KVEL']);

    test('keeps temperature and wind for the wanted stations, with their own time and unit', () => {
        expect(OBSERVED_VARIABLES).toEqual(['air_temp', 'wind_speed']);
        const kept = wantedRows([
            row('UTMYT', 'air_temp', '2026-11-20T05:10:00.000Z', -1.2),
            row('UTMYT', 'ozone_concentration', '2026-11-20T05:10:00Z', 31, 'ppb'),
            row('QRS', 'air_temp', '2026-11-20T05:10:00Z', 2),
            row('KVEL', 'wind_speed', '2026-11-20T05:15:00Z', 3.1, 'm/s'),
        ], stids);
        expect(kept).toEqual([
            { stid: 'UTMYT', variable: 'air_temp', time: '2026-11-20T05:10:00.000Z', value: -1.2, units: 'Celsius' },
            { stid: 'KVEL', variable: 'wind_speed', time: '2026-11-20T05:15:00.000Z', value: 3.1, units: 'm/s' },
        ]);
    });

    test('drops a row with no number, no unit or no time, and survives a file that is not a list', () => {
        expect(wantedRows([
            row('KVEL', 'air_temp', '2026-11-20T05:10:00Z', null),
            row('KVEL', 'air_temp', '2026-11-20T05:10:00Z', 'warm'),
            row('KVEL', 'air_temp', 'yesterday', 1),
            { stid: 'KVEL', variable: 'air_temp', value: 1, date_time: '2026-11-20T05:10:00Z' },
        ], stids)).toEqual([]);
        expect(wantedRows({ not: 'a list' }, stids)).toEqual([]);
        expect(wantedRows(null, stids)).toEqual([]);
    });
});

describe('observedByTown', () => {
    const pairs = pairedStations(FORECAST);
    const META = [{ stid: 'UTMYT', name: 'US-40 at MP 105 Myton', elevation: 5087 }, { stid: 'KVEL', name: 'Vernal Airport', elevation: 5262 }];
    const SINCE = at('2026-11-20T04:00:00Z');
    const NOW = at('2026-11-20T07:00:00Z');
    const keep = (rows) => wantedRows(rows, new Set(pairs.map((pair) => pair.stid)));

    test('a station\'s readings, oldest first, once each however many files repeat them', () => {
        const towns = observedByTown(pairs, keep([
            row('UTMYT', 'air_temp', '2026-11-20T05:20:00Z', -2),
            row('UTMYT', 'air_temp', '2026-11-20T05:10:00Z', -1),
            row('UTMYT', 'air_temp', '2026-11-20T05:10:00Z', -1),
            row('UTMYT', 'wind_speed', '2026-11-20T05:10:00Z', 4, 'm/s'),
        ]), META, SINCE, NOW);
        expect(towns.myton).toEqual({
            stid: 'UTMYT',
            name: 'US-40 at MP 105 Myton',
            elevationFt: 5087,
            air_temp: { units: 'Celsius', points: [['2026-11-20T05:10:00.000Z', -1], ['2026-11-20T05:20:00.000Z', -2]] },
            wind_speed: { units: 'm/s', points: [['2026-11-20T05:10:00.000Z', 4]] },
        });
    });

    test('a town whose station is not in the feed has no series: nothing is made up for it', () => {
        const towns = observedByTown(pairs, keep([row('UTMYT', 'air_temp', '2026-11-20T05:10:00Z', -1)]), META, SINCE, NOW);
        expect(towns.split_mountain).toEqual({ stid: 'SPMU1', name: null, elevationFt: null, air_temp: null, wind_speed: null });
        expect(towns.vernal).toMatchObject({ stid: 'KVEL', name: 'Vernal Airport', air_temp: null, wind_speed: null });
        expect(Object.keys(towns)).toEqual(['myton', 'vernal', 'split_mountain']);
    });

    test('only readings from the start of the run to now', () => {
        const towns = observedByTown(pairs, keep([
            row('KVEL', 'air_temp', '2026-11-20T03:59:00Z', 5),
            row('KVEL', 'air_temp', '2026-11-20T04:00:00Z', 4),
            row('KVEL', 'air_temp', '2026-11-20T07:00:00Z', 2),
            row('KVEL', 'air_temp', '2026-11-20T07:05:00Z', 1),
        ]), META, SINCE, NOW);
        expect(towns.vernal.air_temp.points.map(([, value]) => value)).toEqual([4, 2]);
    });

    test('a variable reported in two different units is dropped, not mixed', () => {
        const towns = observedByTown(pairs, keep([
            row('KVEL', 'air_temp', '2026-11-20T05:00:00Z', 1, 'Celsius'),
            row('KVEL', 'air_temp', '2026-11-20T05:10:00Z', 34, 'Fahrenheit'),
        ]), META, SINCE, NOW);
        expect(towns.vernal.air_temp).toBeNull();
    });
});

// Dinosaur's model point stands beside DNOC2 in Colorado, which Synoptic refuses the feed for
// now. The town keeps the producer's station until DNOC2 reports, then changes over by itself.
describe('a town that waits for a better-placed station', () => {
    const DINOSAUR = { stations: [{ id: 'dinosaur', name: 'Dinosaur', reference_stid: 'A3822' }, { id: 'myton', reference_stid: 'UTMYT' }] };
    const pairs = pairedStations(DINOSAUR);
    const META = [
        { stid: 'A3822', name: 'Dinosaur National Monument', elevation: 4800 },
        { stid: 'DNOC2', name: 'DINOSAUR 2 E', elevation: 6046 },
    ];
    const SINCE = at('2026-11-20T04:00:00Z');
    const NOW = at('2026-11-20T07:00:00Z');
    const keep = (rows) => wantedRows(rows, wantedStids(pairs));

    test('Dinosaur waits for DNOC2, and both stations are read from the files', () => {
        expect(PREFERRED_WHEN_REPORTING).toEqual({ dinosaur: 'DNOC2' });
        expect(pairs).toEqual([{ townId: 'dinosaur', stid: 'A3822', preferred: 'DNOC2' }, { townId: 'myton', stid: 'UTMYT' }]);
        expect([...wantedStids(pairs)].sort()).toEqual(['A3822', 'DNOC2', 'UTMYT']);
    });

    test('until the feed carries DNOC2 the town keeps the producer\'s station', () => {
        const towns = observedByTown(pairs, keep([row('A3822', 'air_temp', '2026-11-20T05:00:00Z', 3)]), META, SINCE, NOW);
        expect(towns.dinosaur).toMatchObject({ stid: 'A3822', name: 'Dinosaur National Monument', elevationFt: 4800 });
        expect(towns.dinosaur.air_temp.points).toEqual([['2026-11-20T05:00:00.000Z', 3]]);
    });

    test('a DNOC2 reading from before the run does not count as reporting', () => {
        const towns = observedByTown(pairs, keep([
            row('A3822', 'air_temp', '2026-11-20T05:00:00Z', 3),
            row('DNOC2', 'air_temp', '2026-11-20T03:00:00Z', -1),
        ]), META, SINCE, NOW);
        expect(towns.dinosaur.stid).toBe('A3822');
    });

    test('once DNOC2 reports, the town shows DNOC2 alone: the two are never mixed', () => {
        const towns = observedByTown(pairs, keep([
            row('A3822', 'air_temp', '2026-11-20T05:00:00Z', 3),
            row('A3822', 'wind_speed', '2026-11-20T05:00:00Z', 2, 'm/s'),
            row('DNOC2', 'air_temp', '2026-11-20T05:05:00Z', -1),
        ]), META, SINCE, NOW);
        expect(towns.dinosaur).toEqual({
            stid: 'DNOC2',
            name: 'DINOSAUR 2 E',
            elevationFt: 6046,
            air_temp: { units: 'Celsius', points: [['2026-11-20T05:05:00.000Z', -1]] },
            wind_speed: null,
        });
    });

    test('when the producer names DNOC2 itself there is nothing left to wait for', () => {
        expect(pairedStations({ stations: [{ id: 'dinosaur', reference_stid: 'DNOC2' }] })).toEqual([{ townId: 'dinosaur', stid: 'DNOC2' }]);
        expect(pairedStations({ stations: [{ id: 'dinosaur' }] })).toEqual([{ townId: 'dinosaur', stid: 'DNOC2' }]);
    });
});
