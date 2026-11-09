/**
 * scripts/count-visitors.js replays access-log lines through the live definitions (#340).
 */

import { describe, it, expect } from '@jest/globals';
import { addLine, orderLogFiles } from '../../scripts/count-visitors.js';

const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

const line = (over = {}) => ({
    timestamp: '2026-11-09T15:00:00.000Z',
    visitor_id: 'aaaaaaaaaaaaaaaa',
    visitor_ua_id: 'bbbbbbbbbbbbbbbb',
    network_id: 'cccccccccccccccc',
    address_resolved: true,
    path: '/',
    method: 'GET',
    status: 200,
    is_bot: false,
    declared_bot: false,
    probe: false,
    page: true,
    ua_raw: CHROME,
    ...over,
});

describe('count-visitors replay', () => {
    it('groups by UTC day and rebuilds every tier, beacon included', () => {
        const tallies = new Map();
        addLine(tallies, line());
        addLine(tallies, { timestamp: '2026-11-09T15:01:00.000Z', type: 'engagement', visitor_id: 'aaaaaaaaaaaaaaaa', visitor_ua_id: 'bbbbbbbbbbbbbbbb', network_id: 'cccccccccccccccc', path: '/', duration_s: 9 });
        addLine(tallies, line({ timestamp: '2026-11-10T01:00:00.000Z' }));

        expect([...tallies.keys()]).toEqual(['2026-11-09', '2026-11-10']);
        expect(tallies.get('2026-11-09').counts().uniqueVisitors.js_confirmed.address).toBe(1);
        expect(tallies.get('2026-11-10').counts().uniqueVisitors.js_confirmed.address).toBe(0);
    });

    it('re-derives bot flags from the raw UA unless told to trust the log', () => {
        const curlLoggedAsHuman = line({ ua_raw: 'curl/8.5.0', declared_bot: false });

        const rederived = new Map();
        addLine(rederived, curlLoggedAsHuman);
        expect(rederived.get('2026-11-09').counts().uniqueVisitors.not_declared_bot.address).toBe(0);

        const asLogged = new Map();
        addLine(asLogged, curlLoggedAsHuman, { asLogged: true });
        expect(asLogged.get('2026-11-09').counts().uniqueVisitors.not_declared_bot.address).toBe(1);
    });

    it('trusts the logged bot verdict when the UA was truncated (PR #341 review)', () => {
        // Live saw the full UA, with its bot marker past the 300-character cap.
        const truncated = line({ ua_raw: `Mozilla/5.0 ${'X'.repeat(288)}`, ua_truncated: true, declared_bot: true });
        const tallies = new Map();
        addLine(tallies, truncated);
        expect(tallies.get('2026-11-09').counts().uniqueVisitors.not_declared_bot.address).toBe(0);
    });

    it('ignores a beacon read before any request from that browser, as live does', () => {
        const beacon = { timestamp: '2026-11-09T14:00:00.000Z', type: 'engagement', visitor_id: 'aaaaaaaaaaaaaaaa', visitor_ua_id: 'bbbbbbbbbbbbbbbb', network_id: 'cccccccccccccccc', path: '/', duration_s: 9 };
        const tallies = new Map();
        addLine(tallies, beacon);
        addLine(tallies, line());
        expect(tallies.get('2026-11-09').counts().uniqueVisitors.js_confirmed.address).toBe(0);
    });

    it('reads rotated files oldest first and the live access.log last', () => {
        expect(orderLogFiles([
            '/x/access.log',
            '/x/access_2026-11-05T14-57-45-293Z.log',
            '/x/access_2026-10-30T15-38-09-153Z.log',
        ])).toEqual([
            '/x/access_2026-10-30T15-38-09-153Z.log',
            '/x/access_2026-11-05T14-57-45-293Z.log',
            '/x/access.log',
        ]);
    });

    it('counts unresolved lines as unresolved and skips lines from before #340', () => {
        const tallies = new Map();
        expect(addLine(tallies, line({ visitor_ua_id: null, network_id: null, address_resolved: false }))).toBe(true);
        expect(addLine(tallies, { timestamp: '2026-11-09T15:00:00.000Z', visitor_id: 'x', path: '/', status: 200 })).toBe(false);
        expect(tallies.get('2026-11-09').counts().clientAddress).toMatchObject({ requests: 1, unresolved: 1 });
    });
});
