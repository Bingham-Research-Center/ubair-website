/** A cold rate-limited feed is unavailable; a usable last-good snapshot stays marked cached. */

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

    it('fetchUDOTTrafficEvents rejects as unavailable when the disk cache is cold', async () => {
        service.loadFromDiskCache = coldDiskCache;
        await expect(service.fetchUDOTTrafficEvents()).rejects.toMatchObject({ statusCode: 503 });
    });

    it('fetchUDOTAlerts rejects as unavailable when the disk cache is cold', async () => {
        service.loadFromDiskCache = coldDiskCache;
        await expect(service.fetchUDOTAlerts()).rejects.toMatchObject({ statusCode: 503 });
    });

    it('still returns the cached rows when the 24h disk cache is warm', async () => {
        const stored = [{ id: 1, regions: ['Uintah County'], startTime: '2026-08-31T00:00:00Z' }];
        service.loadFromDiskCache = warmOnlyAtTwentyFourHours(stored);
        await expect(service.fetchUDOTAlerts()).resolves.toEqual(stored.map(row => ({ ...row, cached: true })));
    });

    it('getUpcomingEvents propagates unavailable instead of throwing on .filter', async () => {
        service.loadFromDiskCache = coldDiskCache;
        await expect(service.getUpcomingEvents()).rejects.toMatchObject({ statusCode: 503 });
    });
});
