import fs from 'fs';
import { ALERTS_UNAVAILABLE, PRECIP_ICONS, alertsView, precipTable } from '../weatherHazards.js';
import { PRECIP_ICONS as HOMEPAGE_ICONS, PRECIP_WORDS as HOMEPAGE_WORDS } from '../homepage-lights.js';
import { PRECIP_WORDS } from '../weatherHazards.js';

// The hazards pane on the weather page (issue #407).

const NOW = Date.parse('2026-11-20T05:25:00Z');
const alert = (overrides) => ({
    event: 'Winter Weather Advisory', level: 'advisory', scope: 'nearby', areaDesc: 'Eastern Uinta Mountains',
    ends: '2026-11-21T00:00:00.000Z', description: '* WHAT...Snow.', instruction: 'Slow down.', ...overrides,
});
const ok = (alerts) => ({ status: 'ok', fetchedAt: '2026-11-20T05:21:00Z', alerts });

describe('alertsView', () => {
    test('a failed check is "could not be checked", never "no alerts"', () => {
        for (const failed of [null, undefined, {}, { status: 'unavailable', alerts: null }, { status: 'ok', alerts: null }]) {
            expect(alertsView(failed, NOW)).toEqual({ state: 'unavailable', message: ALERTS_UNAVAILABLE, groups: [] });
        }
        expect(ALERTS_UNAVAILABLE).toMatch(/could not be checked/);
    });

    test('says there are none only when the NWS said so, and when that was', () => {
        expect(alertsView(ok([]), NOW)).toEqual({
            state: 'none',
            message: 'No National Weather Service alerts for the Basin or the high ground around it. Checked 10:21 PM.',
            groups: [],
        });
    });

    test('groups the floor ahead of the high ground and marks warnings', () => {
        const view = alertsView(ok([
            alert({}),
            alert({ event: 'Winter Storm Warning', level: 'warning', scope: 'floor', areaDesc: 'Western Uinta Basin' }),
        ]), NOW);
        expect(view.state).toBe('alerts');
        expect(view.groups.map((group) => group.title)).toEqual(['Basin floor', 'Nearby high ground']);
        expect(view.groups[0].alerts[0]).toEqual({
            event: 'Winter Storm Warning', level: 'warning', where: 'Western Uinta Basin',
            until: 'until Fri 5 PM', text: '* WHAT...Snow.\n\nSlow down.',
        });
        expect(view.groups[1].alerts[0]).toMatchObject({ level: 'other', where: 'Eastern Uinta Mountains' });
    });

    test('leaves out a group with nothing in it', () => {
        expect(alertsView(ok([alert({})]), NOW).groups.map((group) => group.title)).toEqual(['Nearby high ground']);
    });
});

describe('precipTable', () => {
    const body = {
        status: 'ok',
        hours: ['2026-11-20T06:00:00Z', '2026-11-20T07:00:00Z', '2026-11-20T08:00:00Z'],
        bands: [
            { label: 'Passes', range: 'above 7,500 ft', types: ['snow', 'snow', 'mix'] },
            { label: 'Floor', range: 'below 5,900 ft', types: ['rain', 'dry', null] },
        ],
    };

    test('one column per hour, naming the day where it changes', () => {
        expect(precipTable(body).columns).toEqual(['Thu 11 PM', 'Fri 12 AM', '1 AM']);
    });

    test('one row per band, each cell a word and its icons', () => {
        const rows = precipTable(body).rows;
        expect(rows.map((row) => `${row.label} (${row.range})`)).toEqual(['Passes (above 7,500 ft)', 'Floor (below 5,900 ft)']);
        expect(rows[0].cells.map((cell) => cell.words)).toEqual(['Snow', 'Snow', 'Mix']);
        expect(rows[0].cells[2].icons).toEqual(['fa-cloud-rain', 'fa-snowflake']);
        expect(rows[1].cells).toEqual([
            { words: 'Rain', icons: ['fa-cloud-rain'], type: 'rain' },
            { words: 'Dry', icons: [], type: 'dry' },
            { words: 'No forecast', icons: [], type: null },
        ]);
    });

    test('null, and so no table, when there is no forecast', () => {
        for (const none of [null, { status: 'unavailable', hours: [], bands: [] }, { status: 'ok', hours: [], bands: [] }]) {
            expect(precipTable(none)).toBeNull();
        }
    });

    test('uses the same words and symbols as the homepage tile', () => {
        expect(PRECIP_WORDS).toEqual(HOMEPAGE_WORDS);
        expect(PRECIP_ICONS).toEqual(HOMEPAGE_ICONS);
    });
});

describe('the module', () => {
    test('puts NWS and server text into the page as text, never as HTML', () => {
        for (const file of ['../weatherHazards.js', '../townForecast.js']) {
            expect(fs.readFileSync(new URL(file, import.meta.url), 'utf8')).not.toMatch(/innerHTML|insertAdjacentHTML|outerHTML/);
        }
    });
});
