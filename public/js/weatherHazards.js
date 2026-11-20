// The hazards pane on /forecast_weather: National Weather Service alerts for the Basin and
// the high ground around it, and rain or snow by elevation for the hours ahead.
//
// Two rules, the same as everywhere on the site. An alerts fetch that failed is "could not be
// checked", never "no alerts": only the NWS can say there are none. And text from the NWS or
// the server goes into the page as text, never as HTML.
//
// The functions above the "drawing" line are pure and tested.

import { mountainClock, mountainTime, mountainWeekday, sameMountainDay } from './mountainTime.js';

export const ALERTS_UNAVAILABLE = 'National Weather Service alerts could not be checked just now. '
    + 'See weather.gov for current alerts.';

const SCOPES = [
    { scope: 'floor', title: 'Basin floor' },
    { scope: 'nearby', title: 'Nearby high ground' },
];

/**
 * What the alerts part shows for one answer from /api/weather-alerts:
 * `{ state: 'alerts' | 'none' | 'unavailable', message, groups }`.
 */
export function alertsView(result, now) {
    if (result?.status !== 'ok' || !Array.isArray(result.alerts)) {
        return { state: 'unavailable', message: ALERTS_UNAVAILABLE, groups: [] };
    }
    const checked = Number.isFinite(Date.parse(result.fetchedAt))
        ? ` Checked ${mountainTime(Date.parse(result.fetchedAt), now)}.` : '';
    if (result.alerts.length === 0) {
        return {
            state: 'none',
            message: `No National Weather Service alerts for the Basin or the high ground around it.${checked}`,
            groups: [],
        };
    }
    const groups = SCOPES.map(({ scope, title }) => ({
        title,
        alerts: result.alerts.filter((alert) => alert?.scope === scope).map((alert) => ({
            event: String(alert.event ?? 'Alert'),
            level: alert.level === 'warning' ? 'warning' : 'other',
            where: String(alert.areaDesc ?? ''),
            until: Number.isFinite(Date.parse(alert.ends)) ? `until ${mountainTime(Date.parse(alert.ends), now)}` : '',
            text: [alert.description, alert.instruction].filter((part) => typeof part === 'string' && part.trim()).join('\n\n'),
        })),
    })).filter((group) => group.alerts.length > 0);
    return { state: 'alerts', message: `From the National Weather Service.${checked}`, groups };
}

export const PRECIP_WORDS = { snow: 'Snow', rain: 'Rain', mix: 'Mix', dry: 'Dry' };
export const PRECIP_ICONS = { snow: ['fa-snowflake'], rain: ['fa-cloud-rain'], mix: ['fa-cloud-rain', 'fa-snowflake'], dry: [] };

/**
 * The hour-by-hour table for one answer from /api/weather-forecast/precip:
 * `{ columns, rows }`, or null when there is no forecast to show.
 */
export function precipTable(body) {
    if (body?.status !== 'ok' || !Array.isArray(body.hours) || !Array.isArray(body.bands) || body.hours.length === 0) {
        return null;
    }
    const columns = body.hours.map((hour, i) => {
        const ms = Date.parse(hour);
        const newDay = i === 0 || !sameMountainDay(ms, Date.parse(body.hours[i - 1]));
        return newDay ? `${mountainWeekday(ms)} ${mountainClock(ms)}` : mountainClock(ms);
    });
    const rows = body.bands.map((band) => ({
        label: String(band?.label ?? ''),
        range: String(band?.range ?? ''),
        cells: body.hours.map((_, i) => {
            const type = band?.types?.[i];
            return Object.hasOwn(PRECIP_WORDS, type)
                ? { words: PRECIP_WORDS[type], icons: PRECIP_ICONS[type], type }
                : { words: 'No forecast', icons: [], type: null };
        }),
    }));
    return { columns, rows };
}

// ── drawing ───────────────────────────────────────────────────────────────────────────────

const REFRESH_MS = 5 * 60 * 1000;

function element(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
}

function drawAlerts(result) {
    const box = document.getElementById('hazard-alerts');
    if (!box) return;
    const view = alertsView(result, Date.now());
    box.dataset.state = view.state;
    const parts = [];
    for (const group of view.groups) {
        parts.push(element('h3', 'hazard-group', group.title));
        const list = element('ul', 'hazard-list');
        for (const alert of group.alerts) {
            const item = element('li', 'hazard-alert');
            item.dataset.level = alert.level;
            const head = element('p', 'hazard-head');
            head.append(element('strong', '', alert.event), ` ${[alert.where, alert.until].filter(Boolean).join(', ')}`);
            item.append(head);
            if (alert.text) {
                const more = element('details', 'hazard-more');
                more.append(element('summary', '', 'What the NWS says'), element('p', 'hazard-text', alert.text));
                item.append(more);
            }
            list.append(item);
        }
        parts.push(list);
    }
    parts.push(element('p', 'hazard-note', view.message));
    box.replaceChildren(...parts);
}

function drawPrecip(body) {
    const wrap = document.getElementById('precip-hours-wrap');
    const note = document.getElementById('precip-hours-note');
    if (!wrap || !note) return;
    const table = precipTable(body);
    if (!table) {
        wrap.hidden = true;
        note.textContent = typeof body?.detail === 'string' ? body.detail : 'The rain and snow forecast is not available right now.';
        return;
    }
    const el = element('table', 'precip-hours');
    const head = element('tr');
    head.append(element('th', '', ''), ...table.columns.map((label) => {
        const th = element('th', '', label);
        th.scope = 'col';
        return th;
    }));
    const thead = element('thead');
    thead.append(head);
    const tbody = element('tbody');
    for (const row of table.rows) {
        const tr = element('tr');
        const th = element('th', 'precip-hours-band', row.label);
        th.scope = 'row';
        th.append(element('span', 'precip-hours-range', row.range));
        tr.append(th, ...row.cells.map((cellView) => {
            const td = element('td', 'precip-hours-cell');
            td.dataset.type = cellView.type ?? 'unknown';
            td.title = cellView.words;
            for (const icon of cellView.icons) {
                const glyph = element('i', `fas ${icon}`);
                glyph.setAttribute('aria-hidden', 'true');
                td.append(glyph);
            }
            // What is seen: the symbols, a dash for dry, or nothing where the model has no
            // type. What is read aloud: always the word.
            if (cellView.type === 'dry') td.append(element('span', 'precip-hours-dry', '–'));
            td.append(element('span', 'visually-hidden', cellView.words));
            return td;
        }));
        tbody.append(tr);
    }
    el.append(thead, tbody);
    wrap.replaceChildren(el);
    wrap.hidden = false;
    note.textContent = body.detail;
}

async function fetchJson(url) {
    const response = await fetch(url, { cache: 'no-store' });
    // Both routes answer 503 with a body that says "unavailable"; read it rather than guess.
    return response.json();
}

async function loadHazards() {
    const [alerts, precip] = await Promise.all([
        fetchJson('/api/weather-alerts').catch(() => null),
        fetchJson('/api/weather-forecast/precip').catch(() => null),
    ]);
    drawAlerts(alerts);
    drawPrecip(precip);
}

if (typeof document !== 'undefined' && document.getElementById('weather-hazards')) {
    loadHazards();
    setInterval(loadHazards, REFRESH_MS);
}
