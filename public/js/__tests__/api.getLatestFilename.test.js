import { describe, it, expect, afterEach, jest } from '@jest/globals';
import { getLatestFilename } from '../api.js';

// Every map and current-conditions panel starts by asking which observation file is newest.
// Until 1.7.9 the answer was the whole directory listing, sorted in the browser: 99,000 names
// on .com, 255 KB gzipped, twice per map load.

const json = (body, ok = true, status = 200) => ({ ok, status, json: async () => body });

afterEach(() => {
    delete global.fetch;
});

describe('getLatestFilename', () => {
    it('asks the server for the one name', async () => {
        global.fetch = jest.fn(async () => json({ dataType: 'observations', prefix: 'map_obs_', filename: 'map_obs_20261121_0755Z.json' }));
        await expect(getLatestFilename('map_obs_', 'observations')).resolves.toBe('map_obs_20261121_0755Z.json');
        expect(global.fetch).toHaveBeenCalledTimes(1);
        expect(global.fetch.mock.calls[0][0]).toBe('/api/latest/observations?prefix=map_obs_');
    });

    it('says there is no file when the server knows of none, without downloading the list', async () => {
        global.fetch = jest.fn(async () => json({ dataType: 'forecasts', prefix: 'forecast_hrrr_kvel_crosswind_', filename: null }));
        await expect(getLatestFilename('forecast_hrrr_kvel_crosswind_', 'forecasts')).rejects.toThrow(/No files found/);
        expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('falls back to the list while the route is not there (between a deploy\'s pull and its restart)', async () => {
        global.fetch = jest.fn(async (url) => (url.startsWith('/api/latest/')
            ? json({ error: 'not found' }, false, 404)
            : json(['map_obs_20261121_0750Z.json', 'map_obs_20261121_0755Z.json', 'map_obs_meta_20261121_0446Z.json', 'filelist.json'])));
        await expect(getLatestFilename('map_obs_', 'observations')).resolves.toBe('map_obs_20261121_0755Z.json');
        expect(global.fetch.mock.calls.map(([url]) => url)).toEqual([
            '/api/latest/observations?prefix=map_obs_',
            '/api/filelist/observations?prefix=map_obs_',
        ]);
    });

    it('falls back to the list when the request itself fails', async () => {
        global.fetch = jest.fn(async (url) => {
            if (url.startsWith('/api/latest/')) throw new TypeError('Failed to fetch');
            return json(['map_obs_meta_20261121_0446Z.json']);
        });
        await expect(getLatestFilename('map_obs_meta_', 'metadata')).resolves.toBe('map_obs_meta_20261121_0446Z.json');
    });

    it('fails plainly when neither answers', async () => {
        global.fetch = jest.fn(async () => json({}, false, 502));
        await expect(getLatestFilename('map_obs_', 'observations')).rejects.toThrow('Unable to list files: 502');
    });
});
