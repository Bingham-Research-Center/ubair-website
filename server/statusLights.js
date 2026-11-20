/**
 * The homepage status lights: the rules that turn data into a colour and a line of words.
 *
 * Four tiles: Weather now, Ozone, Roads now, and Precip next 6 h. Every colour comes from a
 * rule in this file, never from generated text. Two things hold for every light:
 *
 *  - Grey means "we do not know": a source is missing, stale or failed. A failure never shows
 *    green, because green is a claim that someone checked.
 *  - The words carry the meaning; the colour repeats it. Each light returns a short `line` and
 *    a `detail` sentence saying what it is based on and when that was checked.
 *
 * Thresholds were agreed with JRL on 2026-11-20 (docs/features/HOMEPAGE-STATUS-LIGHTS.md lists them in
 * plain words). Pure functions only: routes/statusLights.js gathers the inputs.
 */

import { currentSeason, describeOutlook } from '../public/js/outlookSeasons.js';
import { toMph } from '../public/js/met.js';
import { mountainTime } from '../public/js/mountainTime.js';
import { ROAD_KINDS, classifyUdotRoad, isMajorBasinPoint, isMajorBasinRoute } from './roadConditionRules.js';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// Mountain time, the way a person says it, is shared with the weather page.
export { mountainTime };

const light = (key, label, href, level, line, detail, asOf = null) => ({ key, label, href, level, line, detail, asOf });

// ── Weather now ───────────────────────────────────────────────────────────────────────────

// A gust this strong at a road weather station, or a sustained wind this strong in our own
// observation feed, turns the light amber on its own. The observation feed carries no gusts
// (2026-11), so both are used.
export const GUST_MPH = 40;
export const SUSTAINED_MPH = 30;
// A reading older than this is not "now". Road stations report every 10 to 30 minutes and
// reach us through a five-minute cache, so they get a little longer.
export const OBS_MAX_AGE_MS = 30 * MINUTE;
export const RWIS_MAX_AGE_MS = 45 * MINUTE;
// No station in the Basin has measured these; a reading above them is a broken sensor.
const MAX_PLAUSIBLE_GUST_MPH = 120;
const MAX_PLAUSIBLE_SUSTAINED_MPH = 100;

// "Floor and foothills": where people live. Higher ground belongs to the roads light.
// The observation feed gives each station's elevation in feet; UDOT's road stations give only
// a position, so they are chosen by a box drawn round the floor and benches.
export const FLOOR_MAX_FT = 7500;
const FLOOR_MIN_FT = 3900; // lower than anywhere in the Basin: a value below it is not feet
export const FLOOR_BOX = Object.freeze({ south: 40.0, north: 40.55, west: -110.85, east: -109.0 });

const fresh = (time, now, maxAge) => {
    const t = Date.parse(time);
    return Number.isFinite(t) && now - t <= maxAge && t - now <= 10 * MINUTE;
};

/** Strongest fresh, plausible sustained wind at a floor station in the observation feed. */
export function strongestObservedWind(rows, meta, now) {
    const floor = new Map();
    for (const station of meta || []) {
        if (station?.elevation >= FLOOR_MIN_FT && station.elevation < FLOOR_MAX_FT) floor.set(station.stid, station);
    }
    let best = null;
    for (const row of rows || []) {
        if (row?.variable !== 'wind_speed' || !floor.has(row.stid)) continue;
        const mph = toMph(row.value, row.units);
        if (mph === null || mph < 0 || mph > MAX_PLAUSIBLE_SUSTAINED_MPH) continue;
        if (!fresh(row.date_time, now, OBS_MAX_AGE_MS)) continue;
        if (!best || mph > best.mph) best = { mph, where: floor.get(row.stid).name || row.stid, time: row.date_time };
    }
    return best;
}

/** Strongest fresh, plausible gust at a UDOT road weather station on the floor. */
export function strongestRoadStationGust(stations, now) {
    let best = null;
    for (const station of stations || []) {
        const { lat, lng } = station || {};
        if (!(lat >= FLOOR_BOX.south && lat <= FLOOR_BOX.north && lng >= FLOOR_BOX.west && lng <= FLOOR_BOX.east)) continue;
        const mph = Number.parseFloat(station.windSpeedGust);
        if (!Number.isFinite(mph) || mph < 0 || mph > MAX_PLAUSIBLE_GUST_MPH) continue;
        if (!fresh(station.lastUpdated, now, RWIS_MAX_AGE_MS)) continue;
        if (!best || mph > best.mph) best = { mph, where: station.name, time: station.lastUpdated };
    }
    return best;
}

const until = (alert, now) => (alert.ends ? ` until ${mountainTime(Date.parse(alert.ends), now)}` : '');

/**
 * Weather now.
 *
 *   red    a National Weather Service warning for the Basin floor
 *   amber  any other NWS alert for the floor (watch, advisory, statement), or a station on the
 *          floor gusting 40 mph or blowing a sustained 30 mph
 *   green  none of those, with the NWS answering and observations under 30 minutes old
 *   grey   the NWS could not be asked, or the observations are old, and nothing above is known
 *
 * @param alerts  what NwsAlertsService.getBasinAlerts() returned
 * @param obs     { rows, meta, fileTimeMs } from the observation feed, or null
 * @param rwis    UDOT road weather stations, or null if that feed is down
 */
export function weatherLight({ alerts, obs, rwis, now }) {
    const make = (level, line, detail) => light('weather', 'Weather now', '/forecast_weather', level, line, detail,
        alerts?.fetchedAt ?? null);

    const alertsOk = alerts?.status === 'ok' && Array.isArray(alerts.alerts);
    const floor = alertsOk ? alerts.alerts.filter((alert) => alert.scope === 'floor') : [];
    const warnings = floor.filter((alert) => alert.level === 'warning');
    const others = floor.filter((alert) => alert.level !== 'warning');

    const gust = strongestRoadStationGust(rwis, now);
    const sustained = obs ? strongestObservedWind(obs.rows, obs.meta, now) : null;
    const windy = [];
    if (gust && gust.mph >= GUST_MPH) windy.push(`gusts of ${Math.round(gust.mph)} mph at ${gust.where}`);
    if (sustained && sustained.mph >= SUSTAINED_MPH) windy.push(`wind of ${Math.round(sustained.mph)} mph at ${sustained.where}`);
    const windAlert = floor.some((alert) => /wind/i.test(alert.event));
    const checked = alertsOk ? `Alerts checked ${mountainTime(Date.parse(alerts.fetchedAt), now)}.` : '';

    const named = [...warnings, ...others];
    if (named.length > 0) {
        const first = named[0];
        const more = named.length > 1 ? `, and ${named.length - 1} more` : '';
        const list = named.slice(0, 3).map((alert) => `${alert.event} for ${alert.areaDesc}${until(alert, now)}`).join('; ');
        const observed = windy.length ? ` Observed: ${windy.join(' and ')}.` : '';
        return make(warnings.length ? 'red' : 'amber', `${first.event}${until(first, now)}${more}`,
            `National Weather Service: ${list}.${observed} ${checked}`.trim());
    }

    if (windy.length > 0) {
        const strongest = gust && gust.mph >= GUST_MPH
            ? `Gusts ${Math.round(gust.mph)} mph at ${gust.where}`
            : `Wind ${Math.round(sustained.mph)} mph at ${sustained.where}`;
        const nws = alertsOk
            ? (windAlert ? '' : 'There is no National Weather Service wind alert for the Basin floor.')
            : 'National Weather Service alerts are unavailable right now.';
        return make('amber', strongest,
            `Observed ${windy.join(' and ')}. ${nws} ${checked}`.replace(/\s+/g, ' ').trim());
    }

    if (!alertsOk) {
        return make('grey', 'Alerts unavailable',
            'National Weather Service alerts could not be checked just now. See weather.gov for current alerts.');
    }
    const obsFresh = obs && Number.isFinite(obs.fileTimeMs) && now - obs.fileTimeMs <= OBS_MAX_AGE_MS;
    if (!obsFresh) {
        return make('grey', 'Observations out of date',
            `No National Weather Service alerts for the Basin floor, but our station observations are more than 30 minutes old. ${checked}`);
    }
    const quiet = rwis
        ? 'No floor station is gusting 40 mph or more.'
        : 'No floor station reports strong wind (road-station gusts are unavailable).';
    return make('green', 'No alerts', `No National Weather Service alerts for the Basin floor. ${quiet} ${checked}`);
}

// ── Ozone ─────────────────────────────────────────────────────────────────────────────────

// An outlook lights this tile for its own Day 1–5 window, then the tile goes grey.
export const OUTLOOK_CURRENT_DAYS = 5;

const RISK_ORDER = ['NO', 'LOW', 'SOME', 'MODERATE', 'HIGH'];
const RISK_LEVEL = { NO: 'green', LOW: 'green', SOME: 'amber', MODERATE: 'amber', HIGH: 'red' };

/**
 * The risk word under an outlook's "Day 1–5" or "Day 6–10" heading, or null.
 *
 * The outlook template puts a line "NO|LOW|SOME|MODERATE|HIGH RISK OF ELEVATED OZONE" under
 * each "### Day a–b (...)" heading. Nothing else in the file is read.
 */
export function outlookRisk(markdown, from, to) {
    const heading = new RegExp(`^[^\\n]*Day\\s*${from}\\s*[–-]\\s*${to}\\b`, 'i');
    const section = String(markdown ?? '').split(/^###\s/m).find((part) => heading.test(part));
    const match = section?.match(/\b(NO|LOW|SOME|MODERATE|MEDIUM|HIGH)\s+RISK\b/i);
    if (!match) return null;
    const word = match[1].toUpperCase();
    return word === 'MEDIUM' ? 'MODERATE' : word;
}

const sentenceCase = (word) => word.charAt(0) + word.slice(1).toLowerCase();

/**
 * Ozone, from the forecasters' own outlook and nothing else: not a model, not generated text.
 *
 *   red    HIGH risk in days 1–5 or 6–10
 *   amber  SOME or MODERATE
 *   green  NO or LOW
 *   grey   no outlook from this season in the last five days, or one with no risk line
 *
 * @param outlook  { filename, markdown } for the newest outlook, or null if there is none
 */
export function ozoneLight({ outlook, now }) {
    const make = (level, line, detail, asOf = null) => light('ozone', 'Ozone', '/forecast_outlooks', level, line, detail, asOf);
    const info = outlook ? describeOutlook(outlook.filename) : null;
    if (!info) {
        return make('grey', 'No current outlook', 'No ozone outlook is available.');
    }
    const issued = info.issued.toISOString();
    const ageDays = (now - info.issued.getTime()) / DAY;
    if (info.season !== currentSeason(new Date(now))) {
        return make('grey', 'No current outlook',
            `The last ozone outlook was issued ${info.date}, in the ${info.season} season.`, issued);
    }
    if (ageDays > OUTLOOK_CURRENT_DAYS) {
        return make('grey', 'No current outlook',
            `The last ozone outlook was issued ${info.date}, ${Math.floor(ageDays)} days ago. `
            + `An outlook lights this tile for ${OUTLOOK_CURRENT_DAYS} days.`, issued);
    }

    const near = outlookRisk(outlook.markdown, 1, 5);
    const far = outlookRisk(outlook.markdown, 6, 10);
    if (!near) {
        return make('grey', 'See the outlook',
            `The outlook issued ${info.date} does not state a risk level for days 1 to 5 in the usual place.`, issued);
    }
    const worst = far && RISK_ORDER.indexOf(far) > RISK_ORDER.indexOf(near) ? far : near;
    const when = worst === near ? '' : ', days 6 to 10';
    const age = ageDays < 1 ? 'today' : `${Math.floor(ageDays)} day${Math.floor(ageDays) === 1 ? '' : 's'} ago`;
    return make(RISK_LEVEL[worst], `${sentenceCase(worst)} risk${when}`,
        `Forecasters' outlook issued ${info.date}, ${info.time} (${age}): days 1 to 5 ${near} risk`
        + `${far ? `, days 6 to 10 ${far} risk` : ''} of elevated ozone.`, issued);
}

// ── Roads now ─────────────────────────────────────────────────────────────────────────────

// Short names for the stretches people know. Anything else keeps UDOT's own name.
const ROAD_NAMES = [
    [/daniels/i, 'US-40 Daniels Canyon'],
    [/indian canyon/i, 'US-191 Indian Canyon'],
    [/us[\s-]?191 vernal to greendale/i, 'US-191 north of Vernal'],
    [/us[\s-]?191 greendale/i, 'US-191 Flaming Gorge'],
    [/us[\s-]?40 through duchesne/i, 'US-40 Duchesne'],
    [/us[\s-]?40 through roosevelt/i, 'US-40 Roosevelt'],
    [/us[\s-]?40 through vernal/i, 'US-40 Vernal to Colorado'],
];

export function shortRoadName(name) {
    const text = String(name ?? '').trim();
    const known = ROAD_NAMES.find(([pattern]) => pattern.test(text));
    return known ? known[1] : text.replace(/\s+through\s+/i, ' ');
}

const capitalise = (text) => text.charAt(0).toUpperCase() + text.slice(1);

// The words for one report: UDOT's own surface word, and its restriction if there is one.
function reportWords(report) {
    const surface = String(report.roadCondition ?? '').trim().toLowerCase();
    const restriction = String(report.restriction ?? '').trim();
    const restricted = restriction && restriction.toLowerCase() !== 'none';
    return { surface, restriction: restricted ? restriction.charAt(0).toLowerCase() + restriction.slice(1) : '' };
}

function headline(report) {
    const { surface, restriction } = reportWords(report);
    if (report.kind === 'closed') return 'Closed';
    if (report.kind === 'restriction') return capitalise(restriction);
    return capitalise(surface || 'reported');
}

/**
 * Roads now, from what UDOT reports on the Basin's major routes (US-40, US-191, SR-87).
 * It reads UDOT's reports only: the roads page also blends in a forecast and camera
 * estimates, and an estimate is not "now".
 *
 *   red    closed, icy, or snow covered
 *   amber  slush, patchy snow, wet, snow falling, or traction devices required
 *   green  every reporting stretch is dry
 *   grey   the UDOT feed is down, or no major route has a report
 *
 * @param roads   { status: 'ok' | 'unavailable', segments, lastUpdated }; a segment is
 *                { name, coordinates, roadCondition, weatherCondition, restriction }
 * @param events  UDOT traffic events, or null when that feed is down
 */
export function roadsLight({ roads, events, now }) {
    const make = (level, line, detail) => light('roads', 'Roads now', '/roads', level, line, detail, roads?.lastUpdated ?? null);
    if (!roads || roads.status !== 'ok' || !Array.isArray(roads.segments)) {
        return make('grey', 'Road reports unavailable',
            'UDOT road reports could not be loaded just now. See udottraffic.utah.gov for current conditions.');
    }

    const reports = roads.segments.filter(isMajorBasinRoute).map((segment) => ({
        ...segment,
        ...classifyUdotRoad(segment.roadCondition, segment.weatherCondition, segment.restriction, { major: true }),
        where: shortRoadName(segment.name),
    }));

    const closures = (events || [])
        .filter((event) => event?.isFullClosure === true && isMajorBasinPoint(event.roadwayName, event.latitude, event.longitude))
        .map((event) => ({
            kind: 'closed', condition: 'red', where: String(event.roadwayName).replace(/^(US|SR)\s+/i, '$1-'),
            roadCondition: '', restriction: '', fromEvent: true,
        }));

    const known = [...closures, ...reports.filter((report) => report.condition !== 'gray')];
    if (known.length === 0) {
        return make('grey', 'No road reports', 'UDOT has no current report for US-40, US-191 or SR-87 in the Basin.');
    }

    const rank = (report) => ROAD_KINDS.indexOf(report.kind);
    const ordered = [...known].sort((a, b) => rank(a) - rank(b));
    const worst = ordered[0];
    const updated = Number.isFinite(Date.parse(roads.lastUpdated))
        ? ` UDOT reports, last changed ${mountainTime(Date.parse(roads.lastUpdated), now)}.` : ' UDOT reports.';

    if (worst.condition === 'green') {
        const reporting = reports.length === known.length
            ? `All ${known.length} reporting stretches of US-40, US-191 and SR-87 are dry.`
            : `${known.length} of ${reports.length} stretches of US-40, US-191 and SR-87 are reporting, all dry.`;
        return make('green', 'Major routes dry', `${reporting}${updated}`);
    }

    const notable = ordered.filter((report) => report.condition !== 'green');
    const sameKind = notable.filter((report) => report.kind === worst.kind).length;
    const more = sameKind > 1 ? `, and ${sameKind - 1} more` : '';
    const list = notable.slice(0, 5).map((report) => {
        if (report.fromEvent) return `${report.where}: closed`;
        const { surface, restriction } = reportWords(report);
        return `${report.where}: ${[surface, restriction].filter(Boolean).join(', ') || 'reported'}`;
    }).join('. ');
    const rest = notable.length > 5 ? ` And ${notable.length - 5} more.` : '';
    return make(worst.condition === 'red' ? 'red' : 'amber', `${headline(worst)}: ${worst.where}${more}`, `${list}.${rest}${updated}`);
}

// ── Precip next 6 h ───────────────────────────────────────────────────────────────────────

export const PRECIP_WINDOW_HOURS = 6;
// A band needs this many forecast hours inside the window, or the file is too old to speak
// for "the next six hours".
const PRECIP_MIN_HOURS = 3;
const FEET_PER_METRE = 3.28084;

// Low, middle and high ground (JRL, 2026-11-20). Listed top down, as the tile shows them.
export const PRECIP_BANDS = Object.freeze([
    Object.freeze({ key: 'passes', label: 'Passes', range: 'above 7,500 ft', minFt: 7500, maxFt: Infinity }),
    Object.freeze({ key: 'benches', label: 'Benches', range: '5,900 to 7,500 ft', minFt: 5900, maxFt: 7500 }),
    Object.freeze({ key: 'floor', label: 'Floor', range: 'below 5,900 ft', minFt: -Infinity, maxFt: 5900 }),
]);

const WET_TYPES = new Set(['snow', 'rain', 'mixed']);

/**
 * One band's answer from its point-hours: 'snow' | 'rain' | 'mix' | 'dry'.
 * Mixed when the model says mixed for a good share of the wet hours, or when both rain and
 * snow each make up a fifth of them; otherwise whichever of the two there is more of.
 */
export function bandType({ snow, rain, mixed }) {
    const wet = snow + rain + mixed;
    if (wet === 0) return 'dry';
    if (mixed / wet >= 0.3 || (snow / wet >= 0.2 && rain / wet >= 0.2)) return 'mix';
    return snow >= rain ? 'snow' : 'rain';
}

/**
 * Snow, rain, a mix or dry for the floor, the benches and the passes over the next six hours,
 * from the HRRR road forecast's precipitation type at its waypoints. A forecast, not an
 * observation, and labelled as one.
 *
 * Only the type is used. The file's `precip_1hr` runs up through the forecast (it is a total
 * since the model run began, whatever its name says), so no amount is shown from it.
 *
 * @param forecast  the parsed road-forecast latest.json, or null
 */
export function precipBands({ forecast, now }) {
    const base = { key: 'precip', label: `Precip next ${PRECIP_WINDOW_HOURS} h`, href: '/forecast_weather' };
    const unavailable = (detail) => ({ ...base, status: 'unavailable', bands: [], detail, asOf: null });
    if (!forecast || !Array.isArray(forecast.points)) {
        return unavailable('The HRRR road forecast is not available right now.');
    }

    // Two routes can share a waypoint (Roosevelt is on both US-40 and the Basin roads list).
    const points = [...new Map(forecast.points
        .filter((point) => Number.isFinite(point?.elevation_m) && Array.isArray(point.forecasts))
        .map((point) => [`${point.lat},${point.lon}`, point])).values()];

    const inWindow = (entry) => {
        const t = Date.parse(entry?.valid_time);
        return Number.isFinite(t) && t > now && t <= now + PRECIP_WINDOW_HOURS * HOUR;
    };
    const hours = new Set(points.flatMap((point) => point.forecasts.filter(inWindow).map((entry) => entry.valid_time)));
    if (hours.size < PRECIP_MIN_HOURS) {
        return unavailable('The newest HRRR road forecast is too old to cover the next six hours.');
    }

    const bands = PRECIP_BANDS.map((band) => {
        const inBand = points.filter((point) => {
            const feet = point.elevation_m * FEET_PER_METRE;
            return feet >= band.minFt && feet < band.maxFt;
        });
        const counts = { snow: 0, rain: 0, mixed: 0 };
        let total = 0;
        const wetHours = new Set();
        for (const point of inBand) {
            for (const entry of point.forecasts.filter(inWindow)) {
                if (typeof entry.precip_type !== 'string') continue;
                total += 1;
                if (WET_TYPES.has(entry.precip_type)) {
                    counts[entry.precip_type] += 1;
                    wetHours.add(entry.valid_time);
                }
            }
        }
        const { key, label, range } = band;
        if (total === 0) return { key, label, range, type: null, extent: null, detail: 'No forecast points at this height.' };

        const type = bandType(counts);
        const wet = counts.snow + counts.rain + counts.mixed;
        // "at times" when under a third of the band's point-hours are wet.
        const extent = type === 'dry' ? null : (wet / total < 1 / 3 ? 'at times' : null);
        const names = inBand.map((point) => point.name).slice(0, 3).join(', ');
        const detail = type === 'dry'
            ? `No precipitation forecast at ${names}.`
            : `Precipitation in ${wetHours.size} of the next ${hours.size} hours at ${names}.`;
        return { key, label, range, type, extent, detail };
    });

    const init = Number.isFinite(Date.parse(forecast.init_time)) ? forecast.init_time : null;
    return {
        ...base,
        status: 'ok',
        bands,
        detail: `HRRR forecast${init ? ` run at ${mountainTime(Date.parse(init), now)}` : ''}: `
            + 'the kind of precipitation the model expects, not a measurement.',
        asOf: init,
    };
}

/**
 * The same forecast hour by hour, for the weather page: one type per band for each of the
 * hours still ahead in the newest run (up to twelve).
 *
 * Returns `{ status: 'ok', hours, bands, detail, asOf }`, where `hours` is the valid times and
 * each band carries `types`, one per hour: 'snow' | 'rain' | 'mix' | 'dry', or null where the
 * model gives no type for that hour.
 */
export function precipByHour({ forecast, now }) {
    const unavailable = (detail) => ({ status: 'unavailable', hours: [], bands: [], detail, asOf: null });
    if (!forecast || !Array.isArray(forecast.points)) {
        return unavailable('The HRRR road forecast is not available right now.');
    }
    const points = [...new Map(forecast.points
        .filter((point) => Number.isFinite(point?.elevation_m) && Array.isArray(point.forecasts))
        .map((point) => [`${point.lat},${point.lon}`, point])).values()];

    const ahead = (entry) => Number.isFinite(Date.parse(entry?.valid_time)) && Date.parse(entry.valid_time) > now;
    const hours = [...new Set(points.flatMap((point) => point.forecasts.filter(ahead).map((entry) => entry.valid_time)))].sort();
    if (hours.length < PRECIP_MIN_HOURS) {
        return unavailable('The newest HRRR road forecast is too old to say anything about the hours ahead.');
    }

    const bands = PRECIP_BANDS.map(({ key, label, range, minFt, maxFt }) => {
        const inBand = points.filter((point) => {
            const feet = point.elevation_m * FEET_PER_METRE;
            return feet >= minFt && feet < maxFt;
        });
        const types = hours.map((hour) => {
            const counts = { snow: 0, rain: 0, mixed: 0 };
            let known = 0;
            for (const point of inBand) {
                const entry = point.forecasts.find((candidate) => candidate?.valid_time === hour);
                if (typeof entry?.precip_type !== 'string') continue;
                known += 1;
                if (WET_TYPES.has(entry.precip_type)) counts[entry.precip_type] += 1;
            }
            return known === 0 ? null : bandType(counts);
        });
        return { key, label, range, places: inBand.map((point) => point.name), types };
    });

    const init = Number.isFinite(Date.parse(forecast.init_time)) ? forecast.init_time : null;
    return {
        status: 'ok',
        hours,
        bands,
        detail: `HRRR forecast${init ? ` run at ${mountainTime(Date.parse(init), now)}` : ''}: `
            + 'the kind of precipitation the model expects at points along the highways, not a measurement.',
        asOf: init,
    };
}
