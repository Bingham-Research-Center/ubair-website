import { chartSeries, comparisonRows, hourSentence, nearestHour, thinReadings, verdictSentence } from '../townChart.js';
import { linear, ticksBetween } from '../svgKit.js';

// "Forecast and measured": a town's forecast line with what its paired station measured in
// the hours of the run already past.

const at = (iso) => Date.parse(iso);
const fToC = (f) => ((f - 32) * 5) / 9;
const HOUR = 3600000;
const INIT = at('2026-11-20T04:00:00Z'); // 9 PM MST on 19 Nov
const NOW = INIT + 3.5 * HOUR;

const FORECAST = {
    init_time: '2026-11-20T04:00:00Z',
    valid_times: [0, 1, 2, 3, 4, 5].map((h) => new Date(INIT + h * HOUR).toISOString()),
    variables: { temp_2m_c: { units: 'Celsius' } },
    stations: [
        { id: 'vernal', name: 'Vernal', forecasts: { temp_2m_c: [36, 36, 36, 34, 33, 34].map(fToC) } },
        { id: 'split_mountain', name: 'Split Mountain', forecasts: { temp_2m_c: [38, 38, 37, 36, 36, 35].map(fToC) } },
    ],
};
const reading = (minutesAfterInit, f) => [new Date(INIT + minutesAfterInit * 60000).toISOString(), fToC(f)];
const OBSERVED = {
    status: 'ok',
    towns: {
        vernal: { stid: 'KVEL', name: 'Vernal Airport', air_temp: { units: 'Celsius', points: [reading(-20, 37), reading(5, 36), reading(55, 35), reading(118, 35), reading(185, 32), reading(400, 20)] } },
        split_mountain: { stid: 'SPMU1', name: null, air_temp: null },
    },
};

describe('chartSeries', () => {
    const series = chartSeries(FORECAST, 'vernal', OBSERVED, NOW);

    test('the forecast in °F for every hour of the run', () => {
        expect(series.forecast.map((point) => Math.round(point.f))).toEqual([36, 36, 36, 34, 33, 34]);
        expect(series.forecast[0].t).toBe(INIT);
    });

    test('the readings since the run began and up to now, with the station they came from', () => {
        // The reading 20 minutes before the run, and the one "from the future", are left out.
        expect(series.measured.map((point) => Math.round(point.f))).toEqual([36, 35, 35, 32]);
        expect(series.station).toEqual({ stid: 'KVEL', name: 'Vernal Airport' });
    });

    test('a town with no station in the feed has a line and no dots', () => {
        const alone = chartSeries(FORECAST, 'split_mountain', OBSERVED, NOW);
        expect(alone.forecast).toHaveLength(6);
        expect(alone.measured).toEqual([]);
        expect(alone.station).toBeNull();
    });

    test('no dots, and no error, when the readings could not be had', () => {
        for (const missing of [null, undefined, { status: 'unavailable', towns: {} }, { status: 'ok' }]) {
            expect(chartSeries(FORECAST, 'vernal', missing, NOW)).toMatchObject({ measured: [], station: null });
        }
    });

    test('readings in a unit met.js does not know are not drawn', () => {
        const odd = { status: 'ok', towns: { vernal: { stid: 'KVEL', name: 'Vernal Airport', air_temp: { units: 'Rankine', points: [reading(5, 36)] } } } };
        expect(chartSeries(FORECAST, 'vernal', odd, NOW)).toMatchObject({ measured: [], station: null });
    });

    test('a town the run does not list gives nothing to draw', () => {
        expect(chartSeries(FORECAST, 'atlantis', OBSERVED, NOW).forecast).toEqual([]);
    });
});

describe('thinReadings', () => {
    test('the first reading made in each quarter hour', () => {
        const readings = [0, 5, 10, 14, 15, 20, 31, 59].map((minute) => ({ t: INIT + minute * 60000, f: minute }));
        expect(thinReadings(readings).map((point) => point.f)).toEqual([0, 15, 31, 59]);
        expect(thinReadings([])).toEqual([]);
    });
});

describe('comparisonRows', () => {
    const rows = comparisonRows(chartSeries(FORECAST, 'vernal', OBSERVED, NOW));

    test('each hour already past, beside the reading made nearest to it', () => {
        expect(rows.map((row) => [(row.t - INIT) / HOUR, Math.round(row.forecastF), Math.round(row.measuredF)]))
            .toEqual([[0, 36, 36], [1, 36, 35], [2, 36, 35], [3, 34, 32]]);
        // Positive: the model ran warm.
        expect(Math.round(rows[3].differenceF)).toBe(2);
    });

    test('an hour with no reading within 20 minutes is left out, not matched to a distant one', () => {
        const sparse = { ...OBSERVED, towns: { vernal: { ...OBSERVED.towns.vernal, air_temp: { units: 'Celsius', points: [reading(5, 36), reading(150, 33)] } } } };
        expect(comparisonRows(chartSeries(FORECAST, 'vernal', sparse, NOW)).map((row) => (row.t - INIT) / HOUR)).toEqual([0]);
    });

    test('hours still ahead are never compared', () => {
        expect(rows.every((row) => row.t <= NOW)).toBe(true);
        expect(comparisonRows(chartSeries(FORECAST, 'vernal', OBSERVED, INIT - HOUR))).toEqual([]);
    });
});

describe('verdictSentence', () => {
    const rows = (...differences) => differences.map((differenceF, i) => ({ t: i, forecastF: 30 + differenceF, measuredF: 30, differenceF }));

    test('says how many hours it rests on, so a few hours are not read as a verdict on the model', () => {
        expect(verdictSentence(rows(0.2, -0.4, 1), 'Vernal Airport'))
            .toBe('Over the 3 hours compared so far, the forecast has matched Vernal Airport to within about a degree.');
        expect(verdictSentence(rows(0.4), 'Myton')).toBe('Over the 1 hour compared so far, the forecast has matched Myton to within about a degree.');
    });

    test('a scatter either side: the largest miss, with no direction claimed', () => {
        expect(verdictSentence(rows(2.2, -1.8, 0.3, 0.6), 'Vernal Airport'))
            .toBe('Over the 4 hours compared so far, the forecast has been within 2°F of what Vernal Airport measured.');
    });

    test('a steady miss: its size and its direction', () => {
        expect(verdictSentence(rows(3.6, 4.2, 4.4), 'Vernal Airport'))
            .toBe('Over the 3 hours compared so far, the forecast has run about 4°F warmer than Vernal Airport measured.');
        expect(verdictSentence(rows(-2, -3, -2.6), 'Roosevelt'))
            .toBe('Over the 3 hours compared so far, the forecast has run about 3°F colder than Roosevelt measured.');
    });

    test('nothing to compare yet', () => {
        expect(verdictSentence([], 'Vernal Airport')).toBe('No hour of this run can be compared with Vernal Airport yet.');
    });
});

describe('the pointer', () => {
    const series = chartSeries(FORECAST, 'vernal', OBSERVED, NOW);

    test('nearestHour finds the forecast hour closest to a time', () => {
        expect(nearestHour(series, INIT + 0.4 * HOUR)).toBe(0);
        expect(nearestHour(series, INIT + 0.6 * HOUR)).toBe(1);
        expect(nearestHour(series, INIT + 99 * HOUR)).toBe(5);
        expect(nearestHour({ forecast: [] }, INIT)).toBe(-1);
    });

    test('hourSentence says the hour in words, with the reading when there is one', () => {
        expect(hourSentence(series, 3)).toBe('12 AM: forecast 34°F, measured 32°F.');
        // An hour still ahead has a forecast and nothing measured.
        expect(hourSentence(series, 5)).toBe('2 AM: forecast 34°F.');
        expect(hourSentence(series, 9)).toBe('');
    });
});

describe('svgKit scales', () => {
    test('linear maps a data range onto pixels, either way up', () => {
        const y = linear(30, 40, 200, 0);
        expect([y(30), y(35), y(40)]).toEqual([200, 100, 0]);
        expect(linear(5, 5, 0, 100)(5)).toBe(50);
    });

    test('ticksBetween gives round numbers that cover the range', () => {
        expect(ticksBetween(31.2, 41.7, 5)).toEqual([30, 35, 40, 45]);
        expect(ticksBetween(4300, 8700, 1000)).toEqual([4000, 5000, 6000, 7000, 8000, 9000]);
        expect(ticksBetween(30, 40, 5)).toEqual([30, 35, 40]);
    });
});
