import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it, jest } from '@jest/globals';

function browser() {
    const element = () => ({ innerHTML: '', classList: { add() {}, remove() {} } });
    const containers = Object.fromEntries(['active-events', 'upcoming-events', 'all-events', 'alerts-container'].map(id => [id, element()]));
    const fetch = jest.fn();
    const context = vm.createContext({ fetch, console: { error() {} }, requestAnimationFrame() {},
        document: { getElementById: id => containers[id], querySelectorAll: () => [], querySelector: element } });
    for (const file of ['utils', 'TrafficEventsManager']) vm.runInContext(readFileSync(new URL(`../roads/${file}.js`, import.meta.url), 'utf8'), context);
    const manager = vm.runInContext('Object.create(TrafficEventsManager.prototype)', context);
    Object.assign(manager, { currentTab: 'active', eventsData: {}, alertsData: [], alertsStatus: 'ready',
        eventsStatus: { active: 'ready', upcoming: 'ready', all: 'ready' },
        expandedLists: new Set(), expandedDescriptions: new Set() });
    for (const tab of ['active', 'upcoming', 'all']) manager.eventsData[tab] = [{ id: tab, roadwayName: 'US-40',
        description: `Last received ${tab}`, startDate: tab === 'upcoming' ? '2099-01-01T00:00:00Z' : '2020-01-01T00:00:00Z' }];
    return { manager, containers, fetch };
}
const response = data => ({ ok: true, json: async () => ({ success: true, ...data }) });
const unavailable = /feed unavailable|could not be updated/i;

describe('traffic feed state across views', () => {
    it.each(['active', 'upcoming', 'all'])('retains the outage and last received %s reports through tab changes', async tab => {
        const { manager, containers, fetch } = browser();
        manager.currentTab = tab;
        manager.displayEvents(tab);
        fetch.mockResolvedValue({ ok: false, status: 503 });
        await manager.loadAllEventsData();
        expect(containers[`${tab}-events`].innerHTML).toMatch(unavailable);
        expect(containers[`${tab}-events`].innerHTML).toContain(`Last received ${tab}`);
        for (const next of ['active', 'upcoming', 'all']) {
            manager.switchTab(next);
            expect(containers[`${next}-events`].innerHTML).toMatch(unavailable);
        }
        fetch.mockResolvedValue(response({ events: [] }));
        await manager.loadAllEventsData();
        expect(containers['all-events'].innerHTML).not.toMatch(unavailable);
    });

    it('marks an empty cached snapshot as unavailable instead of a fresh empty feed', async () => {
        const { manager, containers, fetch } = browser();
        manager.currentTab = 'upcoming';
        fetch.mockResolvedValue(response({ events: [], status: 'cached', feedUnavailable: true, lastUpdated: '2026-11-03T15:00:00Z' }));
        await manager.loadAllEventsData();
        const html = containers['upcoming-events'].innerHTML;
        expect(html).toMatch(unavailable);
        expect(html).toContain('Cached UDOT report');
        expect(html).not.toMatch(/No upcoming (events|advisories)/i);
    });

    it('retains alerts with an outage notice after a failed refresh', async () => {
        const { manager, containers, fetch } = browser();
        fetch.mockResolvedValueOnce(response({ alerts: [{ id: 1, message: 'US-40 closure', regions: ['Uintah County'] }] }));
        await manager.loadAlerts();
        fetch.mockResolvedValueOnce({ ok: false, status: 503 });
        await manager.loadAlerts();
        const html = containers['alerts-container'].innerHTML + containers['active-events'].innerHTML;
        expect(html).toContain('US-40 closure');
        expect(html).toMatch(unavailable);
        expect(html).not.toContain('No UDOT alerts');
    });
});
