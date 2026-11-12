import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    COPYRIGHT_HOLDER, DEFAULT_CAVEAT, PAGE_CAVEATS, copyrightLine, footerText,
} from '../../public/js/disclaimers.js';

// #290: the disclaimer and copyright exist once, in public/js/disclaimers.js, and are shown in
// the footer only. Decided 2026-11-12: "© <year> Bingham Research Center, Utah State
// University", year computed; no sidebar disclaimer box.

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (file) => fs.readFileSync(path.join(repoRoot, file), 'utf8');
const walk = (dir) => fs.readdirSync(path.join(repoRoot, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) return e.name === '__tests__' || e.name === 'api' || e.name === 'vendor' ? [] : walk(rel);
    return /\.(html|js)$/.test(e.name) ? [rel] : [];
});

describe('disclaimers', () => {
    test('the copyright line names BRC first, then USU, with the given year', () => {
        expect(COPYRIGHT_HOLDER).toBe('Bingham Research Center, Utah State University');
        expect(copyrightLine(2031)).toBe('© 2031 Bingham Research Center, Utah State University.');
    });

    test('every sidebar page has its own caveat', () => {
        const links = [...read('public/partials/sidebar.html').matchAll(/href="(\/[^"]*)"/g)].map((m) => m[1]);
        expect(links.length).toBeGreaterThan(5);
        for (const href of links) expect(Object.keys(PAGE_CAVEATS)).toContain(href);
    });

    test('caveats stay terse', () => {
        for (const caveat of Object.values(PAGE_CAVEATS)) expect(caveat.length).toBeLessThanOrEqual(150);
    });

    test('footer text is the caveat then the copyright; unknown pages get the default', () => {
        expect(footerText('/sports', 2026)).toBe(`${PAGE_CAVEATS['/sports']} © 2026 ${COPYRIGHT_HOLDER}.`);
        expect(footerText('/sports/', 2026)).toBe(footerText('/sports', 2026));
        expect(footerText('/about', 2026)).toBe(`© 2026 ${COPYRIGHT_HOLDER}.`);
        expect(footerText('/somewhere-new', 2026)).toBe(`${DEFAULT_CAVEAT} © 2026 ${COPYRIGHT_HOLDER}.`);
    });

    test('no page, partial or script hard-codes a copyright year or its own disclaimer', () => {
        const files = [...walk('views'), ...walk('public/partials'), ...walk('public/js')]
            .filter((f) => f !== 'public/js/disclaimers.js');
        const offenders = files.filter((f) => {
            const text = read(f).replace(/(&copy;|©)\s*(<a[^>]*>)?\s*OpenStreetMap/g, '');
            return /(&copy;|©)/.test(text) || /sidebar-disclaimer|PAGE_DISCLAIMERS|class="main-footer"/.test(text);
        });
        expect(offenders).toEqual([]);
    });

    test('every page with the sidebar loads the shared footer', () => {
        const pages = walk('views').filter((f) => read(f).includes('sidebar_container'));
        expect(pages.length).toBeGreaterThan(8);
        const missing = pages.filter((f) => !read(f).includes('<script type="module" src="/public/js/loadFooter.js"></script>'));
        expect(missing).toEqual([]);
    });
});
