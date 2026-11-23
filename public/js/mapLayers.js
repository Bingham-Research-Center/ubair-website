// What the forecast map on /forecast_weather can show, and how each layer is worked out,
// banded and coloured.
//
// Everything here is arithmetic on the HRRR surface-layers run the reader has already
// downloaded: nothing is fetched, and nothing costs the server anything. Three rules:
//
//  - A layer is offered only when the run carries the fields it needs, in units met.js knows.
//    A field the producer has not sent yet, or sends in a unit we do not recognise, gives no
//    layer rather than a wrong one. Layers for fields CHPC plans to add are listed here already
//    (gusts, snow on the ground, cloud, humidity) and appear by themselves when the field does.
//  - A derived layer uses a standard formula and says so in its note. Wind chill is the
//    National Weather Service's; a total is a plain sum of amounts that are truly hourly.
//  - Snow is never derived: the run's snowfall field is a running total with gaps
//    (hrrrFields.js), shown as the total it is.
//
// Colours are not in this file. A band names a ramp and a position on it; the page reads the
// ramp's five steps from the theme tokens (--scale-*-1 to -5) and `rampColour` blends them.
// Pure functions only.

import { runningTotalForHour, sliceFieldForHour } from './hrrrFields.js';
import { feelsLikeColdF, toFahrenheit, toMillimetres, toMph } from './met.js';

const MM_PER_INCH = 25.4;

// ── Scales ────────────────────────────────────────────────────────────────────────────────

const range = (from, to, step) => Array.from({ length: Math.round((to - from) / step) + 1 }, (_, i) => from + i * step);

/**
 * A scale is a list of band edges in display units, low to high, and one colour per band:
 * `edges.length + 1` of them. A value below the first edge is in band 0; a value at or above
 * the last edge is in the last band. A colour is `{ ramp, t }` (a position from 0, lightest,
 * to 1, darkest), or null for a band that is left clear so the basemap shows through.
 */
function magnitudeScale(unit, decimals, ramp, edges) {
    // Below the first edge is "too little to show"; the rest step from light to dark.
    const colours = [null, ...edges.map((_, i) => ({ ramp, t: edges.length === 1 ? 0.5 : i / (edges.length - 1) }))];
    return Object.freeze({ unit, decimals, edges: Object.freeze(edges), colours: Object.freeze(colours) });
}

// Temperature diverges about freezing in bands of 5 °F: thirteen colder bands down to -35 °F
// and one for anything colder, the band that holds 32 °F in neutral grey, thirteen warmer
// bands up to 100 °F and one for anything hotter. Fourteen steps on each arm.
const TEMP_EDGES = range(-35, 100, 5);
const TEMP_ARM = 14;
// The first band either side of freezing starts a little way up its arm, so that it is plainly
// tinted and not mistaken for the neutral band; the fourteenth is the darkest step.
const ARM_START = 0.12;
const armPosition = (step) => Math.min(1, ARM_START + ((step - 1) / (TEMP_ARM - 1)) * (1 - ARM_START));
const TEMP_COLOURS = TEMP_EDGES.map((edge) => {
    // The band that starts at `edge`.
    if (edge === 30) return { ramp: 'freezing', t: 0 };
    const stepsFromFreezing = edge < 30 ? (30 - edge) / 5 : (edge - 30) / 5;
    return { ramp: edge < 30 ? 'cold' : 'warm', t: armPosition(stepsFromFreezing) };
});

export const SCALES = Object.freeze({
    temperature: Object.freeze({
        unit: '°F',
        decimals: 0,
        edges: Object.freeze(TEMP_EDGES),
        colours: Object.freeze([{ ramp: 'cold', t: 1 }, ...TEMP_COLOURS]),
    }),
    // One band: everything colder than freezing, in the cold arm's middle step.
    freezing: Object.freeze({
        unit: '°F',
        decimals: 0,
        edges: Object.freeze([32]),
        colours: Object.freeze([{ ramp: 'cold', t: 0.5 }, null]),
    }),
    wind: magnitudeScale('mph', 0, 'wind', [5, 10, 15, 20, 25, 30, 40, 50, 60]),
    rainRate: magnitudeScale('in/hr', 2, 'rain', [0.01, 0.05, 0.1, 0.25, 0.5]),
    rainTotal: magnitudeScale('in', 2, 'rain', [0.01, 0.1, 0.25, 0.5, 1, 2]),
    snowTotal: magnitudeScale('in', 1, 'snow', [0.1, 0.5, 1, 3, 6, 12]),
    snowDepth: magnitudeScale('in', 0, 'snow', [1, 3, 6, 12, 24, 48]),
    percent: magnitudeScale('%', 0, 'cloud', [10, 30, 50, 70, 90]),
    humidity: magnitudeScale('%', 0, 'rain', [20, 40, 60, 80, 95]),
});

/** Which band of `scale` a value falls in, or -1 for a value that is not a number. */
export function bandIndex(scale, value) {
    if (!Number.isFinite(value)) return -1;
    const { edges } = scale;
    let low = 0;
    let high = edges.length;
    while (low < high) {
        const mid = (low + high) >> 1;
        if (value >= edges[mid]) low = mid + 1; else high = mid;
    }
    return low;
}

const tidy = (number, decimals) => {
    const text = number.toFixed(decimals);
    return (decimals > 0 ? text.replace(/\.?0+$/, '') : text).replace(/^-/, '−');
};

/** "30 to 35 °F", "below −35 °F", "100 °F or more". */
export function bandLabel(scale, index) {
    const { edges, unit, decimals } = scale;
    const low = index > 0 ? tidy(edges[index - 1], decimals) : null;
    const high = index < edges.length ? tidy(edges[index], decimals) : null;
    if (low === null) return `below ${high} ${unit}`;
    if (high === null) return `${low} ${unit} or more`;
    return `${low} to ${high} ${unit}`;
}

/**
 * The legend for a field: the coloured bands between its lowest and highest value, highest
 * first. Bands the field never reaches are left out, so a winter map is not explained with
 * summer colours. `[{ index, label, colour }]`; empty when nothing on the map is coloured.
 */
export function legendBands(scale, values) {
    let lowest = Infinity;
    let highest = -Infinity;
    for (const value of values) {
        const index = bandIndex(scale, value);
        if (index < 0) continue;
        if (index < lowest) lowest = index;
        if (index > highest) highest = index;
    }
    const bands = [];
    for (let index = highest; index >= lowest; index -= 1) {
        if (scale.colours[index]) bands.push({ index, label: bandLabel(scale, index), colour: scale.colours[index] });
    }
    return bands;
}

/**
 * A colour at position `t` (0 to 1) along a ramp of `[r, g, b]` steps, blended between the
 * two steps it falls between.
 */
export function rampColour(steps, t) {
    if (!Array.isArray(steps) || steps.length === 0) return null;
    if (steps.length === 1) return steps[0].slice(0, 3);
    const at = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0)) * (steps.length - 1);
    const i = Math.min(steps.length - 2, Math.floor(at));
    const f = at - i;
    return [0, 1, 2].map((c) => Math.round(steps[i][c] + (steps[i + 1][c] - steps[i][c]) * f));
}

// ── Layers ────────────────────────────────────────────────────────────────────────────────

const unitOf = (payload, field) => payload?.variables?.[field]?.units;

/** One hour of a field, each value passed through a met.js converter with the file's own unit. */
function converted(payload, field, hourIndex, convert) {
    const unit = unitOf(payload, field);
    return sliceFieldForHour(payload, field, hourIndex).map((value) => convert(value, unit) ?? NaN);
}

const percentOf = (value, unit) => ((unit === 'percent' || unit === '%') && Number.isFinite(value) ? value : null);
const inchesOf = (value, unit) => {
    const mm = toMillimetres(value, unit);
    return mm === null ? null : mm / MM_PER_INCH;
};

const hourCount = (payload) => (Array.isArray(payload?.field_shape) ? payload.field_shape[0] : 0);

/** For each grid point, `pick` over the hours from `fromHour` to the end of the run. */
function overHours(payload, fromHour, hourValues, pick) {
    let result = null;
    for (let hour = fromHour; hour < hourCount(payload); hour += 1) {
        const values = hourValues(hour);
        if (!result) {
            result = values.slice();
        } else {
            for (let i = 0; i < values.length; i += 1) result[i] = pick(result[i], values[i]);
        }
    }
    return result || [];
}

// NaN-aware: a missing hour does not erase the hours that are there.
const least = (a, b) => (Number.isFinite(a) && Number.isFinite(b) ? Math.min(a, b) : (Number.isFinite(a) ? a : b));
const most = (a, b) => (Number.isFinite(a) && Number.isFinite(b) ? Math.max(a, b) : (Number.isFinite(a) ? a : b));
const sum = (a, b) => (Number.isFinite(a) && Number.isFinite(b) ? a + b : (Number.isFinite(a) ? a : b));

const tempF = (payload, hour) => converted(payload, 'temperature_2m_c', hour, toFahrenheit);

function windMph(payload, hour) {
    const u = converted(payload, 'wind_u_10m_ms', hour, toMph);
    const v = converted(payload, 'wind_v_10m_ms', hour, toMph);
    return u.map((value, i) => Math.hypot(value, v[i]));
}

/**
 * The layers, in the order the picker lists them. Each has:
 *   needs      the fields it reads, and the converter that must know each field's unit
 *   values     (payload, hourIndex, fromHour) -> one number per grid point, in display units
 *   wholeRun   true when the layer covers the hours from now to the end of the run, so it
 *              does not change as the time slider moves
 *   note       what it is and how it was worked out, in a sentence for the reader
 */
export const MAP_LAYERS = Object.freeze([
    {
        key: 'temperature',
        label: 'Temperature',
        scale: 'temperature',
        needs: { temperature_2m_c: toFahrenheit },
        values: (payload, hour) => tempF(payload, hour),
        note: 'Air temperature two metres above the ground, straight from the model.',
    },
    {
        key: 'feels_like',
        label: 'Feels like (wind chill)',
        scale: 'temperature',
        needs: { temperature_2m_c: toFahrenheit, wind_u_10m_ms: toMph, wind_v_10m_ms: toMph },
        values: (payload, hour) => {
            const wind = windMph(payload, hour);
            return tempF(payload, hour).map((value, i) => feelsLikeColdF(value, wind[i]) ?? NaN);
        },
        note: 'Computed from the model\'s temperature and wind with the National Weather Service wind chill formula. '
            + 'Above 50 °F, or in a wind under 3 mph, there is no wind chill and this is the air temperature.',
    },
    {
        key: 'below_freezing',
        label: 'Below freezing',
        scale: 'freezing',
        needs: { temperature_2m_c: toFahrenheit },
        values: (payload, hour) => tempF(payload, hour),
        note: 'Where the model\'s air temperature is below 32 °F at this hour.',
    },
    {
        key: 'coldest',
        label: 'Coldest, now to the end of the run',
        scale: 'temperature',
        wholeRun: true,
        needs: { temperature_2m_c: toFahrenheit },
        values: (payload, hour, fromHour) => overHours(payload, fromHour, (h) => tempF(payload, h), least),
        note: 'The lowest hourly temperature at each point between now and the end of this model run.',
    },
    {
        key: 'warmest',
        label: 'Warmest, now to the end of the run',
        scale: 'temperature',
        wholeRun: true,
        needs: { temperature_2m_c: toFahrenheit },
        values: (payload, hour, fromHour) => overHours(payload, fromHour, (h) => tempF(payload, h), most),
        note: 'The highest hourly temperature at each point between now and the end of this model run.',
    },
    {
        key: 'wind_speed',
        label: 'Wind speed',
        scale: 'wind',
        needs: { wind_u_10m_ms: toMph, wind_v_10m_ms: toMph },
        values: (payload, hour) => windMph(payload, hour),
        note: 'Sustained wind ten metres above the ground, computed from the model\'s two wind components. Not gusts.',
    },
    {
        key: 'wind_gust',
        label: 'Wind gusts',
        scale: 'wind',
        needs: { wind_gust_10m_ms: toMph },
        values: (payload, hour) => converted(payload, 'wind_gust_10m_ms', hour, toMph),
        note: 'The model\'s strongest gust in the hour.',
    },
    {
        key: 'rain_rate',
        label: 'Rain in the hour',
        scale: 'rainRate',
        needs: { rainfall_1h_mm: inchesOf },
        values: (payload, hour) => converted(payload, 'rainfall_1h_mm', hour, inchesOf),
        note: 'Rain falling in the hour ending at this time, straight from the model.',
    },
    {
        key: 'rain_total',
        label: 'Rain, now to the end of the run',
        scale: 'rainTotal',
        wholeRun: true,
        needs: { rainfall_1h_mm: inchesOf },
        values: (payload, hour, fromHour) => overHours(payload, fromHour,
            (h) => converted(payload, 'rainfall_1h_mm', h, inchesOf), sum),
        note: 'The model\'s hourly rain amounts added up from now to the end of this run.',
    },
    {
        // A running total since the run began, not an hourly amount: see hrrrFields.js.
        key: 'snowfall_1h_mm',
        label: 'Snow since the run began',
        scale: 'snowTotal',
        runningTotal: true,
        needs: { snowfall_1h_mm: inchesOf },
        values: (payload, hour) => {
            const unit = unitOf(payload, 'snowfall_1h_mm');
            return runningTotalForHour(payload, 'snowfall_1h_mm', hour).map((value) => inchesOf(value, unit) ?? NaN);
        },
        note: 'A total since this model run began, up to this hour, as the model sends it. It is not an hourly rate.',
    },
    {
        key: 'snow_depth',
        label: 'Snow on the ground',
        scale: 'snowDepth',
        needs: { snow_depth_mm: inchesOf },
        values: (payload, hour) => converted(payload, 'snow_depth_mm', hour, inchesOf),
        note: 'The depth of snow lying on the ground in the model.',
    },
    {
        key: 'cloud_cover',
        label: 'Cloud cover',
        scale: 'percent',
        needs: { cloud_cover_pct: percentOf },
        values: (payload, hour) => converted(payload, 'cloud_cover_pct', hour, percentOf),
        note: 'How much of the sky the model covers with cloud.',
    },
    {
        key: 'humidity',
        label: 'Relative humidity',
        scale: 'humidity',
        needs: { rh_2m_pct: percentOf },
        values: (payload, hour) => converted(payload, 'rh_2m_pct', hour, percentOf),
        note: 'Relative humidity two metres above the ground, straight from the model.',
    },
].map((layer) => Object.freeze(layer)));

export const DEFAULT_LAYER = 'temperature';

/** True when the run has every field the layer reads, each in a unit its converter knows. */
export function layerAvailable(layer, payload) {
    const shape = payload?.field_shape;
    if (!Array.isArray(shape) || shape.length !== 3) return false;
    return Object.entries(layer.needs).every(([field, convert]) => {
        const flat = payload?.fields?.[field];
        // The converter is asked about 1: any unit it does not know gives null.
        return Array.isArray(flat) && flat.length === shape[0] * shape[1] * shape[2] && convert(1, unitOf(payload, field)) !== null;
    });
}

/** The layers this run can show, in picker order. */
export function availableLayers(payload) {
    return MAP_LAYERS.filter((layer) => layerAvailable(layer, payload));
}

export function layerByKey(key) {
    return MAP_LAYERS.find((layer) => layer.key === key) || null;
}

// ── Placing the grid on the map ───────────────────────────────────────────────────────────

const mercatorY = (lat) => (Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) * 180) / Math.PI;
const fromMercatorY = (y) => (Math.atan(Math.exp((y * Math.PI) / 180)) * 360) / Math.PI - 90;
const KM_PER_DEGREE = 111.2;

/** Least-squares fit of `values` as a plane over (col, row): [constant, perCol, perRow]. */
function fitPlane(values, rows, cols) {
    // Normal equations for the three unknowns, solved by elimination.
    const m = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
    for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
            const value = values[row * cols + col];
            if (!Number.isFinite(value)) continue;
            const x = [1, col, row];
            for (let i = 0; i < 3; i += 1) {
                for (let j = 0; j < 3; j += 1) m[i][j] += x[i] * x[j];
                m[i][3] += x[i] * value;
            }
        }
    }
    for (let i = 0; i < 3; i += 1) {
        const pivot = m[i][i];
        if (!Number.isFinite(pivot) || Math.abs(pivot) < 1e-12) return null;
        for (let j = i; j < 4; j += 1) m[i][j] /= pivot;
        for (let k = 0; k < 3; k += 1) {
            if (k === i) continue;
            const factor = m[k][i];
            for (let j = i; j < 4; j += 1) m[k][j] -= factor * m[i][j];
        }
    }
    return [m[0][3], m[1][3], m[2][3]];
}

/**
 * Where the model grid sits on a web map.
 *
 * The run lists a latitude and longitude for every grid point. The grid is the model's own
 * projection, turned a few degrees from north, so it cannot be laid on the map as an
 * upright rectangle. Over the Basin it is very nearly a parallelogram on a Mercator map,
 * though, so one straight fit (column and row to position) places a picture of the whole
 * field. `worstKm` is the furthest any listed point sits from the fit: under 3 km for the real
 * grid, most of it the rounding of the coordinates in the file.
 *
 * Returns null for a grid too small or too broken to fit; otherwise
 *   corners   { topLeft, topRight, bottomLeft } as [lat, lon]: grid (col 0, row 0),
 *             (last col, row 0) and (col 0, last row)
 *   toGrid    (lat, lon) -> { col, row }, fractional, for reading a value under the pointer
 *   worstKm
 */
export function fitGrid(grid) {
    const [rows, cols] = Array.isArray(grid?.shape) ? grid.shape : [];
    const { lats, lons } = grid || {};
    if (!(rows >= 2 && cols >= 2) || !Array.isArray(lats) || !Array.isArray(lons)
        || lats.length !== rows * cols || lons.length !== rows * cols) {
        return null;
    }
    const xFit = fitPlane(lons, rows, cols);
    const yFit = fitPlane(lats.map((lat) => (Number.isFinite(lat) ? mercatorY(lat) : NaN)), rows, cols);
    if (!xFit || !yFit) return null;

    const position = (col, row) => [fromMercatorY(yFit[0] + yFit[1] * col + yFit[2] * row), xFit[0] + xFit[1] * col + xFit[2] * row];
    let worstKm = 0;
    for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
            const i = row * cols + col;
            if (!Number.isFinite(lats[i]) || !Number.isFinite(lons[i])) continue;
            const [lat, lon] = position(col, row);
            const km = Math.hypot((lat - lats[i]) * KM_PER_DEGREE, (lon - lons[i]) * KM_PER_DEGREE * Math.cos((lats[i] * Math.PI) / 180));
            if (km > worstKm) worstKm = km;
        }
    }

    // The fit turned round: position -> (col, row).
    const det = xFit[1] * yFit[2] - xFit[2] * yFit[1];
    if (Math.abs(det) < 1e-12) return null;
    const toGrid = (lat, lon) => {
        const dx = lon - xFit[0];
        const dy = mercatorY(lat) - yFit[0];
        return { col: (dx * yFit[2] - xFit[2] * dy) / det, row: (xFit[1] * dy - dx * yFit[1]) / det };
    };

    return {
        corners: { topLeft: position(0, 0), topRight: position(cols - 1, 0), bottomLeft: position(0, rows - 1) },
        toGrid,
        worstKm,
    };
}

/**
 * The value of a field at a fractional grid position, blended from the four points round it.
 * NaN outside the grid or where none of the four has a value.
 */
export function valueAt(values, rows, cols, col, row) {
    if (!(col >= 0 && row >= 0 && col <= cols - 1 && row <= rows - 1)) return NaN;
    const c0 = Math.min(cols - 2, Math.floor(col));
    const r0 = Math.min(rows - 2, Math.floor(row));
    const fc = col - c0;
    const fr = row - r0;
    let total = 0;
    let weight = 0;
    const add = (value, w) => {
        if (Number.isFinite(value) && w > 0) {
            total += value * w;
            weight += w;
        }
    };
    add(values[r0 * cols + c0], (1 - fc) * (1 - fr));
    add(values[r0 * cols + c0 + 1], fc * (1 - fr));
    add(values[(r0 + 1) * cols + c0], (1 - fc) * fr);
    add(values[(r0 + 1) * cols + c0 + 1], fc * fr);
    return weight > 0 ? total / weight : NaN;
}

/**
 * A picture of a field: `factor` pixels per grid step, each pixel the blend of the four grid
 * values round it, coloured by the band that blend falls in.
 *
 * Blending first and banding second is what gives clean band edges like a contour map. The
 * detail is still the grid's: about 6 km between points, so nothing narrower than that shows.
 *
 * With `edgeColour`, a pixel whose band differs from its neighbour to the left or above is
 * drawn in that colour instead: a thin line along every band edge, so that two pale bands
 * side by side can still be told apart.
 *
 * @param bandColours  one `[r, g, b, a]` (0 to 255) or null per band of the scale
 * @param edgeColour   `[r, g, b, a]` for the lines between bands, or null for none
 * @returns `{ width, height, data }` with `data` as RGBA bytes, row 0 first
 */
export function rasterise(values, rows, cols, factor, scale, bandColours, edgeColour = null) {
    const width = (cols - 1) * factor + 1;
    const height = (rows - 1) * factor + 1;
    const bands = new Int16Array(width * height);
    for (let y = 0; y < height; y += 1) {
        const row = y / factor;
        for (let x = 0; x < width; x += 1) {
            bands[y * width + x] = bandIndex(scale, valueAt(values, rows, cols, x / factor, row));
        }
    }

    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            const i = y * width + x;
            const band = bands[i];
            if (band < 0) continue;
            // An edge is a change of band between two pixels that both have a value.
            const left = x > 0 ? bands[i - 1] : band;
            const above = y > 0 ? bands[i - width] : band;
            const onEdge = edgeColour && ((left >= 0 && left !== band) || (above >= 0 && above !== band));
            const colour = onEdge ? edgeColour : bandColours[band];
            if (!colour) continue;
            const p = i * 4;
            data[p] = colour[0];
            data[p + 1] = colour[1];
            data[p + 2] = colour[2];
            data[p + 3] = colour[3];
        }
    }
    return { width, height, data };
}

/** "31 °F", "0.12 in/hr": a value in a scale's units, or "--" when there is none. */
export function formatValue(scale, value) {
    return Number.isFinite(value) ? `${value.toFixed(scale.decimals).replace(/^-/, '−')} ${scale.unit}` : '--';
}
