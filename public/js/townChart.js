// "Forecast and measured" on /forecast_weather: the chosen town's temperature forecast as a
// line, with a dot for each reading its paired weather station has made since the model run
// began. A run reaches the page some three hours after it starts, so its first hours can
// already be checked against what happened: the plainest test of a forecast there is.
//
// The forecast is the run the town table reads; the readings come from
// /api/weather-forecast/observed, which gathers them from the ten-minute observation files.
// A town whose station is not in our feed gets the line and a sentence saying so, never a
// made-up dot.
//
// The functions above the "drawing" line are pure and tested.

import { toFahrenheit } from './met.js';
import { mountainClock, mountainTime, mountainWeekday, sameMountainDay } from './mountainTime.js';
import { drawAtWidth, linear, svg, svgText, ticksBetween } from './svgKit.js';

const MINUTE = 60 * 1000;
// A reading counts for a forecast hour if it was made within this long of it.
const MATCH_WINDOW_MS = 20 * MINUTE;
// An airport reports every five minutes and a road station every ten: drawn as they come, the
// dots run into each other. One reading is drawn per quarter hour, the first made in it.
const DOT_EVERY_MS = 15 * MINUTE;

/** The first reading made in each quarter hour. */
export function thinReadings(readings) {
    const kept = [];
    let lastSlot = null;
    for (const reading of readings) {
        const slot = Math.floor(reading.t / DOT_EVERY_MS);
        if (slot !== lastSlot) kept.push(reading);
        lastSlot = slot;
    }
    return kept;
}

/**
 * The two series for one town, in °F:
 * `{ forecast: [{ t, f }], measured: [{ t, f }], station, nowMs }`.
 *
 * `station` is `{ stid, name }` when the town has a paired station with temperature readings
 * in the feed, otherwise null. Readings later than `now`, outside the hours the run covers, or
 * in a unit met.js does not know, are left out.
 */
export function chartSeries(forecast, townId, observed, now) {
    const town = (forecast?.stations || []).find((candidate) => candidate?.id === townId);
    const times = Array.isArray(forecast?.valid_times) ? forecast.valid_times : [];
    const temps = Array.isArray(town?.forecasts?.temp_2m_c) ? town.forecasts.temp_2m_c : [];
    const unit = forecast?.variables?.temp_2m_c?.units;
    const line = times.map((time, i) => ({ t: Date.parse(time), f: toFahrenheit(temps[i], unit) }))
        .filter((point) => Number.isFinite(point.t) && point.f !== null);

    const paired = observed?.status === 'ok' ? observed.towns?.[townId] : null;
    const readings = paired?.air_temp;
    const measured = (Array.isArray(readings?.points) ? readings.points : [])
        .map(([time, value]) => ({ t: Date.parse(time), f: toFahrenheit(value, readings.units) }))
        // Only readings inside the hours the run covers: there is no forecast to hold an earlier one against.
        .filter((point) => Number.isFinite(point.t) && point.f !== null && point.t <= now
            && line.length > 0 && point.t >= line[0].t && point.t <= line.at(-1).t)
        .sort((a, b) => a.t - b.t);

    return {
        forecast: line,
        measured,
        station: paired && measured.length > 0 ? { stid: String(paired.stid), name: paired.name ? String(paired.name) : String(paired.stid) } : null,
        nowMs: now,
    };
}

/**
 * The forecast hours already past, each beside the reading made nearest to it (within 20
 * minutes): `[{ t, forecastF, measuredF, differenceF }]`, where the difference is forecast
 * minus measured, so positive means the model ran warm. Hours with no reading near them are
 * left out.
 */
export function comparisonRows(series) {
    const rows = [];
    for (const hour of series.forecast) {
        if (hour.t > series.nowMs) continue;
        let nearest = null;
        for (const reading of series.measured) {
            const gap = Math.abs(reading.t - hour.t);
            if (gap <= MATCH_WINDOW_MS && (!nearest || gap < Math.abs(nearest.t - hour.t))) nearest = reading;
        }
        if (nearest) rows.push({ t: hour.t, forecastF: hour.f, measuredF: nearest.f, differenceF: hour.f - nearest.f });
    }
    return rows;
}

/**
 * One sentence on how the run has done so far at this town. It reports the typical miss and
 * its direction over the hours compared, and how many hours that is, so three hours are not
 * read as a verdict on the model.
 */
export function verdictSentence(rows, stationName) {
    if (rows.length === 0) return `No hour of this run can be compared with ${stationName} yet.`;
    const hours = `${rows.length} hour${rows.length === 1 ? '' : 's'}`;
    const mean = rows.reduce((total, row) => total + row.differenceF, 0) / rows.length;
    const worst = Math.max(...rows.map((row) => Math.abs(row.differenceF)));
    if (worst < 1.5) return `Over the ${hours} compared so far, the forecast has matched ${stationName} to within about a degree.`;
    if (Math.abs(mean) < 1.5) {
        return `Over the ${hours} compared so far, the forecast has been within ${Math.round(worst)}°F of what ${stationName} measured.`;
    }
    return `Over the ${hours} compared so far, the forecast has run about ${Math.round(Math.abs(mean))}°F `
        + `${mean > 0 ? 'warmer' : 'colder'} than ${stationName} measured.`;
}

/** The forecast hour nearest to a time, for the pointer: an index into `series.forecast`, or -1. */
export function nearestHour(series, t) {
    let best = -1;
    for (let i = 0; i < series.forecast.length; i += 1) {
        if (best < 0 || Math.abs(series.forecast[i].t - t) < Math.abs(series.forecast[best].t - t)) best = i;
    }
    return best;
}

/** "3 AM: forecast 29°F, measured 27°F." for one forecast hour, with the reading nearest it. */
export function hourSentence(series, index) {
    const hour = series.forecast[index];
    if (!hour) return '';
    const when = mountainTime(hour.t, series.nowMs);
    const match = comparisonRows({ ...series, forecast: [hour] })[0];
    const measured = match ? `, measured ${Math.round(match.measuredF)}°F` : '';
    return `${when}: forecast ${Math.round(hour.f)}°F${measured}.`;
}

// ── drawing ───────────────────────────────────────────────────────────────────────────────

let state = null;   // { forecast, townId, townName, observed }
let redraw = null;

function draw(width) {
    const box = document.getElementById('town-chart');
    const verdict = document.getElementById('town-chart-verdict');
    const readout = document.getElementById('town-chart-readout');
    const legend = document.getElementById('town-chart-legend');
    const tableBox = document.getElementById('town-chart-table');
    if (!box || !state) return;

    const now = Date.now();
    const series = chartSeries(state.forecast, state.townId, state.observed, now);
    if (series.forecast.length < 2) {
        box.replaceChildren();
        if (verdict) verdict.textContent = 'The run has no temperatures to draw for this place.';
        if (legend) legend.hidden = true;
        if (tableBox) tableBox.hidden = true;
        return;
    }

    const narrow = width < 560;
    const height = narrow ? 210 : 240;
    const pad = { top: 16, right: narrow ? 12 : 20, bottom: 30, left: narrow ? 38 : 46 };
    const all = [...series.forecast, ...series.measured].map((point) => point.f);
    const ticks = ticksBetween(Math.min(...all) - 1, Math.max(...all) + 1, 5);
    const x = linear(series.forecast[0].t, series.forecast.at(-1).t, pad.left, width - pad.right);
    const y = linear(ticks[0], ticks.at(-1), height - pad.bottom, pad.top);
    const base = height - pad.bottom;

    const chart = svg('svg', {
        class: 'town-chart-svg', width, height, viewBox: `0 0 ${width} ${height}`, role: 'img',
        'aria-label': `${state.townName}: forecast temperature${series.station ? `, with readings from ${series.station.name}` : ''}`,
    });

    for (const tick of ticks) {
        chart.append(
            svg('line', { class: 'chart-grid', x1: pad.left, x2: width - pad.right, y1: y(tick), y2: y(tick) }),
            svgText(`${tick}°`, { class: 'chart-tick', x: pad.left - 6, y: y(tick) + 4, 'text-anchor': 'end' }),
        );
    }
    // The freezing line, where it is on the chart: the number most readers are looking for.
    if (ticks[0] < 32 && ticks.at(-1) > 32) {
        chart.append(
            svg('line', { class: 'chart-freezing', x1: pad.left, x2: width - pad.right, y1: y(32), y2: y(32) }),
            svgText('32°F', { class: 'chart-tick chart-freezing-label', x: width - pad.right, y: y(32) - 4, 'text-anchor': 'end' }),
        );
    }

    // Time labels every three hours (six on a phone), with the day where it changes.
    const every = narrow ? 6 : 3;
    let lastLabelled = null;
    series.forecast.forEach((hour, i) => {
        if (i % every !== 0) return;
        const newDay = lastLabelled === null || !sameMountainDay(hour.t, lastLabelled);
        lastLabelled = hour.t;
        const anchor = i === 0 ? 'start' : (i === series.forecast.length - 1 ? 'end' : 'middle');
        chart.append(svgText(newDay ? `${mountainWeekday(hour.t)} ${mountainClock(hour.t)}` : mountainClock(hour.t),
            { class: 'chart-tick', x: x(hour.t), y: base + 18, 'text-anchor': anchor }));
    });
    chart.append(svg('line', { class: 'chart-axis', x1: pad.left, x2: width - pad.right, y1: base, y2: base }));

    // Now: what is left of it has been measured, what is right of it has not happened yet.
    if (now > series.forecast[0].t && now < series.forecast.at(-1).t) {
        chart.append(
            svg('line', { class: 'chart-now', x1: x(now), x2: x(now), y1: pad.top, y2: base }),
            svgText('now', { class: 'chart-tick', x: x(now) + 4, y: pad.top + 10, 'text-anchor': 'start' }),
        );
    }

    chart.append(svg('polyline', {
        class: 'town-chart-line',
        points: series.forecast.map((point) => `${x(point.t).toFixed(1)},${y(point.f).toFixed(1)}`).join(' '),
    }));
    for (const reading of thinReadings(series.measured)) {
        chart.append(svg('circle', { class: 'town-chart-dot', cx: x(reading.t), cy: y(reading.f), r: 4 }));
    }

    // The pointer: a line at the nearest forecast hour, and that hour in words under the chart.
    const cursor = svg('line', { class: 'chart-cursor', y1: pad.top, y2: base, visibility: 'hidden' });
    const hit = svg('rect', { class: 'chart-hit', x: pad.left, y: pad.top, width: width - pad.left - pad.right, height: base - pad.top });
    const idle = 'Point at the chart, or tap it, for one hour.';
    const point = (event) => {
        const bounds = chart.getBoundingClientRect();
        const t = series.forecast[0].t + ((event.clientX - bounds.left - pad.left) / (width - pad.left - pad.right))
            * (series.forecast.at(-1).t - series.forecast[0].t);
        const index = nearestHour(series, t);
        if (index < 0) return;
        cursor.setAttribute('x1', x(series.forecast[index].t));
        cursor.setAttribute('x2', x(series.forecast[index].t));
        cursor.setAttribute('visibility', 'visible');
        if (readout) readout.textContent = hourSentence(series, index);
    };
    hit.addEventListener('pointermove', point);
    hit.addEventListener('pointerdown', point);
    hit.addEventListener('pointerleave', () => {
        cursor.setAttribute('visibility', 'hidden');
        if (readout) readout.textContent = idle;
    });
    chart.append(cursor, hit);
    box.replaceChildren(chart);
    if (readout) readout.textContent = idle;

    const rows = comparisonRows(series);
    if (verdict) {
        verdict.textContent = series.station
            ? verdictSentence(rows, series.station.name)
            : 'No weather station in our feed is paired with this place, so there is nothing to hold the forecast against here.';
    }
    if (legend) {
        legend.hidden = false;
        const measured = legend.querySelector('[data-series="measured"]');
        if (measured) {
            measured.hidden = !series.station;
            const text = measured.querySelector('.town-chart-legend-text');
            if (text && series.station) text.textContent = `Measured at ${series.station.name} (${series.station.stid})`;
        }
    }

    // The same numbers as a table, for anyone who would rather read them.
    if (tableBox) {
        tableBox.hidden = rows.length === 0;
        const body = tableBox.querySelector('tbody');
        if (body) {
            body.replaceChildren(...rows.map((row) => {
                const tr = document.createElement('tr');
                const th = document.createElement('th');
                th.scope = 'row';
                th.textContent = mountainTime(row.t, now);
                // The last column is worked out from the two numbers shown, so the row agrees with itself.
                const shown = Math.round(row.forecastF) - Math.round(row.measuredF);
                const cells = [`${Math.round(row.forecastF)}°F`, `${Math.round(row.measuredF)}°F`,
                    shown === 0 ? 'the same' : `${Math.abs(shown)}°F ${shown > 0 ? 'too warm' : 'too cold'}`];
                tr.append(th, ...cells.map((text) => {
                    const td = document.createElement('td');
                    td.textContent = text;
                    return td;
                }));
                return tr;
            }));
        }
    }
}

/**
 * Called by townForecast.js whenever the run, the chosen town or the readings change.
 * `observed` is the answer from /api/weather-forecast/observed, or null if it could not be had.
 */
export function showTownChart(forecast, townId, townName, observed) {
    const box = document.getElementById('town-chart');
    if (!box) return;
    if (!forecast || !townId) {
        state = null;
        box.replaceChildren();
        return;
    }
    state = { forecast, townId, townName, observed };
    if (redraw) redraw();
    else redraw = drawAtWidth(box, draw);
}

