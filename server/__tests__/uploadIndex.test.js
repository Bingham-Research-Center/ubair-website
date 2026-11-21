import fs from 'fs';
import os from 'os';
import path from 'path';
import {
    UploadIndex,
    getUploadIndex,
    isGeneratedIndex,
    isPointerCopy,
    isTrackedFile,
    productOf,
    removeLegacyFilelist,
    _resetUploadIndexForTests,
} from '../uploadIndex.js';

// The upload index: the newest file of each product, known without listing a directory.
// Measured on 2026-11-21, the three things that listed one instead: freshness (3.1 s on .com,
// the whole site waiting), every upload (about 100 ms on .dev, 142 times per Clyfar run), and
// every map load (the browser was sent 99,000 names to find one).

const HOUR = 60 * 60 * 1000;
let root;

beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'upload-index-'));
    _resetUploadIndexForTests();
});

afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

function put(dataType, name, ageMs = 0) {
    const dir = path.join(root, dataType);
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, name);
    fs.writeFileSync(file, '{}');
    const when = new Date(Date.now() - ageMs);
    fs.utimesSync(file, when, when);
    return file;
}

describe('productOf', () => {
    test.each([
        ['map_obs_20261121_0755Z.json', 'map_obs_*.json', '202611210755'],
        ['map_obs_meta_20261121_0446Z.json', 'map_obs_meta_*.json', '202611210446'],
        ['forecast_hrrr_waypoints_us40_dense_20261121_0500Z.json', 'forecast_hrrr_waypoints_us40_dense_*.json', '202611210500'],
        ['forecast_possibility_heatmap_clyfar028_20261120_1800Z.json', 'forecast_possibility_heatmap_clyfar028_*.json', '202611201800'],
        ['heatmap_UB-poss_ozone_20261120-1800_clyfar028.png', 'heatmap_UB-poss_ozone_*_clyfar028.png', '202611201800'],
        ['LLM-OUTLOOK-20261120_1800Z.pdf', 'LLM-OUTLOOK-*.pdf', '202611201800'],
        ['outlook_20261112_0337.md', 'outlook_*.md', '202611120337'],
        ['llm_forecast_ffion_20261203_1210Z.json', 'llm_forecast_ffion_*.json', '202612031210'],
    ])('%s is one of %s', (filename, product, stamp) => {
        expect(productOf(filename)).toEqual({ product, stamp });
    });

    test('a name with no time stamp is a product of its own', () => {
        expect(productOf('template-2025-2026.md')).toEqual({ product: 'template-2025-2026.md', stamp: '' });
    });
});

describe('what the index keeps', () => {
    test('producers\' payloads, not indexes, the server\'s copies or temporary files', () => {
        expect(isTrackedFile('map_obs_20261121_0755Z.json')).toBe(true);
        expect(isTrackedFile('LLM-OUTLOOK-20261120_1800Z.pdf')).toBe(true);

        expect(isTrackedFile('forecast_hrrr_surface_layers_index.json')).toBe(false);
        expect(isTrackedFile('outlooks_list.json')).toBe(false);
        expect(isTrackedFile('filelist.json')).toBe(false);
        expect(isTrackedFile('latest.json')).toBe(false);
        expect(isTrackedFile('latest_ffion.json')).toBe(false);
        expect(isTrackedFile('.upload-123-abcdef.part')).toBe(false);
        expect(isTrackedFile('notes.docx')).toBe(false);
    });

    test('a pointer copy is named latest, and a payload that merely starts that way is not one', () => {
        expect(isPointerCopy('latest.json')).toBe(true);
        expect(isPointerCopy('latest_rhiannon.json')).toBe(true);
        expect(isPointerCopy('latest_run_20261121_0500Z.json')).toBe(false);
        expect(isGeneratedIndex('latest.json')).toBe(false);
    });
});

describe('reading the directories', () => {
    test('the newest file of each product is the one with the latest stamp in its name', async () => {
        put('observations', 'map_obs_20261121_0750Z.json', 10 * 60000);
        put('observations', 'map_obs_20261121_0755Z.json', 5 * 60000);
        put('observations', 'map_obs_20261120_2355Z.json', 8 * HOUR);
        put('observations', 'filelist.json');
        put('forecasts', 'forecast_hrrr_kvel_crosswind_20261121_0500Z.json', HOUR);
        put('forecasts', 'forecast_hrrr_kvel_crosswind_20261121_0400Z.json', 2 * HOUR);
        put('forecasts', 'forecast_hrrr_surface_layers_20261121_0500Z.json', HOUR);
        put('forecasts', 'forecast_hrrr_surface_layers_index.json');

        const index = new UploadIndex(root);
        await index.ready();

        expect(index.latest('observations', 'map_obs_')).toEqual({ filename: 'map_obs_20261121_0755Z.json', stamp: '202611210755' });
        expect(index.latest('forecasts', 'forecast_hrrr_kvel_crosswind_').filename).toBe('forecast_hrrr_kvel_crosswind_20261121_0500Z.json');
        // A prefix is a whole product name, not the start of several.
        expect(index.latest('forecasts', 'forecast_hrrr_')).toBeNull();
        expect(index.latest('metadata', 'map_obs_meta_')).toBeNull();

        const observations = index.overview('observations');
        expect(observations.exists).toBe(true);
        expect(observations.products).toHaveLength(1);
        expect(observations.products[0]).toMatchObject({ product: 'map_obs_*.json', count: 3, receivedName: 'map_obs_20261121_0755Z.json' });
        expect(Date.now() - observations.products[0].receivedAtMs).toBeGreaterThanOrEqual(5 * 60000 - 2000);
    });

    test('a dataType nobody has uploaded to does not exist, and that is not an error', async () => {
        const index = new UploadIndex(root);
        await index.ready();
        expect(index.overview('aircraft')).toMatchObject({ exists: false, error: null, products: [] });
        expect(index.newestReceivedAtMs()).toBeNull();
    });

    test('"when did anything last arrive" is the newest file across every dataType', async () => {
        put('observations', 'map_obs_20261121_0755Z.json', 40 * 60000);
        put('metadata', 'map_obs_meta_20261121_0446Z.json', 3 * HOUR);
        const index = new UploadIndex(root);
        await index.ready();
        const age = Date.now() - index.newestReceivedAtMs();
        expect(age).toBeGreaterThanOrEqual(40 * 60000 - 2000);
        expect(age).toBeLessThan(41 * 60000);
    });

    test('a temporary file left by a process that died mid-upload is removed; one in flight is not', async () => {
        const stale = put('forecasts', '.upload-999-aaaaaaaaaaaa.part', 2 * HOUR);
        const inFlight = put('forecasts', '.upload-999-bbbbbbbbbbbb.part', 30 * 1000);
        const index = new UploadIndex(root);
        await index.ready();
        expect(fs.existsSync(stale)).toBe(false);
        expect(fs.existsSync(inFlight)).toBe(true);
        expect(index.overview('forecasts').products).toEqual([]);
    });

    test('one index per upload root, shared by everything that asks for it', () => {
        expect(getUploadIndex(root)).toBe(getUploadIndex(path.join(root, '.')));
        expect(getUploadIndex(root)).not.toBe(getUploadIndex(path.join(root, 'elsewhere')));
    });
});

describe('noting an upload', () => {
    test('a new file becomes the newest and is counted once', async () => {
        put('observations', 'map_obs_20261121_0755Z.json', 5 * 60000);
        const index = new UploadIndex(root);
        await index.ready();

        index.noteUpload('observations', 'map_obs_20261121_0800Z.json');
        expect(index.latest('observations', 'map_obs_').filename).toBe('map_obs_20261121_0800Z.json');
        expect(index.overview('observations').products[0]).toMatchObject({ count: 2, receivedName: 'map_obs_20261121_0800Z.json' });

        // The same name again replaces the file: received, not counted twice.
        index.noteUpload('observations', 'map_obs_20261121_0800Z.json', { isNew: false });
        expect(index.overview('observations').products[0].count).toBe(2);
    });

    test('an older run sent late is recorded as received but is not the newest', async () => {
        const index = new UploadIndex(root);
        await index.ready();
        index.noteUpload('forecasts', 'forecast_hrrr_waypoints_us40_dense_20261121_0500Z.json', { atMs: 1000 });
        index.noteUpload('forecasts', 'forecast_hrrr_waypoints_us40_dense_20261121_0300Z.json', { atMs: 2000 });

        expect(index.latest('forecasts', 'forecast_hrrr_waypoints_us40_dense_').filename)
            .toBe('forecast_hrrr_waypoints_us40_dense_20261121_0500Z.json');
        expect(index.overview('forecasts').products[0]).toMatchObject({
            count: 2, receivedAtMs: 2000, receivedName: 'forecast_hrrr_waypoints_us40_dense_20261121_0300Z.json',
        });
    });

    test('the first upload to a dataType makes it exist, and an index file is not a product', async () => {
        const index = new UploadIndex(root);
        await index.ready();
        index.noteUpload('aircraft', 'aircraft_profile_index.json');
        expect(index.overview('aircraft')).toMatchObject({ exists: true, products: [] });
    });

    test('an upload noted while a directory is being read again is not lost to the older listing', async () => {
        put('observations', 'map_obs_20261121_0755Z.json', 5 * 60000);
        const index = new UploadIndex(root);
        await index.ready();

        // The scan lists the directory before this file exists in it; the route then notes it.
        const scan = index.scan('observations');
        index.noteUpload('observations', 'map_obs_20261121_0800Z.json', { atMs: Date.now() + 1000 });
        await scan;

        expect(index.latest('observations', 'map_obs_').filename).toBe('map_obs_20261121_0800Z.json');
        expect(index.overview('observations').products[0].count).toBe(2);
    });

    test('a directory is read again only when it was last read too long ago', async () => {
        put('outlooks', 'outlook_20261112_0337.md', HOUR);
        const index = new UploadIndex(root);
        await index.ready();

        // Copied in by hand, as outlooks are: the index does not know until it reads again.
        put('outlooks', 'outlook_20261121_0900.md');
        index.refreshOlderThan(HOUR);
        await Promise.all(index.scanning.values());
        expect(index.latest('outlooks', 'outlook_', '.md').filename).toBe('outlook_20261112_0337.md');

        index.refreshOlderThan(HOUR, Date.now() + 2 * HOUR);
        await Promise.all(index.scanning.values());
        expect(index.latest('outlooks', 'outlook_', '.md').filename).toBe('outlook_20261121_0900.md');
    });
});

describe('removeLegacyFilelist', () => {
    test('removes the list nothing writes any more, and only that', () => {
        const fossil = put('observations', 'filelist.json');
        const data = put('observations', 'map_obs_20261121_0755Z.json');
        expect(removeLegacyFilelist(root)).toBe(true);
        expect(fs.existsSync(fossil)).toBe(false);
        expect(fs.existsSync(data)).toBe(true);
        expect(removeLegacyFilelist(root)).toBe(false);
    });
});
