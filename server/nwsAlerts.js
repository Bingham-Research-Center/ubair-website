/**
 * Active National Weather Service alerts for the Uinta Basin, or an honest "unavailable".
 *
 * One rule runs through this module: a failed fetch is never an empty list. "No alerts" is a
 * statement about the weather, and only a successful answer from the NWS can make it. Callers
 * get `{ status: 'ok', alerts: [...] }` or `{ status: 'unavailable', alerts: null }`, and a
 * page that cannot tell the two apart is a page that says all-clear during an outage.
 *
 * The homepage status lights, the weather page's hazards strip and the fire page read this.
 */

import fetch from 'node-fetch';
import { NWS_USER_AGENT } from './nwsHelpers.js';

// The Basin, as the NWS divides it. Two forecast offices share the floor: Salt Lake City has
// the west (Roosevelt, Duchesne), Grand Junction the east (Vernal).
//
// "floor" is where people live: the two public zones, their two fire-weather zones, and the
// two counties (short-fused warnings such as flash flood and severe thunderstorm are issued by
// county). "nearby" is the high ground around it: the Uinta Mountains, the Wasatch
// Plateau/Book Cliffs zone that holds Daniels Summit and Indian Canyon, and the Tavaputs.
// Only floor alerts colour the homepage weather light (JRL, 2026-11-20); the passes are the
// roads light's job. Nearby alerts are still returned, labelled, for pages that list them.
//
// A zone code the NWS does not know answers 200 with no alerts, not an error, so a typo here
// reads as quiet weather. nwsAlerts.test.js pins this list.
export const BASIN_ZONES = Object.freeze({
    floor: Object.freeze({
        UTZ024: 'Eastern Uinta Basin',
        UTZ114: 'Western Uinta Basin',
        UTZ486: 'Eastern Uintah Basin (fire weather)',
        UTZ482: 'Western Uintah Basin (fire weather)',
        UTC047: 'Uintah County',
        UTC013: 'Duchesne County',
    }),
    nearby: Object.freeze({
        UTZ023: 'Eastern Uinta Mountains',
        UTZ112: 'Western Uinta Mountains',
        UTZ113: 'Wasatch Plateau/Book Cliffs',
        UTZ025: 'Tavaputs Plateau',
        UTZ485: 'Eastern Ashley National Forest (fire weather)',
        UTZ483: 'Southern Ashley National Forest (fire weather)',
        UTZ484: 'Tavaputs Plateau (fire weather)',
        UTZ487: 'Book Cliffs (fire weather)',
    }),
});

export const BASIN_ZONE_CODES = Object.freeze([
    ...Object.keys(BASIN_ZONES.floor),
    ...Object.keys(BASIN_ZONES.nearby),
]);

export const ALERTS_URL = `https://api.weather.gov/alerts/active?zone=${BASIN_ZONE_CODES.join(',')}`;

const FETCH_TIMEOUT_MS = 10 * 1000;
// A successful answer is reused for this long, so the NWS sees at most one request per window
// however many visitors load the homepage.
export const ALERTS_TTL_MS = 5 * 60 * 1000;
// When the NWS stops answering, the last good answer stands in for this long, marked with its
// own time. After that the state is "unavailable": an alert list half an hour old is still
// news, one from this morning is not.
export const ALERTS_MAX_STALE_MS = 30 * 60 * 1000;
// After a failed fetch, wait this long before asking again. Without it every page view during
// an NWS outage would wait out its own ten-second timeout.
export const ALERTS_RETRY_MS = 60 * 1000;

/**
 * 'warning' | 'watch' | 'advisory' | 'statement', from the event's own name. The NWS names
 * its products by level ("Winter Storm Warning", "Wind Advisory"); anything else, such as a
 * Special Weather Statement or an Air Quality Alert, is a statement.
 */
export function alertLevel(event) {
    const name = String(event ?? '').trim().toLowerCase();
    if (name.endsWith('warning')) return 'warning';
    if (name.endsWith('watch')) return 'watch';
    if (name.endsWith('advisory')) return 'advisory';
    return 'statement';
}

/** 'floor' if any of the alert's zone codes is a floor code, else 'nearby', else null. */
export function alertScope(ugcCodes) {
    const codes = Array.isArray(ugcCodes) ? ugcCodes : [];
    if (codes.some((code) => Object.hasOwn(BASIN_ZONES.floor, code))) return 'floor';
    if (codes.some((code) => Object.hasOwn(BASIN_ZONES.nearby, code))) return 'nearby';
    return null;
}

const isoOrNull = (value) => (Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null);

/**
 * One NWS alert feature as the site uses it, or null if it is not a real, current alert for
 * one of our zones (a test message, a cancellation, or a zone we did not ask about).
 */
export function normaliseAlert(feature, now = Date.now()) {
    const p = feature?.properties;
    if (!p || typeof p.event !== 'string' || p.event.trim() === '') return null;
    if (p.status && p.status !== 'Actual') return null;
    if (p.messageType === 'Cancel') return null;

    const zones = Array.isArray(p.geocode?.UGC) ? p.geocode.UGC.filter((code) => typeof code === 'string') : [];
    const scope = alertScope(zones);
    if (!scope) return null;

    // `ends` is when the event ends; `expires` is only when this message is due to be replaced.
    const ends = isoOrNull(p.ends) ?? isoOrNull(p.expires);
    if (ends && Date.parse(ends) <= now) return null;

    return {
        id: p.id ?? feature.id ?? null,
        event: p.event.trim(),
        level: alertLevel(p.event),
        scope,
        zones,
        areaDesc: p.areaDesc ?? '',
        severity: p.severity ?? null,
        urgency: p.urgency ?? null,
        certainty: p.certainty ?? null,
        onset: isoOrNull(p.onset) ?? isoOrNull(p.effective),
        ends,
        headline: p.headline ?? '',
        description: p.description ?? '',
        instruction: p.instruction ?? '',
        sender: p.senderName ?? '',
    };
}

const LEVEL_ORDER = { warning: 0, watch: 1, advisory: 2, statement: 3 };

/** Floor before nearby, then by level, then the one that ends soonest. */
export function sortAlerts(alerts) {
    return [...alerts].sort((a, b) => (
        (a.scope === 'floor' ? 0 : 1) - (b.scope === 'floor' ? 0 : 1)
        || LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]
        || (Date.parse(a.ends ?? '') || Infinity) - (Date.parse(b.ends ?? '') || Infinity)
    ));
}

/**
 * GET one NWS alerts URL and return its features. Throws on a network error, a timeout, a
 * non-200 answer or a body that is not an alert collection. It never returns [] for a failure.
 */
export async function fetchAlertFeatures(url, { fetchImpl = fetch, timeoutMs = FETCH_TIMEOUT_MS } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetchImpl(url, {
            headers: { 'User-Agent': NWS_USER_AGENT, Accept: 'application/geo+json' },
            signal: controller.signal,
        });
        if (!response.ok) throw new Error(`NWS alerts answered ${response.status}`);
        const body = await response.json();
        if (!Array.isArray(body?.features)) throw new Error('NWS alerts answer has no "features" list');
        return body.features;
    } finally {
        clearTimeout(timer);
    }
}

export class NwsAlertsService {
    constructor({ fetchFeatures = fetchAlertFeatures, now = Date.now, url = ALERTS_URL } = {}) {
        this.fetchFeatures = fetchFeatures;
        this.now = now;
        this.url = url;
        this.lastGood = null; // { fetchedAtMs, alerts }
        this.lastFailure = null; // { atMs, error }
        this.inFlight = null;
    }

    /**
     * `{ status, alerts, fetchedAt, error }`.
     *  - 'ok': `alerts` is the current list (possibly empty: the NWS says there are none).
     *    `fetchedAt` may be up to ALERTS_MAX_STALE_MS old if the NWS has since stopped answering.
     *  - 'unavailable': `alerts` is null. We do not know.
     */
    async getBasinAlerts() {
        const now = this.now();
        if (this.lastGood && now - this.lastGood.fetchedAtMs < ALERTS_TTL_MS) {
            return this.answer(now);
        }
        if (this.lastFailure && now - this.lastFailure.atMs < ALERTS_RETRY_MS) {
            return this.answer(now, this.lastFailure.error);
        }

        // One request at a time: visitors who arrive while it is in flight share its result.
        if (!this.inFlight) {
            this.inFlight = this.fetchFeatures(this.url)
                .then((features) => {
                    const fetchedAtMs = this.now();
                    const alerts = sortAlerts(
                        features.map((feature) => normaliseAlert(feature, fetchedAtMs)).filter(Boolean)
                    );
                    this.lastGood = { fetchedAtMs, alerts };
                    this.lastFailure = null;
                    return null;
                })
                .catch((error) => {
                    this.lastFailure = { atMs: this.now(), error };
                    console.error('NWS alerts fetch failed:', error.message);
                    return error;
                })
                .finally(() => { this.inFlight = null; });
        }
        const error = await this.inFlight;
        return this.answer(this.now(), error);
    }

    answer(now, error = null) {
        if (this.lastGood && now - this.lastGood.fetchedAtMs < ALERTS_MAX_STALE_MS) {
            return {
                status: 'ok',
                // An alert can end between two fetches; drop it rather than show it late.
                alerts: this.lastGood.alerts.filter((alert) => !alert.ends || Date.parse(alert.ends) > now),
                fetchedAt: new Date(this.lastGood.fetchedAtMs).toISOString(),
                error: null,
            };
        }
        return {
            status: 'unavailable',
            alerts: null,
            fetchedAt: this.lastGood ? new Date(this.lastGood.fetchedAtMs).toISOString() : null,
            error: error ? error.message : 'NWS alerts have not been fetched yet',
        };
    }
}

// The app shares one instance, so the homepage, the weather page and the status lights make
// one NWS request between them per TTL.
let shared = null;
export function getNwsAlertsService() {
    if (!shared) shared = new NwsAlertsService();
    return shared;
}

/** Test hook. */
export function _setNwsAlertsServiceForTests(service) {
    shared = service;
}
