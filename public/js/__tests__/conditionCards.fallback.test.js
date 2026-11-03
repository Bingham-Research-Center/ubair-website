import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it, jest } from '@jest/globals';

const source = readFileSync(new URL('../roads/ConditionCards.js', import.meta.url), 'utf8');

function browser() {
    const cards = {};
    const element = () => ({ textContent: '', title: '', removeAttribute(name) { delete this[name]; } });
    for (const type of ['road-conditions', 'visibility', 'precipitation', 'wind']) {
        const value = element();
        const classes = new Set();
        cards[type] = { value, classes, querySelector: () => value,
            classList: { add: name => classes.add(name), remove: (...names) => names.forEach(name => classes.delete(name)) } };
    }
    const freshness = element();
    const sourceLabel = element();
    const data = { stations: [{ name: 'UDOT Test Station', lastUpdated: '2026-09-15T05:00:00Z',
        condition: { condition: 'yellow', status: 'Caution' }, visibility: 5, surfaceStatus: 'wet', windSpeedGust: 20 }], cameraDetections: [] };
    const cache = { getData: jest.fn().mockResolvedValue(data) };
    const fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ current: { windSpeed: 10 } }) });
    const context = vm.createContext({
        roadWeatherDataCache: cache, fetch,
        console: { error: jest.fn(), warn: jest.fn() },
        unitsSystem: { formatVisibility: n => `${n} mi`, formatWindSpeed: n => `${n} mph`, formatWindSpeedFromKmh: n => `${n} km/h` },
        document: {
            getElementById: id => id === 'conditions-updated' ? freshness : id === 'conditions-source' ? sourceLabel : null,
            querySelector(selector) {
                const match = selector.match(/\.condition-card-compact\.([\w-]+)( \.value)?/);
                return match ? (match[2] ? cards[match[1]].value : cards[match[1]]) : null;
            }
        }
    });
    vm.runInContext(source, context);
    const update = vm.runInContext('updateConditionCards', context);
    const select = vm.runInContext('updateConditionCardsWithLocation', context);
    return { cards, freshness, sourceLabel, cache, fetch, data, update, select, updateLocation: select };
}

describe('condition card fallback', () => {
    it('does not use a road condition as precipitation after a location weather fetch fails', () => {
        const { cards, updateLocation } = browser();
        updateLocation({ condition: 'Clear' });
        expect(cards.precipitation.value.textContent).toBe('Not reported');
    });
    it('does not report dry precipitation for an unknown station surface', async () => {
        const { cards, cache, update } = browser();
        cache.getData.mockResolvedValue({ stations: [{ surfaceStatus: 'Unknown' }], cameraDetections: [] });
        await update();
        expect(cards.precipitation.value.textContent).toBe('Not reported');
        expect(cards['road-conditions'].value.textContent).toBe('Not reported');
    });
    it('clears stale station values and timestamps when only backup wind is available', async () => {
        const { cards, freshness, cache, update } = browser();
        await update();
        expect(cards['road-conditions'].value.textContent).toBe('Wet');
        expect(cards.wind.value.title).toContain('Test');
        cache.getData.mockRejectedValue(new Error('offline'));
        await update();
        for (const type of ['road-conditions', 'visibility', 'precipitation']) {
            expect(cards[type].value.textContent).toBe('Not reported');
        }
        expect(cards['road-conditions'].classes.size).toBe(0);
        expect(cards.wind.value.textContent).toBe('10 km/h');
        expect(cards.wind.value.title).toBeUndefined();
        expect(freshness.textContent).toBe('Backup wind data; update time unavailable');
        expect(freshness.title).toBeUndefined();
    });

    it('leaves all cards unavailable when both primary and backup requests fail', async () => {
        const { cards, freshness, cache, fetch, update } = browser();
        await update();
        cache.getData.mockRejectedValue(new Error('offline'));
        fetch.mockResolvedValue({ ok: false });
        await update();
        for (const card of Object.values(cards)) expect(card.value.textContent).toBe('Not reported');
        expect(freshness.textContent).toBe('Data update time unavailable');
    });

    it('removes an old wind tooltip when a later station snapshot has no wind', async () => {
        const { cards, cache, update } = browser();
        await update();
        cache.getData.mockResolvedValue({ stations: [{ name: 'Station', lastUpdated: '2026-09-15T05:10:00Z' }], cameraDetections: [] });
        await update();
        expect(cards.wind.value.textContent).toBe('Not reported');
        expect(cards.wind.value.title).toBeUndefined();
    });
});

describe('condition strip source and surface fields', () => {
    it('summarizes reported surfaces independently of high wind warnings', async () => {
        const { data, cards, sourceLabel, update } = browser();
        data.stations[0].condition = { condition: 'red', status: 'High Winds (45 mph)' };
        data.stations[0].surfaceStatus = 'Dry';
        data.stations[0].windSpeedGust = 45;
        await update();
        expect(cards['road-conditions'].value.textContent).toBe('Dry');
        expect(cards['road-conditions'].classes.has('level-green')).toBe(true);
        expect(cards.wind.value.textContent).toBe('45 mph');
        expect(sourceLabel.textContent).toBe('Basin summary · 1 station');
    });

    it('shows the selected station name and keeps surface, precipitation and wind separate', () => {
        const { cards, sourceLabel, select } = browser();
        select({ name: 'US-40 @ Test Station', sourceType: 'Station', surfaceStatus: 'Wet',
            condition: 'High Winds', windSpeed: 34, lastUpdated: '2026-09-15T05:00:00Z' });
        expect(sourceLabel.textContent).toBe('Station · US-40 @ Test Station');
        expect(cards['road-conditions'].value.textContent).toBe('Wet');
        expect(cards.wind.value.textContent).toBe('34 mph');
        expect(cards.precipitation.value.textContent).toBe('Not reported');
    });

    it('does not use an overall weather status when the surface report is missing', () => {
        const { cards, select } = browser();
        select({ name: 'Road', condition: 'Gusts 34 mph', roadCondition: 'High Winds', windSpeed: 34 });
        expect(cards['road-conditions'].value.textContent).toBe('Not reported');
        expect(cards.wind.value.textContent).toBe('34 mph');
    });

    it('retains a selected camera on a units refresh and returns to the summary on reset', async () => {
        const { cards, sourceLabel, cache, select, update } = browser();
        select({ name: 'SR-45 NB @ Milepost 29, UN', sourceType: 'Camera', snowLevel: 'light', windSpeed: 20, windSpeedUnit: 'km/h' });
        await update();
        expect(cache.getData).not.toHaveBeenCalled();
        expect(sourceLabel.textContent).toBe('Camera · SR-45 NB @ Milepost 29, UN');
        expect(cards['road-conditions'].value.textContent).toBe('Light snow');
        expect(cards.wind.value.textContent).toBe('20 km/h');
        await update({ resetSelection: true });
        expect(sourceLabel.textContent).toBe('Basin summary · 1 station');
        expect(cards['road-conditions'].value.textContent).toBe('Wet');
    });

    it('ignores a late response from a camera that is no longer selected', () => {
        const { cards, sourceLabel, select } = browser();
        const previous = { name: 'Previous camera', sourceType: 'Camera', windSpeed: 10 };
        select(previous);
        select({ name: 'New station', sourceType: 'Station', surfaceStatus: 'Dry', windSpeed: 0 });
        previous.windSpeed = 50;
        select(previous, { refresh: true });
        expect(sourceLabel.textContent).toBe('Station · New station');
        expect(cards.wind.value.textContent).toBe('0 mph');
        expect(cards['road-conditions'].value.textContent).toBe('Dry');
    });
});
