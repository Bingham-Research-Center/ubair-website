import { describe, it, expect } from '@jest/globals';
import { processObservationData } from '../api.js';

const row = (stid, variable, value, date_time, units) => ({ stid, variable, value, date_time, units });

describe('processObservationData', () => {
    it('keys every reading by station ID and never merges stations', () => {
        // Until 21 Nov 2026 these three all became "Vernal", and the first one in the file won.
        const result = processObservationData([
            row('COOPVELU1', 'air_temp', -0.556, '2026-11-20T13:30:00Z', 'Celsius'),
            row('KVEL', 'air_temp', -1, '2026-11-21T03:25:00Z', 'Celsius'),
            row('QV4', 'air_temp', 0.306, '2026-11-21T03:00:00Z', 'Celsius'),
            row('QV4', 'ozone_concentration', 37, '2026-11-21T03:00:00Z', 'ppb')
        ]);

        expect(result.Temperature).toEqual({ COOPVELU1: -0.556, KVEL: -1, QV4: 0.306 });
        expect(result.Ozone).toEqual({ QV4: 37 });
        expect(result._timestamps).toEqual({
            COOPVELU1: '2026-11-20T13:30:00Z', KVEL: '2026-11-21T03:25:00Z', QV4: '2026-11-21T03:00:00Z'
        });
        expect(result._times.QV4).toEqual({ Temperature: '2026-11-21T03:00:00Z', Ozone: '2026-11-21T03:00:00Z' });
        expect(result._units).toEqual({ Temperature: 'Celsius', Ozone: 'ppb' });
    });

    it('keeps the newer reading when a station sends a variable twice', () => {
        const result = processObservationData([
            row('KVEL', 'air_temp', 2, '2026-11-21T03:25:00Z', 'Celsius'),
            row('KVEL', 'air_temp', 5, '2026-11-21T01:55:00Z', 'Celsius'),
            row('KVEL', 'wind_speed', 3, '2026-11-21T01:55:00Z', 'm/s')
        ]);
        expect(result.Temperature.KVEL).toBe(2);
        expect(result._times.KVEL.Temperature).toBe('2026-11-21T03:25:00Z');
        expect(result._timestamps.KVEL).toBe('2026-11-21T03:25:00Z');
    });

    it('keeps a zero and skips a null', () => {
        const result = processObservationData([
            row('A1386', 'NOx_concentration', 0, '2026-11-21T03:00:00Z', 'ppb'),
            row('A1386', 'ozone_concentration', null, '2026-11-21T03:00:00Z', 'ppb')
        ]);
        expect(result.NOx.A1386).toBe(0);
        expect(result.Ozone).toBeUndefined();
    });

    it('throws for invalid observation payloads', () => {
        expect(() => processObservationData({})).toThrow('Expected array of observations');
    });
});
