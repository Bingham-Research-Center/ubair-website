// Station markers, popups and legend entries for the two air-quality maps: the homepage
// (index_map.js) and Live AQ (map.js). Both maps build them here and nowhere else; until
// v1.6.4 each map had its own popup builder and the two had drifted apart.
//
// Observations arrive as raw SI with the feed's own unit names (Celsius, m/s, Millimeters):
// every conversion goes through met.js, and a value in a unit it does not know is left out
// rather than shown with a guessed label.

import { toCelsius, toFahrenheit, toMetresPerSecond, toMillimetres, toMph } from './met.js';

const TIME_ZONE = 'America/Denver';

// EPA AQI breakpoints for 8-hour ozone, in ppb (decided on #194, 2026-10-20). They are applied
// to the latest hourly reading, so a colour is a guide, not an official AQI. EPA truncates the
// concentration before comparing, hence Math.trunc.
export const OZONE_BANDS = [
    { key: 'good', label: 'Good', min: 0, max: 54 },
    { key: 'moderate', label: 'Moderate', min: 55, max: 70 },
    { key: 'sensitive', label: 'Unhealthy for sensitive groups', min: 71, max: 85 },
    { key: 'unhealthy', label: 'Unhealthy', min: 86, max: 105 },
    { key: 'very-unhealthy', label: 'Very unhealthy', min: 106, max: 200 },
    { key: 'hazardous', label: 'Hazardous', min: 201, max: Infinity }
];

export function getOzoneBand(ppb) {
    if (!Number.isFinite(ppb)) return null;
    const value = Math.trunc(ppb);
    return OZONE_BANDS.find((band) => value <= band.max);
}

const hasValue = (value) => value !== null && value !== undefined && !Number.isNaN(value);

/**
 * What an air-quality station's marker shows: an EPA band key when it reports ozone,
 * 'weather' when it reports something else, 'nodata' when it reports nothing.
 * CSS colours each one (`.aq-status[data-status=…]` in map.css).
 */
export function getMarkerStatus(measurements = {}) {
    if (!Object.values(measurements).some(hasValue)) return 'nodata';
    const band = getOzoneBand(measurements.Ozone);
    return band ? band.key : 'weather';
}

/**
 * Road weather stations (mountain passes) are judged on driving conditions instead.
 * Inputs are the feed's raw SI: °C, m/s and mm of snow.
 */
export function getRoadCautionLevel(measurements = {}) {
    const temp = measurements['Temperature'];
    const wind = measurements['Wind Speed'];
    const snow = measurements['Snow Depth'];

    if (!hasValue(temp)) return 'nodata';
    if (temp < 0 && ((hasValue(wind) && wind > 15) || (hasValue(snow) && snow > 50))) return 'road-hazardous';
    if (temp <= 2 || (hasValue(wind) && wind >= 10) || (hasValue(snow) && snow > 0)) return 'road-caution';
    return 'road-clear';
}

export function isRoadWeatherStation(stationType) {
    return stationType === 'road';
}

/**
 * The marker both maps use: a disc coloured by status, smaller for a station without ozone,
 * a diamond for a road weather station. Sizes are px because Leaflet anchors the icon by them.
 */
export function createStationIcon(status, { road = false } = {}) {
    const small = !road && !OZONE_BANDS.some((band) => band.key === status);
    const size = small ? 16 : 22;
    return L.divIcon({
        className: 'station-marker-icon',
        html: `<span class="station-marker aq-status${road ? ' station-marker--road' : ''}" data-status="${status}"></span>`,
        iconSize: [size, size],
        popupAnchor: [0, -size / 2]
    });
}

// Shared by sports.js, aviation.js and homepage-current.js as well as the popups.
export function getCardinalDirection(degrees) {
    if (degrees === null || degrees === undefined || isNaN(degrees)) return 'N/A';
    const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    const index = Math.round(degrees / 22.5) % 16;
    return directions[index];
}

function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// One decimal below 10, whole numbers above: "4.8 ppb", "22 ppb", "0 in".
function formatNumber(value) {
    if (value === 0) return '0';
    return Math.abs(value) < 10 ? value.toFixed(1) : String(Math.round(value));
}

// Pollutants in the order a popup lists them. Ozone is a whole number, as the monitors report it.
const POLLUTANTS = ['Ozone', 'PM2.5', 'PM10', 'NOx', 'NO', 'NO2'];
const POLLUTANT_UNITS = { 'ppb': 'ppb', 'ppm': 'ppm', 'ug/m3': 'µg/m³', 'µg/m³': 'µg/m³' };

function pollutantRow(name, value, unit) {
    const shown = name === 'Ozone' ? String(Math.round(value)) : formatNumber(value);
    const unitText = unit ? ` ${escapeHtml(POLLUTANT_UNITS[unit] ?? unit)}` : '';
    let category = '';
    if (name === 'Ozone') {
        const band = getOzoneBand(value);
        category = ` <span class="station-popup-category aq-status" data-status="${band.key}">${band.label}</span>`;
    }
    return [name, `${shown}${unitText}${category}`];
}

function weatherRows(measurements, units, imperial) {
    const rows = [];

    const t = measurements['Temperature'];
    if (hasValue(t)) {
        const value = imperial ? toFahrenheit(t, units['Temperature']) : toCelsius(t, units['Temperature']);
        if (value !== null) rows.push(['Temperature', `${Math.round(value)} ${imperial ? '°F' : '°C'}`]);
    }

    const speed = measurements['Wind Speed'];
    const direction = measurements['Wind Direction'];
    const cardinal = hasValue(direction) ? getCardinalDirection(direction) : null;
    if (hasValue(speed)) {
        const value = imperial ? toMph(speed, units['Wind Speed']) : toMetresPerSecond(speed, units['Wind Speed']);
        if (value !== null) {
            const rounded = Math.round(value);
            rows.push(['Wind', rounded === 0 ? 'Calm' : `${cardinal ? `${cardinal} ` : ''}${rounded} ${imperial ? 'mph' : 'm/s'}`]);
        }
    }

    const snow = measurements['Snow Depth'];
    if (hasValue(snow)) {
        const mm = toMillimetres(snow, units['Snow Depth']);
        if (mm !== null) rows.push(['Snow depth', imperial ? `${formatNumber(mm / 25.4)} in` : `${formatNumber(mm / 10)} cm`]);
    }

    return rows;
}

const mountainClock = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, hour: 'numeric', minute: '2-digit' });
const mountainDay = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, day: 'numeric', month: 'short' });

/**
 * "Observed 3:30 am MT · 12 min ago", with the date added when it is not today in Utah.
 * `stale` is true past two hours, when a reading should not pass for current conditions.
 */
export function describeObservedTime(observedAt, now = new Date()) {
    const when = new Date(observedAt);
    if (!observedAt || Number.isNaN(when.getTime())) return null;

    const clock = mountainClock.format(when).replace(/\s?(AM|PM)$/, (m, ap) => ` ${ap.toLowerCase()}`);
    const sameDay = mountainDay.format(when) === mountainDay.format(now);
    const minutes = Math.max(0, Math.round((now - when) / 60000));
    let age;
    if (minutes < 60) age = `${minutes} min ago`;
    else if (minutes < 48 * 60) age = `${Math.round(minutes / 60)} h ago`;
    else age = `${Math.round(minutes / 1440)} days ago`;

    return {
        text: `Observed ${sameDay ? '' : `${mountainDay.format(when)}, `}${clock} MT · ${age}`,
        stale: minutes > 120
    };
}

/**
 * The popup both maps show for a station: its name and observation time, then pollutants
 * (ozone with its EPA category), then weather. A value that is missing, or in a unit met.js
 * does not know, gets no row.
 *
 * @param {object} options
 * @param {object} options.units      the feed's unit name per variable (observations._units)
 * @param {string} options.observedAt ISO time of the station's latest report
 * @param {boolean} options.imperial  °F, mph and inches (default) or °C, m/s and cm
 * @param {boolean} options.isRoadStation adds a link to the road weather page
 */
export function createStationPopup(stationName, measurements = {}, {
    units = {}, observedAt = null, imperial = true, isRoadStation = false, now = new Date()
} = {}) {
    const pollution = POLLUTANTS
        .filter((name) => hasValue(measurements[name]))
        .map((name) => pollutantRow(name, measurements[name], units[name]));
    const weather = weatherRows(measurements, units, imperial);

    const group = (rows) => rows.length === 0 ? '' : `
        <dl class="station-popup-group">${rows.map(([label, value]) => `
            <dt>${label}</dt><dd>${value}</dd>`).join('')}
        </dl>`;

    const time = describeObservedTime(observedAt, now);
    const timeHtml = time
        ? `<p class="station-popup-time${time.stale ? ' is-stale' : ''}">${time.text}</p>`
        : '';
    const body = pollution.length || weather.length
        ? `${group(pollution)}${group(weather)}`
        : '<p class="station-popup-empty">No recent observations from this station.</p>';
    const roadLink = isRoadStation
        ? '<a class="station-popup-link" href="/roads">Road weather &rarr;</a>'
        : '';

    return `
        <div class="station-popup-body">
            <h3 class="station-popup-name">${escapeHtml(stationName)}</h3>
            ${timeHtml}
            ${body}
            ${roadLink}
        </div>`;
}

/** Legend rows, in the order both maps list them. */
export function legendEntries() {
    return [
        ...OZONE_BANDS.map((band) => ({
            status: band.key,
            label: `${band.label} (${Number.isFinite(band.max) ? `${band.min}–${band.max}` : `${band.min}+`} ppb)`
        })),
        { status: 'weather', label: 'Weather only, no ozone' },
        { status: 'nodata', label: 'No recent data' }
    ];
}

export const LEGEND_NOTE = 'Colours use the EPA’s 8-hour ozone bands, applied to the latest hourly reading.';
