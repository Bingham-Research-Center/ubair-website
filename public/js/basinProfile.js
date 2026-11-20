// "Across the Basin" on /forecast_weather: the 14 towns and passes of the HRRR waypoints run
// drawn in profile along US-40, from Daniels Summit in the west to Dinosaur in the east, each
// coloured by its forecast temperature. Seen from the side, the Basin's shape explains its
// weather: on a still winter night the cold settles on the floor and the passes stay warmer.
//
// It is the same run the town table reads (townForecast.js hands it over), so nothing more is
// fetched. The ground is drawn from the 14 points' own heights, joined by straight lines: a
// sketch of the road's profile, and it says so.
//
// The functions above the "drawing" line are pure and tested.

import { getCardinalDirection } from './mapUtils.js';
import { SCALES, bandIndex, legendBands } from './mapLayers.js';
import { toFahrenheit, toMillimetres, toMph } from './met.js';
import { firstHourFromNow, mountainTime } from './mountainTime.js';
import { drawAtWidth, linear, svg, svgText, ticksBetween } from './svgKit.js';
import { bandRgb, cssRgb } from './themeColours.js';

const FEET_PER_METRE = 3.28084;
const MM_PER_INCH = 25.4;
const EARTH_RADIUS_MILES = 3958.8;
// A hundredth of an inch in the hour is the least anyone would call precipitation.
const WET_INCHES = 0.01;
// The floor: where the Basin's towns are, and where cold air pools (the homepage's lowest band).
const FLOOR_MAX_FT = 5900;
// The pass must be this much warmer than the floor before the page calls it an inversion.
const INVERSION_MIN_F = 2;

function milesBetween(a, b) {
    const rad = (degrees) => (degrees * Math.PI) / 180;
    const dLat = rad(b.lat - a.lat);
    const dLon = rad(b.lon - a.lon);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 2 * EARTH_RADIUS_MILES * Math.asin(Math.sqrt(h));
}

/**
 * The places in the run, west to east as the file lists them, with how far along the line
 * each one is: `[{ id, name, elevationFt, miles }]`. Distance is point to point in a straight
 * line, so a little shorter than the road.
 */
export function profilePoints(forecast) {
    const stations = (Array.isArray(forecast?.stations) ? forecast.stations : []).filter((station) =>
        typeof station?.id === 'string' && typeof station?.name === 'string'
        && [station.lat, station.lon, station.elevation_m].every(Number.isFinite));
    let miles = 0;
    return stations.map((station, i) => {
        if (i > 0) miles += milesBetween(stations[i - 1], station);
        return { id: station.id, name: station.name, elevationFt: Math.round((station.elevation_m * FEET_PER_METRE) / 10) * 10, miles };
    });
}

/**
 * Every place at one forecast hour, in display units:
 * `{ [id]: { tempF, windMph, windFrom, precipIn } }`. A value the file does not carry, or
 * states in a unit met.js does not know, is null.
 */
export function profileHour(forecast, hourIndex) {
    const unit = (variable) => forecast?.variables?.[variable]?.units;
    const hour = {};
    for (const station of Array.isArray(forecast?.stations) ? forecast.stations : []) {
        const at = (variable) => station?.forecasts?.[variable]?.[hourIndex];
        const mm = toMillimetres(at('rainfall_1h_mm'), unit('rainfall_1h_mm'));
        hour[station.id] = {
            tempF: toFahrenheit(at('temp_2m_c'), unit('temp_2m_c')),
            windMph: toMph(at('wind_speed_10m_ms'), unit('wind_speed_10m_ms')),
            windFrom: Number.isFinite(at('wind_dir_10m_deg')) ? getCardinalDirection(at('wind_dir_10m_deg')) : null,
            precipIn: mm === null ? null : mm / MM_PER_INCH,
        };
    }
    return hour;
}

/** "Myton, 5,100 ft: 28°F, wind W 6 mph, no precipitation." */
export function pointSentence(point, values) {
    const where = `${point.name}, ${point.elevationFt.toLocaleString('en-US')} ft`;
    if (!values || values.tempF === null) return `${where}: no forecast for this hour.`;
    const wind = values.windMph === null ? null
        : (Math.round(values.windMph) === 0 ? 'calm' : `wind ${values.windFrom ? `${values.windFrom} ` : ''}${Math.round(values.windMph)} mph`);
    const precip = values.precipIn === null ? null
        : (values.precipIn >= WET_INCHES ? `${values.precipIn.toFixed(2)} in of precipitation in the hour` : 'no precipitation');
    return `${where}: ${[`${Math.round(values.tempF)}°F`, wind, precip].filter(Boolean).join(', ')}.`;
}

/**
 * One or two sentences about the hour: the coldest and warmest places, and, when the Basin
 * floor is colder than the highest pass, that it is an inversion. Two named places each time,
 * never an average.
 */
export function profileSummary(points, hour) {
    const known = points.filter((point) => Number.isFinite(hour?.[point.id]?.tempF));
    if (known.length < 2) return 'The run has no temperatures for this hour.';
    const temp = (point) => hour[point.id].tempF;
    const say = (point) => `${point.name} ${Math.round(temp(point))}°F`;
    const coldest = known.reduce((a, b) => (temp(b) < temp(a) ? b : a));
    const warmest = known.reduce((a, b) => (temp(b) > temp(a) ? b : a));
    const range = Math.round(temp(coldest)) === Math.round(temp(warmest))
        ? `About ${Math.round(temp(coldest))}°F all along the road.`
        : `Coldest: ${say(coldest)}. Warmest: ${say(warmest)}.`;

    const top = known.reduce((a, b) => (b.elevationFt > a.elevationFt ? b : a));
    const floor = known.filter((point) => point.elevationFt < FLOOR_MAX_FT);
    if (floor.length === 0 || top.elevationFt < FLOOR_MAX_FT) return range;
    const floorColdest = floor.reduce((a, b) => (temp(b) < temp(a) ? b : a));
    if (temp(top) - temp(floorColdest) < INVERSION_MIN_F) return range;
    return `${range} It is colder on the Basin floor than up at ${top.name} (${Math.round(temp(top))}°F, ${top.elevationFt.toLocaleString('en-US')} ft): `
        + 'cold air is pooled low, which is a temperature inversion.';
}

// The names that get a label first when there is not room for all fourteen.
const LABEL_ORDER = ['vernal', 'daniels_summit', 'roosevelt', 'dinosaur', 'duchesne', 'myton', 'strawberry', 'fruitland',
    'fort_duchesne', 'starvation', 'split_mountain', 'asphalt_ridge', 'east_lapoint', 'little_red_fox'];

/**
 * Which places to label so that no two labels run into each other: the ids, taken in order of
 * how well known the place is, each kept only if its label clears every label kept so far.
 * `extents` is `{ [id]: [left, right] }`, the space each label would take, in pixels.
 */
export function chooseLabels(points, extents, gap = 10) {
    const rank = (id) => (LABEL_ORDER.includes(id) ? LABEL_ORDER.indexOf(id) : LABEL_ORDER.length);
    const kept = [];
    for (const point of [...points].sort((p, q) => rank(p.id) - rank(q.id))) {
        const [left, right] = extents[point.id] || [];
        if (!Number.isFinite(left) || !Number.isFinite(right)) continue;
        if (kept.every((other) => right + gap <= extents[other.id][0] || left - gap >= extents[other.id][1])) kept.push(point);
    }
    return new Set(kept.map((point) => point.id));
}

/** The temperature band a value falls in, as mapLayers.js colours it, or null. */
export function tempBand(tempF) {
    const index = bandIndex(SCALES.temperature, tempF);
    return index < 0 ? null : SCALES.temperature.colours[index];
}

// ── drawing ───────────────────────────────────────────────────────────────────────────────

let run = null;      // the forecast townForecast.js handed over
let hourIndex = 0;
let fromHour = 0;
let redraw = null;

function draw(width) {
    const box = document.getElementById('profile-chart');
    const summary = document.getElementById('profile-summary');
    const readout = document.getElementById('profile-readout');
    const legend = document.getElementById('profile-legend');
    if (!box || !run) return;

    const points = profilePoints(run);
    const hour = profileHour(run, hourIndex);
    if (points.length < 2) {
        box.replaceChildren();
        if (summary) summary.textContent = 'The town forecast does not list enough places to draw the Basin\'s profile.';
        return;
    }

    const narrow = width < 560;
    const height = narrow ? 250 : 300;
    const pad = { top: 34, right: narrow ? 14 : 24, bottom: 42, left: narrow ? 46 : 58 };
    const lowFt = Math.floor((Math.min(...points.map((p) => p.elevationFt)) - 300) / 500) * 500;
    const highFt = Math.ceil((Math.max(...points.map((p) => p.elevationFt)) + 300) / 500) * 500;
    const x = linear(0, points.at(-1).miles, pad.left, width - pad.right);
    const y = linear(lowFt, highFt, height - pad.bottom, pad.top);
    const base = height - pad.bottom;
    const xs = Object.fromEntries(points.map((point) => [point.id, x(point.miles)]));

    const chart = svg('svg', {
        class: 'profile-svg', width, height, viewBox: `0 0 ${width} ${height}`, role: 'img',
        'aria-label': `The Basin in profile along US-40, ${points[0].name} to ${points.at(-1).name}, with each place's forecast temperature`,
    });

    // Height lines, every thousand feet.
    for (const tick of ticksBetween(lowFt, highFt, 1000).filter((ft) => ft > lowFt && ft < highFt)) {
        chart.append(
            svg('line', { class: 'chart-grid', x1: pad.left, x2: width - pad.right, y1: y(tick), y2: y(tick) }),
            svgText(`${tick.toLocaleString('en-US')} ft`, { class: 'chart-tick', x: pad.left - 6, y: y(tick) + 4, 'text-anchor': 'end' }),
        );
    }

    // The ground: the fourteen heights joined up, filled down to the baseline.
    const outline = points.map((point) => `${xs[point.id].toFixed(1)},${y(point.elevationFt).toFixed(1)}`).join(' ');
    chart.append(svg('polygon', { class: 'profile-ground', points: `${pad.left},${base} ${outline} ${width - pad.right},${base}` }));
    chart.append(svg('line', { class: 'chart-axis', x1: pad.left, x2: width - pad.right, y1: base, y2: base }));

    // Where each name would sit under the baseline: centred on its dot, or pushed inward at the
    // two ends. About six pixels a letter at this size; a little generous, so names never touch.
    const anchorOf = (cx) => (cx < pad.left + 30 ? 'start' : (cx > width - pad.right - 30 ? 'end' : 'middle'));
    const extents = Object.fromEntries(points.map((point) => {
        const w = point.name.length * 6.4;
        const cx = xs[point.id];
        const anchor = anchorOf(cx);
        return [point.id, anchor === 'start' ? [cx, cx + w] : (anchor === 'end' ? [cx - w, cx] : [cx - w / 2, cx + w / 2])];
    }));
    const labelled = chooseLabels(points, extents);
    const say = (point) => { if (readout) readout.textContent = pointSentence(point, hour[point.id]); };
    // Numbers and names go on last, over every dot, so a neighbouring dot cannot cover one.
    const labels = [];

    for (const point of points) {
        const values = hour[point.id];
        const cx = xs[point.id];
        const cy = y(point.elevationFt);
        const group = svg('g', { class: 'profile-point', tabindex: 0, role: 'img', 'aria-label': pointSentence(point, values) });
        group.append(svg('title', {}, pointSentence(point, values)));
        // A bigger, unseen target than the dot, so a finger or a pointer does not have to be exact.
        group.append(svg('circle', { class: 'chart-hit', cx, cy, r: 16 }));
        if (values?.precipIn !== null && values?.precipIn >= WET_INCHES) {
            // Three slanted strokes over the dot: precipitation in the hour. The run does not say rain or snow.
            for (const dx of [-6, 0, 6]) {
                group.append(svg('line', { class: 'profile-precip', x1: cx + dx + 2, x2: cx + dx - 2, y1: cy - 21, y2: cy - 12 }));
            }
        }
        const dot = svg('circle', { class: 'profile-dot', cx, cy, r: 7 });
        const band = Number.isFinite(values?.tempF) ? tempBand(values.tempF) : null;
        if (band) dot.style.fill = cssRgb(bandRgb(band));
        else dot.dataset.empty = 'true';
        group.append(dot);
        group.addEventListener('pointerenter', () => say(point));
        group.addEventListener('focus', () => say(point));
        group.addEventListener('click', () => say(point));
        chart.append(group);

        if (labelled.has(point.id)) {
            const wet = values?.precipIn !== null && values?.precipIn >= WET_INCHES;
            if (Number.isFinite(values?.tempF)) {
                labels.push(svgText(`${Math.round(values.tempF)}°`, { class: 'profile-temp', x: cx, y: cy - (wet ? 26 : 13), 'text-anchor': 'middle' }));
            }
            labels.push(svgText(point.name, { class: 'profile-name', x: cx, y: base + 17, 'text-anchor': anchorOf(cx) }));
        }
    }
    chart.append(
        ...labels,
        svgText('West', { class: 'chart-tick', x: pad.left, y: base + 34, 'text-anchor': 'start' }),
        svgText('East', { class: 'chart-tick', x: width - pad.right, y: base + 34, 'text-anchor': 'end' }),
    );
    box.replaceChildren(chart);

    if (summary) summary.textContent = profileSummary(points, hour);
    if (readout) readout.textContent = 'Point at a dot, or tap it, for that place.';

    // The legend: the temperature bands on show at this hour, warmest first, and the rain mark.
    if (legend) {
        const temps = points.map((point) => hour[point.id]?.tempF).filter(Number.isFinite);
        const items = legendBands(SCALES.temperature, temps).map((band) => {
            const item = document.createElement('li');
            const swatch = document.createElement('span');
            swatch.className = 'profile-legend-swatch';
            swatch.style.backgroundColor = cssRgb(bandRgb(band.colour));
            swatch.setAttribute('aria-hidden', 'true');
            item.append(swatch, band.label);
            return item;
        });
        const wetItem = document.createElement('li');
        const strokes = document.createElement('span');
        strokes.className = 'profile-legend-wet';
        strokes.setAttribute('aria-hidden', 'true');
        strokes.textContent = '///';
        wetItem.append(strokes, 'precipitation in the hour');
        legend.replaceChildren(...items, wetItem);
    }

    const label = document.getElementById('profile-hour-label');
    const time = run.valid_times?.[hourIndex];
    if (label && time) {
        const on = hourIndex - fromHour;
        label.textContent = `${mountainTime(Date.parse(time), Date.now())} (${on <= 0 ? 'the hour under way' : `${on} hour${on === 1 ? '' : 's'} on`})`;
    }
}

/** Called by townForecast.js with each run it loads, or with null when there is none. */
export function showProfile(forecast) {
    const section = document.getElementById('basin-profile');
    const box = document.getElementById('profile-chart');
    const slider = document.getElementById('profile-hour');
    const summary = document.getElementById('profile-summary');
    if (!section || !box) return;

    if (!forecast || profilePoints(forecast).length < 2) {
        run = null;
        box.replaceChildren();
        if (slider) slider.disabled = true;
        if (summary) summary.textContent = 'The town forecast is not available right now.';
        return;
    }

    const sameRun = run && run.init_time === forecast.init_time;
    run = forecast;
    const times = Array.isArray(forecast.valid_times) ? forecast.valid_times : [];
    fromHour = firstHourFromNow(times, Date.now());
    // A refresh of the same run keeps the hour the reader chose, unless it has slipped into the past.
    if (!sameRun || hourIndex < fromHour) hourIndex = fromHour;
    if (slider) {
        slider.min = String(fromHour);
        slider.max = String(Math.max(fromHour, times.length - 1));
        slider.value = String(hourIndex);
        slider.disabled = times.length - 1 <= fromHour;
        if (!slider.dataset.wired) {
            slider.dataset.wired = 'true';
            slider.addEventListener('input', (event) => {
                hourIndex = parseInt(event.target.value, 10);
                redraw?.();
            });
        }
    }

    if (redraw) redraw();
    else redraw = drawAtWidth(box, draw);
}
