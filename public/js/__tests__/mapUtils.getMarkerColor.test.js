import { describe, it, expect } from '@jest/globals';
import { getMarkerColor } from '../mapUtils.js';

describe('getMarkerColor', () => {
    it('returns gray when a station has no measurements at all', () => {
        expect(getMarkerColor({})).toBe('gray');
        expect(getMarkerColor({ Ozone: null, Temperature: undefined })).toBe('gray');
    });

    it('returns blue for active stations without ozone data', () => {
        expect(getMarkerColor({ Temperature: 10, Ozone: null })).toBe('#4A90D2');
        expect(getMarkerColor({ Temperature: 10, Ozone: undefined })).toBe('#4A90D2');
    });

    it.each([
        [0, 'green'],
        [49, 'green'],
        [50, 'orange'],
        [69, 'orange'],
        [70, 'red']
    ])('returns %s ppb ozone as %s', (ozone, expectedColor) => {
        expect(getMarkerColor({ Ozone: ozone })).toBe(expectedColor);
    });
});
