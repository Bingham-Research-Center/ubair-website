import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it, jest } from '@jest/globals';

function browser(miles, stationAvailable = true) {
    const popupHandlers = [];
    const updates = [];
    const camera = { id: 1, name: 'Camera', lat: 40.3, lng: -110 };
    const station = { name: 'RWIS', lat: camera.lat + miles / 3958.8 * 180 / Math.PI, lng: camera.lng,
        surfaceStatus: 'Wet', surfaceTemp: 28 };
    const fetch = jest.fn().mockResolvedValueOnce({ ok: false }).mockResolvedValueOnce(
        stationAvailable ? { ok: true, json: async () => [station] } : { ok: false });
    const context = vm.createContext({ fetch, console: { error() {} }, document: { getElementById: () => ({}) },
        updateConditionCardsWithLocation: data => updates.push({ ...data }),
        L: { divIcon: value => value, marker: () => ({ on: (event, handler) => popupHandlers.push(handler), bindPopup() {} }),
            markerClusterGroup: () => ({ addLayer() {}, addTo() {} }) } });
    for (const file of ['utils', 'RoadWeatherMap']) vm.runInContext(readFileSync(new URL(`../roads/${file}.js`, import.meta.url), 'utf8'), context);
    const map = vm.runInContext('new RoadWeatherMap("road-map")', context);
    map.map = { hasLayer: () => false };
    map.renderTrafficCameras([camera], [{ cameraId: '1', snowLevel: 'unknown', rwisData: {
        stationName: 'RWIS', surfaceStatus: 'Wet', surfaceTemp: 28, distance: Math.round(miles), tooDistant: false
    } }]);
    return { open: popupHandlers[0], updates };
}

describe('camera strip station distance', () => {
    it('never copies a rounded-in station 10.48 miles away', async () => {
        const { open, updates } = browser(10.48);
        await open();
        expect(updates).toHaveLength(2);
        for (const data of updates) {
            expect(data.surfaceStatus).toBeFalsy();
            expect(data.roadTemp).toBeUndefined();
        }
    });
    it('adds pavement and temperature only after the precise lookup accepts a nearby station', async () => {
        const { open, updates } = browser(9.99);
        await open();
        expect(updates[0].surfaceStatus).toBeFalsy();
        expect(updates[1]).toMatchObject({ surfaceStatus: 'Wet', roadTemp: 28 });
    });
    it('leaves pavement unknown if the precise lookup fails', async () => {
        const { open, updates } = browser(10.48, false);
        await open();
        expect(updates.at(-1).surfaceStatus).toBeFalsy();
    });
});
