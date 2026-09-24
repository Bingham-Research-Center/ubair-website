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
    const data = { stations: [{ name: 'UDOT Test Station', lastUpdated: '2026-09-15T05:00:00Z',
        condition: { condition: 'yellow', status: 'Caution' }, visibility: 5, surfaceStatus: 'wet', windSpeedGust: 20 }], cameraDetections: [] };
    const cache = { getData: jest.fn().mockResolvedValue(data) };
    const fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ current: { windSpeed: 10 } }) });
    const context = vm.createContext({
        roadWeatherDataCache: cache, fetch,
        console: { error: jest.fn(), warn: jest.fn() },
        unitsSystem: { formatVisibility: n => `${n} mi`, formatWindSpeed: n => `${n} mph`, formatWindSpeedFromKmh: n => `${n} km/h` },
        document: {
            getElementById: () => freshness,
            querySelector(selector) {
                const match = selector.match(/\.condition-card-compact\.([\w-]+)( \.value)?/);
                return match ? (match[2] ? cards[match[1]].value : cards[match[1]]) : null;
            }
        }
    });
    vm.runInContext(source, context);
    return { cards, freshness, cache, fetch, update: () => vm.runInContext('updateConditionCards()', context) };
}

describe('condition card fallback', () => {
    it('clears stale station values and timestamps when only backup wind is available', async () => {
        const { cards, freshness, cache, update } = browser();
        await update();
        expect(cards['road-conditions'].value.textContent).toBe('Caution');
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
