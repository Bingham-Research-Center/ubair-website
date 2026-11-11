import fs from 'fs';
import path from 'path';
import { scanTree, scanCss, repoRoot, baselinePath } from '../../scripts/style-scan.mjs';

// Raw colours, radii, shadows, gradients and fonts belong in public/css/theme/tokens.css and
// nowhere else (docs/STYLE-TOKEN-GUIDE.md). Most of the site predates that rule, so this is a
// ratchet rather than a ban: each file has a ceiling per metric, recorded in
// styleRatchet.baseline.json, and may go down but never up. A file with no entry has a
// ceiling of zero, so new stylesheets start clean.
//
// Failing here means a change added a raw value. Use a token instead; add the token to
// tokens.css if it does not exist. After removing raw values, lower the ceilings with
// `node scripts/style-scan.mjs --tighten`.

const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
const current = scanTree();

describe('style ratchet', () => {
    test('no file has more raw style values than its baseline allows', () => {
        const over = [];
        for (const [file, counts] of Object.entries(current)) {
            for (const [metric, n] of Object.entries(counts)) {
                const ceiling = baseline[file]?.[metric] ?? 0;
                if (n > ceiling) over.push(`${file}: ${metric} ${n} > ${ceiling}`);
            }
        }
        expect(over).toEqual([]);
    });

    test('tokens.css is the only stylesheet under theme/ that may hold raw values', () => {
        const themed = Object.keys(current).filter((file) => file.startsWith('public/css/theme/'));
        const raw = themed.filter((file) =>
            ['color', 'radius', 'shadow', 'gradient', 'fontFamily'].some((m) => current[file][m]));
        expect(raw).toEqual([]);
    });

    test('shared theme stylesheets never use !important', () => {
        // Rules in a cascade layer lose to any page rule, which is the point: a page can
        // always override the shared look. !important inverts that order.
        const themed = Object.keys(current).filter((file) => file.startsWith('public/css/theme/'));
        expect(themed.filter((file) => current[file].important)).toEqual([]);
    });

    test('the preview-only theme switcher is not on this branch', () => {
        const previewOnly = [
            'public/css/theme/variants',
            'public/js/theme-switcher.js',
            'public/js/theme-boot.js',
        ];
        expect(previewOnly.filter((p) => fs.existsSync(path.join(repoRoot, p)))).toEqual([]);
    });
});

describe('scanCss', () => {
    test('counts raw values and ignores tokens and comments', () => {
        const counts = scanCss(`
            /* #fff in a comment */
            .a { color: #fff; background: rgba(0, 0, 0, 0.1); border-radius: 12px; }
            .b { color: var(--color-text); border-radius: var(--radius-md); box-shadow: none; }
            .c:hover { transform: translateY(-4px); box-shadow: 0 2px 8px black !important; }
            .d { font-family: Arial; background: linear-gradient(#000, #111); }
        `);
        expect(counts).toMatchObject({
            color: 4, radius: 1, shadow: 1, gradient: 1, important: 1, hoverMotion: 1, fontFamily: 1,
        });
    });
});
