import { describe, it, expect } from '@jest/globals';
import { mapStationName } from '../mapShared.js';

describe('mapStationName', () => {
    it('maps known station aliases to canonical display names', () => {
        expect(mapStationName('KU69', 'Duchesne')).toBe('Duchesne');
        expect(mapStationName('COOPDSNU1', 'Duchesne COOP')).toBe('Duchesne');
        expect(mapStationName('UBMYT', 'Myton')).toBe('Myton');
        expect(mapStationName('UTMYT', 'Myton')).toBe('Myton');
    });

    it('maps bluebell, manila, and starvation consistently', () => {
        expect(mapStationName('UCC34', 'Bluebell COOP')).toBe('Bluebell');
        expect(mapStationName('K40U', 'Manila COOP')).toBe('Manila');
        expect(mapStationName('UTSTV', 'Starvation COOP')).toBe('Starvation');
    });

    it('normalizes unknown stations from metadata naming conventions', () => {
        expect(mapStationName('TEST1', 'ALTA - GUARD STATION RADIO')).toBe('Alta Guard Station');
    });

    it('does not remap legacy aliases to basin town names', () => {
        expect(mapStationName('CEN', 'Centerville')).toBe('Centerville');
        expect(mapStationName('BUNUT', 'Bunnell')).toBe('Bunnell');
    });
});
