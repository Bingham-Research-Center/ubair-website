import fs from 'node:fs/promises';
import { beforeEach, afterEach, describe, expect, it, jest } from '@jest/globals';

const fetch = jest.fn();
const memory = new Map();
jest.unstable_mockModule('node-fetch', () => ({ default: fetch }));
jest.unstable_mockModule('node-cache', () => ({ default: class {
    get(key) { return memory.get(key); }
    set(key, value) { memory.set(key, value); }
} }));
let service;
const now = '2026-11-03T18:00:00.000Z';
const updated = '2026-11-03T15:00:00.000Z';

beforeEach(async () => {
    jest.resetModules();
    memory.clear();
    fetch.mockReset().mockResolvedValue({ ok: false, status: 503 });
    jest.useFakeTimers().setSystemTime(new Date(now));
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const { default: Service } = await import('../trafficEventsService.js');
    service = new Service();
    jest.spyOn(service, 'loadFromDiskCache').mockResolvedValue(null);
    jest.spyOn(service, 'saveToDiskCache').mockResolvedValue(undefined);
});
afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });

describe('traffic feed availability', () => {
    it.each(['fetchUDOTTrafficEvents', 'fetchUDOTAlerts'])('%s shares a successful refresh among concurrent callers', async method => {
        fetch.mockResolvedValue({ ok: true, json: async () => [] });
        expect(await Promise.all([service[method](), service[method](), service[method]()])).toEqual([[], [], []]);
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it.each(['fetchUDOTTrafficEvents', 'fetchUDOTAlerts'])('%s rejects an outage and a rate-limited retry without cache', async method => {
        await expect(service[method]()).rejects.toMatchObject({ statusCode: 503 });
        await expect(service[method]()).rejects.toMatchObject({ statusCode: 503 });
    });

    it.each([
        '/traffic-events', '/traffic-events/active', '/traffic-events/upcoming',
        '/traffic-events/type/:eventType', '/traffic-events/map', '/traffic-events/summary', '/alerts'
    ])('%s exposes unavailable instead of a successful empty feed', async path => {
        const { default: router, setTrafficEventsService } = await import('../routes/trafficEvents.js');
        setTrafficEventsService(service);
        const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
        await router.stack.find(layer => layer.route?.path === path).route.stack[0].handle(
            { query: {}, params: { eventType: 'closures' } }, res);
        expect(res.status).toHaveBeenCalledWith(503);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false, status: 'unavailable' }));
    });

    it.each([['fetchUDOTTrafficEvents', 'events'], ['fetchUDOTAlerts', 'alerts']])(
        '%s distinguishes successful empty reports and cached empty reports', async (method, feed) => {
            fetch.mockResolvedValue({ ok: true, json: async () => [] });
            expect(await service[method]()).toEqual([]);
            expect(service.feedStatus[feed]).toMatchObject({ status: 'available', feedUnavailable: false, lastUpdated: now });
            expect(await service[method]()).toEqual([]);
            expect(service.feedStatus[feed]).toMatchObject({ status: 'cached', feedUnavailable: false, lastUpdated: now });
            expect(fetch).toHaveBeenCalledTimes(1);
        });

    it.each([['fetchUDOTTrafficEvents', 'events'], ['fetchUDOTAlerts', 'alerts']])(
        '%s retains a marked last-good report on an outage', async (method, feed) => {
            const row = { id: 1, message: 'US-40 near Roosevelt closed.', regions: ['Uintah County'], lastUpdated: updated };
            service.loadFromDiskCache.mockImplementation(async (_key, age) => age === 86400000 ? [row] : null);
            expect(await service[method]()).toEqual([{ ...row, cached: true }]);
            expect(service.feedStatus[feed]).toMatchObject({ status: 'cached', feedUnavailable: true, lastUpdated: updated });
        });

    it('retains a three-hour-old empty disk snapshot for the outage fallback', async () => {
        service.loadFromDiskCache.mockRestore();
        jest.spyOn(fs, 'readFile').mockResolvedValue(JSON.stringify({ timestamp: Date.parse(updated), data: [] }));
        const unlink = jest.spyOn(fs, 'unlink').mockResolvedValue(undefined);
        expect(await service.fetchUDOTTrafficEvents()).toEqual([]);
        expect(service.feedStatus.events).toMatchObject({ status: 'cached', feedUnavailable: true, lastUpdated: updated });
        expect(unlink).not.toHaveBeenCalled();
    });
});
