// What the two air-quality maps know about one station: its name, its place and its own recent
// readings. Everything is keyed by Synoptic station ID (config.js says why).

import { STATIONS, COMPANION_OF, HOME_STATIONS } from './config.js';
import { getMarkerStatus } from './mapUtils.js';

// How old a reading may be and still be shown. Ozone is hourly and usually lands 55 min after
// the hour (95th percentile 85 min, rare outages near 3 h; measured 21 Nov 2026), so three
// hours keeps a marker from flickering grey. Co-op observers report snow depth once a day.
export const MAX_AGE_MINUTES = { default: 180, 'Snow Depth': 30 * 60 };

const ROAD_CODE = /^(US|SR|I)-\d+$/i;

export function cleanMetadataName(name) {
    if (!name) return name;

    return name
        .replace(/\s+COOPB?$/, '')
        .replace(/\s+RADIO$/, '')
        .replace(/^ALTA\s*-\s*/, 'Alta ')
        .replace(/\s*NM\s*-\s*/, ' ')
        .split(/\s+/)
        .map((word) => {
            if (ROAD_CODE.test(word) || word.toUpperCase() === 'MP') return word.toUpperCase();
            if (/^(at|@)$/i.test(word)) return word.toLowerCase();
            const lower = word.toLowerCase();
            return lower.charAt(0).toUpperCase() + lower.slice(1);
        })
        .join(' ');
}

export function mapStationName(stid, metadataName = null) {
    return STATIONS[stid]?.name ?? cleanMetadataName(metadataName) ?? stid;
}

/**
 * One station's readings that are recent enough to show (MAX_AGE_MINUTES), as
 * { variable: value }, with the time of the newest one. `lastReportAt` is the station's
 * newest report of any age, for saying how long it has been quiet.
 */
export function stationReading(observations = {}, stid, now = new Date()) {
    const measurements = {};
    const shownAt = {};
    let observedAt = null;

    for (const [variable, byStation] of Object.entries(observations)) {
        if (variable.startsWith('_')) continue;
        const value = byStation?.[stid];
        if (value === null || value === undefined || Number.isNaN(value)) continue;

        // A reading with no time cannot be vouched for, so it is not shown.
        const at = observations._times?.[stid]?.[variable];
        const when = at ? new Date(at) : null;
        if (!when || Number.isNaN(when.getTime())) continue;
        const ageMinutes = (now - when) / 60000;
        if (ageMinutes > (MAX_AGE_MINUTES[variable] ?? MAX_AGE_MINUTES.default)) continue;

        measurements[variable] = value;
        shownAt[variable] = at;
        if (!observedAt || when > new Date(observedAt)) observedAt = at;
    }

    return { measurements, shownAt, observedAt, lastReportAt: observations._timestamps?.[stid] ?? null };
}

/**
 * Everything a map needs to draw one station: name, place, readings, companions, status.
 * Returns null when the station cannot be placed.
 */
export function describeStation(stid, { observations = {}, metadata = {}, now = new Date() } = {}) {
    const entry = STATIONS[stid] ?? {};
    const meta = metadata[stid] ?? {};
    const lat = Number.isFinite(meta.lat) ? meta.lat : entry.lat;
    const lng = Number.isFinite(meta.lng) ? meta.lng : entry.lng;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

    const reading = stationReading(observations, stid, now);
    const companions = (entry.companions ?? []).map((companion) => ({
        stid: companion,
        name: mapStationName(companion, metadata[companion]?.name),
        ...stationReading(observations, companion, now)
    }));

    // A companion's readings can make a quiet marker blue, never give it an ozone colour.
    const companionHasData = companions.some((c) => Object.keys(c.measurements).length > 0);
    let status = getMarkerStatus(reading.measurements);
    if (status === 'nodata' && companionHasData) status = 'weather';

    return {
        stid,
        name: mapStationName(stid, meta.name),
        lat,
        lng,
        ...reading,
        companions,
        status,
        road: Boolean(entry.road),
        notReportingSince: entry.notReportingSince ?? null
    };
}

/** Station IDs the Live AQ map draws: everything in the feed's metadata, plus the stations
 * known to have stopped reporting, minus companions drawn inside another station's popup. */
export function liveAqStationIds(metadata = {}) {
    const ids = new Set(Object.keys(metadata));
    for (const [stid, entry] of Object.entries(STATIONS)) {
        if (entry.notReportingSince) ids.add(stid);
    }
    return [...ids].filter((stid) => !(COMPANION_OF[stid] && ids.has(COMPANION_OF[stid])));
}

/** Station IDs the homepage map draws, in auto-cycle order: the Basin floor stations
 * (HOME_STATIONS) the feed carries, plus those known to have stopped reporting. A listed
 * station the feed has never carried (Fruitland, for now) is left off rather than drawn grey. */
export function homeStationIds(observations = {}, metadata = {}) {
    const inFeed = new Set([...Object.keys(metadata), ...Object.keys(observations._timestamps ?? {})]);
    return HOME_STATIONS.filter((stid) => inFeed.has(stid) || STATIONS[stid].notReportingSince);
}

/** Leaflet's zIndexOffset: ozone above weather above grey, so a quiet station never hides one
 * that is reporting (the Vernal airport and co-op stand 2 km apart). */
export function markerLayer(status) {
    if (status === 'nodata') return 0;
    if (status === 'weather') return 100;
    return 300;
}
