/**
 * End to end through the real app (issue #340): the client address comes from the hop nginx
 * appended, the beacon's text/plain body is parsed, and /api/analytics/visitors reports it.
 *
 * Supertest connects over loopback, which is exactly how nginx reaches the app, so a request
 * with X-Forwarded-For here looks like a proxied one and a request without it looks like a
 * local tool. Every test reads deltas against a snapshot, because the store is module-level.
 */

import { describe, it, expect } from '@jest/globals';
import request from 'supertest';
import { promises as fs } from 'fs';
import path from 'path';
import app from '../server.js';
import { visitors } from '../middleware/analytics.js';

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

// 'finish' fires as the response is handed off; give the event loop a turn before reading.
const settle = () => new Promise(r => setImmediate(r));
const counts = async () => {
    await settle();
    return visitors.snapshot();
};
const delta = (after, before, tier, identity) =>
    after.uniqueVisitors[tier][identity] - before.uniqueVisitors[tier][identity];

describe('visitor tracking through the app', () => {
    it('keys a visitor on the address nginx appended, not the spoofable first hop', async () => {
        const ua = `${UA} first-hop-test`;
        const before = await counts();
        await request(app).get('/about').set('User-Agent', ua)
            .set('X-Forwarded-For', '10.9.9.9, 203.0.113.50').expect(200);
        await request(app).get('/about').set('User-Agent', ua)
            .set('X-Forwarded-For', '172.16.1.1, 203.0.113.50').expect(200);
        await request(app).get('/about').set('User-Agent', ua)
            .set('X-Forwarded-For', '10.9.9.9, 198.51.100.50').expect(200);
        const after = await counts();

        // Same rightmost hop, different forged first hops: one visitor. New rightmost: another.
        expect(delta(after, before, 'page_viewer', 'address')).toBe(2);
        expect(after.pageViews.page_viewer - before.pageViews.page_viewer).toBe(3);
        expect(after.clientAddress.unresolved).toBe(before.clientAddress.unresolved);
    });

    it('counts a request with no forwarded address as unresolved, not as a visitor', async () => {
        const before = await counts();
        await request(app).get('/about').set('User-Agent', UA).expect(200);
        const after = await counts();

        expect(after.clientAddress.unresolved - before.clientAddress.unresolved).toBe(1);
        expect(delta(after, before, 'any', 'address_ua')).toBe(0);
    });

    it('does not count a Chrome-UA scanner 404 as a page view', async () => {
        const before = await counts();
        await request(app).get('/phpinfo').set('User-Agent', UA)
            .set('X-Forwarded-For', '192.0.2.77').expect(404);
        const after = await counts();

        expect(delta(after, before, 'not_declared_bot', 'address')).toBe(1);
        expect(delta(after, before, 'page_viewer', 'address')).toBe(0);
    });

    it('sees a scanner probe that looks like an asset, and drops it from clean (PR #341 review)', async () => {
        // '/config.json' contains '.js', so the static-asset skip used to hide it entirely.
        const xff = '192.0.2.88';
        const before = await counts();
        await request(app).get('/about').set('User-Agent', UA).set('X-Forwarded-For', xff).expect(200);
        await request(app).get('/config.json').set('User-Agent', UA).set('X-Forwarded-For', xff).expect(404);
        const after = await counts();

        expect(delta(after, before, 'page_viewer', 'address')).toBe(1);
        expect(delta(after, before, 'clean', 'address')).toBe(0);
    });

    it('does not mistake a served asset named like a probe for one (PR #341 review)', async () => {
        // The homepage loads /public/js/config.js, which matches the /config scanner pattern.
        const xff = '203.0.113.120';
        const before = await counts();
        await request(app).get('/about').set('User-Agent', UA).set('X-Forwarded-For', xff).expect(200);
        const first = await request(app).get('/public/js/config.js')
            .set('User-Agent', UA).set('X-Forwarded-For', xff).expect(200);
        await request(app).get('/public/js/config.js')
            .set('User-Agent', UA).set('X-Forwarded-For', xff)
            .set('If-None-Match', first.headers.etag).expect(304);
        const after = await counts();

        expect(delta(after, before, 'clean', 'address')).toBe(1);
        expect(after.clientAddress.requests - before.clientAddress.requests).toBe(1);
    });

    it('still ignores real assets, and their 404s do not push a reader over the miss limit', async () => {
        const xff = '198.51.100.88';
        const before = await counts();
        await request(app).get('/about').set('User-Agent', UA).set('X-Forwarded-For', xff).expect(200);
        await request(app).get('/public/js/loadSidebar.js').set('User-Agent', UA).set('X-Forwarded-For', xff).expect(200);
        // A page that points at a file we do not have (as the root /favicon.ico was until #309)
        // makes the reader's browser ask for it on every load.
        for (let i = 0; i < 12; i++) {
            await request(app).get('/missing-icon.ico').set('User-Agent', UA).set('X-Forwarded-For', xff).expect(404);
        }
        const after = await counts();

        expect(after.clientAddress.requests - before.clientAddress.requests).toBe(1);
        expect(delta(after, before, 'clean', 'address')).toBe(1);
    });

    it('accepts a sendBeacon-style text/plain beacon and js-confirms that visitor', async () => {
        const ua = `${UA} beacon-test`;
        const xff = '203.0.113.77';
        const before = await counts();
        await request(app).get('/about').set('User-Agent', ua).set('X-Forwarded-For', xff).expect(200);
        await request(app).post('/api/analytics/engagement')
            .set('User-Agent', ua).set('X-Forwarded-For', xff)
            .set('Content-Type', 'text/plain;charset=UTF-8')
            .send(JSON.stringify({ path: '/about/faq', duration_s: 12 }))
            .expect(204);
        const after = await counts();

        expect(delta(after, before, 'js_confirmed', 'address_ua')).toBe(1);
    });

    it('still accepts an application/json beacon and still rejects a malformed one', async () => {
        await request(app).post('/api/analytics/engagement')
            .set('X-Forwarded-For', '203.0.113.78')
            .send({ path: '/', duration_s: 3 })
            .expect(204);
        await request(app).post('/api/analytics/engagement')
            .set('X-Forwarded-For', '203.0.113.78')
            .set('Content-Type', 'text/plain')
            .send(JSON.stringify({ path: 'https://evil.example/', duration_s: 3 }))
            .expect(400);
    });

    it('logs the full path for a route inside an /api router, not the stripped one', async () => {
        const ua = `${UA} path-test`;
        await request(app).get('/api/health').set('User-Agent', ua).set('X-Forwarded-For', '203.0.113.90');
        const logFile = path.join(visitors.dir, 'access.log');
        let line;
        for (let i = 0; i < 50 && !line; i++) {
            await new Promise(r => setTimeout(r, 10));
            const text = await fs.readFile(logFile, 'utf-8').catch(() => '');
            line = text.trim().split('\n').map(l => JSON.parse(l)).reverse().find(e => e.ua_raw === ua);
        }
        expect(line).toMatchObject({ path: '/api/health', page: false, address_resolved: true });
    });

    it('serves definitions, today and history, with no hashes', async () => {
        const res = await request(app).get('/api/analytics/visitors?days=7').expect(200);
        expect(res.body.definitions.tiers.map(t => t.key))
            .toEqual(['any', 'not_declared_bot', 'page_viewer', 'clean', 'js_confirmed']);
        expect(Object.keys(res.body.definitions.identities)).toEqual(['network', 'address', 'address_ua']);
        expect(res.body.today.date).toBe(new Date().toISOString().slice(0, 10));
        expect(res.body.today.uniqueVisitors.page_viewer.address).toBeGreaterThan(0);
        expect(Array.isArray(res.body.history)).toBe(true);
        expect(JSON.stringify(res.body)).not.toMatch(/[0-9a-f]{16}/);
    });
});
