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

// Pollutants in the order a popup lists them. Ozone is a whole number, as the monitors report it.
const POLLUTANTS = ['Ozone', 'PM2.5', 'PM10', 'NOx', 'NO', 'NO2'];

// What a popup can show. A station reporting only something else (solar radiation, say)
// is grey, so a blue marker never opens on "No recent observations".
const SHOWN_VARIABLES = [...POLLUTANTS, 'Temperature', 'Wind Speed', 'Snow Depth'];

/**
 * What an air-quality station's marker shows: an EPA band key when it reports ozone,
 * 'weather' when it reports something else the popup shows, 'nodata' otherwise.
 * CSS colours each one (`.aq-status[data-status=…]` in map.css).
 */
export function getMarkerStatus(measurements = {}) {
    if (!SHOWN_VARIABLES.some((name) => hasValue(measurements[name]))) return 'nodata';
    const band = getOzoneBand(measurements.Ozone);
    return band ? band.key : 'weather';
}

/**
 * The marker both maps use: a disc coloured by status, smaller for a station without ozone.
 * Sizes are px because Leaflet anchors the icon by them.
 */
export function createStationIcon(status) {
    const small = !OZONE_BANDS.some((band) => band.key === status);
    const size = small ? 16 : 22;
    return L.divIcon({
        className: 'station-marker-icon',
        html: `<span class="station-marker aq-status" data-status="${status}"></span>`,
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
 * `stale` is true past three hours (MAX_AGE_MINUTES in mapShared.js), when a reading should
 * not pass for current conditions.
 */
export function describeObservedTime(observedAt, now = new Date(), prefix = 'Observed') {
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
        text: `${prefix} ${sameDay ? '' : `${mountainDay.format(when)}, `}${clock} MT · ${age}`,
        stale: minutes > 180
    };
}

const longDay = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' });

// Snow depth older than this came from a once-a-day report, and the popup says so.
const DAILY_AFTER_MINUTES = 180;

/**
 * The popup both maps show for a station: its name and observation time, then pollutants
 * (ozone with its EPA category), then weather, then any station on the same spot. Only
 * readings recent enough to show are passed in (stationReading in mapShared.js); a value in
 * a unit met.js does not know gets no row.
 *
 * @param {object} options
 * @param {object} options.units      the feed's unit name per variable (observations._units)
 * @param {string} options.observedAt time of the newest reading shown
 * @param {object} options.shownAt    time of each reading shown, by variable
 * @param {string} options.lastReportAt the station's newest report of any age
 * @param {string} options.notReportingSince last day Synoptic held data (config.js)
 * @param {Array}  options.companions stations on the same spot: { name, measurements, observedAt, shownAt }
 * @param {boolean} options.imperial  °F, mph and inches (default) or °C, m/s and cm
 * @param {boolean} options.isRoadStation adds a link to the road weather page
 */
export function createStationPopup(stationName, measurements = {}, {
    units = {}, observedAt = null, shownAt = {}, lastReportAt = null, notReportingSince = null,
    companions = [], imperial = true, isRoadStation = false, now = new Date()
} = {}) {
    const group = (rows) => rows.length === 0 ? '' : `
        <dl class="station-popup-group">${rows.map(([label, value]) => `
            <dt>${label}</dt><dd>${value}</dd>`).join('')}
        </dl>`;

    const sections = (values, times) => {
        const pollution = POLLUTANTS
            .filter((name) => hasValue(values[name]))
            .map((name) => pollutantRow(name, values[name], units[name]));
        const weather = weatherRows(values, units, imperial);
        const snowAt = times?.['Snow Depth'];
        const daily = snowAt && hasValue(values['Snow Depth'])
            && (now - new Date(snowAt)) / 60000 > DAILY_AFTER_MINUTES;
        return {
            html: `${group(pollution)}${group(weather)}`,
            any: pollution.length + weather.length > 0,
            daily
        };
    };

    const own = sections(measurements, shownAt);
    let timeHtml = '';
    let body = own.html;
    if (own.any) {
        const time = describeObservedTime(observedAt, now);
        if (time) timeHtml = `<p class="station-popup-time">${time.text}</p>`;
    } else if (notReportingSince && !(lastReportAt && new Date(lastReportAt) > new Date(notReportingSince))) {
        const since = longDay.format(new Date(`${notReportingSince}T00:00:00Z`));
        timeHtml = `<p class="station-popup-time is-stale">Not reporting since ${since}</p>`;
        body = '<p class="station-popup-empty">This monitor has sent no data to Synoptic since then.</p>';
    } else {
        const last = describeObservedTime(lastReportAt, now, 'Last report');
        if (last) timeHtml = `<p class="station-popup-time is-stale">${last.text}</p>`;
        body = '<p class="station-popup-empty">No recent observations from this station.</p>';
    }

    let daily = own.daily;
    const companionHtml = companions.map((companion) => {
        const part = sections(companion.measurements ?? {}, companion.shownAt);
        if (!part.any) return '';
        daily = daily || part.daily;
        const time = describeObservedTime(companion.observedAt, now);
        return `
            <h4 class="station-popup-sub">${escapeHtml(companion.name)}</h4>
            ${time ? `<p class="station-popup-time">${time.text}</p>` : ''}
            ${part.html}`;
    }).join('');
    // A quiet station whose companion reports: say nothing about the quiet one but its name.
    if (!own.any && companionHtml) body = '';

    const dailyNote = daily ? '<p class="station-popup-note">Snow depth is a once-a-day report.</p>' : '';
    const roadLink = isRoadStation
        ? '<a class="station-popup-link" href="/roads">Road weather &rarr;</a>'
        : '';

    return `
        <div class="station-popup-body">
            <h3 class="station-popup-name">${escapeHtml(stationName)}</h3>
            ${timeHtml}
            ${body}
            ${companionHtml}
            ${dailyNote}
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
        { status: 'weather', label: 'Weather only' },
        { status: 'nodata', label: 'No recent data' }
    ];
}

export const LEGEND_NOTE = 'Colours use the EPA’s 8-hour ozone bands, applied to the latest hourly reading.';

/**
 * The legend both maps show: one strip of the six EPA colours with each band's lower edge
 * under it, then the two other kinds of marker. Hovering a band names it; a screen reader
 * hears the whole scale.
 */
export function legendMarkup() {
    const entries = legendEntries();
    const bands = entries.slice(0, OZONE_BANDS.length);
    const others = entries.slice(OZONE_BANDS.length);
    const scaleLabel = `Ozone scale: ${bands.map((b) => b.label).join(', ')}. ${LEGEND_NOTE}`;
    return `
        <div class="aq-legend">
            <p class="aq-legend-title">Ozone (ppb)</p>
            <div class="aq-legend-scale" role="img" aria-label="${escapeHtml(scaleLabel)}" title="${escapeHtml(LEGEND_NOTE)}">
                ${bands.map((b) => `<span class="aq-legend-band aq-status" data-status="${b.status}" title="${escapeHtml(b.label)}"></span>`).join('')}
            </div>
            <div class="aq-legend-ticks" aria-hidden="true">
                ${OZONE_BANDS.map((band) => `<span>${band.min}</span>`).join('')}
            </div>
            <p class="aq-legend-others">
                ${others.map((o) => `<span class="aq-legend-other"><span class="aq-legend-dot aq-status" data-status="${o.status}" aria-hidden="true"></span>${o.label}</span>`).join('')}
            </p>
        </div>`;
}
