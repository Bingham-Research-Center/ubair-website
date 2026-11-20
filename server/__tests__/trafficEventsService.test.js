import { jest } from '@jest/globals';
import TrafficEventsService from '../trafficEventsService.js';

describe('TrafficEventsService rate-limit fallbacks', () => {
    let consoleSpy;

    beforeEach(() => {
        consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
        consoleSpy.mockRestore();
        jest.restoreAllMocks();
    });

    test('traffic events reject as unavailable when no stale cache exists', async () => {
        const service = new TrafficEventsService();
        service.lastApiCalls.set('events', Date.now());
        jest.spyOn(service, 'loadFromDiskCache').mockResolvedValue(null);

        await expect(service.fetchUDOTTrafficEvents()).rejects.toMatchObject({ statusCode: 503 });
    });

    test('traffic events use an available stale cache while rate limited', async () => {
        const service = new TrafficEventsService();
        const staleEvents = [{ id: 'cached-event' }];
        service.lastApiCalls.set('events', Date.now());
        jest.spyOn(service, 'loadFromDiskCache')
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce(staleEvents);

        await expect(service.fetchUDOTTrafficEvents()).resolves.toEqual(staleEvents.map(row => ({ ...row, cached: true })));
    });

    test('traffic alerts reject as unavailable when no stale cache exists', async () => {
        const service = new TrafficEventsService();
        service.lastApiCalls.set('alerts', Date.now());
        jest.spyOn(service, 'loadFromDiskCache').mockResolvedValue(null);

        await expect(service.fetchUDOTAlerts()).rejects.toMatchObject({ statusCode: 503 });
    });

    test('traffic alerts use an available stale cache while rate limited', async () => {
        const service = new TrafficEventsService();
        const staleAlerts = [{ id: 'cached-alert' }];
        service.lastApiCalls.set('alerts', Date.now());
        jest.spyOn(service, 'loadFromDiskCache')
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce(staleAlerts);

        await expect(service.fetchUDOTAlerts()).resolves.toEqual(staleAlerts.map(row => ({ ...row, cached: true })));
    });
});
