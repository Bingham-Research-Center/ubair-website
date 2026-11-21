#!/usr/bin/env node
// Write SAMPLE llm_forecast files, stamped "just issued", into a preview's llm_forecasts folder
// so the LLM text blocks can be looked at before any real text exists.
//
//   node scripts/preview-llm-samples.mjs /srv/ubair-website-preview-theme/public/api/static/llm_forecasts
//
// The text is the test fixtures', and every piece of it begins "SAMPLE TEXT, NOT A FORECAST."
// This script refuses to write anywhere inside the live dev or prod checkouts, or through a
// link that leads there: sample text must never reach a real site.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { llmForecastFilename, validateLlmForecast } from '../public/js/llmForecast.js';

const LIVE_ROOTS = ['/srv/ubair-website/', '/var/www/ubair-website/'];
const out = process.argv[2];
if (!out) {
    console.error('usage: node scripts/preview-llm-samples.mjs <a preview\'s public/api/static/llm_forecasts folder>');
    process.exit(2);
}

// Check before creating anything: follow the path up to the first folder that exists, resolve
// any links, and see where it really leads.
let existing = path.resolve(out);
while (!fs.existsSync(existing)) existing = path.dirname(existing);
const real = `${path.join(fs.realpathSync(existing), path.relative(existing, path.resolve(out)))}/`;
if (LIVE_ROOTS.some((root) => real.startsWith(root))) {
    console.error(`Refusing: ${real} is inside a live checkout. Sample text is for previews only.`);
    process.exit(1);
}
fs.mkdirSync(out, { recursive: true });

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), '../public/js/__tests__/fixtures/llm_forecasts');
const iso = (ms) => new Date(ms).toISOString().replace('.000Z', 'Z');
const minute = (ms) => Math.floor(ms / 60000) * 60000;
const now = Date.now();
// The GEFS cycle a run issued now would describe: the newest 00/06/12/18Z at least 5 h old.
const gefs = Math.floor((now - 5 * 3600000) / (6 * 3600000)) * 6 * 3600000;

const plans = [
    { file: 'llm_forecast_ffion_20261203_1210Z.json', issued: minute(now - 20 * 60000), hours: 12,
        describes: { gefs: iso(gefs), hrrr: iso(Math.floor((now - 3 * 3600000) / 3600000) * 3600000), obs_through: iso(minute(now - 40 * 60000)) } },
    { file: 'llm_forecast_rhiannon_20261203_1200Z.json', issued: minute(now - 10 * 60000), hours: 6,
        describes: { obs_through: iso(minute(now - 30 * 60000)), aircraft_through: iso(minute(now - 40 * 60000)) } },
];

for (const plan of plans) {
    const doc = JSON.parse(fs.readFileSync(path.join(fixtures, plan.file), 'utf8'));
    doc.issued = iso(plan.issued);
    doc.valid_until = iso(plan.issued + plan.hours * 3600000);
    doc.describes = plan.describes;
    const name = llmForecastFilename(doc.persona, plan.issued);
    const { ok, errors } = validateLlmForecast(doc, { filename: name, now });
    if (!ok) {
        console.error(`The sample for ${doc.persona} does not meet the contract:`, errors);
        process.exit(1);
    }
    const body = `${JSON.stringify(doc, null, 2)}\n`;
    fs.writeFileSync(path.join(out, name), body);
    fs.writeFileSync(path.join(out, `latest_${doc.persona}.json`), body);
    console.log(`wrote ${name} and latest_${doc.persona}.json (sample, issued ${doc.issued})`);
}
