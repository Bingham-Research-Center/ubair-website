import { describe, it, expect } from '@jest/globals';
import {
    clusterDetections,
    categorizeAndConfirm,
    haversineMeters,
    parseDetectionTime,
    ACTIVE_WINDOW_HOURS,
    RECENT_WINDOW_HOURS
} from '../fireClustering.js';

// Helper: build a synthetic FIRMS detection row.
// dateOffsetHours is hours BEFORE the test "now" (positive = older).
const NOW_MS = Date.parse('2026-05-28T18:00:00Z');

function det({ lat, lon, hoursAgo = 0, confidence = 'h', frp = 5, satellite = 'N20' }) {
    const ts = NOW_MS - hoursAgo * 3600 * 1000;
    const d = new Date(ts);
    const acqDate = d.toISOString().slice(0, 10);
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const mm = String(d.getUTCMinutes()).padStart(2, '0');
    return {
        lat,
        lon,
        confidence,
        frp,
        satellite,
        acqDate,
        acqTime: `${hh}${mm}`
    };
}

describe('haversineMeters', () => {
    it('returns ~0 for same point', () => {
        expect(haversineMeters(40, -110, 40, -110)).toBeLessThan(1);
    });

    it('approximates a known short distance (~157km between two basin points)', () => {
        // 1° latitude ≈ 111 km
        const d = haversineMeters(40.0, -110.0, 41.0, -110.0);
        expect(d).toBeGreaterThan(110_000);
        expect(d).toBeLessThan(112_000);
    });
});

describe('parseDetectionTime', () => {
    it('parses acqDate + acqTime correctly as UTC ms', () => {
        const t = parseDetectionTime({ acqDate: '2026-05-28', acqTime: '0841' });
        expect(t).toBe(Date.parse('2026-05-28T08:41:00Z'));
    });

    it('zero-pads short acqTime', () => {
        const t = parseDetectionTime({ acqDate: '2026-05-28', acqTime: '841' });
        expect(t).toBe(Date.parse('2026-05-28T08:41:00Z'));
    });

    it('returns null on missing date', () => {
        expect(parseDetectionTime({ acqTime: '0900' })).toBeNull();
        expect(parseDetectionTime(null)).toBeNull();
    });
});

describe('clusterDetections', () => {
    it('groups two detections within 500m into one cluster', () => {
        const a = det({ lat: 40.1240, lon: -110.3717, hoursAgo: 2 });
        const b = det({ lat: 40.1245, lon: -110.3720, hoursAgo: 1 });
        const clusters = clusterDetections([a, b]);
        expect(clusters).toHaveLength(1);
        expect(clusters[0].detectionCount).toBe(2);
    });

    it('keeps two detections >5km apart in separate clusters', () => {
        const a = det({ lat: 40.10, lon: -110.10, hoursAgo: 2 });
        const b = det({ lat: 40.20, lon: -110.10, hoursAgo: 2 }); // ~11km north
        const clusters = clusterDetections([a, b]);
        expect(clusters).toHaveLength(2);
    });

    it('produces stable ids across reruns (idempotent)', () => {
        const inputs = [
            det({ lat: 40.124, lon: -110.371, hoursAgo: 2 }),
            det({ lat: 40.125, lon: -110.372, hoursAgo: 1 })
        ];
        const first = clusterDetections(inputs);
        const second = clusterDetections(inputs);
        expect(first.map(f => f.id)).toEqual(second.map(f => f.id));
    });

    it('ignores detections with missing lat/lon', () => {
        const clusters = clusterDetections([
            det({ lat: 40.12, lon: -110.37, hoursAgo: 2 }),
            { lat: null, lon: null, acqDate: '2026-05-28', acqTime: '0900' },
            {}
        ]);
        expect(clusters).toHaveLength(1);
        expect(clusters[0].detectionCount).toBe(1);
    });

    it('accumulates max/mean FRP and worst-case confidence', () => {
        const clusters = clusterDetections([
            det({ lat: 40.12, lon: -110.37, hoursAgo: 2, frp: 5, confidence: 'l' }),
            det({ lat: 40.121, lon: -110.371, hoursAgo: 1, frp: 20, confidence: 'h' })
        ]);
        expect(clusters).toHaveLength(1);
        expect(clusters[0].maxFrp).toBe(20);
        expect(clusters[0].meanFrp).toBeCloseTo(12.5, 1);
        expect(clusters[0].maxConfidence).toBe('h');
    });

    it('reports estimatedAreaKm2 ~ detection count × VIIRS pixel area', () => {
        const clusters = clusterDetections([
            det({ lat: 40.12, lon: -110.37, hoursAgo: 2 }),
            det({ lat: 40.121, lon: -110.371, hoursAgo: 1 }),
            det({ lat: 40.1205, lon: -110.3705, hoursAgo: 1 })
        ]);
        expect(clusters[0].estimatedAreaKm2).toBeCloseTo(0.42, 2);
    });

    it('handles empty / non-array input gracefully', () => {
        expect(clusterDetections([])).toEqual([]);
        expect(clusterDetections(null)).toEqual([]);
        expect(clusterDetections(undefined)).toEqual([]);
    });
});

describe('confirmation', () => {
    it('confirms a single high-confidence detection', () => {
        const [c] = clusterDetections([det({ lat: 40.1, lon: -110.1, confidence: 'h' })]);
        expect(c.confirmed).toBe(true);
    });

    it('does not confirm a single low-confidence detection', () => {
        const [c] = clusterDetections([det({ lat: 40.1, lon: -110.1, confidence: 'l' })]);
        expect(c.confirmed).toBe(false);
    });

    it('confirms two low-confidence detections (count threshold)', () => {
        const [c] = clusterDetections([
            det({ lat: 40.1, lon: -110.1, hoursAgo: 2, confidence: 'l' }),
            det({ lat: 40.1005, lon: -110.1005, hoursAgo: 1, confidence: 'l' })
        ]);
        expect(c.confirmed).toBe(true);
        expect(c.detectionCount).toBe(2);
    });
});

describe('categorizeAndConfirm', () => {
    it('puts a 2h-ago confirmed cluster in active', () => {
        const clusters = clusterDetections([det({ lat: 40.1, lon: -110.1, hoursAgo: 2 })]);
        const { active, recent } = categorizeAndConfirm(clusters, NOW_MS);
        expect(active).toHaveLength(1);
        expect(recent).toHaveLength(0);
        expect(active[0].status).toBe('active');
    });

    it('puts a 30h-ago confirmed cluster in recent', () => {
        const clusters = clusterDetections([
            det({ lat: 40.1, lon: -110.1, hoursAgo: 32 }),
            det({ lat: 40.1005, lon: -110.1005, hoursAgo: 30 })
        ]);
        const { active, recent } = categorizeAndConfirm(clusters, NOW_MS);
        expect(active).toHaveLength(0);
        expect(recent).toHaveLength(1);
        expect(recent[0].status).toBe('recent');
    });

    it('drops a cluster older than the recent window', () => {
        const clusters = clusterDetections([
            det({ lat: 40.1, lon: -110.1, hoursAgo: 80, confidence: 'h' })
        ]);
        const { active, recent } = categorizeAndConfirm(clusters, NOW_MS);
        expect(active).toHaveLength(0);
        expect(recent).toHaveLength(0);
    });

    it('drops unconfirmed clusters even when timing is fine', () => {
        const clusters = clusterDetections([
            det({ lat: 40.1, lon: -110.1, hoursAgo: 2, confidence: 'l' })
        ]);
        const { active, recent } = categorizeAndConfirm(clusters, NOW_MS);
        expect(active).toHaveLength(0);
        expect(recent).toHaveLength(0);
    });

    it('sorts active and recent by lastSeenAt descending', () => {
        const clusters = clusterDetections([
            // older active
            det({ lat: 40.20, lon: -110.20, hoursAgo: 10 }),
            // newer active (different cluster)
            det({ lat: 40.10, lon: -110.10, hoursAgo: 2 }),
            // recent
            det({ lat: 40.30, lon: -110.30, hoursAgo: 30 }),
            det({ lat: 40.3005, lon: -110.3005, hoursAgo: 28 })
        ]);
        const { active, recent } = categorizeAndConfirm(clusters, NOW_MS);
        expect(active).toHaveLength(2);
        const aT0 = Date.parse(active[0].lastSeenAt);
        const aT1 = Date.parse(active[1].lastSeenAt);
        expect(aT0).toBeGreaterThan(aT1);
        expect(recent).toHaveLength(1);
    });

    it('boundary: lastSeenAt exactly at ACTIVE_WINDOW_HOURS is still active', () => {
        const clusters = clusterDetections([
            det({ lat: 40.1, lon: -110.1, hoursAgo: ACTIVE_WINDOW_HOURS, confidence: 'h' })
        ]);
        const { active, recent } = categorizeAndConfirm(clusters, NOW_MS);
        expect(active).toHaveLength(1);
        expect(recent).toHaveLength(0);
    });

    it('boundary: just past ACTIVE_WINDOW_HOURS moves to recent', () => {
        const clusters = clusterDetections([
            det({ lat: 40.1, lon: -110.1, hoursAgo: ACTIVE_WINDOW_HOURS + 1, confidence: 'h' })
        ]);
        const { active, recent } = categorizeAndConfirm(clusters, NOW_MS);
        expect(active).toHaveLength(0);
        expect(recent).toHaveLength(1);
    });

    it('boundary: past RECENT_WINDOW_HOURS is dropped', () => {
        const clusters = clusterDetections([
            det({ lat: 40.1, lon: -110.1, hoursAgo: RECENT_WINDOW_HOURS + 1, confidence: 'h' })
        ]);
        const { active, recent } = categorizeAndConfirm(clusters, NOW_MS);
        expect(active).toHaveLength(0);
        expect(recent).toHaveLength(0);
    });

    it('handles empty/non-array input gracefully', () => {
        expect(categorizeAndConfirm([], NOW_MS)).toEqual({ active: [], recent: [] });
        expect(categorizeAndConfirm(null, NOW_MS)).toEqual({ active: [], recent: [] });
    });
});
