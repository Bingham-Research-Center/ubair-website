import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import request from 'supertest';
import app from '../server.js';

// Rule since the v1.6.0 relaunch: a page that is not ready lives on a branch, not on dev behind
// a "Coming Soon" overlay. Agriculture, aviation and water were parked on 12 Nov 2026 (tag
// parked/pre-cleanup-2026-11-11, branch parked/unfinished-pages). Aviation came back in 1.6.1
// as a finished page (aviationPage.test.js); the other two stay parked.

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (file) => fs.readFileSync(path.join(repoRoot, file), 'utf8');

describe('pages parked off dev', () => {
    test.each(['/agriculture', '/water'])('%s is not served', async (url) => {
        await request(app).get(url).expect(404);
    });

    // A 2025 prototype that stayed routed on prod, unlinked, until the v1.6.5 cleanup.
    test('/test-viz is not served and its files are gone', async () => {
        await request(app).get('/test-viz').expect(404);
        for (const file of ['views/test-viz.html', 'public/js/test-viz.js', 'public/css/test-viz.css']) {
            expect(fs.existsSync(path.join(repoRoot, file))).toBe(false);
        }
    });

    // The Clyfar and weather pages carried summary panes that no upload ever filled: one said
    // "will be available soon", the other "Loading..." for good.
    test('no page waits on a summary that nothing produces', () => {
        const clyfar = read('views/forecast_air_quality.html') + read('public/js/forecast_air_quality.js');
        expect(clyfar).not.toMatch(/available soon|being prepared|llm-summaries-section|summary-card/i);
        const weather = read('views/forecast_weather.html');
        expect(weather).not.toMatch(/weather-summaries-section|Loading (plain|extended|detailed)/i);
        expect(weather).not.toMatch(/typical winter patterns/i);
    });

    test('the sidebar offers nothing that is not ready', () => {
        const sidebar = read('public/partials/sidebar.html');
        expect(sidebar).not.toMatch(/coming[- ]soon|disabled-link/i);
        expect(sidebar).not.toMatch(/href="\/(agriculture|water)"/);
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
