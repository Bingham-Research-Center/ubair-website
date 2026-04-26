import { describe, it, expect } from '@jest/globals';
import { processObservationData } from '../api.js';

describe('processObservationData', () => {
    it('keys observations by canonical station names used by map rendering', () => {
        const rawData = [
            {
                stid: 'KU69',
                variable: 'ozone_concentration',
                value: 52,
                date_time: '2026-02-27T00:00:00Z',
                units: 'ppb'
            },
            {
                stid: 'COOPDSNU1',
                variable: 'ozone_concentration',
                value: 58,
                date_time: '2026-02-27T00:05:00Z',
                units: 'ppb'
            },
            {
                stid: 'UCC34',
                variable: 'ozone_concentration',
                value: 61,
                date_time: '2026-02-27T00:10:00Z',
                units: 'ppb'
            },
            {
                stid: 'K40U',
                variable: 'ozone_concentration',
                value: 47,
                date_time: '2026-02-27T00:15:00Z',
                units: 'ppb'
            },
            {
                stid: 'UTSTV',
                variable: 'ozone_concentration',
                value: 49,
                date_time: '2026-02-27T00:20:00Z',
                units: 'ppb'
            },
            {
                stid: 'UBMYT',
                variable: 'air_temp',
                value: 5,
                date_time: '2026-02-27T00:25:00Z',
                units: 'Celsius'
            }
        ];

        const metadata = {
            KU69: { name: 'Duchesne' },
            COOPDSNU1: { name: 'Duchesne COOP' },
            UCC34: { name: 'Bluebell' },
            K40U: { name: 'Manila' },
            UTSTV: { name: 'Starvation' },
            UBMYT: { name: 'Myton' }
        };

        const result = processObservationData(rawData, metadata);

        expect(result.Ozone.Duchesne).toBe(52);
        expect(result.Ozone.Bluebell).toBe(61);
        expect(result.Ozone.Manila).toBe(47);
        expect(result.Ozone.Starvation).toBe(49);
        expect(result.Temperature.Myton).toBe(5);

        expect(result._timestamps.Duchesne).toBe('2026-02-27T00:05:00Z');
        expect(result._units.Ozone).toBe('ppb');
        expect(result._units.Temperature).toBe('Celsius');
    });

    it('preserves zero values when merging alias station IDs', () => {
        const rawData = [
            {
                stid: 'KU69',
                variable: 'ozone_concentration',
                value: 0,
                date_time: '2026-02-27T01:00:00Z',
                units: 'ppb'
            },
            {
                stid: 'COOPDSNU1',
                variable: 'ozone_concentration',
                value: 12,
                date_time: '2026-02-27T01:05:00Z',
                units: 'ppb'
            }
        ];

        const metadata = {
            KU69: { name: 'Duchesne' },
            COOPDSNU1: { name: 'Duchesne COOP' }
        };

        const result = processObservationData(rawData, metadata);
        expect(result.Ozone.Duchesne).toBe(0);
        expect(result._timestamps.Duchesne).toBe('2026-02-27T01:05:00Z');
    });

    it('throws for invalid observation payloads', () => {
        expect(() => processObservationData({}, {})).toThrow('Expected array of observations');
    });
});
