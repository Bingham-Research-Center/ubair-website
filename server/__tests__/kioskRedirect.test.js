import request from 'supertest';
import app from '../server.js';

describe('retired kiosk URLs', () => {
    test.each(['/kiosk', '/kiosk-portrait', '/portrait-kiosk'])(
        '%s redirects to the homepage in display mode',
        async (url) => {
            const response = await request(app).get(url).expect(302);
            expect(response.headers.location).toBe('/?display=1');
        }
    );

    test('the redirect target is served', async () => {
        await request(app).get('/?display=1').expect(200);
    });
});
