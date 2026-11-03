import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it, jest } from '@jest/globals';

function browser() {
    const notice = { textContent: '', dataset: {} };
    const legend = { textContent: '' };
    const lines = [];
    const fetch = jest.fn();
    const context = vm.createContext({
        fetch,
        console: { error: jest.fn() },
        document: { getElementById: id => id === 'road-feed-status' ? notice : id === 'road-legend-source' ? legend : {} },
        window: { dispatchEvent: jest.fn() },
        CustomEvent: class { constructor(type) { this.type = type; } },
        L: { polyline: jest.fn((coordinates, style) => {
            const line = { coordinates, style, bindPopup(html) { this.popup = html; }, on() {},
                addTo(map) { map.layers.add(this); } };
            lines.push(line);
            return line;
        }) }
    });
    for (const name of ['utils', 'DataCache', 'RoadWeatherMap']) {
        vm.runInContext(readFileSync(new URL(`../roads/${name}.js`, import.meta.url), 'utf8'), context);
    }
    const map = vm.runInContext('new RoadWeatherMap("road-map")', context);
    map.map = { layers: new Set(), removeLayer(layer) { this.layers.delete(layer); }, hasLayer(layer) { return this.layers.has(layer); } };
    map.renderWeatherStations = jest.fn();
    map.renderTrafficCameras = jest.fn();
    const cache = vm.runInContext('roadWeatherDataCache', context);
    return { map, notice, legend, lines, fetch, cache };
}

const updated = new Date(Date.now() - 12 * 60000).toISOString();
const road = { id: 'real-udot-road', name: 'Reported US-40 segment', source: 'UDOT', cached: false,
    lastUpdated: updated, coordinates: [[40.3, -110], [40.4, -110]],
    overallCondition: { condition: 'yellow', status: 'Wet Roads' } };
const good = { status: 'available', lastUpdated: updated, segments: [road], stations: [], cameras: [] };
const reply = data => ({ ok: true, json: async () => data });

describe('road map feed fallback', () => {
    it.each(['HTTP failure', 'network failure', 'empty segments', 'backend unavailable'])(
        'draws no placeholder roads or stations on %s and shows the notice', async mode => {
            const { map, fetch, lines, notice, legend } = browser();
            if (mode === 'HTTP failure') fetch.mockResolvedValue({ ok: false, status: 503 });
            else if (mode === 'network failure') fetch.mockRejectedValue(new Error('offline'));
            else fetch.mockResolvedValue(reply(mode === 'backend unavailable'
                ? { ...good, status: 'unavailable' } : { ...good, segments: [] }));
            await map.loadRoadWeatherData();
            expect(lines).toHaveLength(0);
            expect(map.roadLayers.size).toBe(0);
            expect(map.stationMarkers.size).toBe(0);
            expect(notice.dataset.state).toBe('unavailable');
            expect(notice.textContent).toContain('Road conditions feed unavailable');
            expect(legend.textContent).toContain('feed unavailable');
        }
    );

    it.each(['HTTP failure', 'empty segments'])('retains real roads with age and cached source on %s', async mode => {
        const { map, fetch, cache, notice } = browser();
        fetch.mockResolvedValueOnce(reply(good));
        await map.loadRoadWeatherData();
        expect(map.roadLayers.get(road.id).popup).toContain('Real-time UDOT data');
        cache.lastUpdated -= 300001;
        fetch.mockResolvedValueOnce(mode === 'HTTP failure' ? { ok: false, status: 503 } : reply({ ...good, segments: [] }));
        await map.loadRoadWeatherData();
        expect(map.roadLayers.size).toBe(1);
        const retained = map.roadLayers.get(road.id);
        expect(retained.coordinates).toEqual(road.coordinates);
        expect(retained.popup).toContain('Cached UDOT data');
        expect(retained.popup).not.toContain('Real-time');
        expect(notice.textContent).toContain('Road conditions last updated 12 min ago');
        expect(notice.textContent).toContain('feed unavailable');
        cache.lastUpdated -= 300001;
        fetch.mockResolvedValueOnce(reply(good));
        await map.loadRoadWeatherData();
        expect(notice.dataset.state).toBe('available');
        expect(notice.textContent).not.toContain('unavailable');
        expect(map.roadLayers.size).toBe(1);
    });

    it('renders successful stations and cameras while retaining unrelated layers', async () => {
        const { map, fetch } = browser();
        const restArea = {};
        map.restAreaMarkers.set('rest-area', restArea);
        map.map.layers.add(restArea);
        const stations = [{ id: 'real-station' }];
        const cameras = [{ id: 'real-camera' }];
        fetch.mockResolvedValue(reply({ status: 'unavailable', segments: [], stations, cameras, cameraDetections: [] }));
        await map.loadRoadWeatherData();
        expect(map.renderWeatherStations).toHaveBeenCalledWith(stations);
        expect(map.renderTrafficCameras).toHaveBeenCalledWith(cameras, []);
        expect(map.map.hasLayer(restArea)).toBe(true);
    });

    it('labels shared cache reads with age and never guesses UDOT provenance', async () => {
        const { map, fetch } = browser();
        fetch.mockResolvedValue(reply(good));
        await map.loadRoadWeatherData();
        await map.loadRoadWeatherData();
        expect(map.roadLayers.get(road.id).popup).toContain('Cached UDOT data');
        map.roadDataCached = false;
        for (const segment of [
            { ...road, source: undefined, type: undefined },
            { ...road, source: undefined, type: 'monitored' },
            { ...road, source: 'HRRR', type: 'hrrr_estimated' },
            { ...road, source: undefined, type: 'estimated' }
        ]) {
            map.renderRoadSegment(segment);
            expect(map.roadLayers.get(road.id).popup).not.toContain('Real-time UDOT');
            expect(map.roadLayers.get(road.id).popup).toContain('last updated 12 min ago');
        }
        expect(map.getRoadSourceLabel({ type: 'hrrr_estimated' })).toContain('HRRR model estimate; update time unavailable');
    });
});
