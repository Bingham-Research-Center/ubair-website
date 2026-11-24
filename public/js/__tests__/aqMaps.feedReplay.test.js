import fs from 'fs';
import { describe, it, expect } from '@jest/globals';
import { processObservationData } from '../api.js';
import { HOME_STATIONS, STATIONS } from '../config.js';
import { describeStation, homeStationIds, liveAqStationIds, mapStationName, stationReading } from '../mapShared.js';

// The real feed as it stood at 03:36Z on 21 Nov 2026, replayed through the maps' own code.
// Each test pins a fault that file showed on .dev that day.
const raw = JSON.parse(fs.readFileSync(new URL('./fixtures/map_obs_20261121_0336Z.json', import.meta.url), 'utf8'));
const rawMeta = JSON.parse(fs.readFileSync(new URL('./fixtures/map_obs_meta_20261121_0336Z.json', import.meta.url), 'utf8'));
const metadata = Object.fromEntries(rawMeta.map((s) => [s.stid, { name: s.name, lat: s.latitude, lng: s.longitude }]));
const observations = processObservationData(raw);
const now = new Date('2026-11-21T03:40:00Z');
const station = (stid) => describeStation(stid, { observations, metadata, now });

describe('one marker, one station', () => {
    it('shows the Vernal monitor its own temperature, not a co-op reading 14 h old', () => {
        const vernal = station('QV4');
        expect(vernal.name).toBe('Vernal');
        expect(vernal.measurements.Ozone).toBe(37);
        expect(vernal.measurements.Temperature).toBe(0.306); // was -0.556 from COOPVELU1 at 13:30Z
        expect(vernal.observedAt).toBe('2026-11-21T03:00:00.000Z');
    });

    // On Live AQ, 16 markers were ozone-coloured while 11 stations measure ozone.
    it('gives an ozone colour only to stations that measure ozone', () => {
        const coloured = liveAqStationIds(metadata)
            .map(station).filter(Boolean)
            .filter((s) => !['weather', 'nodata'].includes(s.status))
            .map((s) => s.stid).sort();
        const monitors = [...new Set(raw.filter((r) => r.variable === 'ozone_concentration').map((r) => r.stid))].sort();
        expect(coloured).toEqual(monitors);
        expect(coloured).toHaveLength(11);
    });

    it('never lends ozone to the airport, the road sensor or a silent station', () => {
        expect(station('KVEL').measurements.Ozone).toBeUndefined();
        expect(station('KVEL').status).toBe('weather');
        expect(station('UTMYT').measurements.Ozone).toBeUndefined();
        expect(station('COOPROSU1').status).toBe('nodata');
    });

    it('finds the Red Wash and Dinosaur NM monitors the homepage missed', () => {
        expect(station('A1633')).toMatchObject({ name: 'Red Wash', status: 'good' });
        expect(station('A1633').measurements.Ozone).toBe(38);
        expect(station('A3822')).toMatchObject({ name: 'Dinosaur NM', status: 'good' });
    });
});

describe('how old a reading may be', () => {
    it('shows daily co-op snow depth up to 30 h old, and nothing else that old', () => {
        // COOPDINU1 reported at 15:48Z the day before: 12 h old.
        const dino = station('A3822');
        expect(dino.companions).toHaveLength(1);
        expect(dino.companions[0]).toMatchObject({ stid: 'COOPDINU1', name: 'Dinosaur NM co-op' });
        expect(dino.companions[0].measurements).toEqual({ 'Snow Depth': 0 });

        const vernalCoop = station('COOPVELU1');
        expect(vernalCoop.measurements).toEqual({ 'Snow Depth': 50.8 });
        expect(vernalCoop.status).toBe('weather');
    });

    it('drops a snow depth past 30 h and any other reading past 3 h', () => {
        const at = (minutes) => new Date(new Date('2026-11-21T03:00:00Z').getTime() + minutes * 60000);
        const obs = processObservationData([
            { stid: 'X', variable: 'ozone_concentration', value: 40, date_time: '2026-11-21T03:00:00Z', units: 'ppb' },
            { stid: 'X', variable: 'snow_depth', value: 30, date_time: '2026-11-21T03:00:00Z', units: 'Millimeters' }
        ]);
        expect(Object.keys(stationReading(obs, 'X', at(180)).measurements)).toEqual(['Ozone', 'Snow Depth']);
        expect(Object.keys(stationReading(obs, 'X', at(181)).measurements)).toEqual(['Snow Depth']);
        expect(Object.keys(stationReading(obs, 'X', at(30 * 60 + 1)).measurements)).toEqual([]);
        expect(stationReading(obs, 'X', at(30 * 60 + 1)).lastReportAt).toBe('2026-11-21T03:00:00Z');
    });
});

describe('the homepage map', () => {
    it('draws the Basin floor only: no mountain passes', () => {
        for (const pass of ['UTDAN', 'UTICS', 'UTSLD']) expect(HOME_STATIONS).not.toContain(pass);
    });

    it('draws the monitors that stopped reporting, grey, and leaves off one the feed never carried', () => {
        const drawn = homeStationIds(observations, metadata);
        expect(drawn).toEqual(expect.arrayContaining(['UBHSP', 'UBCSP', 'UB7ST', 'A1633', 'A3822', 'COOPALMU1', 'COOPNELU1']));
        expect(drawn).not.toContain('QFL'); // active on Synoptic, not yet in the CHPC feed
        for (const stid of ['UBHSP', 'UBCSP', 'UB7ST']) {
            const s = station(stid);
            expect(s.status).toBe('nodata');
            expect(s.notReportingSince).toBe(STATIONS[stid].notReportingSince);
        }
    });

    it('places every station it draws', () => {
        for (const stid of homeStationIds(observations, metadata)) expect(station(stid)).not.toBeNull();
    });
});

// Rangely and the two Dinosaur stations are in CHPC's request but refused by Synoptic until the
// token covers Colorado. Nothing is drawn for them before their data arrives, and nothing has
// to change here when it does.
describe('the Colorado stations, before and after the feed carries them', () => {
    it('draws none of them while the feed has none', () => {
        for (const stid of ['K4V0', 'DNOC2', 'SURC2']) {
            expect(metadata[stid]).toBeUndefined();
            expect(station(stid)).toBeNull(); // no position is kept here to draw one from
            expect(liveAqStationIds(metadata)).not.toContain(stid);
        }
        expect(homeStationIds(observations, metadata)).not.toContain('K4V0');
    });

    it('draws Rangely on Live AQ, by its own readings, once it arrives', () => {
        const withRangely = { ...metadata, K4V0: { name: 'RANGELY AIRPORT', lat: 40.09397, lng: -108.76306 } };
        const arrived = {
            ...observations,
            Temperature: { ...observations.Temperature, K4V0: 5 },
            _times: { ...observations._times, K4V0: { Temperature: '2026-11-21T03:35:00.000Z' } },
            _timestamps: { ...observations._timestamps, K4V0: '2026-11-21T03:35:00.000Z' },
        };
        expect(liveAqStationIds(withRangely)).toContain('K4V0');
        // The homepage map stays on the stations it has until JRL adds Rangely to it: fitting
        // Rangely in zooms that map out a level.
        expect(homeStationIds(arrived, withRangely)).not.toContain('K4V0');

        const rangely = describeStation('K4V0', { observations: arrived, metadata: withRangely, now });
        expect(rangely).toMatchObject({ name: 'Rangely', lat: 40.09397, lng: -108.76306, status: 'weather', notReportingSince: null });
        expect(rangely.measurements).toEqual({ Temperature: 5 });
    });

    it('names the two Dinosaur stations so neither reads as the Monument\'s ozone monitor', () => {
        expect(mapStationName('DNOC2', 'DINOSAUR 2 E')).toBe('Dinosaur, Colorado');
        expect(mapStationName('SURC2', 'DINOSAUR NM SUCCESS')).toBe('Dinosaur NM (Success)');
        expect(mapStationName('A3822', 'Dinosaur National Monument')).toBe('Dinosaur NM');
        for (const stid of ['K4V0', 'DNOC2', 'SURC2']) expect(HOME_STATIONS).not.toContain(stid);
    });
});

describe('the Live AQ map', () => {
    it('draws a companion inside its neighbour, not on top of it', () => {
        const ids = liveAqStationIds(metadata);
        expect(ids).not.toContain('COOPDINU1');
        expect(ids).not.toContain('COOPFTDU1');
        expect(ids).toEqual(expect.arrayContaining(['A3822', 'UINU1', 'UBHSP', 'UBCSP', 'UB7ST']));
    });
});
