import { describe, it, expect } from '@jest/globals';
import * as mapUtils from '../mapUtils.js';

const { getMarkerStatus, getOzoneBand, legendEntries, legendMarkup } = mapUtils;

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
        expect(getMarkerStatus({ 'Snow Depth': 0 })).toBe('weather');
    });

    it('is nodata when a station reports only what the popup does not show', () => {
        expect(getMarkerStatus({ solar_radiation: 300, 'Wind Direction': 270 })).toBe('nodata');
    });

    // #194: Live AQ skipped yellow and ran one band off; every edge is pinned here.
    it.each(EPA_EDGES)('puts %s ppb ozone in the %s band', (ozone, band) => {
        expect(getMarkerStatus({ Ozone: ozone })).toBe(band);
        expect(getOzoneBand(ozone).key).toBe(band);
    });
});

// The homepage map painted the passes amber and red by a road rule of its own, which disagreed
// with the Roads light (Soldier Summit red for snow beside the road). Road status belongs to
// server/roadConditionRules.js alone.
describe('road status', () => {
    it('is not decided in the map code', () => {
        expect(mapUtils.getRoadCautionLevel).toBeUndefined();
        expect(mapUtils.isRoadWeatherStation).toBeUndefined();
    });
});

describe('legend', () => {
    it('lists every band with its range, then weather-only and no data', () => {
        expect(legendEntries().map((e) => e.label)).toEqual([
            'Good (0–54 ppb)',
            'Moderate (55–70 ppb)',
            'Unhealthy for sensitive groups (71–85 ppb)',
            'Unhealthy (86–105 ppb)',
            'Very unhealthy (106–200 ppb)',
            'Hazardous (201+ ppb)',
            'Weather only',
            'No recent data'
        ]);
    });

    it('draws one strip of the six bands, their lower edges, and one line for the rest', () => {
        const html = legendMarkup();
        const strip = [...html.matchAll(/class="aq-legend-band aq-status" data-status="([a-z-]+)"/g)].map((m) => m[1]);
        expect(strip).toEqual(['good', 'moderate', 'sensitive', 'unhealthy', 'very-unhealthy', 'hazardous']);
        const ticks = html.slice(html.indexOf('aq-legend-ticks')).match(/<span>(\d+)<\/span>/g).map((t) => t.replace(/\D/g, ''));
        expect(ticks).toEqual(['0', '55', '71', '86', '106', '201']);
        expect([...html.matchAll(/aq-legend-dot aq-status" data-status="([a-z]+)"/g)].map((m) => m[1]))
            .toEqual(['weather', 'nodata']);
        // Every band is named for a screen reader, with the EPA caveat.
        expect(html).toContain('Unhealthy for sensitive groups (71–85 ppb)');
        expect(html).toContain('applied to the latest hourly reading');
    });
});
