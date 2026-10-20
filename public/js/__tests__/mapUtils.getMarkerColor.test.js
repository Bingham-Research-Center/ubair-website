import { describe, it, expect } from '@jest/globals';
import { getMarkerColor } from '../mapUtils.js';

// Ozone markers follow the EPA AQI bands (decided on #194, 2026-10-20) — the same scale the
// /live_aq legend image already shows. The band edges are the contract; the colour strings
// may change when #194 is fixed, as long as each band keeps its own colour.
//
// Each edge is its own test so a regression at an edge that is already right still fails.
// Edges the current code already gets right:
const EPA_EDGES_MET = [
    [0, 'green'],
    [86, 'red'],
    [105, 'red']
];
// Known failing until #194 (markers still use green <50 / orange 50–69 / red >=70).
// When #194 lands, Jest flags each of these as unexpectedly passing — move them up.
const EPA_EDGES_PENDING_194 = [
    [54, 'green'],
    [55, 'yellow'],
    [70, 'yellow'],
    [71, 'orange'],
    [85, 'orange'],
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

    it.each(EPA_EDGES_MET)('colours %s ppb ozone %s (EPA AQI band)', (ozone, expectedColor) => {
        expect(getMarkerColor({ Ozone: ozone })).toBe(expectedColor);
    });

    it.failing.each(EPA_EDGES_PENDING_194)('colours %s ppb ozone %s (EPA AQI band, #194)', (ozone, expectedColor) => {
        expect(getMarkerColor({ Ozone: ozone })).toBe(expectedColor);
    });
});
