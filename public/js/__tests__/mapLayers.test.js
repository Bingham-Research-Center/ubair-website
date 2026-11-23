import fs from 'fs';
import {
    DEFAULT_LAYER,
    MAP_LAYERS,
    SCALES,
    availableLayers,
    bandIndex,
    bandLabel,
    fitGrid,
    formatValue,
    layerAvailable,
    layerByKey,
    legendBands,
    rampColour,
    rasterise,
    valueAt,
} from '../mapLayers.js';

// The forecast map's layers: what is offered, how each is worked out, and how a field becomes
// a banded picture placed on the map. All of it runs in the reader's browser on a file they
// have already been sent.

const GRID = JSON.parse(fs.readFileSync(new URL('./fixtures/hrrr_surface_grid_20261119.json', import.meta.url), 'utf8'));

const VARIABLES = {
    temperature_2m_c: { units: 'Celsius' },
    wind_u_10m_ms: { units: 'm/s' },
    wind_v_10m_ms: { units: 'm/s' },
    rainfall_1h_mm: { units: 'Millimeters' },
    snowfall_1h_mm: { units: 'Millimeters' },
};
const fToC = (f) => ((f - 32) * 5) / 9;
const MS_PER_MPH = 1 / 2.23694;

// Three hours on a grid of one row and two points, A and B.
const run = (extra = {}) => ({
    field_shape: [3, 1, 2],
    variables: { ...VARIABLES, ...(extra.variables || {}) },
    fields: {
        temperature_2m_c: [fToC(40), fToC(10), fToC(30), fToC(-4), fToC(34), fToC(20)],
        wind_u_10m_ms: [3 * MS_PER_MPH, 0, 0, 12 * MS_PER_MPH, 0, 1 * MS_PER_MPH],
        wind_v_10m_ms: [4 * MS_PER_MPH, 20 * MS_PER_MPH, 0, 16 * MS_PER_MPH, 0, 0],
        rainfall_1h_mm: [0, 25.4, 2.54, 0, 5.08, null],
        snowfall_1h_mm: [0, 0, 25.4, 0, 0, 50.8],
        ...(extra.fields || {}),
    },
});
const values = (key, payload, hour, fromHour = 0) => layerByKey(key).values(payload, hour, fromHour);
const rounded = (list, digits = 1) => list.map((value) => (Number.isFinite(value) ? Number(value.toFixed(digits)) : value));

describe('scales', () => {
    test('temperature is banded every 5 °F and diverges about freezing', () => {
        const scale = SCALES.temperature;
        expect(scale.edges[0]).toBe(-35);
        expect(scale.edges.at(-1)).toBe(100);
        expect(scale.edges.every((edge, i) => i === 0 || edge - scale.edges[i - 1] === 5)).toBe(true);
        expect(scale.colours).toHaveLength(scale.edges.length + 1);

        const colourAt = (f) => scale.colours[bandIndex(scale, f)];
        // The band that holds 32 °F is the neutral one; colder is the cold arm, warmer the warm.
        expect(colourAt(32)).toEqual({ ramp: 'freezing', t: 0 });
        expect(colourAt(30)).toEqual({ ramp: 'freezing', t: 0 });
        expect(colourAt(29.9).ramp).toBe('cold');
        expect(colourAt(35).ramp).toBe('warm');
        // Further from freezing is darker, by the same amount on each side.
        expect(colourAt(12).t).toBeGreaterThan(colourAt(27).t);
        expect(colourAt(88).t).toBeGreaterThan(colourAt(47).t);
        expect(colourAt(27).t).toBeCloseTo(colourAt(37).t, 10);
        expect(colourAt(-12).t).toBeCloseTo(colourAt(76).t, 10);
        // The ends are the darkest step, and nothing short of them is.
        expect(colourAt(-60)).toEqual({ ramp: 'cold', t: 1 });
        expect(colourAt(118)).toEqual({ ramp: 'warm', t: 1 });
        expect(colourAt(-33).t).toBeLessThan(1);
        expect(colourAt(97).t).toBeLessThan(1);
    });

    test('a magnitude scale leaves "too little to show" clear and darkens with amount', () => {
        for (const name of ['wind', 'rainRate', 'rainTotal', 'snowTotal', 'snowDepth', 'percent', 'humidity']) {
            const scale = SCALES[name];
            expect(scale.colours).toHaveLength(scale.edges.length + 1);
            expect(scale.colours[0]).toBeNull();
            const positions = scale.colours.slice(1).map((colour) => colour.t);
            expect(positions[0]).toBe(0);
            expect(positions.at(-1)).toBe(1);
            expect(positions.every((t, i) => i === 0 || t > positions[i - 1])).toBe(true);
            expect(new Set(scale.colours.slice(1).map((colour) => colour.ramp)).size).toBe(1);
        }
        expect(SCALES.wind.colours[bandIndex(SCALES.wind, 4.9)]).toBeNull();
        expect(SCALES.wind.colours[bandIndex(SCALES.wind, 5)]).toEqual({ ramp: 'wind', t: 0 });
    });

    test('snow on the map is in inches, never a rate', () => {
        expect(SCALES.snowTotal.unit).toBe('in');
        expect(layerByKey('snowfall_1h_mm')).toMatchObject({ label: 'Snow since the run began', scale: 'snowTotal', runningTotal: true });
        expect(layerByKey('snowfall_1h_mm').note).toMatch(/not an hourly rate/);
    });

    test('bandIndex and bandLabel', () => {
        const scale = SCALES.temperature;
        expect(bandIndex(scale, -40)).toBe(0);
        expect(bandIndex(scale, -35)).toBe(1);
        expect(bandIndex(scale, 99.9)).toBe(scale.edges.length - 1);
        expect(bandIndex(scale, 100)).toBe(scale.edges.length);
        for (const none of [NaN, null, undefined, Infinity]) expect(bandIndex(scale, none)).toBe(-1);

        expect(bandLabel(scale, 0)).toBe('below −35 °F');
        expect(bandLabel(scale, bandIndex(scale, -7))).toBe('−10 to −5 °F');
        expect(bandLabel(scale, bandIndex(scale, 32))).toBe('30 to 35 °F');
        expect(bandLabel(scale, scale.edges.length)).toBe('100 °F or more');
        expect(bandLabel(SCALES.rainRate, 2)).toBe('0.05 to 0.1 in/hr');
        expect(formatValue(scale, -3.4)).toBe('−3 °F');
        expect(formatValue(SCALES.rainRate, 0.123)).toBe('0.12 in/hr');
        expect(formatValue(scale, NaN)).toBe('--');
    });

    test('the legend lists only the bands the field reaches, highest first', () => {
        const legend = legendBands(SCALES.temperature, [21, 33, NaN, 38, 24]);
        expect(legend.map((band) => band.label)).toEqual(['35 to 40 °F', '30 to 35 °F', '25 to 30 °F', '20 to 25 °F']);
        expect(legend[1].colour).toEqual({ ramp: 'freezing', t: 0 });
        // Clear bands are not listed: a calm map has no wind legend rows at all.
        expect(legendBands(SCALES.wind, [1, 3, 4])).toEqual([]);
        expect(legendBands(SCALES.wind, [1, 12]).map((band) => band.label)).toEqual(['10 to 15 mph', '5 to 10 mph']);
        expect(legendBands(SCALES.temperature, [NaN, NaN])).toEqual([]);
    });

    test('rampColour blends between the steps of a ramp', () => {
        const steps = [[0, 0, 0], [100, 50, 10], [200, 100, 20]];
        expect(rampColour(steps, 0)).toEqual([0, 0, 0]);
        expect(rampColour(steps, 0.5)).toEqual([100, 50, 10]);
        expect(rampColour(steps, 0.75)).toEqual([150, 75, 15]);
        expect(rampColour(steps, 1)).toEqual([200, 100, 20]);
        expect(rampColour(steps, 7)).toEqual([200, 100, 20]);
        expect(rampColour([[9, 8, 7]], 0.3)).toEqual([9, 8, 7]);
        expect(rampColour([], 0.3)).toBeNull();
    });
});

describe('layers', () => {
    test('today\'s run offers nine layers; the four that wait on new fields are not among them', () => {
        expect(DEFAULT_LAYER).toBe('temperature');
        expect(availableLayers(run()).map((layer) => layer.key)).toEqual([
            'temperature', 'feels_like', 'below_freezing', 'coldest', 'warmest', 'wind_speed', 'rain_rate', 'rain_total', 'snowfall_1h_mm',
        ]);
        expect(MAP_LAYERS.map((layer) => layer.key).filter((key) => !layerAvailable(layerByKey(key), run())))
            .toEqual(['wind_gust', 'snow_depth', 'cloud_cover', 'humidity']);
        for (const layer of MAP_LAYERS) {
            expect(SCALES[layer.scale]).toBeDefined();
            expect(layer.note.length).toBeGreaterThan(20);
        }
    });

    test('a layer for a field CHPC has not sent yet appears as soon as the run carries it', () => {
        const withGust = run({
            variables: { wind_gust_10m_ms: { units: 'm/s' }, snow_depth_mm: { units: 'Millimeters' }, cloud_cover_pct: { units: 'percent' }, rh_2m_pct: { units: '%' } },
            fields: {
                wind_gust_10m_ms: [0, 10, 5, 20, 0, 0],
                snow_depth_mm: [0, 254, 0, 254, 0, 508],
                cloud_cover_pct: [0, 100, 50, 50, 10, 90],
                rh_2m_pct: [30, 95, 30, 95, 30, 95],
            },
        });
        expect(availableLayers(withGust).map((layer) => layer.key)).toEqual(MAP_LAYERS.map((layer) => layer.key));
        expect(rounded(values('wind_gust', withGust, 1))).toEqual([11.2, 44.7]);
        expect(rounded(values('snow_depth', withGust, 2))).toEqual([0, 20]);
        expect(values('cloud_cover', withGust, 0)).toEqual([0, 100]);
        expect(values('humidity', withGust, 0)).toEqual([30, 95]);
    });

    test('a field in a unit met.js does not know gives no layer, never a wrong number', () => {
        const kelvinless = run({ variables: { temperature_2m_c: { units: 'furlongs' } } });
        expect(availableLayers(kelvinless).map((layer) => layer.key)).toEqual(['wind_speed', 'rain_rate', 'rain_total', 'snowfall_1h_mm']);
        expect(availableLayers(run({ variables: { rainfall_1h_mm: {} } })).map((layer) => layer.key)).not.toContain('rain_total');
        // A field cut short, or a file with no shape, offers nothing that reads it.
        expect(availableLayers(run({ fields: { wind_u_10m_ms: [1, 2] } })).map((layer) => layer.key)).not.toContain('wind_speed');
        expect(availableLayers({ fields: run().fields, variables: VARIABLES })).toEqual([]);
        expect(availableLayers(null)).toEqual([]);
    });

    test('temperature and wind speed are converted from the units the file states', () => {
        expect(rounded(values('temperature', run(), 0))).toEqual([40, 10]);
        // 3 and 4 mph of wind components make 5 mph; the map shows the speed, not a component.
        expect(rounded(values('wind_speed', run(), 0))).toEqual([5, 20]);
        expect(rounded(values('wind_speed', run(), 1))).toEqual([0, 20]);
    });

    test('feels like: the NWS wind chill where it applies, the air temperature where it does not', () => {
        // Hour 0: 40 °F in a 5 mph wind is 36 °F; 10 °F in a 20 mph wind is -9 °F.
        expect(rounded(values('feels_like', run(), 0), 0)).toEqual([36, -9]);
        // Hour 1: A is calm, so 30 °F stays 30 °F; B is -4 °F in 20 mph, about -27 °F.
        expect(rounded(values('feels_like', run(), 1), 0)).toEqual([30, -27]);
        // It is never warmer than the air.
        const air = values('temperature', run(), 0);
        expect(values('feels_like', run(), 0).every((value, i) => value <= air[i])).toBe(true);
    });

    test('coldest, warmest and the rain total cover the hours from now to the end of the run', () => {
        expect(rounded(values('coldest', run(), 0, 0))).toEqual([30, -4]);
        expect(rounded(values('warmest', run(), 0, 0))).toEqual([40, 20]);
        // Opened in the run's second hour, the first hour is history and is left out.
        expect(rounded(values('coldest', run(), 2, 1))).toEqual([30, -4]);
        expect(rounded(values('warmest', run(), 2, 1))).toEqual([34, 20]);
        expect(rounded(values('rain_total', run(), 0, 0), 2)).toEqual([0.3, 1]);
        expect(rounded(values('rain_total', run(), 0, 1), 2)).toEqual([0.3, 0]);
        // They do not change as the slider moves.
        expect(values('coldest', run(), 0, 1)).toEqual(values('coldest', run(), 2, 1));
        for (const key of ['coldest', 'warmest', 'rain_total']) expect(layerByKey(key).wholeRun).toBe(true);
        expect(layerByKey('temperature').wholeRun).toBeUndefined();
    });

    test('a missing hour does not erase a total or an extreme', () => {
        // B has no rain value in the last hour: its total is what the other hours say.
        expect(rounded(values('rain_total', run(), 0, 0), 2)[1]).toBe(1);
        const gappy = run({ fields: { temperature_2m_c: [fToC(40), null, fToC(30), null, null, null] } });
        expect(rounded(values('coldest', gappy, 0, 0))).toEqual([30, NaN]);
    });

    test('rain is the hour\'s amount; snow is the running total, repaired', () => {
        expect(rounded(values('rain_rate', run(), 1), 2)).toEqual([0.1, 0]);
        expect(rounded(values('snowfall_1h_mm', run(), 1))).toEqual([1, 0]);
        // A's total drops to zero in the last hour, as the real field does; it is held.
        expect(rounded(values('snowfall_1h_mm', run(), 2))).toEqual([1, 2]);
    });
});

describe('fitGrid: placing the model grid on the map', () => {
    const [rows, cols] = GRID.grid.shape;
    const fit = fitGrid(GRID.grid);

    test('the real HRRR grid fits a straight placement to within 3 km', () => {
        expect([rows, cols]).toEqual([36, 38]);
        expect(fit.worstKm).toBeLessThan(3);
    });

    test('the corners are the grid\'s own corners, and the grid is turned a little from north', () => {
        const at = (col, row) => [GRID.grid.lats[row * cols + col], GRID.grid.lons[row * cols + col]];
        const near = (a, b) => expect(Math.hypot((a[0] - b[0]) * 111, (a[1] - b[1]) * 85)).toBeLessThan(3);
        near(fit.corners.topLeft, at(0, 0));
        near(fit.corners.topRight, at(cols - 1, 0));
        near(fit.corners.bottomLeft, at(0, rows - 1));
        // Row 0 is the southern edge, and it does not run due east: an upright rectangle would be wrong.
        expect(fit.corners.bottomLeft[0]).toBeGreaterThan(fit.corners.topLeft[0]);
        expect(Math.abs(fit.corners.topRight[0] - fit.corners.topLeft[0])).toBeGreaterThan(0.1);
    });

    test('toGrid turns a place back into a grid position', () => {
        for (const [col, row] of [[0, 0], [10, 5], [37, 35], [19, 18]]) {
            const position = fit.toGrid(GRID.grid.lats[row * cols + col], GRID.grid.lons[row * cols + col]);
            expect(Math.abs(position.col - col)).toBeLessThan(0.5);
            expect(Math.abs(position.row - row)).toBeLessThan(0.5);
        }
        // Vernal is inside the grid; Salt Lake City is off its western edge.
        const vernal = fit.toGrid(40.4555, -109.5287);
        expect(vernal.col).toBeGreaterThan(0);
        expect(vernal.col).toBeLessThan(cols - 1);
        expect(fit.toGrid(40.76, -111.89).col).toBeLessThan(0);
    });

    test('null for a grid it cannot fit', () => {
        expect(fitGrid(null)).toBeNull();
        expect(fitGrid({ shape: [1, 5], lats: [1, 2, 3, 4, 5], lons: [1, 2, 3, 4, 5] })).toBeNull();
        expect(fitGrid({ shape: [2, 2], lats: [1, 2, 3], lons: [1, 2, 3, 4] })).toBeNull();
        expect(fitGrid({ shape: [2, 2], lats: [40, 40, 40, 40], lons: [-110, -110, -110, -110] })).toBeNull();
    });
});

describe('valueAt and rasterise', () => {
    // A 2 x 2 grid: 0 and 10 along the top, 20 and 30 along the bottom.
    const field = [0, 10, 20, 30];

    test('valueAt blends the four points round a position', () => {
        expect(valueAt(field, 2, 2, 0, 0)).toBe(0);
        expect(valueAt(field, 2, 2, 1, 1)).toBe(30);
        expect(valueAt(field, 2, 2, 0.5, 0)).toBe(5);
        expect(valueAt(field, 2, 2, 0.5, 0.5)).toBe(15);
        // Off the grid there is no value.
        expect(valueAt(field, 2, 2, -0.1, 0)).toBeNaN();
        expect(valueAt(field, 2, 2, 1.01, 0)).toBeNaN();
    });

    test('a missing point is left out of the blend, and four missing points give nothing', () => {
        expect(valueAt([0, NaN, 20, NaN], 2, 2, 0.5, 0.5)).toBe(10);
        expect(valueAt([NaN, NaN, NaN, NaN], 2, 2, 0.5, 0.5)).toBeNaN();
    });

    test('rasterise blends first and bands second, so band edges are clean lines', () => {
        const scale = { edges: [15], colours: [null, { ramp: 'x', t: 1 }], unit: '', decimals: 0 };
        const picture = rasterise(field, 2, 2, 4, scale, [null, [10, 20, 30, 200]]);
        expect([picture.width, picture.height]).toEqual([5, 5]);
        expect(picture.data).toHaveLength(5 * 5 * 4);
        const pixel = (x, y) => Array.from(picture.data.slice((y * 5 + x) * 4, (y * 5 + x) * 4 + 4));
        // Top-left is 0, under the edge: clear. Bottom-right is 30: coloured.
        expect(pixel(0, 0)).toEqual([0, 0, 0, 0]);
        expect(pixel(4, 4)).toEqual([10, 20, 30, 200]);
        // The middle is exactly 15, on the edge: coloured; one step up-left is 10: clear.
        expect(pixel(2, 2)).toEqual([10, 20, 30, 200]);
        expect(pixel(1, 2)).toEqual([0, 0, 0, 0]);
        // Every pixel is one band's colour or clear: no blended in-between colours.
        for (let i = 0; i < picture.data.length; i += 4) {
            expect([0, 200]).toContain(picture.data[i + 3]);
        }
    });

    test('a point with no value leaves a clear patch, not a colour', () => {
        const scale = { edges: [1], colours: [null, { ramp: 'x', t: 1 }], unit: '', decimals: 0 };
        const picture = rasterise([NaN, NaN, NaN, NaN], 2, 2, 2, scale, [null, [1, 1, 1, 255]]);
        expect(Array.from(picture.data).every((byte) => byte === 0)).toBe(true);
    });
});
