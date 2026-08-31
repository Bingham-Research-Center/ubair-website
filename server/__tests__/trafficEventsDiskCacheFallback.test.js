/**
 * Regression tests for the UDOT rate-limit disk-cache fallback.
 *
 * Context: the production error log on 2026-08-31 was dominated by two throws --
 *   TypeError: Cannot read properties of null (reading 'length')
 *     at server/routes/trafficEvents.js:18
 *   TypeError: Cannot read properties of null (reading 'filter')
 *     at TrafficEventsService.getUpcomingEvents (server/trafficEventsService.js:378)
 *
 * Both fetchUDOTAlerts() and fetchUDOTTrafficEvents() guarded their rate-limit branch with
 *   return this.loadFromDiskCache(key, 24h) || [];
 * loadFromDiskCache is `async`, so the `||` was testing a *Promise* -- always truthy -- and the
 * `[]` fallback was unreachable. Whenever a call was rate-limited while the 24h disk cache was
 * cold or expired, the method resolved to null, and every caller that dereferenced .length or
 * .filter threw. /api/traffic-events and /api/alerts returned 500 intermittently.
 *
 * The failure only appears when the memory cache misses AND the 2h disk cache misses AND the
 * call is inside minCallInterval -- which is why it was intermittent rather than constant.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import TrafficEventsService from '../trafficEventsService.js';

const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

// Stub that mimics a cold/expired disk cache: loadFromDiskCache resolves null (see its
// `return null` paths for an expired entry and for a missing file).
const coldDiskCache = async () => null;

// Stub that mimics a miss on the 2h lookup but a hit on the 24h rate-limit fallback, so the
// test actually exercises the rate-limit branch rather than returning early.
const warmOnlyAtTwentyFourHours = (rows) => async (_key, maxAge) =>
    maxAge === TWENTY_FOUR_HOURS ? rows : null;

describe('UDOT rate-limit disk-cache fallback', () => {
    let service;

    beforeEach(() => {
        service = new TrafficEventsService();
        // Force the rate-limit branch: both API keys were called "just now".
        service.lastApiCalls.set('events', Date.now());
        service.lastApiCalls.set('alerts', Date.now());
    });

    it('fetchUDOTTrafficEvents resolves to [] when the disk cache is cold', async () => {
        service.loadFromDiskCache = coldDiskCache;
        await expect(service.fetchUDOTTrafficEvents()).resolves.toEqual([]);
    });

    it('fetchUDOTAlerts resolves to [] when the disk cache is cold', async () => {
        service.loadFromDiskCache = coldDiskCache;
        await expect(service.fetchUDOTAlerts()).resolves.toEqual([]);
    });

    it('hands callers something they can safely dereference', async () => {
        service.loadFromDiskCache = coldDiskCache;
        const events = await service.fetchUDOTTrafficEvents();

        expect(events).not.toBeNull();
        // routes/trafficEvents.js reads .length; getUpcomingEvents reads .filter.
        expect(events.length).toBe(0);
        expect(typeof events.filter).toBe('function');
    });

    it('still returns the cached rows when the 24h disk cache is warm', async () => {
        const stored = [{ id: 1, startDate: '2026-08-31T00:00:00Z' }];
        service.loadFromDiskCache = warmOnlyAtTwentyFourHours(stored);
        await expect(service.fetchUDOTAlerts()).resolves.toEqual(stored);
    });

    it('getUpcomingEvents survives a cold cache instead of throwing on .filter', async () => {
        service.loadFromDiskCache = coldDiskCache;
        await expect(service.getUpcomingEvents()).resolves.toEqual([]);
    });
});
