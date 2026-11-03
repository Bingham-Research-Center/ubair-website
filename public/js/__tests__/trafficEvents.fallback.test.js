import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it, jest } from '@jest/globals';

function browser() {
    const container = { innerHTML: '' };
    const context = vm.createContext({ document: { getElementById: () => container },
        fetch: jest.fn().mockResolvedValue({ ok: false, status: 503 }), console: { error: jest.fn() } });
    for (const name of ['utils', 'TrafficEventsManager']) {
        vm.runInContext(readFileSync(new URL(`../roads/${name}.js`, import.meta.url), 'utf8'), context);
    }
    const manager = vm.runInContext('Object.create(TrafficEventsManager.prototype)', context);
    manager.currentTab = 'active';
    manager.eventsData = { active: [] };
    // Constructor state that #334's advisory cards read (the constructor is skipped here).
    manager.expandedLists = new Set();
    manager.expandedDescriptions = new Set();
    return { manager, container };
}

describe('traffic fallback presentation', () => {
    it('shows an error for failed HTTP responses and makes no all-clear claim for empty lists', async () => {
        const { manager, container } = browser();
        await manager.loadAllEventsData();
        expect(container.innerHTML).toContain('Error Loading Events');
        manager.displayEvents('active');
        expect(container.innerHTML).toContain('No active advisories');
        expect(container.innerHTML).not.toMatch(/all clear/i);
        manager.displayAlerts([]);
        expect(container.innerHTML).not.toMatch(/all clear/i);
    });

    it('labels cached events and alerts with their real age', () => {
        const { manager } = browser();
        const record = { cached: true, lastUpdated: new Date(Date.now() - 12 * 60000).toISOString() };
        expect(manager.createEventCard(record)).toContain('Cached UDOT report; updated 12 min ago');
        expect(manager.createAlertCard({ cached: true })).toContain('Cached UDOT report; update time unavailable');
    });
});
