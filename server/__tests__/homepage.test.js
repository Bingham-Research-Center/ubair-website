import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// The homepage as redone in v1.6.2: panes with a tab marker, no decorative icons (the navbar keeps
// its own), and nothing on it that pretends to be data it does not have.

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (file) => fs.readFileSync(path.join(repoRoot, file), 'utf8');
const html = read('views/index.html');
const main = html.slice(html.indexOf('<main'), html.indexOf('</main>'));

describe('homepage', () => {
    test('carries no icons except the collapse control', () => {
        const icons = [...main.matchAll(/<i class="([^"]*)"/g)].map((m) => m[1]);
        expect(icons).toEqual(['fas fa-chevron-up']);
        expect(main).toMatch(/id="forecast-collapse"[^>]*>\s*<i class="fas fa-chevron-up">/);
    });

    test('and the only icons its scripts add are precipitation types, which are data', async () => {
        const { PRECIP_ICONS } = await import('../../public/js/homepage-lights.js');
        expect(PRECIP_ICONS).toEqual({
            snow: ['fa-snowflake'], rain: ['fa-cloud-rain'], mix: ['fa-cloud-rain', 'fa-snowflake'], dry: [],
        });
        // No other icon name appears in either homepage script.
        for (const file of ['public/js/homepage-lights.js', 'public/js/homepage-current.js']) {
            const names = new Set(read(file).match(/(?<![\w-])fa-[a-z0-9-]+/g) || []);
            expect([...names].filter((name) => !['fa-snowflake', 'fa-cloud-rain'].includes(name))).toEqual([]);
        }
    });

    test('shows no placeholder or invented content', () => {
        expect(html).not.toMatch(/coming\s+(soon|december)/i);
        expect(html).not.toMatch(/AI Summary|ai-summary/);
        expect(html).not.toMatch(/Basin conditions are stable/);
        // The Current tab used to be stuck on these; it is now filled from the KVEL observation.
        expect(main).not.toMatch(/--°F|-- mi|Visibility/);
        expect(html).toContain('/public/js/homepage-current.js');
    });

    test('the Alerts tab and its snow panel are gone, with the file nobody ever uploaded', () => {
        // The panel waited on gefs_snow_summary.json, which no producer has made. The Precip
        // tile in the status lights now answers the question from a forecast that does arrive.
        expect(html).not.toMatch(/gefs_snow_summary|alerts-snow|No significant snow|alerts-ozone-risk/);
        expect(html).not.toMatch(/dashboard-tabs|tab-button|tab-panel|headlines-dashboard\.js/);
        expect(fs.existsSync(path.join(repoRoot, 'public/js/headlines-dashboard.js'))).toBe(false);
    });

    test('shows five status tiles, each grey until its data arrives', () => {
        const tiles = [...main.matchAll(/<div class="status-light pane[^"]*" id="light-([a-z]+)"([^>]*)>/g)];
        expect(tiles.map((m) => m[1])).toEqual(['weather', 'ahead', 'ozone', 'roads', 'precip']);
        // A light has no colour in the page source: the server's rules set it, and until they
        // answer the tile is grey. Never green by default.
        for (const [, key, attributes] of tiles.slice(0, 4)) {
            expect([key, attributes.trim()]).toEqual([key, 'data-level="grey"']);
        }
        expect(main).not.toMatch(/data-level="(green|amber|red)"/);
        expect(html).toContain('/public/js/homepage-lights.js');
        expect(html).toContain('/public/css/status-lights.css');
    });

    test('each tile links to its page and can say why', () => {
        const hrefs = [...main.matchAll(/<a class="(?:status-light-line|precip-bands)"[^>]*href="([^"]+)"/g)].map((m) => m[1]);
        expect(hrefs).toEqual(['/forecast_weather', '/forecast_weather', '/forecast_outlooks', '/roads', '/forecast_weather']);
        expect(main.match(/<details class="status-light-why" hidden>/g).length).toBe(5);
    });

    test('the forecast tile carries a plain name until the server names the part of the day', () => {
        // "Tonight" or "Tomorrow morning" comes from the server's clock; the page source must
        // not guess one, and must not say "next 12 h".
        expect(main).toMatch(/id="light-ahead"[^>]*>\s*<span class="status-light-label" data-default-label="Coming up">Coming up<\/span>/);
        expect(main).not.toMatch(/Tonight|Tomorrow|next 12 h/i);
    });

    test('the LLM forecast summary sits in the right-hand column, above the air quality outlook', () => {
        const stack = main.indexOf('class="dashboard-stack"');
        const summary = main.indexOf('id="home-llm"');
        const outlook = main.indexOf('forecast-panel');
        expect(stack).toBeGreaterThan(main.indexOf('map-panel'));
        expect(summary).toBeGreaterThan(stack);
        expect(outlook).toBeGreaterThan(summary);
        // Hidden and empty in the page source: llmText.js fills it only from a current file.
        expect(main).toMatch(/<div class="llm-block pane" id="home-llm" data-llm-placement="home\.summary" hidden><\/div>/);
    });

    test('current conditions are always on show, not behind a tab', () => {
        const lights = main.indexOf('id="status-lights"');
        const conditions = main.indexOf('id="current-temp"');
        expect(lights).toBeGreaterThan(-1);
        expect(conditions).toBeGreaterThan(lights);
        expect(main.slice(lights, conditions)).not.toMatch(/<button/);
    });

    test('uses the shared pane style', () => {
        expect(main.match(/class="headline-item pane\b/g).length).toBe(3);
        expect(main.match(/class="status-light pane\b/g).length).toBe(5);
        expect(main.match(/class="dashboard-panel pane\b/g).length).toBe(2);
        expect(read('public/css/main.css')).toContain("@import url('theme/panes.css');");
        expect(fs.existsSync(path.join(repoRoot, 'public/css/theme/panes.css'))).toBe(true);
    });
});

describe('site-wide look since v1.6.2', () => {
    const tokens = read('public/css/theme/tokens.css');

    test('panes and controls have hard edges', () => {
        for (const name of ['sm', 'md', 'lg']) {
            expect(tokens).toMatch(new RegExp(`--radius-${name}:\\s*0;`));
        }
    });

    test('the UI is scaled from one token on the root', () => {
        expect(tokens).toMatch(/--root-font-size:\s*85%;/);
        expect(read('public/css/base.css')).toMatch(/html\s*\{\s*font-size:\s*var\(--root-font-size\);/);
        expect(read('public/css/sidebar.css')).toMatch(/width:\s*var\(--sidebar-width\);/);
    });
});
