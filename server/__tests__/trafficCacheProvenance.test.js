import fs from 'node:fs/promises';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import TrafficEventsService from '../trafficEventsService.js';

afterEach(() => jest.restoreAllMocks());

describe('traffic disk cache provenance', () => {
    it('retains original report and snapshot timestamps when restoring old data', async () => {
        const timestamp = Date.now() - 12 * 60000;
        const lastUpdated = '2026-09-29T12:00:00.000Z';
        jest.spyOn(fs, 'readFile').mockResolvedValue(JSON.stringify({ timestamp, data: [{ id: 1, lastUpdated }] }));
        const rows = await new TrafficEventsService().loadFromDiskCache('test', 24 * 60 * 60 * 1000);
        expect(rows).toEqual([{ id: 1, cached: true, lastUpdated, retrievedAt: new Date(timestamp).toISOString() }]);
    });
});
