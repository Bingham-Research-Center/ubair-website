import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it, jest } from '@jest/globals';

function browser(fetch) {
    const context = vm.createContext({
        fetch,
        console: { error: jest.fn(), warn: jest.fn() },
        document: { querySelector: () => null, getElementById: () => null },
        window: { dispatchEvent: jest.fn() },
        CustomEvent: class { constructor(type) { this.type = type; } }
    });
    for (const name of ['DataCache', 'RoadWeatherMap', 'ConditionCards']) {
        const source = readFileSync(new URL(`../roads/${name}.js`, import.meta.url), 'utf8');
        vm.runInContext(source, context);
    }
    return { context, cache: vm.runInContext('roadWeatherDataCache', context) };
}

const payload = { segments: [], stations: [], cameras: [], cameraDetections: [] };
const response = () => ({ ok: true, json: async () => payload });

describe('shared road weather data', () => {
    it('shares one aggregate request between the actual map and card startup paths', async () => {
        const fetch = jest.fn(async url => url.endsWith('/stations')
            ? { ok: true, json: async () => [{ name: 'Station', lastUpdated: new Date().toISOString() }] }
            : response());
        const { context } = browser(fetch);
        const map = {
            clearLayers: jest.fn(), renderRoadSegments: jest.fn(), renderWeatherStations: jest.fn(),
            renderTrafficCameras: jest.fn(), loadStaticRoadData: jest.fn()
        };
        context.map = map;
        await vm.runInContext('Promise.all([RoadWeatherMap.prototype.loadRoadWeatherData.call(map), updateConditionCards()])', context);
        expect(fetch.mock.calls.filter(([url]) => url === '/api/road-weather')).toHaveLength(1);
        expect(map.renderTrafficCameras).toHaveBeenCalledWith(payload.cameras, payload.cameraDetections);
        expect(map.loadStaticRoadData).not.toHaveBeenCalled();
    });

    it('coalesces pending requests and reuses their completed result', async () => {
        let complete;
        const fetch = jest.fn(() => new Promise(resolve => { complete = resolve; }));
        const { cache } = browser(fetch);
        const first = cache.getData();
        const second = cache.getData();
        expect(fetch).toHaveBeenCalledTimes(1);
        complete(response());
        expect(await first).toBe(payload);
        expect(await second).toBe(payload);
        expect(await cache.getData()).toBe(payload);
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('retries after a failed request instead of caching the failure', async () => {
        const fetch = jest.fn().mockResolvedValueOnce({ ok: false, status: 503 }).mockResolvedValueOnce(response());
        const { cache } = browser(fetch);
        await expect(cache.getData()).rejects.toThrow('503');
        await expect(cache.getData()).resolves.toBe(payload);
        expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('refreshes data after its five-minute lifetime', async () => {
        const fetch = jest.fn().mockResolvedValue(response());
        const { cache } = browser(fetch);
        await cache.getData();
        cache.lastUpdated -= 300001;
        await cache.getData();
        expect(fetch).toHaveBeenCalledTimes(2);
    });
});
