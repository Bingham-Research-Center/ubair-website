import request from 'supertest';
import app, { server } from '../server.js';

// One About page since 2026-11-12. The old About Clyfar and FAQ pages showed "Content not
// found" (their markdown was mockup filler, removed in 2025); their URLs now redirect.
describe('/about', () => {
    test('does not start the HTTP listener during tests', () => {
        expect(server.listening).toBe(false);
    });

    test('serves the About page with real content, not a loader', async () => {
        const res = await request(app).get('/about').expect(200);
        expect(res.headers['content-type']).toMatch(/text\/html/);
        expect(res.text).toContain('<h1>About BasinWx</h1>');
        expect(res.text).toContain('id="clyfar"');
        expect(res.text).not.toMatch(/markdown-it|Loading\.\.\.|not found/i);
    });

    test.each([
        ['/about/clyfar', '/about#clyfar'],
        ['/about/faq', '/about'],
    ])('%s redirects to %s', async (from, to) => {
        const res = await request(app).get(from).expect(302);
        expect(res.headers.location).toBe(to);
    });

    test('returns 404 for an unknown about page', async () => {
        await request(app).get('/about/does-not-exist').expect(404);
    });

    test('returns 404 for a traversal attempt', async () => {
        await request(app).get('/about/%2e%2e%2findex').expect(404);
    });
});
