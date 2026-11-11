#!/usr/bin/env node
// Counts raw style values per file, for the style ratchet (docs/STYLE-TOKEN-GUIDE.md).
//
//   node scripts/style-scan.mjs             print counts for this checkout as JSON
//   node scripts/style-scan.mjs --tighten   lower baseline ceilings to the current counts
//   node scripts/style-scan.mjs --root DIR  scan another checkout (to budget for an open branch)
//
// The baseline is a ceiling per file and metric. server/__tests__/styleRatchet.test.js fails
// when a count rises above it, so raw values can be removed but not added. --tighten only ever
// lowers a ceiling, and leaves entries for files this checkout does not have (they budget for
// branches still open). Raising a ceiling means editing the JSON by hand, where review sees it.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(here, '..');
export const baselinePath = path.join(repoRoot, 'server/__tests__/styleRatchet.baseline.json');

// The only places raw values are allowed.
const TOKEN_FILES = [/^public\/css\/theme\/tokens\.css$/, /^public\/css\/theme\/variants\//];

const HEX = /(?<![&\w])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g;

function count(text, pattern) {
    return (text.match(pattern) || []).length;
}

function declarations(css, property) {
    const pattern = new RegExp(`(?<![\\w-])${property}\\s*:\\s*([^;}]+)`, 'g');
    return [...css.matchAll(pattern)].map((match) => match[1].trim());
}

export function scanCss(source) {
    const css = source.replace(/\/\*[\s\S]*?\*\//g, '');
    const raw = (value) => !value.includes('var(');
    const hoverMotion = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(([, selector, body]) =>
        selector.includes(':hover') && /transform\s*:[^;]*(translate|scale)/.test(body)).length;
    return {
        color: count(css, HEX) + count(css, /\b(?:rgba?|hsla?)\(/g),
        radius: declarations(css, 'border(?:-[a-z]+){0,2}-radius')
            .filter((v) => raw(v) && !/^(0|50%|inherit|initial|unset)$/.test(v)).length,
        shadow: declarations(css, 'box-shadow').filter((v) => raw(v) && v !== 'none').length,
        gradient: count(css, /gradient\(/g),
        important: count(css, /!important/g),
        hoverMotion,
        fontFamily: declarations(css, 'font-family').filter((v) => raw(v) && v !== 'inherit').length,
        rootBlock: count(css, /:root\b/g),
        legacyVar: count(css, /var\(--usu-/g),
    };
}

export function scanJs(source) {
    return {
        color: count(source, HEX),
        inlineStyle: count(source, /style=["'`\\]/g),
    };
}

function walk(root, dir, ext, out = []) {
    const absolute = path.join(root, dir);
    if (!fs.existsSync(absolute)) return out;
    for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
        const rel = path.posix.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name !== '__tests__') walk(root, rel, ext, out);
        } else if (entry.name.endsWith(ext) && !entry.name.endsWith('.min' + ext)) {
            out.push(rel);
        }
    }
    return out;
}

export function scanTree(root = repoRoot) {
    const result = {};
    const add = (file, counts) => {
        if (TOKEN_FILES.some((pattern) => pattern.test(file))) return;
        const nonZero = Object.fromEntries(Object.entries(counts).filter(([, n]) => n > 0));
        if (Object.keys(nonZero).length) result[file] = nonZero;
    };
    for (const file of walk(root, 'public/css', '.css')) {
        add(file, scanCss(fs.readFileSync(path.join(root, file), 'utf8')));
    }
    for (const file of walk(root, 'public/js', '.js')) {
        add(file, scanJs(fs.readFileSync(path.join(root, file), 'utf8')));
    }
    return result;
}

// One file per line, so two branches that each lower a different file do not conflict.
export function formatBaseline(baseline) {
    const lines = Object.keys(baseline).sort()
        .map((file) => `  ${JSON.stringify(file)}: ${JSON.stringify(baseline[file])}`);
    return `{\n${lines.join(',\n')}\n}\n`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const args = process.argv.slice(2);
    const rootFlag = args.indexOf('--root');
    const counts = scanTree(rootFlag >= 0 ? path.resolve(args[rootFlag + 1]) : repoRoot);
    if (args.includes('--tighten')) {
        const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
        let lowered = 0;
        for (const [file, ceilings] of Object.entries(baseline)) {
            const absolute = path.join(repoRoot, file);
            if (!fs.existsSync(absolute)) continue;
            for (const [metric, ceiling] of Object.entries(ceilings)) {
                const now = counts[file]?.[metric] ?? 0;
                if (now < ceiling) {
                    lowered += 1;
                    if (now === 0) delete ceilings[metric]; else ceilings[metric] = now;
                }
            }
            if (Object.keys(ceilings).length === 0) delete baseline[file];
        }
        fs.writeFileSync(baselinePath, formatBaseline(baseline));
        console.log(`Lowered ${lowered} ceilings in ${path.relative(repoRoot, baselinePath)}`);
    } else {
        process.stdout.write(formatBaseline(counts));
    }
}
