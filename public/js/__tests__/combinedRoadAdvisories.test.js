import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const containers = Object.fromEntries(['active', 'upcoming', 'all'].map(tab => [`${tab}-events`, { innerHTML: '' }]));
const fetchMock = jest.fn();
const context = vm.createContext({
    Intl, console: { error: jest.fn() }, fetch: fetchMock, requestAnimationFrame: () => 0,
    document: { getElementById: id => containers[id] }
});
for (const file of ['utils', 'TrafficEventsManager']) {
    vm.runInContext(readFileSync(new URL(`../roads/${file}.js`, import.meta.url), 'utf8'), context);
}

// #334 titles cards by road and hides the UDOT project name, so tests find advisories by description.
const event = { name: 'US-40 roadwork', roadwayName: 'US-40', startDate: '2020-01-01T00:00:00Z', description: 'One lane open.' };
const alert = { id: 1, message: 'US-191 chain restrictions.', severity: 'high', regions: ['Uintah County'] };
const response = data => ({ ok: true, json: async () => ({ success: true, ...data }) });
const html = () => containers['active-events'].innerHTML;
let manager;

beforeEach(() => {
    manager = vm.runInContext('Object.create(TrafficEventsManager.prototype)', context);
    Object.assign(manager, {
        currentTab: 'active', alertsData: [], alertsStatus: 'ready',
        eventsData: { active: [event], upcoming: [], all: [event] },
        eventsStatus: { active: 'ready', upcoming: 'ready', all: 'ready' },
        // Constructor state read by #334's advisory cards and Show all control.
        expandedLists: new Set(), expandedDescriptions: new Set()
    });
    Object.values(containers).forEach(container => { container.innerHTML = ''; });
    fetchMock.mockReset();
});

describe('combined road advisories and alerts', () => {
    it('puts alert severity first in the same list as travel advisories', () => {
        manager.displayAlerts([{ ...alert, id: 2, severity: 'low', message: 'Low priority alert.' }, alert]);
        expect(html().match(/class="events-list advisories-list"/g)).toHaveLength(1);
        expect(html().indexOf(alert.message)).toBeLessThan(html().indexOf('Low priority alert.'));
        expect(html().indexOf('Low priority alert.')).toBeLessThan(html().indexOf('One lane open.'));
        expect(html()).not.toContain('No UDOT alerts');
    });

    it('shows exactly the requested empty-alert line and keeps advisories', () => {
        manager.displayAlerts([]);
        expect(html().match(/No UDOT alerts for the Basin right now\./g)).toHaveLength(1);
        expect(html()).toContain('One lane open.');
        expect(html()).not.toContain('All clear');
        expect(html()).not.toContain('No Active Alerts');
    });

    it('removes expired alerts on subsequent renders and keeps active alerts out of Upcoming', () => {
        manager.displayAlerts([{ ...alert, endTime: '2020-01-01T00:00:00Z' }]);
        expect(html()).not.toContain(alert.message);
        manager.currentTab = 'upcoming';
        manager.eventsData.upcoming = [{ ...event, description: 'Future work', startDate: new Date(Date.now() + 86400000).toISOString() }];
        manager.displayAlerts([alert]);
        expect(containers['upcoming-events'].innerHTML).toContain('Future work');
        expect(containers['upcoming-events'].innerHTML).not.toContain(alert.message);
        manager.currentTab = 'all';
        manager.displayEvents('all');
        expect(containers['all-events'].innerHTML).toContain(alert.message);
        expect(containers['all-events'].innerHTML).toContain('One lane open.');
    });

    it.each(['alerts', 'events'])('keeps both feeds when %s arrives first', async first => {
        let release;
        const delayed = new Promise(resolve => { release = resolve; });
        fetchMock.mockImplementation(async url => {
            const isAlerts = url === '/api/alerts';
            if ((first === 'alerts') !== isAlerts) await delayed;
            return response(isAlerts ? { alerts: [alert] } : { events: [event] });
        });
        manager.alertsStatus = 'loading';
        manager.eventsStatus.active = 'loading';
        const alerts = manager.loadAlerts();
        const events = manager.loadAllEventsData();
        await (first === 'alerts' ? alerts : events);
        expect(html()).toContain(first === 'alerts' ? alert.message : 'One lane open.');
        release();
        await Promise.all([alerts, events]);
        expect(html()).toContain(alert.message);
        expect(html()).toContain('One lane open.');
        expect(html()).not.toContain('Loading');
    });

    it('reports an alert failure without implying there are no alerts or hiding advisories', async () => {
        fetchMock.mockResolvedValue({ ok: false, status: 503 });
        await manager.loadAlerts();
        expect(html()).toContain('UDOT alerts could not be updated');
        expect(html()).toContain('One lane open.');
        expect(html()).not.toContain('No UDOT alerts for the Basin');
    });

    it('keeps alerts when travel advisories fail, and recovers on refresh', async () => {
        manager.displayAlerts([alert]);
        fetchMock.mockRejectedValue(new Error('Offline'));
        await manager.loadAllEventsData();
        expect(html()).toContain(alert.message);
        expect(html()).toContain('Travel advisories could not be updated');
        fetchMock.mockResolvedValue(response({ events: [event] }));
        await manager.loadAllEventsData();
        expect(html()).toContain(alert.message);
        expect(html()).toContain('One lane open.');
        expect(html()).not.toContain('could not be updated');
    });

    it('escapes feed text in the combined alert cards', () => {
        manager.displayAlerts([{ ...alert, message: '<img src=x onerror=alert(1)>', notes: '<script>bad()</script>' }]);
        expect(html()).not.toContain('<img');
        expect(html()).not.toContain('<script>');
        expect(html()).toContain('&lt;img');
    });
});
