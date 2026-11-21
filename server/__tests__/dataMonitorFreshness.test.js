/**
 * Regression test for the freshness "index trap".
 *
 * Observed on linode-dev 2026-08-13: /api/monitoring/freshness reported
 *   outlooks -> { status: "fresh", ageMinutes: 0 }
 * on a box that had never received a single outlooks upload. The directory held only
 * 2026-04 sample files plus outlooks_list.json, which the server rewrites every few
 * minutes — so the index's mtime, not any producer, was driving the verdict.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { jest } from '@jest/globals';

const HOUR = 60 * 60 * 1000;

let tmpRoot;
let monitor;

/** Build a fake public/api/static tree and point a DataMonitor at it. */
async function makeMonitor(manifestDataTypes) {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'freshness-'));
    const staticDir = path.join(tmpRoot, 'public', 'api', 'static');
    fs.mkdirSync(staticDir, { recursive: true });

    const { default: DataMonitor } = await import('../monitoring/dataMonitor.js');
    const m = new DataMonitor();
    m.staticDir = staticDir;
    m.manifest = { dataTypes: manifestDataTypes };
    return m;
}

function writeFile(monitorInstance, subDir, name, ageMs) {
    const dir = path.join(monitorInstance.staticDir, subDir);
    fs.mkdirSync(dir, { recursive: true });
    const full = path.join(dir, name);
    fs.writeFileSync(full, '{}');
    const when = new Date(Date.now() - ageMs);
    fs.utimesSync(full, when, when);
    return full;
}

afterEach(() => {
    if (tmpRoot) fs.rmSync(tmpRoot, { recursive: true, force: true });
    tmpRoot = undefined;
    jest.resetModules();
});

describe('checkDataFreshness — server-generated indexes', () => {
    // Frequencies are cron expressions, as in DATA_MANIFEST.json. 'ad-hoc' is what
    // outlooks really carries: no schedule, so its age is reported and not judged.
    const outlooksManifest = {
        outlooks: {
            endpoint: '/api/static/outlooks',
            schedule: { frequency: 'ad-hoc' },
        },
    };

    test('a freshly-rewritten index does not make a dead dataType look fresh', async () => {
        monitor = await makeMonitor(outlooksManifest);

        // The real dev-box shape: stale producer content, constantly-rewritten index.
        writeFile(monitor, 'outlooks', 'outlook_20240205_1115.md', 2000 * HOUR);
        writeFile(monitor, 'outlooks', 'outlooks_list.json', 0);

        const { outlooks } = await monitor.checkDataFreshness();

        expect(outlooks.latestFile).toBe('outlook_20240205_1115.md');
        expect(outlooks.status).toBe('unscheduled');
        expect(outlooks.expectedFreqMinutes).toBeNull();
        expect(outlooks.ageMinutes).toBeGreaterThan(60);
    });

    test('a directory holding only indexes reports no_data, not fresh', async () => {
        monitor = await makeMonitor(outlooksManifest);
        writeFile(monitor, 'outlooks', 'outlooks_list.json', 0);

        const { outlooks } = await monitor.checkDataFreshness();

        expect(outlooks.status).toBe('no_data');
        expect(outlooks.ageMinutes).toBeUndefined();
    });

    test('filelist.json is excluded too, and real uploads still read as fresh', async () => {
        monitor = await makeMonitor({
            observations: {
                endpoint: '/api/static/observations',
                schedule: { frequency: '*/10 * * * *' },
            },
        });

        writeFile(monitor, 'observations', 'map_obs_20260813_2230Z.json', 60 * 1000);
        writeFile(monitor, 'observations', 'filelist.json', 0);

        const { observations } = await monitor.checkDataFreshness();

        expect(observations.status).toBe('fresh');
        expect(observations.latestFile).toBe('map_obs_20260813_2230Z.json');
        // totalFiles counts producer-written files only.
        expect(observations.totalFiles).toBe(1);
    });
});

describe('checkDataFreshness — producer-uploaded indexes', () => {
    // The linode-dev forecasts shape, 2026-08-25: nginx (client_max_body_size unset ->
    // 1 MB default) was 413ing every ~1.5 MB HRRR run file while letting the 3 KB
    // forecast_hrrr_surface_layers_index.json through. The index's mtime was hours old;
    // the newest actual run on disk was four months old. Freshness reported
    // "stale by 164 minutes" and the outage went unnoticed.
    const forecastsManifest = {
        forecasts: {
            endpoint: '/api/static/forecasts',
            schedule: { frequency: '0 * * * *' },
        },
    };

    test('an hourly-refreshed producer index does not hide a months-dead producer', async () => {
        monitor = await makeMonitor(forecastsManifest);

        writeFile(monitor, 'forecasts', 'forecast_hrrr_surface_layers_20260427_2100Z.json', 2880 * HOUR);
        writeFile(monitor, 'forecasts', 'forecast_hrrr_surface_layers_index.json', 3 * HOUR);

        const { forecasts } = await monitor.checkDataFreshness();

        expect(forecasts.latestFile).toBe('forecast_hrrr_surface_layers_20260427_2100Z.json');
        expect(forecasts.status).toBe('stale');
        // The age must reflect the run file (~120 days), not the index (~3 h).
        expect(forecasts.ageMinutes).toBeGreaterThan(100 * 24 * 60);
    });

    test('a directory holding only a producer index reports no_data', async () => {
        monitor = await makeMonitor(forecastsManifest);
        writeFile(monitor, 'forecasts', 'forecast_hrrr_surface_layers_index.json', 0);

        const { forecasts } = await monitor.checkDataFreshness();

        expect(forecasts.status).toBe('no_data');
        expect(forecasts.ageMinutes).toBeUndefined();
    });

    test('timestamped run files are never mistaken for indexes', async () => {
        monitor = await makeMonitor(forecastsManifest);
        writeFile(monitor, 'forecasts', 'forecast_hrrr_surface_layers_20260825_0300Z.json', 60 * 1000);
        writeFile(monitor, 'forecast_unused', 'ignored.json', 0);

        const { forecasts } = await monitor.checkDataFreshness();

        expect(forecasts.status).toBe('fresh');
        expect(forecasts.latestFile).toBe('forecast_hrrr_surface_layers_20260825_0300Z.json');
        expect(forecasts.totalFiles).toBe(1);
    });
});

describe('isGeneratedIndex', () => {
    test('classifies index-shaped names, not timestamped payloads', async () => {
        const { isGeneratedIndex } = await import('../monitoring/dataMonitor.js');

        expect(isGeneratedIndex('filelist.json')).toBe(true);
        expect(isGeneratedIndex('outlooks_list.json')).toBe(true);
        expect(isGeneratedIndex('forecast_hrrr_surface_layers_index.json')).toBe(true);
        expect(isGeneratedIndex('forecast_hrrr_kvel_crosswind_index.json')).toBe(true);

        expect(isGeneratedIndex('map_obs_20260825_0330Z.json')).toBe(false);
        expect(isGeneratedIndex('forecast_hrrr_surface_layers_20260824_2200Z.json')).toBe(false);
        expect(isGeneratedIndex('road_forecast_20260825_0322Z.json')).toBe(false);
        expect(isGeneratedIndex('outlook_20240205_1115.md')).toBe(false);
    });
});

describe('checkDataFreshness — images cadence from the real manifest', () => {
    // 2026-09-28: the manifest said images arrive every 30 min, so the box reported
    // "stale" 73 min after a perfectly normal upload. What actually lands is one batch of
    // GEFS meteograms per 6-hourly cycle, ~9.5 h after 00/06/12/18Z. Both boxes agreed,
    // and the real gap turned out to be Clyfar's plot job hanging on a Herbie download.
    // With a 6 h interval the 2x rule flags at 12 h, i.e. exactly one missed cycle.
    const realManifestPath = path.resolve(
        path.dirname(new URL(import.meta.url).pathname), '../../DATA_MANIFEST.json'
    );

    test('a normal inter-cycle gap is fresh and one missed cycle is stale', async () => {
        const real = JSON.parse(fs.readFileSync(realManifestPath, 'utf8'));
        monitor = await makeMonitor({ images: real.dataTypes.images });

        expect(monitor.parseFrequency(real.dataTypes.images.schedule.frequency)).toBe(360);

        writeFile(monitor, 'images', 'meteogram_UB-repr_wind_20260928-0000_GEFS.png', 7 * HOUR);
        expect((await monitor.checkDataFreshness()).images.status).toBe('fresh');

        // The index was built from the directory on the first check; build it again.
        (await import('../uploadIndex.js'))._resetUploadIndexForTests();
        writeFile(monitor, 'images', 'meteogram_UB-repr_wind_20260928-0000_GEFS.png', 13 * HOUR);
        expect((await monitor.checkDataFreshness()).images.status).toBe('stale');
    });
});

describe('checkDataFreshness: one product at a time', () => {
    // Until 1.7.9 `forecasts` was judged as one directory on Clyfar's six-hourly schedule. The
    // hourly HRRR point files kept it "fresh" whatever else had stopped: on 2026-11-18 a
    // surface-layers bundle never arrived and the newest run on the map was 14.8 h old, with
    // nothing to say so.
    const manifest = {
        forecasts: {
            endpoint: '/api/upload/forecasts',
            schedule: { frequency: '15 3,9,15,21 * * *', seasonal: true },
            products: {
                hrrr_surface_layers: {
                    filename: { pattern: 'forecast_hrrr_surface_layers_YYYYMMDD_HHMMZ.json' },
                    schedule: { frequency: '45 0,6,12,18 * * *' },
                },
                hrrr_waypoints: {
                    filename: { pattern: 'forecast_hrrr_waypoints_us40_dense_YYYYMMDD_HHMMZ.json' },
                    schedule: { frequency: '50 * * * *' },
                },
                // No schedule of its own: it takes the dataType's, seasonal included.
                possibility_heatmap: {
                    filename: { pattern: 'forecast_possibility_heatmap_{member}_YYYYMMDD_HHMMZ.json' },
                },
            },
        },
    };
    const MIN = 60 * 1000;

    test('a dead six-hourly product is stale although an hourly one beside it is fresh', async () => {
        monitor = await makeMonitor(manifest);
        writeFile(monitor, 'forecasts', 'forecast_hrrr_waypoints_us40_dense_20261121_0500Z.json', 10 * MIN);
        writeFile(monitor, 'forecasts', 'forecast_hrrr_surface_layers_20261119_2300Z.json', 30 * HOUR);
        writeFile(monitor, 'forecasts', 'forecast_hrrr_surface_layers_index.json', 0);

        const { forecasts } = await monitor.checkDataFreshness();

        expect(forecasts.status).toBe('stale');
        expect(forecasts.staleProducts).toEqual(['hrrr_surface_layers']);
        expect(forecasts.products.hrrr_waypoints).toMatchObject({ status: 'fresh', expectedFreqMinutes: 60, totalFiles: 1 });
        expect(forecasts.products.hrrr_surface_layers).toMatchObject({
            status: 'stale', expectedFreqMinutes: 360, latestFile: 'forecast_hrrr_surface_layers_20261119_2300Z.json',
        });
        // The directory's own newest file is still reported, as before.
        expect(forecasts.latestFile).toBe('forecast_hrrr_waypoints_us40_dense_20261121_0500Z.json');
        expect(forecasts.ageMinutes).toBe(10);
        expect(monitor.stats.alerts.at(-1).message).toMatch(/forecasts data is stale: hrrr_surface_layers/);
    });

    test('everything on time is fresh, on the shortest interval among its products', async () => {
        monitor = await makeMonitor(manifest);
        writeFile(monitor, 'forecasts', 'forecast_hrrr_waypoints_us40_dense_20261121_0500Z.json', 10 * MIN);
        writeFile(monitor, 'forecasts', 'forecast_hrrr_surface_layers_20261121_0500Z.json', 5 * HOUR);
        writeFile(monitor, 'forecasts', 'forecast_possibility_heatmap_clyfar001_20261120_1800Z.json', 4 * HOUR);

        const { forecasts } = await monitor.checkDataFreshness();

        expect(forecasts.status).toBe('fresh');
        expect(forecasts.staleProducts).toBeUndefined();
        expect(forecasts.expectedFreqMinutes).toBe(60);
        expect(forecasts.totalFiles).toBe(3);
    });

    test('a seasonal product silent for over a week is dormant, and the directory is not stale for it', async () => {
        monitor = await makeMonitor(manifest);
        writeFile(monitor, 'forecasts', 'forecast_hrrr_waypoints_us40_dense_20261121_0500Z.json', 10 * MIN);
        writeFile(monitor, 'forecasts', 'forecast_hrrr_surface_layers_20261121_0500Z.json', HOUR);
        writeFile(monitor, 'forecasts', 'forecast_possibility_heatmap_clyfar001_20260330_0600Z.json', 30 * 24 * HOUR);
        writeFile(monitor, 'forecasts', 'forecast_possibility_heatmap_clyfar002_20260330_0600Z.json', 30 * 24 * HOUR);

        const { forecasts } = await monitor.checkDataFreshness();

        expect(forecasts.products.possibility_heatmap).toMatchObject({ status: 'dormant', totalFiles: 2 });
        expect(forecasts.status).toBe('fresh');
    });

    test('in season, a seasonal product one cycle late is stale like any other', async () => {
        monitor = await makeMonitor(manifest);
        writeFile(monitor, 'forecasts', 'forecast_hrrr_waypoints_us40_dense_20261121_0500Z.json', 10 * MIN);
        writeFile(monitor, 'forecasts', 'forecast_hrrr_surface_layers_20261121_0500Z.json', HOUR);
        writeFile(monitor, 'forecasts', 'forecast_possibility_heatmap_clyfar001_20261120_1800Z.json', 20 * HOUR);

        const { forecasts } = await monitor.checkDataFreshness();

        expect(forecasts.products.possibility_heatmap.status).toBe('stale');
        expect(forecasts.status).toBe('stale');
        expect(forecasts.staleProducts).toEqual(['possibility_heatmap']);
    });

    test('files the manifest does not list are named, with member numbers folded', async () => {
        monitor = await makeMonitor(manifest);
        writeFile(monitor, 'forecasts', 'forecast_hrrr_waypoints_us40_dense_20261121_0500Z.json', 10 * MIN);
        writeFile(monitor, 'forecasts', 'forecast_rrfs_surface_layers_20261121_0000Z.json', 2 * HOUR);
        writeFile(monitor, 'forecasts', 'forecast_gefs_weather_clyfar001_20261120_1800Z.json', 4 * HOUR);
        writeFile(monitor, 'forecasts', 'forecast_gefs_weather_clyfar028_20261120_1800Z.json', 4 * HOUR);

        const { forecasts } = await monitor.checkDataFreshness();

        expect(forecasts.undeclared).toEqual([
            'forecast_gefs_weather_clyfar#_*.json',
            'forecast_rrfs_surface_layers_*.json',
        ]);
        // A product with no file on this box says so and is not counted as late.
        expect(forecasts.products.hrrr_surface_layers).toEqual({ status: 'no_data', message: 'No file of this product on this box' });
        expect(forecasts.status).toBe('fresh');
    });
});

describe('the real manifest', () => {
    const real = JSON.parse(fs.readFileSync(
        path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../DATA_MANIFEST.json'), 'utf8'
    ));

    test('every product pattern matches its own example file', async () => {
        const { productPatternToRegExp } = await import('../monitoring/dataMonitor.js');
        const { productOf } = await import('../uploadIndex.js');
        const products = Object.entries(real.dataTypes.forecasts.products);
        expect(products.length).toBeGreaterThanOrEqual(6);
        for (const [name, product] of products) {
            const pattern = productPatternToRegExp(product.filename.pattern);
            expect([name, pattern.test(productOf(product.filename.example).product)]).toEqual([name, true]);
        }
    });

    test('files as they arrive are claimed by the product that declares them, and by no other', async () => {
        const { productPatternToRegExp } = await import('../monitoring/dataMonitor.js');
        const { productOf } = await import('../uploadIndex.js');
        const claims = (filename) => Object.entries(real.dataTypes.forecasts.products)
            .filter(([, product]) => productPatternToRegExp(product.filename.pattern).test(productOf(filename).product))
            .map(([name]) => name);

        expect(claims('forecast_hrrr_surface_layers_20261121_0500Z.json')).toEqual(['hrrr_surface_layers']);
        expect(claims('forecast_hrrr_waypoints_us40_dense_20261121_0500Z.json')).toEqual(['hrrr_waypoints']);
        expect(claims('forecast_hrrr_kvel_crosswind_20261121_0500Z.json')).toEqual(['hrrr_kvel_crosswind']);
        expect(claims('forecast_possibility_heatmap_clyfar028_20261120_1800Z.json')).toEqual(['possibility_heatmap']);
        expect(claims('forecast_percentile_scenarios_clyfar000_20261120_1800Z.json')).toEqual(['percentile_scenarios']);
        expect(claims('forecast_exceedance_probabilities_20261120_1800Z.json')).toEqual(['exceedance_probabilities']);
        // Clyfar's three families, declared in 2.5.0 (P28). The member pattern must not claim
        // the percentiles file: forecast_gefs_weather_{member}_ would have.
        expect(claims('forecast_clustering_summary_20261120_1800Z.json')).toEqual(['clustering_summary']);
        expect(claims('forecast_gefs_weather_percentiles_20261120_1800Z.json')).toEqual(['gefs_weather_percentiles']);
        expect(claims('forecast_gefs_weather_clyfar000_20261120_1800Z.json')).toEqual(['gefs_weather_members']);
        expect(claims('forecast_gefs_weather_clyfar030_20261120_1800Z.json')).toEqual(['gefs_weather_members']);
        // The hand-run RRFS draft on .dev (2026-11-21) is not a product.
        expect(claims('forecast_rrfs_surface_layers_20261121_0000Z.json')).toEqual([]);
    });

    test('a whole Clyfar run is claimed: nothing but the RRFS draft is undeclared', async () => {
        monitor = await makeMonitor(real.dataTypes);
        const MIN = 60 * 1000;
        const members = Array.from({ length: 31 }, (_, i) => `clyfar${String(i).padStart(3, '0')}`);
        const names = [
            ...members.flatMap((m) => [
                `forecast_possibility_heatmap_${m}_20261121_0000Z.json`,
                `forecast_percentile_scenarios_${m}_20261121_0000Z.json`,
                `forecast_gefs_weather_${m}_20261121_0000Z.json`,
            ]),
            'forecast_exceedance_probabilities_20261121_0000Z.json',
            'forecast_gefs_weather_percentiles_20261121_0000Z.json',
            'forecast_clustering_summary_20261121_0000Z.json',
            'forecast_rrfs_surface_layers_20261121_0000Z.json',
        ];
        expect(names).toHaveLength(real.dataTypes.forecasts.validation.totalFilesPerRun + 1);
        for (const name of names) writeFile(monitor, 'forecasts', name, 60 * MIN);

        const { forecasts } = await monitor.checkDataFreshness();

        expect(forecasts.undeclared).toEqual(['forecast_rrfs_surface_layers_*.json']);
        for (const product of ['clustering_summary', 'gefs_weather_percentiles', 'gefs_weather_members']) {
            expect([product, forecasts.products[product].status]).toEqual([product, 'fresh']);
        }
        expect(forecasts.products.gefs_weather_members.totalFiles).toBe(31);
    });

    test('P26: the wind frame and the producer stamp are declared, and the example obeys its own patterns', () => {
        const winds = real.dataTypes.forecasts.products.hrrr_surface_layers.schema.properties.variables.properties;
        expect(winds.wind_u_10m_ms.properties.frame.enum).toEqual(['earth']);
        expect(winds.wind_v_10m_ms.properties.frame.enum).toEqual(['earth']);

        const { schema, example, field } = real.provenance;
        const stamp = example[field];
        expect(stamp.commit).toMatch(new RegExp(schema.properties.commit.pattern));
        expect(stamp.ops).toMatch(new RegExp(schema.properties.ops.pattern));
        expect(schema.required.every((key) => key in stamp)).toBe(true);
        // Observations and metadata are bare lists: a top-level key would be a MAJOR change.
        expect(real.dataTypes.observations.schema.type).toBe('array');
        expect(Object.keys(real.provenance.notIn)).toEqual(expect.arrayContaining(['observations', 'metadata']));
    });

    test('from 2.5.0 the surface layers are hourly (P11): a six-hour bundle goes stale between bundles', async () => {
        const { judgeAge } = await import('../monitoring/dataMonitor.js');
        const { schedule } = real.dataTypes.forecasts.products.hrrr_surface_layers;
        expect(judgeAge(119, schedule).status).toBe('fresh');
        expect(judgeAge(121, schedule).status).toBe('stale');
    });

    test('on a box fed as .dev was on 2026-11-21, nothing reads stale', async () => {
        monitor = await makeMonitor(real.dataTypes);
        const MIN = 60 * 1000;
        writeFile(monitor, 'observations', 'map_obs_20261121_0755Z.json', 4 * MIN);
        writeFile(monitor, 'metadata', 'map_obs_meta_20261121_0446Z.json', 194 * MIN);
        writeFile(monitor, 'outlooks', 'outlook_20261112_0337.md', 12802 * MIN);
        writeFile(monitor, 'llm_outlooks', 'LLM-OUTLOOK-20261120_1800Z.md', 198 * MIN);
        writeFile(monitor, 'images', 'meteogram_UB-repr_wind_20261120-1800_GEFS.png', 202 * MIN);
        writeFile(monitor, 'road-forecast', 'road_forecast_20261121_0722Z.json', 38 * MIN);
        writeFile(monitor, 'road-forecast', 'latest.json', 38 * MIN);
        writeFile(monitor, 'forecasts', 'forecast_hrrr_kvel_crosswind_20261121_0500Z.json', 3 * MIN);
        writeFile(monitor, 'forecasts', 'forecast_hrrr_waypoints_us40_dense_20261121_0500Z.json', 10 * MIN);
        writeFile(monitor, 'forecasts', 'forecast_hrrr_surface_layers_20261121_0500Z.json', 14 * MIN);
        for (const product of ['possibility_heatmap_clyfar001', 'percentile_scenarios_clyfar001', 'exceedance_probabilities']) {
            writeFile(monitor, 'forecasts', `forecast_${product}_20261120_1800Z.json`, 203 * MIN);
        }

        const freshness = await monitor.checkDataFreshness();
        const statuses = Object.fromEntries(Object.entries(freshness).map(([name, entry]) => [name, entry.status]));

        expect(statuses).toEqual({
            observations: 'fresh',
            metadata: 'fresh',
            outlooks: 'unscheduled',   // was "stale": a person writes these
            llm_outlooks: 'fresh',     // was "stale" 4 hours in every 6
            images: 'fresh',
            forecasts: 'fresh',
            'road-forecast': 'fresh',
            llm_forecasts: 'missing',
            aircraft: 'missing',
        });
        expect(freshness.observations.expectedFreqMinutes).toBe(5);
        // latest.json is the server's copy, not an upload.
        expect(freshness['road-forecast']).toMatchObject({ latestFile: 'road_forecast_20261121_0722Z.json', totalFiles: 1 });
    });
});
