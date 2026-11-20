import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    BUDGET_TOLERANCE,
    LLM_FORECAST_SCHEMA,
    PERSONAS,
    PLACEMENTS,
    TIERS,
    fileStamp,
    llmForecastFilename,
    parseUtc,
    validateLlmForecast,
    wordCount,
    wordLimit,
} from '../llmForecast.js';

// The llm_forecast/1 contract (issue #402, plan §5.2 and §5.8). The upload route refuses any
// file these checks refuse, so each test here is also a rule a producer has to meet.

const fixtureDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'llm_forecasts');
const FFION_FILE = 'llm_forecast_ffion_20261203_1210Z.json';
const RHIANNON_FILE = 'llm_forecast_rhiannon_20261203_1200Z.json';
const load = (name) => JSON.parse(fs.readFileSync(path.join(fixtureDir, name), 'utf8'));
const NOW = Date.parse('2026-12-03T12:30:00Z');

const errorsOf = (doc, options) => validateLlmForecast(doc, options).errors;
const words = (n) => Array.from({ length: n }, (_, i) => `w${i}`).join(' ');

describe('the contract table', () => {
    test('has three tiers, opening on public', () => {
        expect(TIERS).toEqual(['public', 'industry', 'expert']);
    });

    test('Rhiannon writes for forecasters only: never a public or industry tier', () => {
        for (const [key, spec] of Object.entries(PLACEMENTS)) {
            for (const [tier, { persona }] of Object.entries(spec.tiers)) {
                expect(Object.keys(PERSONAS)).toContain(persona);
                if (persona === 'rhiannon') expect([key, tier]).toEqual([key, 'expert']);
            }
        }
    });

    test('every placement uses known tiers and a positive word budget', () => {
        for (const spec of Object.values(PLACEMENTS)) {
            for (const [tier, { words: budget }] of Object.entries(spec.tiers)) {
                expect(TIERS).toContain(tier);
                expect(budget).toBeGreaterThan(0);
            }
        }
    });

    test('text hides after two missed runs', () => {
        expect(PERSONAS.ffion).toEqual({ cadenceHours: 6, staleHours: 12 });
        expect(PERSONAS.rhiannon).toEqual({ cadenceHours: 3, staleHours: 6 });
    });
});

describe('helpers', () => {
    test('wordCount counts whitespace-separated words', () => {
        expect(wordCount('  Cold and calm.\n\nSnow on the passes.  ')).toBe(7);
        expect(wordCount('')).toBe(0);
        expect(wordCount(undefined)).toBe(0);
    });

    test('wordLimit is half as much again as the budget', () => {
        expect(BUDGET_TOLERANCE).toBe(1.5);
        expect(wordLimit(35)).toBe(53);
        expect(wordLimit(400)).toBe(600);
    });

    test('parseUtc takes UTC times with or without seconds, and nothing else', () => {
        expect(parseUtc('2026-12-03T12:10:00Z')).toBe(Date.UTC(2026, 11, 3, 12, 10));
        expect(parseUtc('2026-12-03T06:00Z')).toBe(Date.UTC(2026, 11, 3, 6, 0));
        for (const bad of ['2026-12-03', '2026-12-03T12:10:00', '2026-12-03T12:10:00-07:00',
            '2026-13-03T12:10:00Z', '3 Dec 2026', '', null, 1764763800000]) {
            expect(parseUtc(bad)).toBeNull();
        }
    });

    test('a filename carries the persona and the issue time to the minute', () => {
        const issued = Date.UTC(2026, 11, 3, 12, 10, 42);
        expect(fileStamp(issued)).toBe('20261203_1210Z');
        expect(llmForecastFilename('ffion', issued)).toBe(FFION_FILE);
    });
});

describe('the sample files', () => {
    test.each([FFION_FILE, RHIANNON_FILE])('%s passes every check', (name) => {
        expect(validateLlmForecast(load(name), { filename: name, now: NOW })).toEqual({ ok: true, errors: [] });
    });

    test('say plainly that they are samples', () => {
        for (const name of [FFION_FILE, RHIANNON_FILE]) {
            const doc = load(name);
            expect(doc.generator.model).toMatch(/fixture/);
            for (const tiers of Object.values(doc.placements)) {
                for (const text of Object.values(tiers)) expect(text).toMatch(/^SAMPLE TEXT, NOT A FORECAST\./);
            }
        }
    });
});

describe('validateLlmForecast refuses', () => {
    let doc;
    beforeEach(() => { doc = load(FFION_FILE); });

    test('anything that is not one JSON object', () => {
        for (const bad of [null, [], 'text', 42]) {
            expect(validateLlmForecast(bad)).toEqual({ ok: false, errors: ['The file must hold one JSON object.'] });
        }
    });

    test('another schema version', () => {
        doc.schema = 'llm_forecast/2';
        expect(errorsOf(doc)).toEqual([`"schema" must be "${LLM_FORECAST_SCHEMA}".`]);
    });

    test('an unknown persona', () => {
        doc.persona = 'gwen';
        expect(errorsOf(doc)).toEqual(['"persona" must be one of: ffion, rhiannon.']);
    });

    test('a missing, malformed or future issue time', () => {
        doc.issued = '2026-12-03 12:10';
        expect(errorsOf(doc)).toContain('"issued" must be a UTC time such as "2026-12-03T12:10:00Z".');

        doc = load(FFION_FILE);
        // Ten minutes ahead of the server is a clock difference; an hour is a mistake.
        expect(errorsOf(doc, { now: Date.parse('2026-12-03T12:00:00Z') })).toEqual([]);
        expect(errorsOf(doc, { now: Date.parse('2026-12-03T11:00:00Z') })).toEqual(['"issued" is in the future.']);
    });

    test('a valid_until that is missing or not after issued', () => {
        doc.valid_until = doc.issued;
        expect(errorsOf(doc)).toEqual(['"valid_until" must be later than "issued".']);
        delete doc.valid_until;
        expect(errorsOf(doc)).toEqual(['"valid_until" must be a UTC time such as "2026-12-04T00:10:00Z".']);
    });

    test('a describes block that is empty or holds something other than times', () => {
        doc.describes = {};
        expect(errorsOf(doc)[0]).toMatch(/"describes" must name at least one input/);
        doc.describes = { gefs: '06Z' };
        expect(errorsOf(doc)).toEqual(['"describes.gefs" must be a UTC time such as "2026-12-03T06:00Z".']);
    });

    test('a missing generator or sources list', () => {
        delete doc.generator.model;
        doc.sources = [];
        expect(errorsOf(doc)).toEqual([
            '"generator" must give "prompt_version" and "model" as short strings.',
            '"sources" must list 1 to 30 short strings saying what the text was built from.',
        ]);
    });

    test('no placements, an unknown placement, or an unknown tier', () => {
        doc.placements = {};
        expect(errorsOf(doc)).toEqual(['"placements" must hold at least one placement.']);

        doc.placements = { 'home.summery': { public: 'Cold.' }, 'home.summary': { stakeholder: 'Cold.' } };
        const errors = errorsOf(doc);
        expect(errors[0]).toMatch(/^Unknown placement "home\.summery"\. Known placements: home\.summary, /);
        expect(errors[1]).toBe('"home.summary" stakeholder: this placement has no such tier (it takes public, industry, expert).');
    });

    test('a tier that belongs to the other persona', () => {
        // Rhiannon may not write a public tab, and Ffion may not write the observed trends.
        const rhiannon = load(RHIANNON_FILE);
        rhiannon.placements['home.summary'] = { public: 'Calm now.' };
        expect(errorsOf(rhiannon)).toEqual(['"home.summary" public is written by ffion, not rhiannon.']);

        doc.placements['outlook.observed_trends'] = { expert: 'Ozone is rising.' };
        doc.placements['aviation.summary'] = { public: 'Calm at Vernal.', expert: 'Calm.' };
        expect(errorsOf(doc)).toEqual([
            '"outlook.observed_trends" expert is written by rhiannon, not ffion.',
            '"aviation.summary" expert is written by rhiannon, not ffion.',
        ]);
    });

    test('empty text, control characters, and text well over its budget', () => {
        doc.placements['home.summary'].public = '   ';
        doc.placements['home.summary'].industry = 'Cold\u0000 and calm.';
        doc.placements['home.summary'].expert = words(91);
        expect(errorsOf(doc)).toEqual([
            '"home.summary" public must be a non-empty string.',
            '"home.summary" industry contains control characters.',
            '"home.summary" expert is 91 words; the budget is about 60 and the limit is 90.',
        ]);
    });

    test('but allows text up to the limit, with paragraphs', () => {
        doc.placements['home.summary'].expert = `${words(45)}\n\n${words(45)}`;
        expect(errorsOf(doc)).toEqual([]);
    });

    test('a filename that does not match the file', () => {
        expect(errorsOf(doc, { filename: 'LLM-WX-20261203_1210Z.json' }))
            .toEqual(['The filename must look like llm_forecast_<persona>_YYYYMMDD_HHMMZ.json.']);
        expect(errorsOf(doc, { filename: RHIANNON_FILE })).toEqual([
            'The filename says "rhiannon" but "persona" is "ffion".',
            `The filename's time must match "issued": expected ${FFION_FILE}.`,
        ]);
    });

    test('and reports every problem at once', () => {
        const errors = errorsOf({ schema: 'x', placements: { 'home.summary': { public: 7 } } }, { filename: 'x.json' });
        expect(errors.length).toBeGreaterThanOrEqual(8);
    });
});

describe('DATA_MANIFEST.json says the same as this module', () => {
    const manifest = JSON.parse(fs.readFileSync(
        path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../DATA_MANIFEST.json'), 'utf8'
    ));
    const entry = manifest.dataTypes.llm_forecasts;

    test('placements, writers and word budgets', () => {
        expect(JSON.parse(JSON.stringify(PLACEMENTS))).toEqual(entry.placements);
        expect(entry.tiers).toEqual(TIERS);
        expect(entry.budgetTolerance).toBe(BUDGET_TOLERANCE);
    });

    test('personas, cadence and stale times', () => {
        for (const [name, spec] of Object.entries(PERSONAS)) {
            expect(entry.personas[name]).toMatchObject(spec);
        }
        expect(Object.keys(entry.personas)).toEqual(Object.keys(PERSONAS));
        expect(entry.schema.properties.persona.enum).toEqual(Object.keys(PERSONAS));
    });

    test('the JSON Schema lists exactly the placements and tiers the server accepts', () => {
        expect(entry.schema.properties.schema.enum).toEqual([LLM_FORECAST_SCHEMA]);
        const inSchema = entry.schema.properties.placements.properties;
        expect(Object.keys(inSchema)).toEqual(Object.keys(PLACEMENTS));
        for (const [key, spec] of Object.entries(PLACEMENTS)) {
            expect(Object.keys(inSchema[key].properties)).toEqual(Object.keys(spec.tiers));
            expect(inSchema[key].additionalProperties).toBe(false);
        }
        expect(entry.schema.properties.placements.additionalProperties).toBe(false);
    });

    test('the example filename is one the server would accept', () => {
        expect(entry.filename.example).toBe(FFION_FILE);
        expect(entry.validation.allowedExtensions).toEqual(['.json']);
    });
});
