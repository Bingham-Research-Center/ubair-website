import fs from 'fs';
import { fileState, placementText } from '../llmForecast.js';
import { jest } from '@jest/globals';
import { LLM_DISCLAIMER, LLM_LABEL, TIER_LABELS, blockModel, describesLine, loadLlmFiles } from '../llmText.js';

// Showing LLM forecast text (issue #405): when a block is drawn, when it is not, and what it
// says. The fixtures were issued at 12:10Z (Ffion) and 12:00Z (Rhiannon) on 3 Dec 2026.

const load = (name) => JSON.parse(fs.readFileSync(new URL(`./fixtures/llm_forecasts/${name}`, import.meta.url), 'utf8'));
const FFION = load('llm_forecast_ffion_20261203_1210Z.json');
const RHIANNON = load('llm_forecast_rhiannon_20261203_1200Z.json');
const at = (iso) => Date.parse(iso);
const NOW = at('2026-12-03T13:00:00Z'); // 6 AM MST

describe('fileState', () => {
    test('a current file may be shown', () => {
        expect(fileState(FFION, { now: NOW })).toEqual({ show: true, reason: null });
        expect(fileState(RHIANNON, { now: NOW })).toEqual({ show: true, reason: null });
    });

    test('hidden when there is no file, or it is not an llm_forecast/1 file', () => {
        for (const odd of [null, undefined, {}, [], 'text', { ...FFION, schema: 'llm_forecast/2' }, { ...FFION, persona: 'gwen' },
            { ...FFION, issued: 'yesterday' }]) {
            expect(fileState(odd, { now: NOW })).toEqual({ show: false, reason: 'missing' });
        }
    });

    test('hidden once it is two runs old: 12 hours for Ffion, 6 for Rhiannon', () => {
        const longLived = (doc) => ({ ...doc, valid_until: '2026-12-10T00:00:00Z' });
        expect(fileState(longLived(FFION), { now: at('2026-12-04T00:09:00Z') }).show).toBe(true);
        expect(fileState(longLived(FFION), { now: at('2026-12-04T00:11:00Z') })).toEqual({ show: false, reason: 'stale' });
        expect(fileState(longLived(RHIANNON), { now: at('2026-12-03T17:59:00Z') }).show).toBe(true);
        expect(fileState(longLived(RHIANNON), { now: at('2026-12-03T18:01:00Z') })).toEqual({ show: false, reason: 'stale' });
    });

    test('hidden at its own valid_until, if that comes first', () => {
        const short = { ...FFION, valid_until: '2026-12-03T14:00:00Z' };
        expect(fileState(short, { now: at('2026-12-03T13:59:00Z') }).show).toBe(true);
        expect(fileState(short, { now: at('2026-12-03T14:00:00Z') })).toEqual({ show: false, reason: 'expired' });
    });

    test('hidden when it claims to come from the future', () => {
        expect(fileState(FFION, { now: at('2026-12-03T12:00:00Z') }).show).toBe(true);   // 10 min: clocks differ
        expect(fileState(FFION, { now: at('2026-12-03T11:00:00Z') })).toEqual({ show: false, reason: 'future' });
    });

    test('hidden when it describes an older GEFS cycle than the chart beside it', () => {
        // The text describes the 06Z cycle.
        expect(fileState(FFION, { now: NOW, chartGefs: '2026-12-03T06:00Z' }).show).toBe(true);
        expect(fileState(FFION, { now: NOW, chartGefs: '2026-12-03T00:00Z' }).show).toBe(true);
        expect(fileState(FFION, { now: NOW, chartGefs: '2026-12-03T12:00Z' })).toEqual({ show: false, reason: 'older-run' });
    });

    test('only GEFS is compared: a newer hourly HRRR run beside it hides nothing', () => {
        // Rhiannon's file names no GEFS cycle at all, so no chart can make it "older".
        expect(fileState(RHIANNON, { now: NOW, chartGefs: '2026-12-03T12:00Z' }).show).toBe(true);
        expect(fileState(FFION, { now: NOW, chartGefs: null }).show).toBe(true);
    });
});

describe('placementText', () => {
    const files = { ffion: FFION, rhiannon: RHIANNON };

    test('gives the tiers a placement has, in tab order, each from the persona that owns it', () => {
        const home = placementText('home.summary', files, { now: NOW });
        expect(home.tiers.map((t) => `${t.tier}:${t.persona}`)).toEqual(['public:ffion', 'industry:ffion', 'expert:ffion']);
        expect(home.tiers[0].text).toMatch(/^SAMPLE TEXT, NOT A FORECAST\. Cold and calm/);
        expect(home.tiers[0]).toMatchObject({ issued: '2026-12-03T12:10:00Z', describes: FFION.describes, sources: FFION.sources });

        const trends = placementText('outlook.observed_trends', files, { now: NOW });
        expect(trends.tiers.map((t) => `${t.tier}:${t.persona}`)).toEqual(['expert:rhiannon']);
    });

    test('null, so nothing is drawn, when no file has the placement', () => {
        expect(placementText('clyfar.summary', files, { now: NOW })).toBeNull();
        expect(placementText('home.summary', { ffion: null, rhiannon: RHIANNON }, { now: NOW })).toBeNull();
        expect(placementText('home.summary', {}, { now: NOW })).toBeNull();
        expect(placementText('not.a.placement', files, { now: NOW })).toBeNull();
    });

    test('null when the file is stale: old text is not shown with a warning, it is not shown', () => {
        expect(placementText('home.summary', files, { now: at('2026-12-04T00:11:00Z') })).toBeNull();
    });

    test('a placement written by both keeps the tiers whose writer is current', () => {
        // Aviation: Ffion writes public and industry, Rhiannon the expert tier.
        const ffion = JSON.parse(JSON.stringify(FFION));
        ffion.placements['aviation.summary'] = { public: 'Calm at Vernal this morning.', industry: 'Calm, fog until 11 AM.' };
        const both = placementText('aviation.summary', { ffion, rhiannon: RHIANNON }, { now: NOW });
        expect(both.tiers.map((t) => `${t.tier}:${t.persona}`)).toEqual(['public:ffion', 'industry:ffion', 'expert:rhiannon']);
        // Seven hours on, Rhiannon's text has gone stale and Ffion's has not.
        const later = placementText('aviation.summary', { ffion, rhiannon: RHIANNON }, { now: at('2026-12-03T19:30:00Z') });
        expect(later.tiers.map((t) => t.tier)).toEqual(['public', 'industry']);
    });

    test('text a persona does not own is ignored, even if a file carries it', () => {
        const rogue = JSON.parse(JSON.stringify(RHIANNON));
        rogue.placements['home.summary'] = { public: 'Rhiannon may not write this.' };
        expect(placementText('home.summary', { ffion: null, rhiannon: rogue }, { now: NOW })).toBeNull();
    });

    test('an overlong or empty text is left out rather than shown or cut', () => {
        const long = JSON.parse(JSON.stringify(FFION));
        long.placements['home.summary'].public = Array.from({ length: 60 }, () => 'word').join(' ');
        long.placements['home.summary'].industry = '   ';
        expect(placementText('home.summary', { ffion: long }, { now: NOW }).tiers.map((t) => t.tier)).toEqual(['expert']);
    });
});

describe('blockModel', () => {
    const files = { ffion: FFION, rhiannon: RHIANNON };

    test('is the label, the reader tabs opening on Public, and the line saying what it is', () => {
        const model = blockModel('weather.discussion', files, { now: NOW });
        expect(model.label).toBe('LLM forecast');
        expect(model.disclaimer).toBe(LLM_DISCLAIMER);
        expect(model.tabs.map((tab) => tab.label)).toEqual(['Public', 'Industry', 'Expert']);
        expect(model.tabs[0].tier).toBe('public');
        expect(LLM_DISCLAIMER).toMatch(/Generated by an LLM/);
        expect(LLM_DISCLAIMER).toMatch(/verify with official forecasts/);
        expect([LLM_LABEL, TIER_LABELS]).toEqual(['LLM forecast', { public: 'Public', industry: 'Industry', expert: 'Expert' }]);
    });

    test('never names a persona to the reader', () => {
        for (const key of ['home.summary', 'weather.discussion', 'outlook.model_guidance', 'outlook.observed_trends', 'aviation.summary']) {
            const model = blockModel(key, files, { now: NOW });
            expect(JSON.stringify(model)).not.toMatch(/ffion|rhiannon/i);
        }
    });

    test('says when it was issued, in Mountain time, and what it describes', () => {
        const model = blockModel('home.summary', files, { now: NOW });
        expect(model.tabs[0].meta).toBe('Issued 5:10 AM. Describes the GEFS 06Z run and the HRRR 09Z run, with observations to 4:50 AM.');
        const trends = blockModel('outlook.observed_trends', files, { now: NOW });
        expect(trends.tabs[0].meta).toBe('Issued 5 AM. Describes observations to 4:50 AM and aircraft data to 4:40 AM.');
    });

    test('shows "Built from" on the Expert tab only', () => {
        const model = blockModel('home.summary', files, { now: NOW });
        expect(model.tabs.map((tab) => tab.sources.length)).toEqual([0, 0, 3]);
        expect(model.tabs[2].sources[0]).toBe('GEFS 06Z percentiles (fixture)');
    });

    test('splits text into paragraphs at blank lines and joins single line breaks', () => {
        const doc = JSON.parse(JSON.stringify(FFION));
        doc.placements['home.summary'].public = 'Cold and calm.\nFog at dawn.\n\n\nSnow on the passes Saturday.';
        expect(blockModel('home.summary', { ffion: doc }, { now: NOW }).tabs[0].paragraphs)
            .toEqual(['Cold and calm. Fog at dawn.', 'Snow on the passes Saturday.']);
    });

    test('is null when there is nothing current to show', () => {
        expect(blockModel('home.summary', { ffion: null, rhiannon: null }, { now: NOW })).toBeNull();
        expect(blockModel('home.summary', files, { now: at('2026-12-05T00:00:00Z') })).toBeNull();
        expect(blockModel('home.summary', files, { now: NOW, chartGefs: '2026-12-03T12:00Z' })).toBeNull();
    });

    test('describesLine copes with a partial or empty describes block', () => {
        expect(describesLine({ gefs: '2026-12-03T06:00Z' }, NOW)).toBe('Describes the GEFS 06Z run.');
        expect(describesLine({}, NOW)).toBe('');
        expect(describesLine(undefined, NOW)).toBe('');
    });
});

describe('the renderer', () => {
    const source = fs.readFileSync(new URL('../llmText.js', import.meta.url), 'utf8');

    test('puts the text into the page as text, never as HTML', () => {
        expect(source).not.toMatch(/innerHTML|insertAdjacentHTML|outerHTML/);
    });

    test('uses tab semantics a screen reader understands', () => {
        for (const piece of ["'role', 'tablist'", "'role', 'tab'", "'role', 'tabpanel'", "'aria-selected'", "'aria-controls'"]) {
            expect(source).toContain(piece);
        }
    });

    test('opens on the first tab and keeps no memory of a reader\'s choice', () => {
        expect(source).toMatch(/select\(0\);/);
        expect(source).not.toMatch(/localStorage|sessionStorage|cookie/);
    });

    test('never asks for a file by name: before any text exists that is a 404 on every page view', () => {
        // 1.7.7 fetched latest_<persona>.json directly, and the homepage logged two 404s a visit.
        expect(source).toMatch(/fetch\('\/api\/llm-forecasts\/latest'/);
        expect(source.match(/\bfetch\(/g)).toHaveLength(1);
        expect(source).not.toMatch(/fetch\([^)]*api\/static\/llm_forecasts/);
    });
});

describe('loadLlmFiles', () => {
    const realFetch = globalThis.fetch;
    afterEach(() => { globalThis.fetch = realFetch; });
    const answer = (ok, body) => jest.fn().mockResolvedValue({ ok, json: async () => body });

    test('one request, and a null for a persona with no file', async () => {
        globalThis.fetch = answer(true, { status: 'ok', files: { ffion: FFION, rhiannon: null } });
        expect(await loadLlmFiles()).toEqual({ ffion: FFION, rhiannon: null });
        expect(globalThis.fetch).toHaveBeenCalledTimes(1);
        expect(globalThis.fetch).toHaveBeenCalledWith('/api/llm-forecasts/latest', { cache: 'no-store' });
    });

    test('no files at all, which is today: both null, and nothing to draw', async () => {
        globalThis.fetch = answer(true, { status: 'ok', files: { ffion: null, rhiannon: null } });
        const files = await loadLlmFiles();
        expect(files).toEqual({ ffion: null, rhiannon: null });
        expect(blockModel('home.summary', files, { now: NOW })).toBeNull();
    });

    test('a failed request, a server error or an odd answer all mean "none", never an error on the page', async () => {
        for (const fetchMock of [answer(false, {}), answer(true, null), answer(true, { files: 'x' }), jest.fn().mockRejectedValue(new Error('offline'))]) {
            globalThis.fetch = fetchMock;
            expect(await loadLlmFiles()).toEqual({ ffion: null, rhiannon: null });
        }
    });

    test('a persona the site does not know is not passed on', async () => {
        globalThis.fetch = answer(true, { status: 'ok', files: { ffion: FFION, gwen: { text: 'x' } } });
        expect(Object.keys(await loadLlmFiles())).toEqual(['ffion', 'rhiannon']);
    });
});
