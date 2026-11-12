// Aviation page: runway winds at KVEL (Vernal Regional), runway 17/35.
//
// One question, three views of it: how hard does the wind blow across the runway?
//   - Now: the latest KVEL observation from the Synoptic feed. The feed is raw SI (m/s) and
//     api.js deliberately does not convert it, so this page converts at display time.
//   - A chart and a table of the HRRR sub-hourly forecast that brc-tools pushes hourly as
//     forecast_hrrr_kvel_crosswind_YYYYMMDD_HHMMZ.json (docs/WEBSITE-BRCTOOLS-CONTRACT.md §5c).
//
// Steps already in the past are hidden: a run reaches the site a few hours after its init time,
// so a large part of its 6 h window is history by the time anyone reads it.
//
// Conventions: directions are degrees true, as in the payload and in METARs. For a runway end
// with heading h and wind from d at speed V, headwind = V cos(d - h) and crosswind =
// V sin(d - h); a positive crosswind blows from the right of a pilot rolling along h. These are
// the producer's conventions, and the tests check that they reproduce its series.

import { getLatestFilename } from './api.js';
import { getCardinalDirection } from './mapUtils.js';

export const STATION_ID = 'KVEL';
export const CROSSWIND_PREFIX = 'forecast_hrrr_kvel_crosswind_';
const TIME_ZONE = 'America/Denver';

// Runway 17/35, true headings from the FAA chart (brc-tools #59). Used for the observed wind when
// no forecast payload is available to supply runway_headings_deg.
const KVEL_RUNWAY_HEADINGS = [179, 359];

const MODEL_NAMES = { hrrr_subh: 'HRRR sub-hourly', hrrr: 'HRRR' };

// An observation older than this is left off the chart, so it cannot stretch the time axis.
const OBS_ON_CHART_MS = 90 * 60 * 1000;

// A step stays on screen until it is more than half a 15 min step old.
const STEP_GRACE_MS = 7.5 * 60 * 1000;

// Below this the wind is reported as calm and no runway end is favoured.
const CALM_KT = 0.5;

const KNOTS_PER_UNIT = {
    'kt': 1, 'kts': 1, 'knot': 1, 'knots': 1,
    'm/s': 1.943844, 'meters/second': 1.943844, 'm s-1': 1.943844,
    'mph': 0.868976, 'miles/hour': 0.868976,
    'km/h': 0.539957, 'kph': 0.539957,
};

/** Convert a speed to knots. Returns null for a unit it does not know, rather than guessing. */
export function toKnots(value, unit) {
    if (!Number.isFinite(value)) return null;
    const factor = KNOTS_PER_UNIT[String(unit ?? '').trim().toLowerCase()];
    return factor === undefined ? null : value * factor;
}

/** Head and cross components of a wind on a runway end. Positive cross = from the right. */
export function windComponents(speedKt, fromDeg, headingDeg) {
    if (!Number.isFinite(speedKt) || !Number.isFinite(fromDeg) || !Number.isFinite(headingDeg)) return null;
    const angle = ((fromDeg - headingDeg) * Math.PI) / 180;
    return { head: speedKt * Math.cos(angle), cross: speedKt * Math.sin(angle) };
}

/** Runway number from a heading, as the producer derives it (floor, not round); 0 is 36. */
export function runwayNumber(headingDeg) {
    const n = Math.floor(headingDeg / 10) % 36;
    return String(n === 0 ? 36 : n).padStart(2, '0');
}

/** Series key for one runway end: 'crosswind_kt_179', 'headwind_kt_359'. */
export function seriesKey(kind, headingDeg) {
    return `${kind}_kt_${String(headingDeg).padStart(3, '0')}`;
}

const isReciprocal = (a, b) => Math.abs(((((b - a) % 360) + 360) % 360) - 180) <= 1;

/**
 * Group runway-end headings into physical runways: [179, 359] -> one runway, "17/35".
 * The two ends of one strip share a crosswind and split the headwind, so the page shows one
 * set of numbers per strip instead of two mirror-image columns.
 */
export function runwayPairs(headings) {
    const left = (headings || []).filter(Number.isFinite).sort((a, b) => a - b);
    const pairs = [];
    while (left.length) {
        const first = left.shift();
        const i = left.findIndex((other) => isReciprocal(first, other));
        const ends = i >= 0 ? [first, left.splice(i, 1)[0]] : [first];
        pairs.push({ ends, label: ends.map(runwayNumber).join('/') });
    }
    return pairs;
}

/**
 * What one physical runway sees from one wind.
 * comp is { head, cross } relative to ends[0]. Returns
 *   cross      crosswind magnitude, kt
 *   crossFrom  compass side it blows from ('W'), or null when there is none to speak of
 *   gustCross  crosswind in the gust, kt: never below cross, null when there is no gust value
 *   favoured   heading of the end with the headwind, or null when calm or straight across
 *   head       headwind on that end, kt (negative only for a lone end with a tailwind)
 */
export function summariseRunway(ends, comp, speedKt, gustKt = null) {
    if (!comp || !Number.isFinite(comp.head) || !Number.isFinite(comp.cross)) return null;
    const calm = !Number.isFinite(speedKt) || speedKt < CALM_KT;
    const cross = Math.abs(comp.cross);
    const sideBearing = (ends[0] + (comp.cross >= 0 ? 90 : 270)) % 360;

    // HRRR's sub-hourly gust sometimes comes out below the sustained wind; floor it at the wind.
    let gustCross = null;
    if (Number.isFinite(gustKt)) gustCross = calm ? 0 : (Math.max(gustKt, speedKt) * cross) / speedKt;

    let favoured = ends[0];
    let head = comp.head;
    if (ends.length > 1 && comp.head < 0) {
        favoured = ends[1];
        head = -comp.head;
    }
    if (calm || (ends.length > 1 && Math.abs(head) < CALM_KT)) favoured = null;

    return {
        cross: calm ? 0 : cross,
        crossFrom: calm || cross < CALM_KT ? null : getCardinalDirection(sideBearing),
        gustCross,
        favoured,
        head: calm ? 0 : head,
    };
}

/** Components for forecast step i on ends[0]: the producer's series, or computed if absent. */
export function forecastComponents(payload, ends, i) {
    const series = payload.series || {};
    const head = series[seriesKey('headwind', ends[0])]?.[i];
    const cross = series[seriesKey('crosswind', ends[0])]?.[i];
    if (Number.isFinite(head) && Number.isFinite(cross)) return { head, cross };
    return windComponents(series.wind_speed_kt?.[i], series.wind_dir_deg?.[i], ends[0]);
}

/** Indices of the steps that are not yet past. */
export function upcomingIndices(validTimes, nowMs, graceMs = STEP_GRACE_MS) {
    const out = [];
    (validTimes || []).forEach((iso, i) => {
        const t = Date.parse(iso);
        if (Number.isFinite(t) && t >= nowMs - graceMs) out.push(i);
    });
    return out;
}

/**
 * The newest KVEL wind in a raw observation file ([{stid, variable, value, units, date_time}]).
 * Returns { speedKt, dirDeg, time } or null. Speed is converted using the row's own units.
 */
export function stationWind(rows, stid = STATION_ID) {
    let speed = null;
    let dir = null;
    for (const row of rows || []) {
        if (row?.stid !== stid) continue;
        if (row.variable === 'wind_speed') speed = row;
        if (row.variable === 'wind_direction') dir = row;
    }
    const speedKt = toKnots(speed?.value, speed?.units);
    if (speedKt === null) return null;
    const dirDeg = Number.isFinite(dir?.value) ? dir.value : null;
    return { speedKt, dirDeg, time: speed.date_time || dir?.date_time || null };
}

// ---- formatting ---------------------------------------------------------------------------

export function fmtKt(value) {
    return Number.isFinite(value) ? String(Math.round(value)) : '—';
}

/** Direction to the nearest 10 degrees, three digits, 360 for north: '290°'. */
export function directionLabel(deg) {
    if (!Number.isFinite(deg)) return '—';
    const tens = Math.round(deg / 10) * 10;
    return `${String(tens % 360 || 360).padStart(3, '0')}°`;
}

export function windLabel(dirDeg, speedKt) {
    if (!Number.isFinite(speedKt)) return '—';
    if (Math.round(speedKt) === 0) return 'Calm';
    return `${directionLabel(dirDeg)} ${Math.round(speedKt)} kt`;
}

/** '0315Z' */
export function zuluLabel(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return `${String(d.getUTCHours()).padStart(2, '0')}${String(d.getUTCMinutes()).padStart(2, '0')}Z`;
}

const localParts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE, hour: 'numeric', minute: '2-digit', hour12: true, timeZoneName: 'short',
});

/** '8:15 PM MST', assembled from parts so the spacing does not depend on the ICU version. */
export function localLabel(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const p = Object.fromEntries(localParts.formatToParts(d).map((part) => [part.type, part.value]));
    return `${p.hour}:${p.minute} ${String(p.dayPeriod).toUpperCase()} ${p.timeZoneName}`;
}

/** ' (12 min ago)', or '' when the time is missing or in the future. */
function ageSuffix(iso, nowMs) {
    const minutes = Math.round((nowMs - Date.parse(iso)) / 60000);
    if (!Number.isFinite(minutes) || minutes < 0) return '';
    return minutes < 90 ? ` (${minutes} min ago)` : ` (${Math.round(minutes / 60)} h ago)`;
}

function crossText(summary) {
    if (!summary) return '—';
    const kt = fmtKt(summary.cross);
    return summary.crossFrom ? `${kt} from ${summary.crossFrom}` : kt;
}

/** The gust crosswind, or a dash when it would read the same as the sustained one. */
function gustText(summary) {
    if (!summary || !Number.isFinite(summary.gustCross)) return '—';
    return Math.round(summary.gustCross) > Math.round(summary.cross) ? fmtKt(summary.gustCross) : '—';
}

function headText(summary) {
    if (!summary) return '—';
    if (summary.favoured === null) return 'Either end';
    const tail = summary.head < 0 ? ' tail' : '';
    return `Rwy ${runwayNumber(summary.favoured)}, ${fmtKt(Math.abs(summary.head))} kt${tail}`;
}

// ---- DOM ----------------------------------------------------------------------------------

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

function figure(label, value, detail) {
    const box = el('div', 'now-figure');
    box.append(el('span', 'now-label', label), el('span', 'now-value', value));
    if (detail) box.append(el('span', 'now-detail', detail));
    return box;
}

function renderNow(wind, headings, nowMs) {
    const stamp = document.getElementById('nowStamp');
    const box = document.getElementById('runwayNow');
    if (!stamp || !box) return;
    box.replaceChildren();
    if (!wind) {
        stamp.textContent = 'The latest KVEL observation is not available right now.';
        return;
    }
    stamp.textContent = wind.time
        ? `Observed ${zuluLabel(wind.time)}, ${localLabel(wind.time)}${ageSuffix(wind.time, nowMs)}. Gusts are not in the live feed.`
        : 'Latest observation.';

    box.append(figure('Wind', windLabel(wind.dirDeg, wind.speedKt)));
    for (const pair of runwayPairs(headings)) {
        const summary = summariseRunway(pair.ends, windComponents(wind.speedKt, wind.dirDeg, pair.ends[0]), wind.speedKt);
        box.append(figure(`Crosswind, Rwy ${pair.label}`, summary ? `${fmtKt(summary.cross)} kt` : '—',
            summary?.crossFrom ? `from the ${summary.crossFrom}` : ''));
        box.append(figure('Headwind', summary?.favoured ? `${fmtKt(Math.abs(summary.head))} kt` : '—',
            summary?.favoured ? `on Rwy ${runwayNumber(summary.favoured)}` : 'calm or straight across'));
    }
}

function renderTable(payload, pairs, steps) {
    const table = document.getElementById('crosswindTable');
    if (!table) return;
    const series = payload.series || {};

    const thead = el('thead');
    const groupRow = el('tr');
    const th = (text, attrs = {}) => {
        const cell = el('th', '', text);
        Object.entries(attrs).forEach(([k, v]) => cell.setAttribute(k, v));
        return cell;
    };
    const corner = el('td');
    corner.setAttribute('colspan', '2');
    groupRow.append(corner);
    pairs.forEach((pair) => groupRow.append(th(`Rwy ${pair.label}`, { colspan: 3, scope: 'colgroup' })));
    const labelRow = el('tr');
    labelRow.append(th('Time', { scope: 'col' }), th('Wind', { scope: 'col' }));
    pairs.forEach(() => labelRow.append(
        th('Crosswind, kt', { scope: 'col' }), th('In gusts', { scope: 'col' }), th('Headwind on', { scope: 'col' }),
    ));
    thead.append(groupRow, labelRow);

    const tbody = el('tbody');
    for (const i of steps) {
        const iso = payload.valid_times[i];
        const speed = series.wind_speed_kt?.[i];
        const gust = series.gust_kt?.[i];
        const tr = el('tr');

        const time = el('td');
        time.append(el('span', 'time-zulu', zuluLabel(iso)), el('span', 'time-local', localLabel(iso)));
        const wind = el('td', '', windLabel(series.wind_dir_deg?.[i], speed));
        if (Number.isFinite(gust) && Math.round(gust) > Math.round(speed)) {
            wind.append(el('span', 'wind-gust', `gust ${Math.round(gust)}`));
        }
        tr.append(time, wind);

        for (const pair of pairs) {
            const summary = summariseRunway(pair.ends, forecastComponents(payload, pair.ends, i), speed, gust);
            tr.append(
                el('td', '', crossText(summary)),
                el('td', '', gustText(summary)),
                el('td', '', headText(summary)),
            );
        }
        tbody.append(tr);
    }
    table.replaceChildren(thead, tbody);
}

function token(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// Plotly has no time zones; hand it UTC wall-clock strings and label the axis UTC.
const plotlyUtc = (iso) => new Date(iso).toISOString().slice(0, 16).replace('T', ' ');

function renderChart(payload, pairs, steps, wind, nowMs) {
    const chart = document.getElementById('crosswindChart');
    if (!chart) return;
    if (typeof window.Plotly === 'undefined' || steps.length === 0) {
        chart.hidden = true;
        return;
    }
    const series = payload.series || {};
    const x = steps.map((i) => plotlyUtc(payload.valid_times[i]));
    const accent = token('--color-accent');
    const soft = token('--color-brand-soft');
    const text = token('--color-text');
    const muted = token('--color-text-muted');
    const grid = token('--color-border');
    const font = token('--font-sans');

    const traces = [];
    for (const pair of pairs) {
        const rows = steps.map((i) => summariseRunway(
            pair.ends, forecastComponents(payload, pair.ends, i), series.wind_speed_kt?.[i], series.gust_kt?.[i],
        ));
        const name = pairs.length > 1 ? ` (Rwy ${pair.label})` : '';
        traces.push({
            x, y: rows.map((r) => r?.cross ?? null), name: `Crosswind${name}`,
            mode: 'lines', line: { color: accent, width: 3 },
            hovertemplate: '%{y:.0f} kt<extra>Crosswind</extra>',
        });
        traces.push({
            x, y: rows.map((r) => r?.gustCross ?? null), name: `In gusts${name}`,
            mode: 'lines', line: { color: soft, width: 2, dash: 'dot' }, connectgaps: false,
            hovertemplate: '%{y:.0f} kt<extra>In gusts</extra>',
        });
    }

    if (wind?.time && pairs.length && nowMs - Date.parse(wind.time) <= OBS_ON_CHART_MS) {
        const observed = summariseRunway(pairs[0].ends, windComponents(wind.speedKt, wind.dirDeg, pairs[0].ends[0]), wind.speedKt);
        if (observed) {
            traces.push({
                x: [plotlyUtc(wind.time)], y: [observed.cross], name: 'Observed',
                mode: 'markers', marker: { color: text, size: 9, symbol: 'diamond' },
                hovertemplate: '%{y:.0f} kt<extra>Observed</extra>',
            });
        }
    }

    const layout = {
        autosize: true,
        margin: { l: 48, r: 16, t: 8, b: 48 },
        paper_bgcolor: 'transparent',
        plot_bgcolor: 'transparent',
        font: { family: font, color: muted, size: 13 },
        xaxis: { title: { text: 'Time (UTC)' }, gridcolor: grid, tickformat: '%H%MZ' },
        yaxis: { title: { text: 'kt' }, gridcolor: grid, rangemode: 'tozero', zeroline: false },
        legend: { orientation: 'h', y: -0.25 },
        hovermode: 'x unified',
    };
    chart.hidden = false;
    window.Plotly.react(chart, traces, layout, { displayModeBar: false, responsive: true });
}

function renderForecast(payload, wind, nowMs) {
    const stamp = document.getElementById('forecastStamp');
    const table = document.getElementById('crosswindTable');
    if (!payload) {
        if (stamp) stamp.textContent = 'The latest HRRR runway-wind forecast is not available right now.';
        if (table) table.replaceChildren();
        renderChart({ series: {}, valid_times: [] }, [], [], null, nowMs);
        return;
    }
    const pairs = runwayPairs(payload.runway_headings_deg);
    const steps = upcomingIndices(payload.valid_times, nowMs);
    const model = (payload.product === 'aviation_crosswind' && MODEL_NAMES[payload.model]) || 'HRRR';
    const issued = payload.generated_at
        ? `, issued ${zuluLabel(payload.generated_at)}${ageSuffix(payload.generated_at, nowMs)}`
        : '';

    if (stamp) {
        stamp.textContent = steps.length
            ? `${model} run ${zuluLabel(payload.init_time)}${issued}. Showing ${steps.length} steps from now on.`
            : `${model} run ${zuluLabel(payload.init_time)}${issued} has no steps left in the future. The forecast comes back when the next run lands.`;
    }
    renderTable(payload, pairs, steps);
    renderChart(payload, pairs, steps, wind, nowMs);
}

async function fetchJson(url) {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`${url}: ${res.status}`);
    return res.json();
}

async function loadForecast() {
    try {
        const name = await getLatestFilename(CROSSWIND_PREFIX, 'forecasts');
        return await fetchJson(`/api/static/forecasts/${name}`);
    } catch (err) {
        console.warn('aviation: no crosswind forecast', err);
        return null;
    }
}

async function loadWind() {
    try {
        const name = await getLatestFilename('map_obs_', 'observations');
        return stationWind(await fetchJson(`/api/static/observations/${name}`));
    } catch (err) {
        console.warn('aviation: no KVEL observation', err);
        return null;
    }
}

async function initAviation() {
    const [payload, wind] = await Promise.all([loadForecast(), loadWind()]);
    const nowMs = Date.now();
    renderNow(wind, payload?.runway_headings_deg || KVEL_RUNWAY_HEADINGS, nowMs);
    renderForecast(payload, wind, nowMs);
}

if (typeof document !== 'undefined' && document.querySelector('body[data-page-type="aviation"]')) {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initAviation);
    } else {
        initAviation();
    }
}
