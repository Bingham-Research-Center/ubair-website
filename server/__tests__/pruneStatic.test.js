import fs from 'fs';
import os from 'os';
import path from 'path';
import {
    DATA_TYPES,
    RULES,
    applyPlan,
    isNeverPruned,
    parseArgs,
    planPrune,
    report,
    ruleFor,
    stampOf,
} from '../../scripts/prune-static.js';
import { UPLOAD_DATA_TYPES } from '../uploadPolicy.js';

// scripts/prune-static.js (#168): which uploaded files are past their keep window. Nothing
// pruned the upload directories before it: on 2026-11-21 .dev held 129,000 files, back to April.

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 21, 8, 0); // 2026-11-21 08:00Z
let root;

beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'prune-static-'));
});

afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

function put(dataType, name, content = '{"x":1}') {
    fs.mkdirSync(path.join(root, dataType), { recursive: true });
    fs.writeFileSync(path.join(root, dataType, name), content);
}

const left = (dataType) => fs.readdirSync(path.join(root, dataType)).sort();
const removed = (plan) => plan.products.flatMap((p) => p.remove.map((file) => `${p.dataType}/${file.name}`)).sort();

describe('stampOf', () => {
    test.each([
        ['map_obs_20261121_0755Z.json', 'map_obs_*.json', Date.UTC(2026, 10, 21, 7, 55)],
        ['heatmap_UB-poss_ozone_20261120-1800_clyfar028.png', 'heatmap_UB-poss_ozone_*_clyfar028.png', Date.UTC(2026, 10, 20, 18, 0)],
        ['outlook_20261112_0337.md', 'outlook_*.md', Date.UTC(2026, 10, 12, 3, 37)],
    ])('%s', (name, product, timeMs) => {
        expect(stampOf(name)).toEqual({ product, timeMs });
    });

    test('a name with no time stamp has no age, so it is never old', () => {
        expect(stampOf('template-2025-2026.md')).toBeNull();
        expect(stampOf('test_obs.json')).toBeNull();
    });
});

describe('the rules', () => {
    test('cover the dataTypes the upload route takes, and no others', () => {
        expect([...DATA_TYPES]).toEqual([...UPLOAD_DATA_TYPES]);
        expect([...new Set(RULES.map((rule) => rule.dataType))].sort()).toEqual([...UPLOAD_DATA_TYPES].sort());
    });

    test('observations, road forecasts and HRRR forecasts keep 30 days (cut R4, JRL 2026-11-20)', () => {
        expect(ruleFor('observations', 'map_obs_20261121_0755Z.json').days).toBe(30);
        expect(ruleFor('metadata', 'map_obs_meta_20261121_0446Z.json').days).toBe(30);
        expect(ruleFor('road-forecast', 'road_forecast_20261121_0722Z.json').days).toBe(30);
        expect(ruleFor('forecasts', 'forecast_hrrr_surface_layers_20261121_0500Z.json').days).toBe(30);
        expect(ruleFor('forecasts', 'forecast_hrrr_kvel_crosswind_20261121_0500Z.json').days).toBe(30);
    });

    test('everything Clyfar sends, and everything a person writes, is kept until a window is chosen', () => {
        expect(ruleFor('forecasts', 'forecast_possibility_heatmap_clyfar028_20261120_1800Z.json').days).toBeNull();
        expect(ruleFor('forecasts', 'forecast_clustering_summary_20261120_1800Z.json').days).toBeNull();
        expect(ruleFor('images', 'heatmap_UB-dailymax_ozone_20261120-1800_clyfar000.png').days).toBeNull();
        expect(ruleFor('outlooks', 'outlook_20240205_1115.md').days).toBeNull();
        expect(ruleFor('llm_outlooks', 'LLM-OUTLOOK-20260330_0600Z.pdf').days).toBeNull();
    });

    test('indexes, lists, the server\'s copies and temporary files are not data', () => {
        for (const name of ['forecast_hrrr_surface_layers_index.json', 'outlooks_list.json', 'filelist.json', 'latest.json', 'latest_ffion.json', '.upload-1-abc.part']) {
            expect([name, isNeverPruned(name)]).toEqual([name, true]);
        }
        expect(isNeverPruned('map_obs_20261121_0755Z.json')).toBe(false);
    });
});

describe('planPrune', () => {
    test('files older than the window go; files inside it stay', async () => {
        put('observations', 'map_obs_20260601_0000Z.json');
        put('observations', 'map_obs_20261021_0755Z.json'); // 31 days and 5 minutes old
        put('observations', 'map_obs_20261022_0805Z.json'); // 29 days 23 h 55 min old
        put('observations', 'map_obs_20261121_0755Z.json');

        const plan = await planPrune({ staticRoot: root, now: NOW });

        expect(removed(plan)).toEqual(['observations/map_obs_20260601_0000Z.json', 'observations/map_obs_20261021_0755Z.json']);
        expect(plan.products[0]).toMatchObject({ product: 'map_obs_*.json', days: 30, files: 4, oldestKept: '2026-10-22T08:05:00.000Z' });
        expect(plan.products[0].removeBytes).toBe(14);
        // A plan is only a plan.
        expect(left('observations')).toHaveLength(4);
    });

    test('the newest file of a product stays however old it is', async () => {
        // A product that has stopped (a hand-run draft, a retired job) keeps its last file.
        put('forecasts', 'forecast_rrfs_surface_layers_20260901_0000Z.json');
        put('forecasts', 'forecast_rrfs_surface_layers_20260902_0000Z.json');
        const plan = await planPrune({ staticRoot: root, now: NOW });
        expect(removed(plan)).toEqual(['forecasts/forecast_rrfs_surface_layers_20260901_0000Z.json']);
    });

    test('each product is weighed on its own, so one cannot shield another', async () => {
        put('forecasts', 'forecast_hrrr_kvel_crosswind_20260901_0000Z.json');
        put('forecasts', 'forecast_hrrr_kvel_crosswind_20261121_0500Z.json');
        put('forecasts', 'forecast_hrrr_waypoints_us40_dense_20260901_0000Z.json'); // newest of its own kind
        const plan = await planPrune({ staticRoot: root, now: NOW });
        expect(removed(plan)).toEqual(['forecasts/forecast_hrrr_kvel_crosswind_20260901_0000Z.json']);
    });

    test('kept: no time stamp, indexes, latest copies, keep-for-ever products, files git tracks', async () => {
        put('observations', 'test_obs.json');
        put('observations', 'map_obs_20260601_0000Z.json');
        put('observations', 'map_obs_20261121_0755Z.json');
        put('metadata', 'map_obs_meta_20250731_0228Z.json'); // the sample file in the repo
        put('metadata', 'map_obs_meta_20261121_0446Z.json');
        put('road-forecast', 'latest.json');
        put('forecasts', 'forecast_hrrr_surface_layers_index.json');
        put('forecasts', 'forecast_possibility_heatmap_clyfar001_20260101_1800Z.json');
        put('forecasts', 'forecast_possibility_heatmap_clyfar001_20261120_1800Z.json');
        put('images', 'meteogram_UB-repr_wind_20260827-0000_GEFS.png');
        put('images', 'meteogram_UB-repr_wind_20261120-1800_GEFS.png');
        put('outlooks', 'outlook_20240205_1115.md');
        put('outlooks', 'outlook_20261112_0337.md');
        fs.mkdirSync(path.join(root, 'timeseries'));
        fs.writeFileSync(path.join(root, 'timeseries', 'old_20200101_0000Z.json'), '{}'); // not an upload directory

        const plan = await planPrune({
            staticRoot: root, now: NOW, protectedFiles: new Set(['metadata/map_obs_meta_20250731_0228Z.json']),
        });

        expect(removed(plan)).toEqual(['observations/map_obs_20260601_0000Z.json']);
    });

    test('--only narrows it to one dataType', async () => {
        put('observations', 'map_obs_20260601_0000Z.json');
        put('observations', 'map_obs_20261121_0755Z.json');
        put('road-forecast', 'road_forecast_20260601_0022Z.json');
        put('road-forecast', 'road_forecast_20261121_0722Z.json');
        const plan = await planPrune({ staticRoot: root, now: NOW, only: 'road-forecast' });
        expect(removed(plan)).toEqual(['road-forecast/road_forecast_20260601_0022Z.json']);
    });

    test('"what if" applies one window to everything, keep-for-ever products included', async () => {
        put('images', 'meteogram_UB-repr_wind_20260827-0000_GEFS.png');
        put('images', 'meteogram_UB-repr_wind_20261120-1800_GEFS.png');
        put('observations', 'map_obs_20261101_0000Z.json'); // 20 days old: inside 30, outside 14
        put('observations', 'map_obs_20261121_0755Z.json');
        expect(removed(await planPrune({ staticRoot: root, now: NOW }))).toEqual([]);
        expect(removed(await planPrune({ staticRoot: root, now: NOW, overrideDays: 14 }))).toEqual([
            'images/meteogram_UB-repr_wind_20260827-0000_GEFS.png',
            'observations/map_obs_20261101_0000Z.json',
        ]);
    });

    test('a box with no upload directories has nothing to plan', async () => {
        expect(await planPrune({ staticRoot: root, now: NOW })).toEqual({ products: [] });
    });
});

describe('applyPlan', () => {
    test('removes exactly what the plan lists and says how much', async () => {
        put('observations', 'map_obs_20260601_0000Z.json', '[1,2,3]');
        put('observations', 'map_obs_20260602_0000Z.json', '[1,2,3,4]');
        put('observations', 'map_obs_20261121_0755Z.json');
        put('observations', 'test_obs.json');
        const plan = await planPrune({ staticRoot: root, now: NOW });

        const result = await applyPlan(plan, root);

        expect(result).toEqual({ removed: 2, bytes: 16, failed: [] });
        expect(left('observations')).toEqual(['map_obs_20261121_0755Z.json', 'test_obs.json']);
        // Running the same plan again finds them gone and is not an error.
        expect(await applyPlan(plan, root)).toEqual({ removed: 0, bytes: 0, failed: [] });
    });
});

describe('the report and the command line', () => {
    test('one line per product, ensemble members folded together, and a total', async () => {
        for (const member of ['001', '002', '003']) {
            put('forecasts', `forecast_possibility_heatmap_clyfar${member}_20261120_1800Z.json`);
        }
        put('forecasts', 'forecast_hrrr_waypoints_us40_dense_20260901_0000Z.json');
        put('forecasts', 'forecast_hrrr_waypoints_us40_dense_20261121_0500Z.json');
        const text = report(await planPrune({ staticRoot: root, now: NOW }));
        const lines = text.split('\n');
        expect(lines).toHaveLength(4); // header, two products, total
        expect(lines[1]).toMatch(/forecast_hrrr_waypoints_us40_dense_\*\.json\s+30 d\s+2\s+1\s/);
        expect(lines[2]).toMatch(/forecast_possibility_heatmap_clyfar#_\*\.json\s+for ever\s+3\s+0\s/);
        expect(lines[3]).toMatch(/^total\s+5\s+1\s/);
    });

    test('a dry run unless --apply is given', () => {
        expect(parseArgs([])).toMatchObject({ apply: false, days: null, only: null });
        expect(parseArgs(['--dry-run', '--only', 'forecasts', '--json'])).toMatchObject({ apply: false, only: 'forecasts', json: true });
        expect(parseArgs(['--apply']).apply).toBe(true);
    });

    test('the windows are policy: --days is for asking, not for deleting', () => {
        expect(parseArgs(['--days', '14']).days).toBe(14);
        expect(() => parseArgs(['--days', '14', '--apply'])).toThrow(/cannot be combined with --apply/);
        expect(() => parseArgs(['--days', '0'])).toThrow(/1 or more/);
        expect(() => parseArgs(['--only', '../..'])).toThrow(/--only takes one of/);
        expect(() => parseArgs(['--force'])).toThrow(/Unknown argument/);
    });
});
