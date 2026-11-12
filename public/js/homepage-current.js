// Homepage "Current" tab: the latest observation at Vernal Regional Airport (KVEL).
//
// One named station, so the three numbers are mutually consistent and the reader knows where
// they come from. KVEL is an airport weather station that reports temperature, dew point and
// wind every few minutes. Humidity is derived from temperature and dew point because the feed
// carries no relative humidity (a producer-side gap; see CLAUDE.md). Visibility used to be a
// placeholder here; the feed has none, so it is gone.

import { getLatestFilename } from './api.js';
import { getCardinalDirection } from './mapUtils.js';
import { relativeHumidityFromDewPoint, toCelsius, toFahrenheit, toMph } from './met.js';

export const CURRENT_STATION = { id: 'KVEL', name: 'Vernal Regional Airport' };
const TIME_ZONE = 'America/Denver';
const REFRESH_MS = 10 * 60 * 1000;

/** The rows for one station, keyed by variable: { air_temp: {value, units, date_time}, ... }. */
export function stationRows(rows, stid) {
    const out = {};
    for (const row of rows || []) {
        if (row?.stid === stid && Number.isFinite(row.value)) out[row.variable] = row;
    }
    return out;
}

/** Display-ready conditions for one station, or null if it has no temperature or wind. */
export function currentConditions(rows, stid = CURRENT_STATION.id) {
    const r = stationRows(rows, stid);
    const tempF = toFahrenheit(r.air_temp?.value, r.air_temp?.units);
    const rh = relativeHumidityFromDewPoint(
        toCelsius(r.air_temp?.value, r.air_temp?.units),
        toCelsius(r.dew_point_temperature?.value, r.dew_point_temperature?.units),
    );
    const windMph = toMph(r.wind_speed?.value, r.wind_speed?.units);
    const windDir = Number.isFinite(r.wind_direction?.value) ? r.wind_direction.value : null;
    if (tempF === null && windMph === null) return null;
    const time = r.air_temp?.date_time || r.wind_speed?.date_time || null;
    return { tempF, rh, windMph, windDir, time };
}

export function temperatureLabel(tempF) {
    return Number.isFinite(tempF) ? `${Math.round(tempF)}°F` : '--';
}

export function humidityLabel(rh) {
    return Number.isFinite(rh) ? `${Math.round(rh)}%` : '--';
}

export function windLabel(mph, dirDeg) {
    if (!Number.isFinite(mph)) return '--';
    if (Math.round(mph) === 0) return 'Calm';
    const from = Number.isFinite(dirDeg) ? `${getCardinalDirection(dirDeg)} ` : '';
    return `${from}${Math.round(mph)} mph`;
}

const localTime = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE, hour: 'numeric', minute: '2-digit', hour12: true, timeZoneName: 'short',
});

/** 'At Vernal Regional Airport (KVEL), observed 11:55 PM MST.' plus the age when it is old. */
export function stampLabel(time, nowMs, station = CURRENT_STATION) {
    const where = `At ${station.name} (${station.id})`;
    const t = Date.parse(time);
    if (!Number.isFinite(t)) return `${where}.`;
    const p = Object.fromEntries(localTime.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
    const minutes = Math.round((nowMs - t) / 60000);
    const age = minutes > 90 ? ` (${Math.round(minutes / 60)} h ago)` : '';
    return `${where}, observed ${p.hour}:${p.minute} ${String(p.dayPeriod).toUpperCase()} ${p.timeZoneName}${age}.`;
}

function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

async function loadCurrent() {
    try {
        const name = await getLatestFilename('map_obs_', 'observations');
        const res = await fetch(`/api/static/observations/${name}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`${name}: ${res.status}`);
        const now = currentConditions(await res.json());
        if (!now) throw new Error(`${CURRENT_STATION.id} not in ${name}`);
        setText('current-temp', temperatureLabel(now.tempF));
        setText('current-rh', humidityLabel(now.rh));
        setText('current-wind', windLabel(now.windMph, now.windDir));
        setText('current-stamp', stampLabel(now.time, Date.now()));
    } catch (err) {
        console.warn('homepage: current conditions unavailable', err);
        setText('current-stamp', `The latest ${CURRENT_STATION.id} observation is not available right now.`);
    }
}

if (typeof document !== 'undefined' && document.querySelector('body[data-page-type="index"]')) {
    loadCurrent();
    setInterval(loadCurrent, REFRESH_MS);
}
