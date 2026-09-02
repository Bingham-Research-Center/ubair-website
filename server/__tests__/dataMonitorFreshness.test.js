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
    // outlooks really carries; parseFrequency falls back to 60 minutes for it.
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

        const { outlooks } = monitor.checkDataFreshness();

        expect(outlooks.latestFile).not.toBe('outlooks_list.json');
        expect(outlooks.status).toBe('stale');
        expect(outlooks.ageMinutes).toBeGreaterThan(60);
    });

    test('a directory holding only indexes reports no_data, not fresh', async () => {
        monitor = await makeMonitor(outlooksManifest);
        writeFile(monitor, 'outlooks', 'outlooks_list.json', 0);

        const { outlooks } = monitor.checkDataFreshness();

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

        const { observations } = monitor.checkDataFreshness();

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

        const { forecasts } = monitor.checkDataFreshness();

        expect(forecasts.latestFile).toBe('forecast_hrrr_surface_layers_20260427_2100Z.json');
        expect(forecasts.status).toBe('stale');
        // The age must reflect the run file (~120 days), not the index (~3 h).
        expect(forecasts.ageMinutes).toBeGreaterThan(100 * 24 * 60);
    });

    test('a directory holding only a producer index reports no_data', async () => {
        monitor = await makeMonitor(forecastsManifest);
        writeFile(monitor, 'forecasts', 'forecast_hrrr_surface_layers_index.json', 0);

        const { forecasts } = monitor.checkDataFreshness();

        expect(forecasts.status).toBe('no_data');
        expect(forecasts.ageMinutes).toBeUndefined();
    });

    test('timestamped run files are never mistaken for indexes', async () => {
        monitor = await makeMonitor(forecastsManifest);
        writeFile(monitor, 'forecasts', 'forecast_hrrr_surface_layers_20260825_0300Z.json', 60 * 1000);
        writeFile(monitor, 'forecast_unused', 'ignored.json', 0);

        const { forecasts } = monitor.checkDataFreshness();

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
