import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from '@jest/globals';

const context = vm.createContext({ Intl, URL, console });
for (const name of ['utils', 'TrafficEventsManager']) {
    vm.runInContext(readFileSync(new URL(`../roads/${name}.js`, import.meta.url), 'utf8'), context);
}
const dates = vm.runInContext('formatAdvisoryDates', context);
const select = vm.runInContext('selectAdvisories', context);
const info = vm.runInContext('formatAdvisoryInfo', context);
const contacts = vm.runInContext('linkAdvisoryContacts', context);
const manager = vm.runInContext('Object.create(TrafficEventsManager.prototype)', context);
manager.expandedDescriptions = new Set();

describe('travel advisory presentation', () => {
    it('formats date ranges without times, using Mountain calendar dates', () => {
        expect(dates('2026-09-21T06:00:00Z', '2027-01-30T07:00:00Z')).toBe('Sep 21 to Jan 30, 2027');
        expect(dates('2026-11-02T07:00:00Z', '2026-11-03T06:59:00Z')).toBe('Nov 2, 2026');
    });

    it('keeps missing and invalid dates readable without inventing an epoch date', () => {
        expect(dates(null, null)).toBe('Dates not provided');
        expect(dates('bad date', '2027-01-30T07:00:00Z')).toBe('Until Jan 30, 2027');
        expect(dates('2026-09-21T06:00:00Z', null)).toBe('Sep 21, 2026 · End date not provided');
    });

    it('drops expired entries from every tab and ranks active entries by feed priority', () => {
        const now = Date.parse('2026-11-02T18:00:00Z');
        const events = [
            { id: 'old', startDate: '2026-10-01T00:00:00Z', plannedEndDate: '2026-11-01T00:00:00Z', priority: 100 },
            { id: 'routine', startDate: '2026-11-01T00:00:00Z', priority: 13 },
            { id: 'closure', startDate: '2026-11-01T00:00:00Z', priority: 30 },
            { id: 'future', startDate: '2026-11-03T00:00:00Z', priority: 99 },
            { id: 'newer', startDate: '2026-11-02T00:00:00Z', priority: 13 }
        ];
        expect(select(events, 'active', now).map(e => e.id)).toEqual(['closure', 'newer', 'routine']);
        expect(select(events, 'upcoming', now).map(e => e.id)).toEqual(['future']);
        expect(select(events, 'all', now).map(e => e.id)).toEqual(['closure', 'newer', 'routine', 'future']);
    });

    it('retains ongoing advisories without a usable end date', () => {
        const events = [{ id: 1, startDate: null, plannedEndDate: null }, { id: 2, plannedEndDate: 'unknown' }];
        expect(select(events, 'active', Date.now())).toHaveLength(2);
    });

    it('uses one road heading and omits unknown severity', () => {
        const html = manager.createEventCard({ id: 1, roadwayName: 'US 40', name: 'Project title', severity: ' Unknown ', description: 'Lane closures.' });
        expect(html).toContain('<h3 class="event-title">US 40</h3>');
        expect(html).not.toContain('<strong>Severity:</strong>');
        expect(html).not.toMatch(/<p[^>]*>US 40<\/p>/);
        expect(html).not.toContain('Project title');
        expect(manager.createEventCard({ roadwayName: 'US 40', severity: 'Major' })).toContain('<strong>Severity:</strong> Major');
    });

    it('splits pipe fragments and removes title copies without dropping useful road details', () => {
        const html = info({ roadwayName: 'US 40', comment: 'US-40 | Roadway: US 40 | US 40 at Red Creek | Renewed | Renewed' });
        expect(html.match(/<li>/g)).toHaveLength(2);
        expect(html).toContain('US 40 at Red Creek');
        expect(html).toContain('Renewed');
        expect(html).not.toContain('Roadway:');
    });

    it('links bare domains, phone numbers and email addresses from the UDOT comment format', () => {
        const html = info({ roadwayName: 'US 40', comment: 'US-40 | Currant Creek to SR-208 | Website: udotinput.utah.gov/us40renewed, Hotline: 435-352-6068, Email: us40renewed@utah.gov' });
        expect(html).toContain('href="https://udotinput.utah.gov/us40renewed"');
        expect(html).toContain('href="tel:+14353526068"');
        expect(html).toContain('href="mailto:us40renewed@utah.gov"');
        expect(html).not.toContain('Email: Email:');
        expect(html).not.toContain('Hotline: Phone:');
    });

    it('labels unlabelled contacts and supports phone extensions', () => {
        const html = contacts('435-264-3448 | us191indiancanyon@utah.gov | +1 (435) 555-1212 ext. 9');
        expect(html).toContain('Phone: <a href="tel:+14352643448"');
        expect(html).toContain('Email: <a href="mailto:us191indiancanyon@utah.gov"');
        expect(html).toContain('href="tel:+14355551212;ext=9"');
    });

    it('preserves URL queries and leaves sentence punctuation outside the link', () => {
        const html = contacts('See https://publicinput.com/Project/AccessCode?id=test%3d%3d&view=1.');
        expect(html).toContain('href="https://publicinput.com/Project/AccessCode?id=test%3d%3d&amp;view=1"');
        expect(html).toMatch(/<\/a>\.$/);
    });

    it('escapes feed markup and never creates a script URL', () => {
        const html = info({ comment: '<img src=x onerror=alert(1)> | javascript:alert(1) | https://example.org/?q=" onclick="alert(1)' });
        expect(html).not.toContain('<img');
        expect(html).toContain('&lt;img');
        expect(html).not.toMatch(/href="javascript:/i);
        expect(html).not.toContain('" onclick="');
        expect(manager.createEventCard({ roadwayName: '<script>alert(1)</script>', description: '<img src=x onerror=alert(1)>' })).not.toContain('<script>');
    });
});
