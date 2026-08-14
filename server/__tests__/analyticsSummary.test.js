/**
 * Regression tests for the daily-summary shape reconciliation.
 *
 * Context: on 2026-08-13 production crash-looped with
 *   TypeError: Cannot read properties of undefined (reading '/')
 *   at updateDailySummary (server/middleware/analytics.js)
 * The live logs/analytics/daily_summary.json had been written by the pre-rewrite build, so it
 * lacked botPaths / referrerSources / hourlyDistribution / sessionsStarted / _sessionPageCounts.
 * The loader returned it as-is whenever the date matched, and the first `summary.botPaths[p]++`
 * dereferenced undefined. Because the call site was fire-and-forget, the throw surfaced as an
 * unhandledRejection, which terminates the process under Node 15+.
 */

import { describe, it, expect } from '@jest/globals';
import { normalizeDailySummary } from '../middleware/analytics.js';

const TODAY = '2026-08-13';

// Exactly what was on disk in production when it crashed.
const PRE_REWRITE_SUMMARY = {
    date: TODAY,
    pageViews: 1234,
    uniqueVisitors: ['a', 'b'],
    pages: { '/': 900 },
    browsers: { chrome: 800 },
    avgResponseTime: 12,
    totalResponseTime: 14808,
    requestCount: 1234,
    uniqueVisitorCount: 2,
};

describe('normalizeDailySummary', () => {
    it('backfills counters missing from an older build without touching existing ones', () => {
        const s = normalizeDailySummary(PRE_REWRITE_SUMMARY, TODAY);

        // The keys whose absence caused the crash.
        expect(s.botPaths).toEqual({});
        expect(s.referrerSources).toEqual({});
        expect(s.hourlyDistribution).toEqual({});
        expect(s.botRequests).toBe(0);
        expect(s._sessionPageCounts).toEqual([]);

        // Pre-existing data must survive — this is a day's real traffic.
        expect(s.pageViews).toBe(1234);
        expect(s.pages).toEqual({ '/': 900 });
        expect(s.uniqueVisitors).toEqual(['a', 'b']);
    });

    it('supports the increments that previously threw', () => {
        const s = normalizeDailySummary(PRE_REWRITE_SUMMARY, TODAY);
        expect(() => {
            s.botPaths['/'] = (s.botPaths['/'] || 0) + 1;
            s.referrerSources['direct'] = (s.referrerSources['direct'] || 0) + 1;
            s.hourlyDistribution['20'] = (s.hourlyDistribution['20'] || 0) + 1;
            new Set(s.uniqueVisitors).add('c');
        }).not.toThrow();
    });

    it('keeps arrays as arrays (typeof [] === "object" trap)', () => {
        // If an array template falls through to the object branch it becomes {}, and every
        // `new Set(summary.uniqueVisitors)` then throws "object is not iterable".
        const s = normalizeDailySummary(PRE_REWRITE_SUMMARY, TODAY);
        expect(Array.isArray(s.uniqueVisitors)).toBe(true);
        expect(Array.isArray(s._sessionPageCounts)).toBe(true);
        expect(() => new Set(s.uniqueVisitors)).not.toThrow();
    });

    it('replaces null or wrong-typed containers with usable ones', () => {
        const corrupt = {
            date: TODAY,
            pages: null,
            browsers: 'not-an-object',
            uniqueVisitors: { 0: 'a' },   // object where an array belongs
            botPaths: [],                 // array where an object belongs
            pageViews: 'many',            // string where a number belongs
        };
        const s = normalizeDailySummary(corrupt, TODAY);

        expect(s.pages).toEqual({});
        expect(s.browsers).toEqual({});
        expect(Array.isArray(s.uniqueVisitors)).toBe(true);
        expect(Array.isArray(s.botPaths)).toBe(false);
        expect(s.botPaths).toEqual({});
        expect(s.pageViews).toBe(0);
    });

    it('returns a fresh summary for junk input', () => {
        for (const junk of [null, undefined, 'string', 42, []]) {
            const s = normalizeDailySummary(junk, TODAY);
            expect(s.date).toBe(TODAY);
            expect(s.pageViews).toBe(0);
            expect(s.botPaths).toEqual({});
        }
    });

    it('stamps the requested date even if the stored one differs', () => {
        const s = normalizeDailySummary({ ...PRE_REWRITE_SUMMARY, date: '2020-01-01' }, TODAY);
        expect(s.date).toBe(TODAY);
    });
});
