import request from 'supertest';
import app from '../server.js';

describe('/about/:page', () => {
    test('serves an allowlisted about page', async () => {
        const response = await request(app)
            .get('/about/faq')
            .expect(200);

        expect(response.headers['content-type']).toMatch(/text\/html/);
        expect(response.text).toContain('<!DOCTYPE html>');
    });

    test('returns 404 for an unknown about page', async () => {
        await request(app)
            .get('/about/does-not-exist')
            .expect(404);
    });

    test('returns 404 for a traversal attempt', async () => {
        await request(app)
            .get('/about/%2e%2e%2findex')
            .expect(404);
    });
});
