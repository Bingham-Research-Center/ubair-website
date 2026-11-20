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

    test('shows no placeholder or invented content', () => {
        expect(html).not.toMatch(/coming\s+(soon|december)/i);
        expect(html).not.toMatch(/AI Summary|ai-summary/);
        expect(html).not.toMatch(/Basin conditions are stable/);
        // The Current tab used to be stuck on these; it is now filled from the KVEL observation.
        expect(main).not.toMatch(/--°F|-- mi|Visibility/);
        expect(html).toContain('/public/js/homepage-current.js');
    });

    test('keeps the snow panel hidden until a real summary loads', () => {
        expect(main).toMatch(/id="alerts-snow"[^>]*\bhidden\b/);
        // No fallback that turns a failed fetch into an all-clear.
        const loader = html.slice(html.indexOf('async function loadAlertsSnowForecast'));
        const catchBlock = loader.slice(loader.indexOf('catch (err)'), loader.indexOf('}', loader.indexOf('catch (err)')));
        expect(catchBlock).not.toMatch(/No significant snow/);
    });

    test('uses the shared pane style', () => {
        expect(main.match(/class="headline-item pane\b/g).length).toBeGreaterThanOrEqual(5);
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
