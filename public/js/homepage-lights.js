// Homepage status lights: Weather now, the forecast tile ("Tonight"), Ozone, Roads now, and
// Precip next 6 h.
//
// This file only draws. The server decides every colour and every word
// (server/statusLights.js) and sends them from /api/status-lights; nothing here has a
// threshold in it. Three rules for the drawing:
//
//  - Grey means "not known". A tile is grey until its data arrives, and goes back to grey if a
//    refresh fails. It never keeps showing a colour it can no longer vouch for.
//  - The words carry the meaning and the colour repeats it, so each line starts with a word a
//    screen reader says aloud ("Warning", "Caution", "Clear", "No data").
//  - Text from the server goes in as text, never as HTML.
//
// The only icons are the precipitation types, which are data: a snowflake, a rain cloud, or
// both for a mix. The three lights are a colour block and words.

const REFRESH_MS = 5 * 60 * 1000;

export const LEVELS = ['red', 'amber', 'green', 'grey'];
export const LEVEL_WORDS = { red: 'Warning', amber: 'Caution', green: 'Clear', grey: 'No data' };

export const PRECIP_WORDS = { snow: 'Snow', rain: 'Rain', mix: 'Mix', dry: 'Dry' };
// Font Awesome names. homepage.test.js allows exactly these on the homepage.
export const PRECIP_ICONS = { snow: ['fa-snowflake'], rain: ['fa-cloud-rain'], mix: ['fa-cloud-rain', 'fa-snowflake'], dry: [] };

const UNAVAILABLE = 'The status could not be loaded just now.';

/** What one light tile shows. Anything unexpected from the server draws as grey. */
export function lightView(light) {
    const level = LEVELS.includes(light?.level) ? light.level : 'grey';
    const line = typeof light?.line === 'string' && light.line.trim() ? light.line : 'Status unavailable';
    const detail = typeof light?.detail === 'string' ? light.detail : '';
    return { level, word: LEVEL_WORDS[level], line, detail };
}

/** The rows of the precipitation tile, top band first; empty when there is no forecast. */
export function precipRows(precip) {
    if (precip?.status !== 'ok' || !Array.isArray(precip.bands)) return [];
    return precip.bands.map((band) => {
        const known = Object.hasOwn(PRECIP_WORDS, band?.type);
        const words = known ? PRECIP_WORDS[band.type] : 'No forecast';
        return {
            label: String(band?.label ?? ''),
            range: String(band?.range ?? ''),
            words: known && band.extent ? `${words} ${band.extent}` : words,
            icons: known ? PRECIP_ICONS[band.type] : [],
            detail: String(band?.detail ?? ''),
        };
    });
}

function setWhy(tile, text) {
    const why = tile.querySelector('.status-light-why');
    if (!why) return;
    why.hidden = !text;
    const paragraph = why.querySelector('p');
    if (paragraph) paragraph.textContent = text;
}

/**
 * The forecast tile is named for the part of the day it covers ("Tonight", "Tomorrow morning").
 * The server works the name out from the clock; until it answers, the tile keeps the plain
 * name the page was sent with.
 */
export function tileLabel(light, fallback) {
    return typeof light?.label === 'string' && light.label.trim() ? light.label.trim() : fallback;
}

function drawLight(tile, light) {
    const view = lightView(light);
    tile.dataset.level = view.level;
    const label = tile.querySelector('.status-light-label[data-default-label]');
    if (label) label.textContent = tileLabel(light, label.dataset.defaultLabel);
    const text = tile.querySelector('.status-light-text');
    if (text) {
        const word = document.createElement('span');
        word.className = 'visually-hidden';
        word.textContent = `${view.word}: `;
        text.replaceChildren(word, view.line);
    }
    setWhy(tile, view.detail);
}

function drawPrecip(tile, precip) {
    const bands = tile.querySelector('.precip-bands');
    if (!bands) return;
    const rows = precipRows(precip);
    if (rows.length === 0) {
        const text = document.createElement('span');
        text.className = 'status-light-text';
        text.textContent = 'Forecast unavailable';
        bands.replaceChildren(text);
        setWhy(tile, typeof precip?.detail === 'string' ? precip.detail : UNAVAILABLE);
        return;
    }
    bands.replaceChildren(...rows.flatMap((row) => {
        const label = document.createElement('span');
        label.className = 'precip-band-label';
        label.textContent = row.label;
        label.title = row.range;
        const value = document.createElement('span');
        value.className = 'precip-band-value';
        for (const icon of row.icons) {
            const glyph = document.createElement('i');
            glyph.className = `fas ${icon}`;
            glyph.setAttribute('aria-hidden', 'true');
            value.append(glyph);
        }
        value.append(row.words);
        return [label, value];
    }));
    const lines = rows.map((row) => `${row.label} (${row.range}): ${row.detail}`);
    setWhy(tile, [precip.detail, ...lines].filter(Boolean).join(' '));
}

function draw(body) {
    const lights = Object.fromEntries((body?.lights || []).map((light) => [light?.key, light]));
    for (const key of ['weather', 'ahead', 'ozone', 'roads']) {
        const tile = document.getElementById(`light-${key}`);
        if (tile) drawLight(tile, lights[key] ?? { level: 'grey', line: 'Status unavailable', detail: UNAVAILABLE });
    }
    const precipTile = document.getElementById('light-precip');
    if (precipTile) drawPrecip(precipTile, body?.precip ?? null);
}

async function loadLights() {
    try {
        const response = await fetch('/api/status-lights', { cache: 'no-store' });
        if (!response.ok) throw new Error(`status ${response.status}`);
        draw(await response.json());
    } catch (error) {
        console.warn('homepage: status lights unavailable', error);
        draw(null);
    }
}

if (typeof document !== 'undefined' && document.getElementById('status-lights')) {
    loadLights();
    setInterval(loadLights, REFRESH_MS);
}
