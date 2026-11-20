/**
 * Unique-visitor definitions (issue #340): address keys, request classification, the
 * identity × tier matrix, and the store's salt / restart / midnight behaviour.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync, statSync, readFileSync, existsSync } from 'fs';
import os from 'os';
import path from 'path';
import {
    MISS_THRESHOLD, TIERS, VisitorStore, VisitorTally, addressKeys, classifyRequest, describeDefinitions,
} from '../middleware/visitorCounts.js';

const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

describe('addressKeys', () => {
    it('keys IPv4 by address and /24', () => {
        expect(addressKeys('203.0.113.9')).toEqual({ address: '203.0.113.9', network: '203.0.113.0/24' });
    });

    it('treats an IPv4-mapped IPv6 address as the IPv4 address', () => {
        expect(addressKeys('::ffff:203.0.113.9')).toEqual(addressKeys('203.0.113.9'));
    });

    it('reads hex-form IPv4-mapped addresses as the IPv4 client (PR #341 review)', () => {
        expect(addressKeys('::ffff:cb00:7109')).toEqual(addressKeys('203.0.113.9'));
        expect(addressKeys('::ffff:c633:6407')).toEqual(addressKeys('198.51.100.7'));
        expect(addressKeys('0:0:0:0:0:ffff:cb00:7109')).toEqual(addressKeys('203.0.113.9'));
        expect(addressKeys('::ffff:7f00:1')).toBeNull();
    });

    it('returns null for loopback and junk, which say nothing about the visitor', () => {
        for (const ip of ['127.0.0.1', '127.8.8.8', '::ffff:127.0.0.1', '::1', '::', 'unknown', '', undefined, null]) {
            expect(addressKeys(ip)).toBeNull();
        }
    });

    it('keys IPv6 by /64, so rotating privacy addresses stay one visitor', () => {
        const a = addressKeys('2001:db8:aa:bb:1111:2222:3333:4444');
        const b = addressKeys('2001:0db8:00aa:00bb:9:8:7:6');
        expect(a.address).toBe('2001:db8:aa:bb::/64');
        expect(b).toEqual(a);
    });

    it('expands :: compression before taking the prefix', () => {
        expect(addressKeys('2001:db8::1')).toEqual({ address: '2001:db8:0:0::/64', network: '2001:db8:0::/48' });
        expect(addressKeys('2001:db8:0:0:0:0:0:1')).toEqual(addressKeys('2001:db8::1'));
    });

    it('separates /64s but groups them by /48', () => {
        const a = addressKeys('2001:db8:aa:1::1');
        const b = addressKeys('2001:db8:aa:2::1');
        expect(a.address).not.toBe(b.address);
        expect(a.network).toBe(b.network);
    });

    it('parses an embedded IPv4 tail', () => {
        expect(addressKeys('64:ff9b::198.51.100.7')).toEqual({ address: '64:ff9b:0:0::/64', network: '64:ff9b:0::/48' });
    });
});

describe('classifyRequest', () => {
    const page = { userAgent: CHROME, method: 'GET', path: '/', status: 200, contentType: 'text/html; charset=UTF-8' };

    it('recognises an HTML page served to a browser', () => {
        expect(classifyRequest(page)).toEqual({ declaredBot: false, probe: false, page: true, miss: false });
    });

    it('flags a missing or self-declared bot User-Agent', () => {
        expect(classifyRequest({ ...page, userAgent: '' }).declaredBot).toBe(true);
        expect(classifyRequest({ ...page, userAgent: 'curl/8.5.0' }).declaredBot).toBe(true);
        expect(classifyRequest({ ...page, userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1)' }).declaredBot).toBe(true);
    });

    it('flags scanner paths and POSTs to page routes as probes, but not API POSTs', () => {
        expect(classifyRequest({ ...page, path: '/.env', status: 404 }).probe).toBe(true);
        expect(classifyRequest({ ...page, path: '/wp-login.php', status: 404 }).probe).toBe(true);
        expect(classifyRequest({ ...page, method: 'POST' }).probe).toBe(true);
        expect(classifyRequest({ ...page, method: 'POST', path: '/api/analytics/engagement' }).probe).toBe(false);
    });

    it('counts a 304 revalidation of a page route, which arrives without Content-Type', () => {
        expect(classifyRequest({ ...page, status: 304, contentType: undefined }).page).toBe(true);
        expect(classifyRequest({ ...page, path: '/robots.txt', status: 304, contentType: undefined }).page).toBe(false);
    });

    it('does not count a 404, an API response or a non-GET as a page view', () => {
        // The 404 case is what let scanners with a Chrome UA count as human page views.
        const notFound = classifyRequest({ ...page, path: '/phpinfo', status: 404 });
        expect(notFound.page).toBe(false);
        expect(notFound.miss).toBe(true);
        expect(classifyRequest({ ...page, path: '/api/filelist/observations', contentType: 'application/json' }).page).toBe(false);
        expect(classifyRequest({ ...page, method: 'HEAD' }).page).toBe(false);
        expect(classifyRequest({ ...page, contentType: 'application/json' }).page).toBe(false);
    });
});

// Opaque ids, as the store would hand them to the tally.
const id = (address, network, ua) => ({ address, network, addressUa: `${address}|${ua}` });
const human = { declaredBot: false, probe: false, page: true, miss: false };
const api = { declaredBot: false, probe: false, page: false, miss: false };

describe('VisitorTally: the identity × tier matrix', () => {
    let t;
    beforeEach(() => {
        t = new VisitorTally();
        // A household behind one NAT: two browsers, both read pages, one sends a beacon.
        t.addRequest(id('A', 'net1', 'chrome'), human);
        t.addRequest(id('A', 'net1', 'chrome'), human);
        t.addRequest(id('A', 'net1', 'safari'), human);
        t.addBeacon(id('A', 'net1', 'chrome'));
        // A neighbour in the same /24.
        t.addRequest(id('F', 'net1', 'chrome'), human);
        // A crawler that announces itself.
        t.addRequest(id('B', 'net2', 'googlebot'), { ...human, declaredBot: true });
        // A scanner with a Chrome UA: reads the homepage, then probes.
        t.addRequest(id('C', 'net3', 'chrome'), human);
        t.addRequest(id('C', 'net3', 'chrome'), { declaredBot: false, probe: true, page: false, miss: true });
        // A prober caught only by its misses.
        t.addRequest(id('D', 'net4', 'chrome'), human);
        for (let i = 0; i < MISS_THRESHOLD; i++) t.addRequest(id('D', 'net4', 'chrome'), { ...api, miss: true });
        // A browser that only called the API.
        t.addRequest(id('E', 'net5', 'chrome'), api);
        // Two requests with no resolvable address.
        t.addRequest(null, human);
        t.addRequest(null, human);
    });

    it('narrows at every tier, under every identity', () => {
        expect(t.counts().uniqueVisitors).toEqual({
            any:              { network: 5, address: 6, address_ua: 7 },
            not_declared_bot: { network: 4, address: 5, address_ua: 6 },
            page_viewer:      { network: 3, address: 4, address_ua: 5 },
            clean:            { network: 1, address: 2, address_ua: 3 },
            js_confirmed:     { network: 1, address: 1, address_ua: 1 },
        });
    });

    it('counts page views per tier', () => {
        expect(t.counts().pageViews).toEqual({
            any: 7, not_declared_bot: 6, page_viewer: 6, clean: 4, js_confirmed: 2,
        });
    });

    it('reports how many page-viewer addresses have several browsers', () => {
        expect(t.counts().addressSharing).toEqual({
            pageViewerAddresses: 4, withSeveralUserAgents: 1, mostUserAgentsAtOneAddress: 2,
        });
    });

    it('reports requests whose client address could not be resolved', () => {
        const total = 2 + 1 + 1 + 1 + 2 + (1 + MISS_THRESHOLD) + 1 + 2;
        expect(t.counts().clientAddress).toEqual({ requests: total, unresolved: 2, unresolvedShare: +(2 / total).toFixed(3) });
    });

    it('survives a JSON round trip unchanged', () => {
        const back = VisitorTally.fromJSON(JSON.parse(JSON.stringify(t)));
        expect(back.counts()).toEqual(t.counts());
    });

    it('has one row per tier and one column per identity in the published definitions', () => {
        const d = describeDefinitions();
        expect(Object.keys(t.counts().uniqueVisitors)).toEqual(d.tiers.map(x => x.key));
        expect(Object.keys(t.counts().uniqueVisitors.any)).toEqual(Object.keys(d.identities));
    });
});

describe('VisitorTally: edge rules', () => {
    it('taints an address only at the miss threshold, summed across its browsers', () => {
        const t = new VisitorTally();
        t.addRequest(id('A', 'n', 'x'), human);
        for (let i = 0; i < MISS_THRESHOLD - 1; i++) t.addRequest(id('A', 'n', 'x'), { ...api, miss: true });
        expect(t.counts().uniqueVisitors.clean.address).toBe(1);
        t.addRequest(id('A', 'n', 'y'), { ...api, miss: true });
        expect(t.counts().uniqueVisitors.clean.address).toBe(0);
    });

    it('does not js-confirm a beacon that came without a page view', () => {
        const t = new VisitorTally();
        t.addRequest(id('A', 'n', 'x'), api);
        t.addBeacon(id('A', 'n', 'x'));
        t.addBeacon(id('B', 'n', 'x'));
        expect(t.counts().uniqueVisitors.js_confirmed.address_ua).toBe(0);
    });

    it('keeps a beacon-only client out of every tier (PR #341 review)', () => {
        // The engagement route bypasses the middleware, so a beacon alone has no bot verdict.
        const t = new VisitorTally();
        t.addBeacon(id('curl', 'n', 'curl/8.5.0'));
        t.addBeacon(id('none', 'n', ''));
        const c = t.counts();
        expect(c.uniqueVisitors.any).toEqual({ network: 0, address: 0, address_ua: 0 });
        expect(c.clientAddress.requests).toBe(0);
    });

    it('lets a beacon from a declared bot raise it no higher than `any`', () => {
        const t = new VisitorTally();
        t.addRequest(id('B', 'n', 'bot'), { ...human, declaredBot: true });
        t.addBeacon(id('B', 'n', 'bot'));
        const c = t.counts();
        expect(c.uniqueVisitors.any.address).toBe(1);
        expect(c.uniqueVisitors.not_declared_bot.address).toBe(0);
    });

    it('stops adding visitors past maxRecords and says so', () => {
        const t = new VisitorTally({ maxRecords: 2 });
        t.addRequest(id('A', 'n', 'x'), human);
        t.addRequest(id('B', 'n', 'x'), human);
        t.addRequest(id('C', 'n', 'x'), human);
        t.addRequest(id('A', 'n', 'x'), human);
        const c = t.counts();
        expect(c.uniqueVisitors.any.address).toBe(2);
        expect(c.pageViews.any).toBe(3);
        expect(c.truncated).toBe(true);
    });

    it('keeps tiers in the documented order', () => {
        expect(TIERS.map(x => x.key)).toEqual(['any', 'not_declared_bot', 'page_viewer', 'clean', 'js_confirmed']);
    });
});

describe('VisitorStore', () => {
    let dir;
    let clock;
    const now = () => clock;
    const open = () => new VisitorStore({ dir, now, flushMs: 0 });
    const histFile = () => path.join(dir, 'visitors_history.jsonl');
    const historyLines = () => (existsSync(histFile())
        ? readFileSync(histFile(), 'utf-8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l))
        : []);

    beforeEach(() => {
        dir = mkdtempSync(path.join(os.tmpdir(), 'visitor-store-'));
        clock = new Date('2026-11-09T12:00:00Z');
    });
    afterEach(() => rmSync(dir, { recursive: true, force: true }));

    it('gives one address the same ids, and splits browsers only in address_ua', () => {
        const s = open();
        const a = s.idsFor('203.0.113.9', CHROME);
        const b = s.idsFor('203.0.113.9', SAFARI);
        const c = s.idsFor('203.0.113.200', CHROME);
        expect(s.idsFor('203.0.113.9', CHROME)).toEqual(a);
        expect(b.ids.address).toBe(a.ids.address);
        expect(b.ids.addressUa).not.toBe(a.ids.addressUa);
        expect(c.ids.address).not.toBe(a.ids.address);
        expect(c.ids.network).toBe(a.ids.network);
        expect(a.visitorId).toBe(a.ids.address);
        expect(a.ids.address).toMatch(/^[0-9a-f]{16}$/);
        // Domain separation: the same string hashed as a different kind never collides.
        expect(a.ids.network).not.toBe(a.ids.address);
    });

    it('records a loopback client as unresolved, not as a visitor', () => {
        const s = open();
        const who = s.idsFor('::ffff:127.0.0.1', CHROME);
        expect(who.resolved).toBe(false);
        expect(who.ids).toBeNull();
        expect(who.visitorId).toMatch(/^[0-9a-f]{16}$/);
        s.recordRequest(who, human);
        const c = s.snapshot();
        expect(c.uniqueVisitors.any.address).toBe(0);
        expect(c.clientAddress).toMatchObject({ requests: 1, unresolved: 1, unresolvedShare: 1 });
    });

    it('keeps the salt private and keeps a day whole across a restart', () => {
        const s1 = open();
        const before = s1.idsFor('203.0.113.9', CHROME);
        s1.recordRequest(before, human);
        s1.flushSync();
        expect(statSync(path.join(dir, '.visitor-salt.json')).mode & 0o777).toBe(0o600);

        const s2 = open();
        expect(s2.idsFor('203.0.113.9', CHROME)).toEqual(before);
        expect(s2.snapshot().uniqueVisitors.page_viewer.address).toBe(1);
        expect(s2.snapshot().date).toBe('2026-11-09');
    });

    it('closes the day at UTC midnight: history line, new salt, empty tally', () => {
        const s = open();
        const day1 = s.idsFor('203.0.113.9', CHROME);
        s.recordRequest(day1, human);
        const oldSalt = readFileSync(path.join(dir, '.visitor-salt.json'), 'utf-8');

        clock = new Date('2026-11-10T00:00:01Z');
        const day2 = s.idsFor('203.0.113.9', CHROME);
        expect(day2.ids.address).not.toBe(day1.ids.address);
        expect(readFileSync(path.join(dir, '.visitor-salt.json'), 'utf-8')).not.toBe(oldSalt);
        expect(s.snapshot()).toMatchObject({ date: '2026-11-10', uniqueVisitors: { any: { address: 0 } } });

        const lines = historyLines();
        expect(lines).toHaveLength(1);
        expect(lines[0]).toMatchObject({ date: '2026-11-09', definitionsVersion: 1, uniqueVisitors: { page_viewer: { address: 1 } } });
        // Counts only: no hash leaves in the history.
        expect(JSON.stringify(lines[0])).not.toContain(day1.ids.address);
    });

    it('finishes a day that ended while the server was down, exactly once', async () => {
        const s1 = open();
        s1.recordRequest(s1.idsFor('203.0.113.9', CHROME), human);
        s1.flushSync();

        clock = new Date('2026-11-11T08:00:00Z');
        open();
        open();
        const lines = historyLines();
        expect(lines.map(l => l.date)).toEqual(['2026-11-09']);
        expect(await open().history(30)).toHaveLength(1);
    });

    it('returns the most recent N days of history', async () => {
        const s = open();
        for (const day of ['2026-11-10', '2026-11-11', '2026-11-12']) {
            s.recordRequest(s.idsFor('203.0.113.9', CHROME), human);
            clock = new Date(`${day}T00:00:01Z`);
            s.snapshot();
        }
        expect((await s.history(2)).map(l => l.date)).toEqual(['2026-11-10', '2026-11-11']);
        expect(await s.history(0)).toEqual([]);
    });

    it('never lets an in-flight flush overwrite the shutdown checkpoint (PR #341 review)', async () => {
        const s1 = open();
        s1.recordRequest(s1.idsFor('203.0.113.1', CHROME), human);
        const pending = s1.flush();                         // payload: one visitor
        s1.recordRequest(s1.idsFor('203.0.113.2', CHROME), human);
        s1.flushSync();                                     // shutdown: two visitors
        await pending;
        expect(open().snapshot().uniqueVisitors.page_viewer.address).toBe(2);
        expect(existsSync(path.join(dir, 'visitors_today.json.tmp'))).toBe(false);
    });

    it('flushes asynchronously and reloads what it wrote', async () => {
        const s1 = open();
        s1.recordRequest(s1.idsFor('198.51.100.7', SAFARI), human);
        await s1.flush();
        expect(open().snapshot().uniqueVisitors.page_viewer.address_ua).toBe(1);
    });
});
