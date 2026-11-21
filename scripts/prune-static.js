#!/usr/bin/env node
/**
 * prune-static.js: say which uploaded files are past their keep window, and with --apply
 * remove them (issue #168; cut R4 in docs/NWP-PRODUCER-HANDOFF-nov20.md).
 *
 *   node scripts/prune-static.js                 dry run: lists what would go, deletes nothing
 *   node scripts/prune-static.js --only forecasts
 *   node scripts/prune-static.js --days 14       what if every window were 14 days? (dry run only)
 *   node scripts/prune-static.js --json          the plan as JSON
 *   node scripts/prune-static.js --apply         remove the files the dry run lists
 *
 * Nothing prunes the upload directories today: on 2026-11-21 .dev held 5.6 GB in 129,000 files
 * and .com 99,000 observation files, back to April.
 *
 * What it never removes, whatever the window:
 *   - the newest file of each product (a product is a family of files that differ only in
 *     their time stamp), so a product that has stopped keeps its last file;
 *   - a file with no time stamp in its name, an index or list, or a `latest*.json` copy;
 *   - a file git tracks (the sample files under public/api/static), so the checkout stays clean;
 *   - anything outside the nine upload directories.
 *
 * A file's age is the time stamp in its name, not its mtime: a restore or a copy changes the
 * mtime, never the name.
 *
 * The windows are RULES below. They are the policy, so they change by pull request: --days is
 * for asking "what if" and is refused together with --apply.
 */

import { execFileSync } from 'child_process';
import { promises as fsp } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// The nine dataTypes of server/uploadPolicy.js. Listed here so the script runs with nothing
// but Node, and tested against that list.
export const DATA_TYPES = Object.freeze([
    'observations', 'metadata', 'outlooks', 'llm_outlooks', 'images',
    'forecasts', 'road-forecast', 'llm_forecasts', 'aircraft',
]);

const CLYFAR_WHY = 'the air-quality forecast page offers every Clyfar run on disk; shortening this shortens that list';

/**
 * Keep windows, in days. The first rule that matches a file decides; `days: null` keeps for
 * ever. 30 days for observations, road forecasts and HRRR forecasts is cut R4, agreed by JRL
 * on 2026-11-20. Everything Clyfar sends is kept until he chooses a window for it (#168).
 */
export const RULES = Object.freeze([
    { dataType: 'observations', match: /^map_obs_/, days: 30, why: 'pages read the newest file; the forecast-against-measured chart reads 24 h' },
    { dataType: 'metadata', match: /^map_obs_meta_/, days: 30, why: 'pages read the newest file' },
    { dataType: 'road-forecast', match: /^road_forecast_/, days: 30, why: 'pages read latest.json' },
    { dataType: 'forecasts', match: /^forecast_(hrrr|rrfs)_/, days: 30, why: 'pages read the newest run of each, or the three in the index' },
    { dataType: 'forecasts', match: /./, days: null, why: CLYFAR_WHY },
    { dataType: 'images', match: /./, days: null, why: CLYFAR_WHY },
    { dataType: 'outlooks', match: /./, days: null, why: 'written by a person; the outlooks page lists them all' },
    { dataType: 'llm_outlooks', match: /./, days: null, why: 'the newest is linked even when it is from last season' },
    { dataType: 'llm_forecasts', match: /./, days: null, why: 'not flowing yet: choose a window when it is' },
    { dataType: 'aircraft', match: /./, days: null, why: 'not flowing yet: choose a window when it is' },
]);

// 20261121_0755Z, 20261120-1800, 20261112_0337: every stamp a producer uses.
const STAMP_RE = /(\d{4})(\d{2})(\d{2})[_-](\d{2})(\d{2})Z?/;

/** `{ product, timeMs }` for a file name, or null when it carries no time stamp. */
export function stampOf(filename) {
    const match = STAMP_RE.exec(filename);
    if (!match) return null;
    const [, year, month, day, hour, minute] = match.map(Number);
    const timeMs = Date.UTC(year, month - 1, day, hour, minute);
    if (!Number.isFinite(timeMs)) return null;
    return {
        product: `${filename.slice(0, match.index)}*${filename.slice(match.index + match[0].length)}`,
        timeMs,
    };
}

/** Indexes, lists and the server's own copies are never data to prune. */
export function isNeverPruned(filename) {
    return filename.startsWith('.')
        || /_(index|list)\.json$/.test(filename)
        || /^latest(_[a-z0-9]+)?\.json$/.test(filename)
        || filename === 'filelist.json';
}

export function ruleFor(dataType, filename, rules = RULES) {
    return rules.find((rule) => rule.dataType === dataType && rule.match.test(filename)) ?? null;
}

async function inBatches(items, size, fn) {
    for (let i = 0; i < items.length; i += size) {
        await Promise.all(items.slice(i, i + size).map(fn));
    }
}

/**
 * Work out what would be removed. Reads directories and stats the candidates; removes nothing.
 *
 * @param staticRoot     public/api/static
 * @param now            ms
 * @param only           one dataType, or null for all
 * @param overrideDays   if set, every rule's window (keep-for-ever ones included): "what if"
 * @param protectedFiles Set of `<dataType>/<filename>` never to remove (the files git tracks)
 * @returns `{ products: [{ dataType, product, days, why, files, remove: [{ name, bytes }], removeBytes, oldestKept, newest }] }`
 */
export async function planPrune({ staticRoot, now = Date.now(), only = null, overrideDays = null, protectedFiles = new Set(), rules = RULES }) {
    const products = [];
    for (const dataType of DATA_TYPES) {
        if (only && only !== dataType) continue;
        const dir = path.join(staticRoot, dataType);
        let names;
        try {
            names = await fsp.readdir(dir);
        } catch (error) {
            if (error.code === 'ENOENT') continue;
            throw error;
        }

        const byProduct = new Map();
        for (const name of names) {
            if (isNeverPruned(name)) continue;
            const stamp = stampOf(name);
            const rule = ruleFor(dataType, name, rules);
            if (!stamp || !rule) continue;
            const key = `${rule.days}|${stamp.product}`;
            if (!byProduct.has(key)) byProduct.set(key, { dataType, product: stamp.product, rule, files: [] });
            byProduct.get(key).files.push({ name, timeMs: stamp.timeMs });
        }

        for (const { product, rule, files } of byProduct.values()) {
            files.sort((a, b) => a.timeMs - b.timeMs || a.name.localeCompare(b.name));
            const newest = files.at(-1);
            const days = overrideDays ?? rule.days;
            const cutoff = days === null ? -Infinity : now - days * 24 * 60 * 60 * 1000;
            const remove = files.filter((file) => file.timeMs < cutoff
                && file !== newest
                && !protectedFiles.has(`${dataType}/${file.name}`));
            await inBatches(remove, 64, async (file) => {
                try {
                    file.bytes = (await fsp.stat(path.join(dir, file.name))).size;
                } catch {
                    file.bytes = 0; // gone already
                }
            });
            const removed = new Set(remove);
            const oldestKept = files.find((file) => !removed.has(file));
            products.push({
                dataType,
                product,
                days,
                why: rule.why,
                files: files.length,
                remove: remove.map(({ name, bytes }) => ({ name, bytes })),
                removeBytes: remove.reduce((sum, file) => sum + file.bytes, 0),
                oldestKept: oldestKept ? new Date(oldestKept.timeMs).toISOString() : null,
                newest: new Date(newest.timeMs).toISOString(),
            });
        }
    }
    products.sort((a, b) => a.dataType.localeCompare(b.dataType) || a.product.localeCompare(b.product));
    return { products };
}

/** Remove what a plan lists. `{ removed, bytes, failed: [{ file, message }] }`. */
export async function applyPlan(plan, staticRoot) {
    const result = { removed: 0, bytes: 0, failed: [] };
    for (const product of plan.products) {
        await inBatches(product.remove, 32, async ({ name, bytes }) => {
            try {
                await fsp.unlink(path.join(staticRoot, product.dataType, name));
                result.removed += 1;
                result.bytes += bytes;
            } catch (error) {
                if (error.code !== 'ENOENT') result.failed.push({ file: `${product.dataType}/${name}`, message: error.message });
            }
        });
    }
    return result;
}

/** The files git tracks under public/api/static, as `<dataType>/<filename>`; null if git cannot say. */
export function trackedFiles(repoRoot) {
    try {
        const out = execFileSync('git', ['-C', repoRoot, 'ls-files', '-z', 'public/api/static'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
        return new Set(out.split('\0').filter(Boolean).map((file) => file.replace(/^public\/api\/static\//, '')));
    } catch {
        return null;
    }
}

const megabytes = (bytes) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

// Member and run numbers folded, so 31 ensemble members print as one line.
function folded(products) {
    const rows = new Map();
    for (const p of products) {
        const key = `${p.dataType}|${p.days}|${p.product.replace(/\d{3,}/g, '#')}`;
        const row = rows.get(key) ?? { dataType: p.dataType, product: p.product.replace(/\d{3,}/g, '#'), days: p.days, files: 0, remove: 0, removeBytes: 0, oldestKept: null };
        row.files += p.files;
        row.remove += p.remove.length;
        row.removeBytes += p.removeBytes;
        if (p.oldestKept && (!row.oldestKept || p.oldestKept < row.oldestKept)) row.oldestKept = p.oldestKept;
        rows.set(key, row);
    }
    return [...rows.values()];
}

export function report(plan) {
    const lines = [];
    const rows = folded(plan.products);
    const width = Math.max(10, ...rows.map((row) => row.product.length));
    lines.push(`${'dataType'.padEnd(14)} ${'product'.padEnd(width)} ${'keep'.padStart(8)} ${'files'.padStart(7)} ${'remove'.padStart(7)} ${'frees'.padStart(10)}  oldest kept`);
    for (const row of rows) {
        lines.push(`${row.dataType.padEnd(14)} ${row.product.padEnd(width)} ${(row.days === null ? 'for ever' : `${row.days} d`).padStart(8)} `
            + `${String(row.files).padStart(7)} ${String(row.remove).padStart(7)} ${megabytes(row.removeBytes).padStart(10)}  ${row.oldestKept ? row.oldestKept.slice(0, 10) : '-'}`);
    }
    const total = rows.reduce((sum, row) => ({ files: sum.files + row.files, remove: sum.remove + row.remove, bytes: sum.bytes + row.removeBytes }), { files: 0, remove: 0, bytes: 0 });
    lines.push(`${'total'.padEnd(14)} ${''.padEnd(width)} ${''.padStart(8)} ${String(total.files).padStart(7)} ${String(total.remove).padStart(7)} ${megabytes(total.bytes).padStart(10)}`);
    return lines.join('\n');
}

export function parseArgs(argv) {
    const args = { apply: false, json: false, only: null, days: null, root: null };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--apply') args.apply = true;
        else if (arg === '--dry-run') args.apply = false;
        else if (arg === '--json') args.json = true;
        else if (arg === '--only') args.only = argv[++i];
        else if (arg === '--days') args.days = Number(argv[++i]);
        else if (arg === '--root') args.root = argv[++i];
        else throw new Error(`Unknown argument: ${arg}`);
    }
    if (args.only !== null && !DATA_TYPES.includes(args.only)) throw new Error(`--only takes one of: ${DATA_TYPES.join(', ')}`);
    if (args.days !== null && !(Number.isFinite(args.days) && args.days >= 1)) throw new Error('--days takes a number of days, 1 or more');
    if (args.days !== null && args.apply) throw new Error('--days is for asking "what if" and cannot be combined with --apply: the windows are RULES in this script');
    return args;
}

async function main(argv) {
    const args = parseArgs(argv);
    const repoRoot = path.resolve(args.root ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
    const staticRoot = path.join(repoRoot, 'public', 'api', 'static');
    await fsp.access(staticRoot);

    const tracked = trackedFiles(repoRoot);
    if (tracked === null && args.apply) {
        throw new Error(`git could not list the tracked files under ${staticRoot}; refusing to remove anything`);
    }
    const plan = await planPrune({ staticRoot, only: args.only, overrideDays: args.days, protectedFiles: tracked ?? new Set() });

    if (args.json) {
        console.log(JSON.stringify(plan, null, 2));
    } else {
        console.log(`${args.apply ? 'Removing from' : 'Dry run on'} ${staticRoot}${args.days !== null ? ` (what if every window were ${args.days} days)` : ''}`);
        console.log(report(plan));
    }
    if (!args.apply) {
        if (!args.json) console.log('\nNothing was removed. Run again with --apply to remove the files counted above.');
        return;
    }
    const result = await applyPlan(plan, staticRoot);
    console.log(`\nRemoved ${result.removed} files, ${megabytes(result.bytes)}.`);
    for (const failure of result.failed) console.error(`could not remove ${failure.file}: ${failure.message}`);
    if (result.failed.length > 0) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main(process.argv.slice(2)).catch((error) => {
        console.error(error.message);
        process.exit(1);
    });
}
