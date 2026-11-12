import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import request from 'supertest';
import app from '../server.js';

// Rule since the v1.6.0 relaunch: a page that is not ready lives on a branch, not on dev behind
// a "Coming Soon" overlay. Agriculture, aviation and water were parked on 12 Nov 2026 (tag
// parked/pre-cleanup-2026-11-11, branch parked/unfinished-pages).

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (file) => fs.readFileSync(path.join(repoRoot, file), 'utf8');

describe('pages parked off dev', () => {
    test.each(['/agriculture', '/aviation', '/water'])('%s is not served', async (url) => {
        await request(app).get(url).expect(404);
    });

    test('the sidebar offers nothing that is not ready', () => {
        const sidebar = read('public/partials/sidebar.html');
        expect(sidebar).not.toMatch(/coming[- ]soon|disabled-link/i);
        expect(sidebar).not.toMatch(/href="\/(agriculture|aviation|water)"/);
        expect(sidebar).toContain('href="https://jrl.ac/team"');
    });

    test('no page or stylesheet carries a coming-soon overlay', () => {
        const files = [
            ...fs.readdirSync(path.join(repoRoot, 'views')).filter((f) => f.endsWith('.html')).map((f) => `views/${f}`),
            ...fs.readdirSync(path.join(repoRoot, 'public/css')).filter((f) => f.endsWith('.css')).map((f) => `public/css/${f}`),
        ];
        expect(files.filter((file) => /coming-soon/.test(read(file)))).toEqual([]);
    });
});
