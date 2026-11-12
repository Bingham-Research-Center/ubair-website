import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import request from 'supertest';
import app from '../server.js';

// One icon for the whole site (docs/FAVICON-INSTALL-STEPS.md). Each page used to link a
// different one, so the tab icon changed as a reader moved around, and /favicon.ico 404ed (#309).

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const iconDir = path.join(repoRoot, 'public/images/favicons');

const LINKS = [
    '<link rel="icon" href="/favicon.ico" sizes="32x32">',
    '<link rel="icon" href="/public/images/favicons/favicon.svg" type="image/svg+xml">',
    '<link rel="apple-touch-icon" href="/apple-touch-icon.png">',
];

// The kiosk pages are being retired (#345) and keep whatever they had until then.
const PENDING_REMOVAL = /^kiosk/;

function views() {
    const list = [];
    for (const dir of ['views', 'views/about']) {
        for (const name of fs.readdirSync(path.join(repoRoot, dir))) {
            if (name.endsWith('.html') && !PENDING_REMOVAL.test(name)) list.push(`${dir}/${name}`);
        }
    }
    return list;
}

describe('favicon', () => {
    test.each(views())('%s links the one site icon and no other', (view) => {
        const html = fs.readFileSync(path.join(repoRoot, view), 'utf8');
        for (const link of LINKS) expect(html).toContain(link);
        expect(html.match(/rel="(?:shortcut )?icon"/g)).toHaveLength(2);
        expect(html.match(/rel="apple-touch-icon"/g)).toHaveLength(1);
    });

    test('favicon.ico holds 16, 32 and 48 px images', () => {
        const ico = fs.readFileSync(path.join(iconDir, 'favicon.ico'));
        expect([ico.readUInt16LE(0), ico.readUInt16LE(2)]).toEqual([0, 1]);
        const sizes = Array.from({ length: ico.readUInt16LE(4) }, (_, i) => ico[6 + 16 * i]);
        expect(sizes).toEqual([16, 32, 48]);
    });

    test('apple-touch-icon.png is 180 px square', () => {
        const png = fs.readFileSync(path.join(iconDir, 'apple-touch-icon.png'));
        expect(png.subarray(1, 4).toString()).toBe('PNG');
        expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([180, 180]);
    });

    test('favicon.svg is a self-contained SVG', () => {
        const svg = fs.readFileSync(path.join(iconDir, 'favicon.svg'), 'utf8');
        expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 64 64">/);
        expect(svg).not.toMatch(/href=|<script|<image/);
    });

    test('the site root serves the icons browsers ask for unprompted', async () => {
        const ico = await request(app).get('/favicon.ico').expect(200);
        expect(ico.headers['content-type']).toMatch(/^image\//);
        for (const url of ['/apple-touch-icon.png', '/apple-touch-icon-precomposed.png']) {
            const png = await request(app).get(url).expect(200);
            expect(png.headers['content-type']).toBe('image/png');
        }
        await request(app).get('/public/images/favicons/favicon.svg').expect(200)
            .expect('content-type', /image\/svg\+xml/);
    });
});
