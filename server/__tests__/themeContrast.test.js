import fs from 'fs';
import path from 'path';
import { repoRoot } from '../../scripts/style-scan.mjs';

// Text tokens must stay readable on the surfaces they are used on, in light and in dark.
// WCAG AA for body text is a contrast ratio of 4.5:1. This reads tokens.css directly, so a
// retheme that breaks contrast fails here rather than in someone's eyes.

const css = fs.readFileSync(path.join(repoRoot, 'public/css/theme/tokens.css'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '');

function block(selector) {
    const start = css.indexOf(selector + ' {');
    if (start < 0) throw new Error(`no ${selector} block in tokens.css`);
    const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
    return Object.fromEntries([...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}

const light = block(':root');
const dark = { ...light, ...block('html[data-mode="dark"]') };

function resolve(tokens, name, depth = 0) {
    const value = tokens[name];
    if (value === undefined) throw new Error(`token ${name} is not defined`);
    if (depth > 10) throw new Error(`token ${name} refers to itself`);
    const ref = value.match(/^var\((--[\w-]+)\)$/);
    return ref ? resolve(tokens, ref[1], depth + 1) : value;
}

function luminance(hex) {
    const h = hex.replace('#', '');
    const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255)
        .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
}

const PAIRS = [
    ['--color-text', '--color-bg'],
    ['--color-text', '--color-surface'],
    ['--color-text-muted', '--color-bg'],
    ['--color-text-muted', '--color-surface'],
    ['--color-link', '--color-surface'],
    ['--color-on-brand', '--color-brand'],
    ['--color-on-brand-muted', '--color-brand'],
    ['--color-on-accent', '--color-accent'],
];

describe.each([['light', light], ['dark', dark]])('%s theme contrast', (_name, tokens) => {
    test.each(PAIRS)('%s on %s is at least 4.5:1', (fg, bg) => {
        const ratio = contrast(resolve(tokens, fg), resolve(tokens, bg));
        expect(Number(ratio.toFixed(2))).toBeGreaterThanOrEqual(4.5);
    });
});

describe('token tiers', () => {
    test('every var() in tokens.css points at a token defined there', () => {
        const names = new Set([...Object.keys(light), ...Object.keys(dark)]);
        const missing = [...css.matchAll(/var\((--[\w-]+)\)/g)].map((m) => m[1]).filter((n) => !names.has(n));
        expect(missing).toEqual([]);
    });

    test('confidence colours match docs/CONFIDENCE_TAXONOMY.md exactly', () => {
        expect([light['--confidence-possible'], light['--confidence-likely'], light['--confidence-confirmed']])
            .toEqual(['#6c757d', '#ffc107', '#28a745']);
    });

    test('fire-restriction stages keep their own colours, whatever the theme', () => {
        // The first cut of the Ink + Teal look painted Stage 1 teal and Stage 2 near-black,
        // because the pills borrowed the page's decorative palette (#351 review).
        expect(['--restriction-stage-1', '--restriction-stage-2', '--restriction-stage-3',
            '--restriction-prevention'].map((name) => resolve(light, name)))
            .toEqual(['#ff8c00', '#ff4500', '#dc2626', '#b22222']);
        const fire = fs.readFileSync(path.join(repoRoot, 'public/css/fire.css'), 'utf8');
        const pills = fire.match(/\.restriction-type-pill\[data-type\^="(?:stage|prevention)[^\n]*/g);
        expect(pills).toHaveLength(4);
        for (const rule of pills) expect(rule).toMatch(/var\(--restriction-/);
    });

    test('the legacy --usu-* shim follows the theme', () => {
        // Hundreds of rules still say var(--usu-blue). They must move with the anchor and
        // accent in tokens.css, not hold the colours the site shipped with before the theme.
        const shim = fs.readFileSync(path.join(repoRoot, 'public/css/variables.css'), 'utf8');
        const all = { ...light, ...Object.fromEntries(
            [...shim.matchAll(/(--usu-[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()])) };
        const follows = {
            '--usu-blue': '--anchor-900', '--usu-light-blue': '--anchor-600', '--usu-red': '--accent-600',
        };
        for (const [name, token] of Object.entries(follows)) {
            expect([name, resolve(all, name)]).toEqual([name, resolve(all, token)]);
        }
        const neutral = { '--usu-accent': '#8b9299', '--usu-gray': '#a7a9ac', '--usu-light-gray': '#e6e7e8' };
        for (const [name, value] of Object.entries(neutral)) {
            expect([name, resolve(all, name)]).toEqual([name, value]);
        }
    });
});
