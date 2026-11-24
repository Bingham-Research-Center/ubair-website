// The contract for LLM forecast text ("llm_forecast/1"), shared by the upload route, which
// refuses a file that breaks it, and by the pages that render the text.
//
// A producer (brc-tools on CHPC) writes one JSON file per run per persona and uploads it to
// the llm_forecasts dataType. The site only renders: it holds no LLM key and never edits,
// shortens or completes the text. Each block of text belongs to a placement (where it goes on
// the site) and a tier (who it is written for). The full description, with an example file, is
// DATA_MANIFEST.json dataTypes.llm_forecasts and docs/WEBSITE-BRCTOOLS-CONTRACT.md §5d.
//
// Pure functions and constants only; importing this module has no side effects.

export const LLM_FORECAST_SCHEMA = 'llm_forecast/1';

// Reader tiers, in tab order. Every block opens on the first.
export const TIERS = Object.freeze(['public', 'industry', 'expert']);

// The two writers. The names stay in producer code, filenames and logs; the site's readers see
// "LLM forecast". cadenceHours is how often each runs; a block is hidden once its text is
// older than staleHours (two missed runs).
export const PERSONAS = Object.freeze({
    ffion: Object.freeze({ cadenceHours: 6, staleHours: 12 }),
    rhiannon: Object.freeze({ cadenceHours: 3, staleHours: 6 }),
});

// Where text goes, who writes each tier, and the word budget the producer writes to.
// Rhiannon writes for forecasters only, so she never appears under a public or industry tier.
const placement = (where, tiers) => Object.freeze({
    where,
    tiers: Object.freeze(Object.fromEntries(
        Object.entries(tiers).map(([tier, [persona, words]]) => [tier, Object.freeze({ persona, words })])
    )),
});

export const PLACEMENTS = Object.freeze({
    'home.summary': placement('Homepage, LLM forecast panel', {
        public: ['ffion', 35], industry: ['ffion', 60], expert: ['ffion', 60],
    }),
    'weather.discussion': placement('Top of /forecast_weather', {
        public: ['ffion', 40], industry: ['ffion', 150], expert: ['ffion', 400],
    }),
    'clyfar.summary': placement('Clyfar page, in ozone season', {
        public: ['ffion', 35], industry: ['ffion', 90], expert: ['ffion', 120],
    }),
    'aviation.summary': placement('Aviation page, beside the KVEL runway winds', {
        public: ['ffion', 35], industry: ['ffion', 90], expert: ['rhiannon', 120],
    }),
    'outlook.model_guidance': placement('AI technical discussion under an ozone outlook', {
        expert: ['ffion', 150],
    }),
    'outlook.observed_trends': placement('AI technical discussion under an ozone outlook', {
        expert: ['rhiannon', 150],
    }),
});

// The budgets are targets, not exact counts. A text more than half as long again as its budget
// is refused at upload: the site never truncates, so an overlong text would break its panel.
export const BUDGET_TOLERANCE = 1.5;

export function wordLimit(words) {
    return Math.ceil(words * BUDGET_TOLERANCE);
}

export function wordCount(text) {
    return typeof text === 'string' ? (text.trim().match(/\S+/g) || []).length : 0;
}

// A producer's clock may run a little ahead of the server's.
const FUTURE_SLACK_MS = 15 * 60 * 1000;
const MAX_SOURCES = 30;
const MAX_LINE_CHARS = 200;

const ISO_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?Z$/;
export const LLM_FORECAST_FILE_RE = /^llm_forecast_([a-z]+)_(\d{8})_(\d{4})Z\.json$/;

/** Milliseconds for "2026-12-03T12:10:00Z" or "2026-12-03T12:10Z"; null for anything else. */
export function parseUtc(value) {
    if (typeof value !== 'string' || !ISO_UTC_RE.test(value)) return null;
    const ms = Date.parse(value.length === 17 ? value.replace('Z', ':00Z') : value);
    return Number.isFinite(ms) ? ms : null;
}

/** "20261203_1210Z", the stamp a file issued at this instant carries in its name. */
export function fileStamp(ms) {
    const iso = new Date(ms).toISOString();
    return `${iso.slice(0, 10).replace(/-/g, '')}_${iso.slice(11, 16).replace(':', '')}Z`;
}

export function llmForecastFilename(persona, issuedMs) {
    return `llm_forecast_${persona}_${fileStamp(issuedMs)}.json`;
}

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isLine = (value) => typeof value === 'string' && value.trim() !== '' && value.length <= MAX_LINE_CHARS;
// Tab, line feed and carriage return are fine in running text; no other control character is.
const hasControlChars = (text) => /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(text);

/**
 * Check one parsed llm_forecast file.
 *
 * Returns `{ ok, errors }`. Every error is a sentence a producer can act on, and all of them
 * are reported at once, so a failed upload does not have to be retried once per mistake.
 * `filename` and `now` are optional: without them the name and future-time checks are skipped.
 */
export function validateLlmForecast(doc, { filename = null, now = null } = {}) {
    const errors = [];
    if (!isPlainObject(doc)) {
        return { ok: false, errors: ['The file must hold one JSON object.'] };
    }

    if (doc.schema !== LLM_FORECAST_SCHEMA) {
        errors.push(`"schema" must be "${LLM_FORECAST_SCHEMA}".`);
    }

    const persona = Object.hasOwn(PERSONAS, doc.persona) ? doc.persona : null;
    if (!persona) {
        errors.push(`"persona" must be one of: ${Object.keys(PERSONAS).join(', ')}.`);
    }

    const issued = parseUtc(doc.issued);
    if (issued === null) {
        errors.push('"issued" must be a UTC time such as "2026-12-03T12:10:00Z".');
    } else if (now !== null && issued > now + FUTURE_SLACK_MS) {
        errors.push('"issued" is in the future.');
    }

    const validUntil = parseUtc(doc.valid_until);
    if (validUntil === null) {
        errors.push('"valid_until" must be a UTC time such as "2026-12-04T00:10:00Z".');
    } else if (issued !== null && validUntil <= issued) {
        errors.push('"valid_until" must be later than "issued".');
    }

    if (!isPlainObject(doc.describes) || Object.keys(doc.describes).length === 0) {
        errors.push('"describes" must name at least one input and its time, e.g. {"gefs": "2026-12-03T06:00Z"}.');
    } else {
        for (const [input, time] of Object.entries(doc.describes)) {
            if (parseUtc(time) === null) {
                errors.push(`"describes.${input}" must be a UTC time such as "2026-12-03T06:00Z".`);
            }
        }
    }

    if (!isPlainObject(doc.generator) || !isLine(doc.generator.prompt_version) || !isLine(doc.generator.model)) {
        errors.push('"generator" must give "prompt_version" and "model" as short strings.');
    }

    if (!Array.isArray(doc.sources) || doc.sources.length === 0 || doc.sources.length > MAX_SOURCES
        || !doc.sources.every(isLine)) {
        errors.push(`"sources" must list 1 to ${MAX_SOURCES} short strings saying what the text was built from.`);
    }

    if (!isPlainObject(doc.placements) || Object.keys(doc.placements).length === 0) {
        errors.push('"placements" must hold at least one placement.');
    } else {
        for (const [key, tiers] of Object.entries(doc.placements)) {
            if (!Object.hasOwn(PLACEMENTS, key)) {
                errors.push(`Unknown placement "${key}". Known placements: ${Object.keys(PLACEMENTS).join(', ')}.`);
                continue;
            }
            if (!isPlainObject(tiers) || Object.keys(tiers).length === 0) {
                errors.push(`Placement "${key}" must hold at least one tier.`);
                continue;
            }
            for (const [tier, text] of Object.entries(tiers)) {
                const spec = Object.hasOwn(PLACEMENTS[key].tiers, tier) ? PLACEMENTS[key].tiers[tier] : null;
                const where = `"${key}" ${tier}`;
                if (!spec) {
                    errors.push(`${where}: this placement has no such tier `
                        + `(it takes ${Object.keys(PLACEMENTS[key].tiers).join(', ')}).`);
                    continue;
                }
                if (persona && spec.persona !== persona) {
                    errors.push(`${where} is written by ${spec.persona}, not ${persona}.`);
                    continue;
                }
                if (typeof text !== 'string' || text.trim() === '') {
                    errors.push(`${where} must be a non-empty string.`);
                    continue;
                }
                if (hasControlChars(text)) {
                    errors.push(`${where} contains control characters.`);
                }
                const count = wordCount(text);
                if (count > wordLimit(spec.words)) {
                    errors.push(`${where} is ${count} words; the budget is about ${spec.words} `
                        + `and the limit is ${wordLimit(spec.words)}.`);
                }
            }
        }
    }

    if (filename !== null) {
        const match = LLM_FORECAST_FILE_RE.exec(filename);
        if (!match) {
            errors.push('The filename must look like llm_forecast_<persona>_YYYYMMDD_HHMMZ.json.');
        } else {
            if (persona && match[1] !== persona) {
                errors.push(`The filename says "${match[1]}" but "persona" is "${persona}".`);
            }
            if (issued !== null && `${match[2]}_${match[3]}Z` !== fileStamp(issued)) {
                errors.push(`The filename's time must match "issued": expected ${llmForecastFilename(persona ?? match[1], issued)}.`);
            }
        }
    }

    return { ok: errors.length === 0, errors };
}

// ── Showing a file: the guards every page applies ─────────────────────────────────────────
//
// The upload route has already refused a file that breaks the contract. These guards are about
// time: text that was right when it was written must not outlive the weather it describes.
// A block that fails a guard is not drawn at all. There is no placeholder and no "stale" badge:
// old forecast text with a warning beside it is still old forecast text.

const HOUR_MS = 60 * 60 * 1000;

/**
 * May text from this file be shown now? `{ show, reason }`.
 *
 *   'missing'      there is no file, or it is not an llm_forecast/1 file
 *   'expired'      now is past the file's own valid_until
 *   'stale'        it is older than its persona's staleHours (two missed runs)
 *   'future'       it claims to have been issued more than 15 minutes from now
 *   'older-run'    it describes an older GEFS cycle than the chart beside it
 *
 * `chartGefs` is the GEFS cycle (a UTC time string) that the page is showing next to the text,
 * if it shows one. Only GEFS is compared: HRRR runs hourly and the text is written every six
 * hours, so an HRRR comparison would hide the text almost all the time.
 */
export function fileState(doc, { now, chartGefs = null } = {}) {
    const hide = (reason) => ({ show: false, reason });
    if (!isPlainObject(doc) || doc.schema !== LLM_FORECAST_SCHEMA || !Object.hasOwn(PERSONAS, doc.persona)) {
        return hide('missing');
    }
    const issued = parseUtc(doc.issued);
    const validUntil = parseUtc(doc.valid_until);
    if (issued === null || validUntil === null) return hide('missing');
    if (issued > now + FUTURE_SLACK_MS) return hide('future');
    if (now >= validUntil) return hide('expired');
    if (now - issued > PERSONAS[doc.persona].staleHours * HOUR_MS) return hide('stale');

    const chart = parseUtc(chartGefs);
    const described = parseUtc(doc.describes?.gefs);
    if (chart !== null && described !== null && described < chart) return hide('older-run');
    return { show: true, reason: null };
}

/**
 * The text for one placement, tier by tier, from whichever persona owns each tier.
 *
 * `files` is `{ ffion, rhiannon }`: each the parsed latest file for that persona, or null.
 * Returns `{ tiers }` with only the tiers that have showable text, in tab order; each is
 * `{ tier, text, persona, issued, describes, sources }`. Returns null when no tier has any, in
 * which case the page draws nothing.
 */
export function placementText(placementKey, files, { now, chartGefs = null } = {}) {
    if (!Object.hasOwn(PLACEMENTS, placementKey)) return null;
    const tiers = [];
    for (const tier of TIERS) {
        const spec = PLACEMENTS[placementKey].tiers[tier];
        if (!spec) continue;
        const doc = files?.[spec.persona];
        if (!fileState(doc, { now, chartGefs }).show) continue;
        const text = doc.placements?.[placementKey]?.[tier];
        if (typeof text !== 'string' || text.trim() === '') continue;
        // A file that somehow got past the upload check with an overlong text is not shown:
        // the page never truncates, and a wall of text is worse than no block.
        if (hasControlChars(text) || wordCount(text) > wordLimit(spec.words)) continue;
        tiers.push({
            tier,
            text: text.trim(),
            persona: spec.persona,
            issued: doc.issued,
            describes: isPlainObject(doc.describes) ? { ...doc.describes } : {},
            sources: Array.isArray(doc.sources) ? doc.sources.filter(isLine) : [],
        });
    }
    return tiers.length > 0 ? { tiers } : null;
}
