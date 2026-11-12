import { describe, it, expect } from '@jest/globals';
import { getMarkerStatus, getOzoneBand, getRoadCautionLevel, legendEntries } from '../mapUtils.js';

// Ozone markers follow the EPA AQI bands for 8-hour ozone (decided on #194, 2026-10-20),
// on both the homepage and Live AQ maps. The band edges are the contract; CSS maps each status
// to an --epa-* token (public/css/map.css).
const EPA_EDGES = [
    [0, 'good'],
    [54, 'good'],
    [54.9, 'good'], // EPA truncates before comparing
    [55, 'moderate'],
    [70, 'moderate'],
    [71, 'sensitive'],
    [85, 'sensitive'],
    [86, 'unhealthy'],
    [105, 'unhealthy'],
    [106, 'very-unhealthy'],
    [200, 'very-unhealthy'],
    [201, 'hazardous']
];

describe('getMarkerStatus', () => {
    it('is nodata when a station has no measurements at all', () => {
        expect(getMarkerStatus({})).toBe('nodata');
        expect(getMarkerStatus({ Ozone: null, Temperature: undefined })).toBe('nodata');
    });

    it('is weather for active stations without ozone data', () => {
        expect(getMarkerStatus({ Temperature: 10, Ozone: null })).toBe('weather');
        expect(getMarkerStatus({ Temperature: 10 })).toBe('weather');
    });

    // #194: Live AQ skipped yellow and ran one band off; every edge is pinned here.
    it.each(EPA_EDGES)('puts %s ppb ozone in the %s band', (ozone, band) => {
        expect(getMarkerStatus({ Ozone: ozone })).toBe(band);
        expect(getOzoneBand(ozone).key).toBe(band);
    });
});

describe('getRoadCautionLevel', () => {
    it('reads raw SI and says nodata without a temperature', () => {
        expect(getRoadCautionLevel({ 'Wind Speed': 20 })).toBe('nodata');
        expect(getRoadCautionLevel({ Temperature: 10 })).toBe('road-clear');
        expect(getRoadCautionLevel({ Temperature: 1 })).toBe('road-caution');
        expect(getRoadCautionLevel({ Temperature: -3, 'Snow Depth': 80 })).toBe('road-hazardous');
    });
});

describe('legendEntries', () => {
    it('lists every band with its range, then weather-only and no data', () => {
        expect(legendEntries().map((e) => e.label)).toEqual([
            'Good (0–54 ppb)',
            'Moderate (55–70 ppb)',
            'Unhealthy for sensitive groups (71–85 ppb)',
            'Unhealthy (86–105 ppb)',
            'Very unhealthy (106–200 ppb)',
            'Hazardous (201+ ppb)',
            'Weather only, no ozone',
            'No recent data'
        ]);
    });
});
