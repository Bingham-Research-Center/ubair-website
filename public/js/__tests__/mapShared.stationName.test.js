import fs from 'fs';
import { describe, it, expect } from '@jest/globals';
import { mapStationName, cleanMetadataName } from '../mapShared.js';

const META = JSON.parse(fs.readFileSync(new URL('./fixtures/map_obs_meta_20261121_0336Z.json', import.meta.url), 'utf8'));

describe('mapStationName', () => {
    it('names a town monitor for the town and the airport for what it is', () => {
        expect(mapStationName('QV4', 'Vernal')).toBe('Vernal');
        expect(mapStationName('KVEL', 'Vernal Airport')).toBe('Vernal airport');
        expect(mapStationName('COOPVELU1', 'VERNAL')).toBe('Vernal co-op');
        expect(mapStationName('QRS', 'Roosevelt')).toBe('Roosevelt');
        expect(mapStationName('K74V', 'ROOSEVELT')).toBe('Roosevelt airport');
        expect(mapStationName('A1388', 'Myton')).toBe('Myton');
        expect(mapStationName('UTMYT', 'US-40 at MP 105 Myton')).toBe('US-40 at Myton');
    });

    // The homepage looked for "Red Wash" and the feed said "Redwash", so it stayed grey.
    it('names the monitors the homepage used to miss', () => {
        expect(mapStationName('A1633', 'Redwash')).toBe('Red Wash');
        expect(mapStationName('A3822', 'Dinosaur National Monument')).toBe('Dinosaur NM');
    });

    it('gives no two stations in the feed the same name', () => {
        const names = META.map((s) => mapStationName(s.stid, s.name));
        const repeated = names.filter((name, i) => names.indexOf(name) !== i);
        expect(repeated).toEqual([]);
    });

    it('does not remap legacy aliases to basin town names', () => {
        expect(mapStationName('CEN', 'Centerville')).toBe('Centerville');
        expect(mapStationName('BUNUT', 'Bunnell')).toBe('Bunnell');
    });
});

describe('cleanMetadataName', () => {
    it('tidies metadata names and keeps road codes in capitals', () => {
        expect(cleanMetadataName('ALTA - GUARD STATION RADIO')).toBe('Alta Guard Station');
        expect(cleanMetadataName('US-40 at MP 66 Fruitland')).toBe('US-40 at MP 66 Fruitland');
        expect(cleanMetadataName('I-15 @ Orem')).toBe('I-15 @ Orem');
        expect(cleanMetadataName('SR-87 at MP 16 Mountain Home')).toBe('SR-87 at MP 16 Mountain Home');
    });
});
