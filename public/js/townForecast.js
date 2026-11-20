// Town forecasts on /forecast_weather: hour by hour for 14 towns and passes along US-40, from
// the HRRR waypoints run that reaches both boxes every hour. The same run is handed to two
// drawings: the forecast-and-measured chart above the table (townChart.js) and the Basin in
// profile below it (basinProfile.js).
//
// The run arrives in SI units and is converted here, at display, with met.js, from the units
// the file itself states. A unit met.js does not know gives "--", never a wrong number. It is
// a model forecast for a point near each town, and the page says so.
//
// The functions above the "drawing" line are pure and tested; the rest touches the page.

import { showProfile } from './basinProfile.js';
import { getCardinalDirection } from './mapUtils.js';
import { toFahrenheit, toMillimetres, toMph } from './met.js';
import { modelRunLabel, mountainClock, mountainTime, mountainWeekday, sameMountainDay } from './mountainTime.js';
import { showTownChart } from './townChart.js';

export const DEFAULT_TOWN = 'vernal';
const FEET_PER_METRE = 3.28084;
const MM_PER_INCH = 25.4;
const HOUR = 60 * 60 * 1000;
// An hour that began up to this long ago is still "now" on the table.
const CURRENT_HOUR_SLACK_MS = 30 * 60 * 1000;

/** The places in the run, west to east as the file lists them: [{ id, name, elevationFt }]. */
export function townList(forecast) {
    return (Array.isArray(forecast?.stations) ? forecast.stations : [])
        .filter((station) => typeof station?.id === 'string' && typeof station?.name === 'string')
        .map((station) => ({
            id: station.id,
            name: station.name,
            elevationFt: Number.isFinite(station.elevation_m) ? Math.round((station.elevation_m * FEET_PER_METRE) / 10) * 10 : null,
        }));
}

const unitOf = (forecast, variable) => forecast?.variables?.[variable]?.units;
const finite = (value) => (Number.isFinite(value) ? value : null);

/**
 * One row per forecast hour from now on for one place, in display units:
 * `{ time, tempF, windMph, windFrom, rh, precipIn }`. Any value the file does not carry, or
 * states in a unit we do not know, is null.
 */
export function townHours(forecast, townId, now) {
    const station = (forecast?.stations || []).find((candidate) => candidate?.id === townId);
    const times = Array.isArray(forecast?.valid_times) ? forecast.valid_times : [];
    if (!station?.forecasts) return [];

    const series = (variable) => (Array.isArray(station.forecasts[variable]) ? station.forecasts[variable] : []);
    const temp = series('temp_2m_c');
    const wind = series('wind_speed_10m_ms');
    const direction = series('wind_dir_10m_deg');
    const humidity = series('rh_2m_pct');
    const precip = series('rainfall_1h_mm');

    const rows = [];
    times.forEach((time, i) => {
        const ms = Date.parse(time);
        if (!Number.isFinite(ms) || ms < now - CURRENT_HOUR_SLACK_MS) return;
        const mm = toMillimetres(precip[i], unitOf(forecast, 'rainfall_1h_mm'));
        rows.push({
            time,
            tempF: toFahrenheit(temp[i], unitOf(forecast, 'temp_2m_c')),
            windMph: toMph(wind[i], unitOf(forecast, 'wind_speed_10m_ms')),
            windFrom: Number.isFinite(direction[i]) ? getCardinalDirection(direction[i]) : null,
            rh: unitOf(forecast, 'rh_2m_pct') === 'percent' ? finite(humidity[i]) : null,
            precipIn: mm === null ? null : mm / MM_PER_INCH,
        });
    });
    return rows;
}

/** Lowest and highest temperature, strongest wind, and how many hours have precipitation. */
export function townSummary(rows) {
    const withTemp = rows.filter((row) => row.tempF !== null);
    if (withTemp.length === 0) return null;
    const low = withTemp.reduce((a, b) => (b.tempF < a.tempF ? b : a));
    const high = withTemp.reduce((a, b) => (b.tempF > a.tempF ? b : a));
    const winds = rows.map((row) => row.windMph).filter((mph) => mph !== null);
    return {
        hours: rows.length,
        lowF: Math.round(low.tempF),
        lowAt: low.time,
        highF: Math.round(high.tempF),
        highAt: high.time,
        maxWindMph: winds.length ? Math.round(Math.max(...winds)) : null,
        // A hundredth of an inch in the hour is the least anyone would call precipitation.
        wetHours: rows.filter((row) => row.precipIn !== null && row.precipIn >= 0.01).length,
    };
}

/** "Vernal, next 15 hours: low 28°F around 6 AM, high 39°F around 2 PM. ..." */
export function summarySentence(name, summary, now) {
    if (!summary) return `${name}: the forecast has no temperatures for the hours ahead.`;
    const around = (time) => mountainTime(Date.parse(time), now);
    const range = summary.lowF === summary.highF
        ? `steady near ${summary.lowF}°F`
        : `low ${summary.lowF}°F around ${around(summary.lowAt)}, high ${summary.highF}°F around ${around(summary.highAt)}`;
    const wind = summary.maxWindMph === null ? '' : ` Wind up to ${summary.maxWindMph} mph.`;
    const wet = summary.wetHours === 0
        ? ' No precipitation in the model.'
        : ` Precipitation in ${summary.wetHours} of the ${summary.hours} hours.`;
    return `${name}, next ${summary.hours} hours: ${range}.${wind}${wet}`;
}

export const tempLabel = (tempF) => (tempF === null ? '--' : `${Math.round(tempF)}°F`);
export const humidityLabel = (rh) => (rh === null ? '--' : `${Math.round(rh)}%`);

export function windLabel(mph, from) {
    if (mph === null) return '--';
    if (Math.round(mph) === 0) return 'Calm';
    return `${from ? `${from} ` : ''}${Math.round(mph)} mph`;
}

/** Liquid equivalent in inches: "0.05 in", "0" for less than a hundredth, "--" if unknown. */
export function precipLabel(inches) {
    if (inches === null) return '--';
    return inches < 0.005 ? '0' : `${inches.toFixed(2)} in`;
}

/** "11 PM", with the day on the first row and wherever the day changes: "Fri 12 AM". */
export function hourLabels(rows) {
    return rows.map((row, i) => {
        const ms = Date.parse(row.time);
        const newDay = i === 0 || !sameMountainDay(ms, Date.parse(rows[i - 1].time));
        return newDay ? `${mountainWeekday(ms)} ${mountainClock(ms)}` : mountainClock(ms);
    });
}

/** "HRRR model run from Thu 7 PM (02Z), 3 hours old." */
export function runLine(forecast, now) {
    const init = Date.parse(forecast?.init_time);
    if (!Number.isFinite(init)) return 'HRRR model forecast.';
    const age = Math.max(0, Math.round((now - init) / HOUR));
    return `HRRR model run from ${modelRunLabel(init)}, ${age} hour${age === 1 ? '' : 's'} old. `
        + 'A forecast for a point near each place, not a measurement. Precipitation is liquid equivalent.';
}

// ── drawing ───────────────────────────────────────────────────────────────────────────────

const REFRESH_MS = 10 * 60 * 1000;
let latest = null;
// What the towns' paired stations have measured since the run began, for the chart. Null
// until it arrives, and again if it cannot be had: the chart then draws the forecast alone.
let observed = null;

function drawChart(townId) {
    const town = latest ? townList(latest).find((candidate) => candidate.id === townId) : null;
    showTownChart(town ? latest : null, town?.id ?? null, town?.name ?? '', observed);
}

function cell(tag, text) {
    const el = document.createElement(tag);
    el.textContent = text;
    return el;
}

function drawTown(townId) {
    drawChart(townId);
    const summaryEl = document.getElementById('town-summary');
    const table = document.getElementById('town-table');
    const body = table?.querySelector('tbody');
    const source = document.getElementById('town-source');
    if (!latest || !summaryEl || !table || !body) return;

    const now = Date.now();
    const town = townList(latest).find((candidate) => candidate.id === townId);
    const rows = town ? townHours(latest, town.id, now) : [];
    if (!town || rows.length === 0) {
        table.hidden = true;
        summaryEl.textContent = 'The newest town forecast has no hours ahead of now. It will return with the next model run.';
        if (source) source.textContent = runLine(latest, now);
        return;
    }

    summaryEl.textContent = summarySentence(town.name, townSummary(rows), now);
    const labels = hourLabels(rows);
    body.replaceChildren(...rows.map((row, i) => {
        const tr = document.createElement('tr');
        tr.append(
            cell('th', labels[i]),
            cell('td', tempLabel(row.tempF)),
            cell('td', windLabel(row.windMph, row.windFrom)),
            cell('td', humidityLabel(row.rh)),
            cell('td', precipLabel(row.precipIn)),
        );
        tr.firstChild.scope = 'row';
        return tr;
    }));
    table.hidden = false;
    if (source) source.textContent = runLine(latest, now);
}

function drawPicker() {
    const select = document.getElementById('town-select');
    if (!select || !latest) return;
    const towns = townList(latest);
    const chosen = towns.some((town) => town.id === select.value) ? select.value
        : (towns.some((town) => town.id === DEFAULT_TOWN) ? DEFAULT_TOWN : towns[0]?.id);
    select.replaceChildren(...towns.map((town) => {
        const option = document.createElement('option');
        option.value = town.id;
        option.textContent = town.elevationFt === null ? town.name : `${town.name} (${town.elevationFt.toLocaleString('en-US')} ft)`;
        return option;
    }));
    if (chosen) select.value = chosen;
    select.disabled = towns.length === 0;
    drawTown(select.value);
}

function drawUnavailable(message) {
    showTownChart(null, null, '', null);
    const summaryEl = document.getElementById('town-summary');
    const table = document.getElementById('town-table');
    const select = document.getElementById('town-select');
    if (summaryEl) summaryEl.textContent = message;
    if (table) table.hidden = true;
    if (select) select.disabled = true;
}

async function loadTowns() {
    try {
        const response = await fetch('/api/weather-forecast/towns', { cache: 'no-store' });
        if (!response.ok) throw new Error(`status ${response.status}`);
        const body = await response.json();
        if (!body?.forecast) throw new Error('no forecast in the answer');
        latest = body.forecast;
        drawPicker();
        showProfile(latest);
        loadObserved();
    } catch (error) {
        console.warn('weather page: town forecast unavailable', error);
        latest = null;
        drawUnavailable('The town forecast is not available right now.');
        showProfile(null);
    }
}

// The readings are a second, smaller question, asked after the forecast is on the page: the
// table and the line never wait for them, and a failure leaves the line without dots.
async function loadObserved() {
    try {
        const response = await fetch('/api/weather-forecast/observed', { cache: 'no-store' });
        observed = await response.json();
    } catch (error) {
        console.warn('weather page: station readings unavailable', error);
        observed = null;
    }
    const select = document.getElementById('town-select');
    if (select?.value) drawChart(select.value);
}

if (typeof document !== 'undefined' && document.getElementById('town-forecast')) {
    document.getElementById('town-select')?.addEventListener('change', (event) => drawTown(event.target.value));
    loadTowns();
    setInterval(loadTowns, REFRESH_MS);
}
