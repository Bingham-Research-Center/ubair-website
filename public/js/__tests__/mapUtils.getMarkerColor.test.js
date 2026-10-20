import { describe, it, expect } from '@jest/globals';
import { getMarkerColor } from '../mapUtils.js';

// Ozone markers follow the EPA AQI bands (decided on #194, 2026-10-20) — the same scale the
// /live_aq legend image already shows. The band edges are the contract; the colour strings
// may change when #194 is fixed, as long as each band keeps its own colour.
const EPA_OZONE_BANDS = [
    [0, 'green'],
    [54, 'green'],
    [55, 'yellow'],
    [70, 'yellow'],
    [71, 'orange'],
    [85, 'orange'],
    [86, 'red'],
    [105, 'red'],
    [106, 'purple'],
    [200, 'purple'],
    [201, 'maroon']
];

describe('getMarkerColor', () => {
    it('returns gray when a station has no measurements at all', () => {
        expect(getMarkerColor({})).toBe('gray');
        expect(getMarkerColor({ Ozone: null, Temperature: undefined })).toBe('gray');
    });

    it('returns blue for active stations without ozone data', () => {
        expect(getMarkerColor({ Temperature: 10, Ozone: null })).toBe('#4A90D2');
        expect(getMarkerColor({ Temperature: 10, Ozone: undefined })).toBe('#4A90D2');
    });

    it('returns green for 0 ppb ozone', () => {
        expect(getMarkerColor({ Ozone: 0 })).toBe('green');
    });

    // Known failing until #194: markers still use green <50 / orange 50–69 / red >=70.
    // When this starts passing, Jest will flag it — change `it.failing` to `it`.
    it.failing('colours ozone by the EPA AQI bands (#194)', () => {
        for (const [ozone, expectedColor] of EPA_OZONE_BANDS) {
            expect([ozone, getMarkerColor({ Ozone: ozone })]).toEqual([ozone, expectedColor]);
        }
    });
});
