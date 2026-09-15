import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it, jest } from '@jest/globals';

const source = readFileSync(new URL('../map-state-manager.js', import.meta.url), 'utf8');

function browser({ blocked = false, search = '', center = { lat: 40.3, lng: -109.7 } } = {}) {
    const values = new Map([
        ['ubair_map_state', JSON.stringify({ center, zoom: 10, timestamp: Date.now() })],
        ['ubair_map_restore_intent', 'webcam']
    ]);
    const context = {
        URL,
        URLSearchParams,
        console: { warn: jest.fn() },
        document: { referrer: '', title: 'Road Weather' },
        window: {
            location: { href: `https://example.test/roads${search}`, search: search.split("#")[0] },
            history: { state: null, replaceState: jest.fn() }
        },
        sessionStorage: {
            getItem(key) {
                if (blocked) throw new Error('SecurityError: storage disabled');
                return values.get(key) ?? null;
            },
            removeItem(key) { values.delete(key); }
        }
    };
    vm.runInNewContext(source, context);
    return { manager: context.window.mapStateManager, context, values };
}

describe('Map state restoration', () => {
    it('keeps map initialization running when browser storage is blocked', () => {
        const { manager } = browser({ blocked: true });
        expect(manager.shouldRestoreState()).toBe(false);
    });

    it('starts a normal visit at the default view despite a saved webcam intent', () => {
        const { manager } = browser();
        expect(manager.shouldRestoreState()).toBe(false);
    });

    it('restores a webcam return and consumes its intent while preserving other URL parts', () => {
        const { manager, context, values } = browser({ search: '?units=metric&returnFrom=webcam#map' });
        const map = { setView: jest.fn() };
        expect(manager.shouldRestoreState()).toBe(true);
        expect(manager.restoreMapState(map)).toBe(true);
        expect(map.setView).toHaveBeenCalledWith([40.3, -109.7], 10);
        expect(values.has('ubair_map_restore_intent')).toBe(false);
        expect(context.window.history.replaceState).toHaveBeenCalledWith(null, 'Road Weather', '/roads?units=metric#map');
        expect(manager.shouldRestoreState()).toBe(false);
    });

    it.each([{ lat: null, lng: -109.7 }, [999, 999], [-91, 0], [0, -181]])('discards invalid coordinates %j and return signals', center => {
        const { manager, context, values } = browser({ search: '?returnFrom=webcam', center });
        const map = { setView: jest.fn() };
        expect(manager.restoreMapState(map)).toBe(false);
        expect(map.setView).not.toHaveBeenCalled();
        expect(values.has('ubair_map_state')).toBe(false);
        expect(values.has('ubair_map_restore_intent')).toBe(false);
        expect(context.window.history.replaceState).toHaveBeenCalledWith(null, 'Road Weather', '/roads');
    });
});
