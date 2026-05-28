/* Pure functions for clustering NASA FIRMS hotspot detections into fire
   entities and categorizing them by status (active / recent).
   No I/O, no network — all inputs come in as plain JS objects.
   Deterministic given the same inputs (suitable for snapshot tests). */

export const CLUSTER_RADIUS_M = 1500;           // detections within this distance merge into one fire
export const VIIRS_PIXEL_BUFFER_M = 500;        // half a VIIRS pixel; padding added to cluster radius
export const VIIRS_PIXEL_AREA_KM2 = 0.14;       // ~ 375m × 375m
export const ACTIVE_WINDOW_HOURS = 12;
export const RECENT_WINDOW_HOURS = 72;

const EARTH_RADIUS_M = 6_371_000;

function toRad(deg) { return (deg * Math.PI) / 180; }

export function haversineMeters(lat1, lon1, lat2, lon2) {
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2
        + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** FIRMS gives `acqDate` "YYYY-MM-DD" and `acqTime` "HHMM" (UTC). Returns ms since epoch, or null. */
export function parseDetectionTime(d) {
    if (!d || !d.acqDate) return null;
    const raw = d.acqTime != null ? String(d.acqTime) : '0000';
    const padded = raw.padStart(4, '0');
    const hh = padded.slice(0, 2);
    const mm = padded.slice(2, 4);
    const ts = Date.parse(`${d.acqDate}T${hh}:${mm}:00Z`);
    return Number.isFinite(ts) ? ts : null;
}

function normalizeConfidence(c) {
    if (c == null) return null;
    const s = String(c).toLowerCase();
    if (s === 'h' || s === 'high') return 'h';
    if (s === 'n' || s === 'nominal') return 'n';
    if (s === 'l' || s === 'low') return 'l';
    return null;
}

const CONFIDENCE_RANK = { l: 0, n: 1, h: 2 };

function compareConfidence(a, b) {
    return (CONFIDENCE_RANK[a] ?? -1) - (CONFIDENCE_RANK[b] ?? -1);
}

/**
 * Cluster detections by spatial proximity using a greedy nearest-cluster
 * pass. Sorted by time first so the result is deterministic for the same
 * input set.
 *
 * @param {Array} detections - raw FIRMS rows
 * @param {Object} [opts]
 * @returns {Array} fires
 */
export function clusterDetections(detections, opts = {}) {
    const clusterRadius = opts.clusterRadiusM ?? CLUSTER_RADIUS_M;
    const pixelBuffer = opts.pixelBufferM ?? VIIRS_PIXEL_BUFFER_M;
    const pixelArea = opts.pixelAreaKm2 ?? VIIRS_PIXEL_AREA_KM2;

    if (!Array.isArray(detections)) return [];

    const valid = detections.filter(d =>
        d && Number.isFinite(d.lat) && Number.isFinite(d.lon)
    );

    // Sort by time (then by lat,lon) so clustering is deterministic.
    const sorted = [...valid].sort((a, b) => {
        const aT = parseDetectionTime(a) ?? 0;
        const bT = parseDetectionTime(b) ?? 0;
        if (aT !== bT) return aT - bT;
        if (a.lat !== b.lat) return a.lat - b.lat;
        return a.lon - b.lon;
    });

    const clusters = [];
    for (const d of sorted) {
        let bestIdx = -1;
        let bestDist = Infinity;
        for (let i = 0; i < clusters.length; i++) {
            const c = clusters[i];
            const dist = haversineMeters(d.lat, d.lon, c.centerLat, c.centerLon);
            if (dist <= clusterRadius && dist < bestDist) {
                bestIdx = i;
                bestDist = dist;
            }
        }
        if (bestIdx >= 0) {
            addToCluster(clusters[bestIdx], d);
        } else {
            clusters.push(newCluster(d));
        }
    }

    return clusters.map(c => finalizeCluster(c, { pixelBuffer, pixelArea }));
}

function newCluster(d) {
    return {
        detections: [d],
        sumLat: d.lat,
        sumLon: d.lon,
        centerLat: d.lat,
        centerLon: d.lon
    };
}

function addToCluster(c, d) {
    c.detections.push(d);
    c.sumLat += d.lat;
    c.sumLon += d.lon;
    const n = c.detections.length;
    c.centerLat = c.sumLat / n;
    c.centerLon = c.sumLon / n;
}

function finalizeCluster(c, { pixelBuffer, pixelArea }) {
    const dets = c.detections;

    let north = -Infinity, south = Infinity, east = -Infinity, west = Infinity;
    let firstSeen = Infinity, lastSeen = -Infinity;
    let maxFrp = null, sumFrp = 0, frpCount = 0;
    let maxConfidence = null;
    let anyNonLow = false;
    const satellites = new Set();
    let maxDistFromCentroid = 0;

    for (const d of dets) {
        north = Math.max(north, d.lat);
        south = Math.min(south, d.lat);
        east = Math.max(east, d.lon);
        west = Math.min(west, d.lon);

        const ts = parseDetectionTime(d);
        if (ts != null) {
            if (ts < firstSeen) firstSeen = ts;
            if (ts > lastSeen) lastSeen = ts;
        }

        if (Number.isFinite(d.frp)) {
            maxFrp = maxFrp == null ? d.frp : Math.max(maxFrp, d.frp);
            sumFrp += d.frp;
            frpCount += 1;
        }

        const conf = normalizeConfidence(d.confidence);
        if (conf) {
            if (conf !== 'l') anyNonLow = true;
            if (maxConfidence == null || compareConfidence(conf, maxConfidence) > 0) {
                maxConfidence = conf;
            }
        }

        if (d.satellite) satellites.add(String(d.satellite));

        const dist = haversineMeters(c.centerLat, c.centerLon, d.lat, d.lon);
        if (dist > maxDistFromCentroid) maxDistFromCentroid = dist;
    }

    const radiusM = Math.round(maxDistFromCentroid + pixelBuffer);
    const id = `${c.centerLat.toFixed(3)}_${c.centerLon.toFixed(3)}`;
    const confirmed = dets.length >= 2 || anyNonLow;

    return {
        id,
        centerLat: round(c.centerLat, 5),
        centerLon: round(c.centerLon, 5),
        radiusM,
        bbox: {
            north: round(north, 5),
            south: round(south, 5),
            east: round(east, 5),
            west: round(west, 5)
        },
        detectionCount: dets.length,
        firstSeenAt: Number.isFinite(firstSeen) ? new Date(firstSeen).toISOString() : null,
        lastSeenAt: Number.isFinite(lastSeen) ? new Date(lastSeen).toISOString() : null,
        maxFrp,
        meanFrp: frpCount > 0 ? round(sumFrp / frpCount, 2) : null,
        maxConfidence,
        satellites: [...satellites].sort(),
        estimatedAreaKm2: round(dets.length * pixelArea, 2),
        confirmed,
        status: null,
        detections: dets
    };
}

function round(n, digits) {
    const m = 10 ** digits;
    return Math.round(n * m) / m;
}

/**
 * Assign status ("active" | "recent") based on lastSeenAt vs nowMs, drop
 * unconfirmed clusters, drop anything older than the recent window.
 *
 * @param {Array} clusters - output of clusterDetections
 * @param {number} nowMs - reference clock (Date.now() in production, fixed in tests)
 * @param {Object} [opts]
 * @returns {{ active: Array, recent: Array }}
 */
export function categorizeAndConfirm(clusters, nowMs, opts = {}) {
    const activeMs = (opts.activeHours ?? ACTIVE_WINDOW_HOURS) * 3600 * 1000;
    const recentMs = (opts.recentHours ?? RECENT_WINDOW_HOURS) * 3600 * 1000;

    const active = [];
    const recent = [];

    if (!Array.isArray(clusters)) return { active, recent };

    for (const c of clusters) {
        if (!c.confirmed) continue;
        if (!c.lastSeenAt) continue;
        const lastMs = Date.parse(c.lastSeenAt);
        if (!Number.isFinite(lastMs)) continue;
        const age = nowMs - lastMs;
        if (age < -60 * 1000) continue; // tolerate a tiny clock skew
        if (age <= activeMs) {
            active.push({ ...c, status: 'active' });
        } else if (age <= recentMs) {
            recent.push({ ...c, status: 'recent' });
        }
        // else: silently dropped — outside our retention window
    }

    const byLastSeenDesc = (a, b) =>
        Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt);
    active.sort(byLastSeenDesc);
    recent.sort(byLastSeenDesc);

    return { active, recent };
}
