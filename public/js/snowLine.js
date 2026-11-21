// "Where rain turns to snow" on /forecast_weather: the forecast points laid out like a
// hillside, highest at the top, with what falls at each one hour by hour.
//
// The server works out everything (server/statusLights.js `precipByHour` and `snowLineAt`):
// each point's type in each hour, and the range of heights between which rain turns to snow.
// This module turns that answer into rows and words, and draws them as a table. A table is the
// right form: it is a grid of places by hours, and it reads aloud correctly as it stands.
//
// The range is always "between this point and that one": fifteen points cannot give a single
// height, and the page does not pretend to one.
//
// The functions above the "drawing" line are pure and tested.

import { mountainClock, mountainWeekday, sameMountainDay } from './mountainTime.js';

export const TYPE_WORDS = { snow: 'Snow', rain: 'Rain', mix: 'Mix', dry: 'Dry' };
// Font Awesome names, the same as the homepage tile and the table by elevation band.
export const TYPE_ICONS = { snow: ['fa-snowflake'], rain: ['fa-cloud-rain'], mix: ['fa-cloud-rain', 'fa-snowflake'], dry: [] };

const feet = (ft) => `${Math.round(ft).toLocaleString('en-US')} ft`;

/** One hour's rain-to-snow range in words. `line` is what `snowLineAt` returned. */
export function snowLineSentence(line) {
    switch (line?.kind) {
        case 'between':
            return `Snow from about ${feet(line.highFt)} up; rain or a mix at ${feet(line.lowFt)} and below.`;
        case 'zone':
            return `Snow as low as ${feet(line.lowFt)}, and rain or a mix as high as ${feet(line.highFt)}: both fall in between.`;
        case 'snow':
            return `Snow at every point with precipitation, down to ${feet(line.downToFt)}.`;
        case 'rain':
            return `Rain or a mix at every point with precipitation, up to ${feet(line.upToFt)}. No snow.`;
        default:
            return 'No precipitation at any forecast point.';
    }
}

/** True when a point at `elevationFt` lies in the hour's rain-to-snow range. */
export function inSnowLineRange(line, elevationFt) {
    return (line?.kind === 'between' || line?.kind === 'zone') && elevationFt >= line.lowFt && elevationFt <= line.highFt;
}

/**
 * The hillside for one answer from /api/weather-forecast/precip:
 * `{ columns, rows, sentences }`, or null when there is nothing to draw.
 *
 *   columns    the hours, "11 PM" with the day where it changes
 *   rows       one per forecast point, highest first: `{ name, elevation, slope, cells }`,
 *              where `slope` is 0 at the lowest point and 1 at the highest (how far its step of
 *              the hillside reaches) and each cell is `{ type, words, icons, inRange }`
 *   sentences  one per hour: where rain turns to snow, in words
 */
export function hillsideView(body) {
    if (body?.status !== 'ok' || !Array.isArray(body.hours) || body.hours.length === 0
        || !Array.isArray(body.places) || body.places.length === 0) {
        return null;
    }
    const places = body.places.filter((place) => Number.isFinite(place?.elevationFt) && Array.isArray(place.types));
    if (places.length === 0) return null;
    const lines = Array.isArray(body.snowLine) ? body.snowLine : [];
    const lowest = Math.min(...places.map((place) => place.elevationFt));
    const highest = Math.max(...places.map((place) => place.elevationFt));

    const columns = body.hours.map((hour, i) => {
        const ms = Date.parse(hour);
        const newDay = i === 0 || !sameMountainDay(ms, Date.parse(body.hours[i - 1]));
        return newDay ? `${mountainWeekday(ms)} ${mountainClock(ms)}` : mountainClock(ms);
    });
    const rows = places.map((place) => ({
        name: String(place.name ?? ''),
        elevation: feet(place.elevationFt),
        slope: highest > lowest ? (place.elevationFt - lowest) / (highest - lowest) : 0,
        cells: body.hours.map((_, i) => {
            const type = place.types[i];
            const known = Object.hasOwn(TYPE_WORDS, type);
            return {
                type: known ? type : null,
                words: known ? TYPE_WORDS[type] : 'No forecast',
                icons: known ? TYPE_ICONS[type] : [],
                inRange: inSnowLineRange(lines[i], place.elevationFt),
            };
        }),
    }));
    return { columns, rows, sentences: body.hours.map((_, i) => snowLineSentence(lines[i])) };
}

// ── drawing ───────────────────────────────────────────────────────────────────────────────

function element(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
}

/** Draw the hillside from the answer weatherHazards.js already fetched. */
export function drawHillside(body) {
    const wrap = document.getElementById('hillside-wrap');
    const now = document.getElementById('hillside-now');
    const note = document.getElementById('hillside-note');
    if (!wrap || !now || !note) return;

    const view = hillsideView(body);
    if (!view) {
        wrap.hidden = true;
        const emptyLegend = document.getElementById('hillside-legend');
        if (emptyLegend) emptyLegend.hidden = true;
        now.textContent = typeof body?.detail === 'string' ? body.detail : 'The rain and snow forecast is not available right now.';
        note.textContent = '';
        return;
    }

    const table = element('table', 'hillside');
    const caption = element('caption', 'visually-hidden', 'Rain, snow or dry at each forecast point, highest first, hour by hour');
    const head = element('tr');
    const corner = element('th', 'hillside-corner', 'Highest first');
    corner.scope = 'col';
    head.append(corner, ...view.columns.map((label, i) => {
        const th = element('th', '', label);
        th.scope = 'col';
        th.title = view.sentences[i];
        return th;
    }));
    const thead = element('thead');
    thead.append(head);

    const tbody = element('tbody');
    for (const row of view.rows) {
        const tr = element('tr');
        const th = element('th', 'hillside-place');
        th.scope = 'row';
        // The step of the hillside: a bar that reaches further the higher the point is.
        const step = element('span', 'hillside-step');
        step.style.setProperty('--slope', row.slope.toFixed(3));
        step.setAttribute('aria-hidden', 'true');
        th.append(step, element('span', 'hillside-name', row.name), element('span', 'hillside-elevation', row.elevation));
        tr.append(th, ...row.cells.map((cellView) => {
            const td = element('td', 'hillside-cell');
            td.dataset.type = cellView.type ?? 'unknown';
            if (cellView.inRange) td.dataset.range = 'true';
            td.title = `${row.name}, ${row.elevation}: ${cellView.words}`;
            for (const icon of cellView.icons) {
                const glyph = element('i', `fas ${icon}`);
                glyph.setAttribute('aria-hidden', 'true');
                td.append(glyph);
            }
            if (cellView.type === 'dry') td.append(element('span', 'hillside-dry', '–'));
            td.append(element('span', 'visually-hidden', cellView.words));
            return td;
        }));
        tbody.append(tr);
    }
    table.append(caption, thead, tbody);
    wrap.replaceChildren(table);
    wrap.hidden = false;

    // What the symbols mean. Built here, like the cells, because the icons are data.
    const legend = document.getElementById('hillside-legend');
    if (legend) {
        const items = ['snow', 'rain', 'mix', 'dry'].map((type) => {
            const item = element('li', 'hillside-cell');
            item.dataset.type = type;
            for (const icon of TYPE_ICONS[type]) {
                const glyph = element('i', `fas ${icon}`);
                glyph.setAttribute('aria-hidden', 'true');
                item.append(glyph);
            }
            if (type === 'dry') item.append(element('span', 'hillside-dry', '–'));
            item.append(` ${TYPE_WORDS[type]}`);
            return item;
        });
        const range = element('li', 'hillside-legend-range');
        const swatch = element('span', 'hillside-range-swatch');
        swatch.setAttribute('aria-hidden', 'true');
        range.append(swatch, ' Where rain turns to snow');
        legend.replaceChildren(...items, range);
        legend.hidden = false;
    }

    now.textContent = `${view.columns[0]}: ${view.sentences[0]}`;
    note.textContent = `${body.detail} The shaded cells are the heights between which rain turns to snow in that hour; `
        + 'it is known only as a range between two forecast points.';
}
