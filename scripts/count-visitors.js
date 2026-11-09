#!/usr/bin/env node
/**
 * Recount unique visitors from the analytics access logs, per UTC day (issue #340).
 *
 * The live server keeps the same counts (GET /api/analytics/visitors). This script exists for
 * when a definition changes: it re-runs the current rules from server/middleware/visitorCounts.js
 * over old log lines. By default the bot and probe flags are re-derived from the logged raw
 * User-Agent, path and method, so a better bot pattern applies retroactively; --as-logged uses
 * the flags as they were logged instead.
 *
 * Only lines written since #340 carry the ids it needs; older lines are skipped and counted.
 *
 *   node scripts/count-visitors.js                      # logs/analytics/access*.log
 *   node scripts/count-visitors.js --json FILE...       # one JSON object per day
 *   node scripts/count-visitors.js --as-logged
 */

import { createReadStream, readdirSync } from 'fs';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';
import {
    DEFINITIONS_VERSION, TIERS, VisitorTally, classifyRequest,
} from '../server/middleware/visitorCounts.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DIR = path.join(__dirname, '../logs/analytics');

/** Fold one parsed access-log line into the per-day tallies. Exported for tests. */
export function addLine(tallies, e, { asLogged = false } = {}) {
    if (!e || typeof e.timestamp !== 'string' || !('visitor_ua_id' in e)) return false;
    const date = e.timestamp.slice(0, 10);
    if (!tallies.has(date)) tallies.set(date, new VisitorTally());
    const tally = tallies.get(date);

    const ids = e.visitor_ua_id
        ? { address: e.visitor_id, network: e.network_id, addressUa: e.visitor_ua_id }
        : null;

    if (e.type === 'engagement') {
        tally.addBeacon(ids);
        return true;
    }

    const derived = classifyRequest({ userAgent: e.ua_raw, method: e.method, path: e.path, status: e.status });
    tally.addRequest(ids, {
        declaredBot: asLogged ? e.declared_bot === true : derived.declaredBot,
        probe: asLogged ? e.probe === true : derived.probe,
        // Content-Type is not logged, so the page flag is always taken as logged.
        page: e.page === true,
        miss: derived.miss,
    });
    return true;
}

function printTable(date, c) {
    const pct = c.clientAddress.unresolvedShare == null ? 'n/a' : `${(c.clientAddress.unresolvedShare * 100).toFixed(1)}%`;
    console.log(`\n${date}  (definitions v${DEFINITIONS_VERSION}; ${c.clientAddress.requests} requests, ${pct} with no resolvable address)`);
    console.log(`  ${'tier'.padEnd(18)}${'network'.padStart(9)}${'address'.padStart(9)}${'addr+UA'.padStart(9)}${'page views'.padStart(12)}`);
    for (const { key } of TIERS) {
        const u = c.uniqueVisitors[key];
        console.log(`  ${key.padEnd(18)}${String(u.network).padStart(9)}${String(u.address).padStart(9)}` +
            `${String(u.address_ua).padStart(9)}${String(c.pageViews[key]).padStart(12)}`);
    }
    const s = c.addressSharing;
    console.log(`  page-viewer addresses with several browsers: ${s.withSeveralUserAgents} of ${s.pageViewerAddresses} (most at one: ${s.mostUserAgentsAtOneAddress})`);
}

async function main(argv) {
    const json = argv.includes('--json');
    const asLogged = argv.includes('--as-logged');
    let files = argv.filter(a => !a.startsWith('--'));
    if (files.length === 0) {
        files = readdirSync(DEFAULT_DIR)
            .filter(f => /^access.*\.log$/.test(f))
            .map(f => path.join(DEFAULT_DIR, f));
    }

    const tallies = new Map();
    let used = 0;
    let skipped = 0;
    for (const file of files) {
        const rl = readline.createInterface({ input: createReadStream(file), crlfDelay: Infinity });
        for await (const line of rl) {
            let e;
            try { e = JSON.parse(line); } catch { skipped++; continue; }
            if (addLine(tallies, e, { asLogged })) used++; else skipped++;
        }
    }

    const dates = [...tallies.keys()].sort();
    for (const date of dates) {
        const c = tallies.get(date).counts();
        if (json) console.log(JSON.stringify({ date, definitionsVersion: DEFINITIONS_VERSION, ...c }));
        else printTable(date, c);
    }
    if (!json) console.log(`\n${used} lines counted, ${skipped} skipped (written before #340, or unparseable).`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main(process.argv.slice(2)).catch(err => {
        console.error(err.message);
        process.exit(1);
    });
}
