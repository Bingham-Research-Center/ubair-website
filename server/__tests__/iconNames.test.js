import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// One icon set, one copy. Every page takes Font Awesome from the package in node_modules
// (served at /vendor/fontawesome), and every fa-* name used must exist in that copy: a name
// from a newer release or from Font Awesome Pro renders as an empty box with no error.

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const vendoredCss = fs.readFileSync(
    path.join(repoRoot, 'node_modules/@fortawesome/fontawesome-free/css/all.css'), 'utf8');
const known = new Set(vendoredCss.match(/\.fa-[a-z0-9]+(?:-[a-z0-9]+)*/g).map((c) => c.slice(1)));

function walk(dir, ext) {
    return fs.readdirSync(path.join(repoRoot, dir), { withFileTypes: true }).flatMap((entry) => {
        const rel = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            return entry.name === '__tests__' ? [] : walk(rel, ext);
        }
        return entry.name.endsWith(ext) ? [rel] : [];
    });
}

const views = walk('views', '.html');
const sources = [...views, ...walk('public/partials', '.html'), ...walk('public/js', '.js')];

describe('Font Awesome', () => {
    test('the vendored copy is installed', () => {
        expect(known.size).toBeGreaterThan(1000);
    });

    test.each(views)('%s does not load Font Awesome from a CDN', (file) => {
        const html = fs.readFileSync(path.join(repoRoot, file), 'utf8');
        expect(html).not.toMatch(/https?:\/\/[^"']*font-?awesome/i);
    });

    test.each(views)('%s loads the vendored copy if it uses icons', (file) => {
        const html = fs.readFileSync(path.join(repoRoot, file), 'utf8');
        const usesIcons = /class="[^"]*\bfa[srb]?\b/.test(html) || html.includes('loadSidebar.js');
        if (usesIcons) {
            expect(html).toContain('/vendor/fontawesome/css/all.min.css');
        }
    });

    test('every fa-* name in views and scripts exists in the vendored copy', () => {
        const unknown = [];
        for (const file of sources) {
            const lines = fs.readFileSync(path.join(repoRoot, file), 'utf8').split('\n');
            lines.forEach((line, index) => {
                // Skip names assembled at runtime: `fa-${x}` and 'fa-prefix-' + x.
                const pattern = /(?<![\w-])fa-[a-z0-9]+(?:-[a-z0-9]+)*(?![\w$-])/g;
                for (const match of line.matchAll(pattern)) {
                    if (!known.has(match[0])) {
                        unknown.push(`${file}:${index + 1} ${match[0]}`);
                    }
                }
            });
        }
        expect(unknown).toEqual([]);
    });
});
