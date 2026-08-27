import { describe, expect, it } from '@jest/globals';
import {
    buildRouteForecastSummary,
    classifyRoadHazard,
    getForecastFreshness,
    normalizeHRRRForecastResponse,
    selectForecastDisplayIndices
} from '../roads/HRRRForecastModel.js';

function makeRoute(overrides = {}) {
    return {
        name: 'Test Route',
        waypoints: [
            {
                name: 'Summit',
                lat: 40.1,
                lon: -110.1,
                forecasts: {
                    temp_2m: [4, 1, -1, -2],
                    wind_speed_10m: [2, 3, 4, 5],
                    wind_gust: [4, 5, 6, 7],
                    visibility: [20, 20, 20, 20],
                    precip_1hr: [0, 0.4, 0.8, 0],
                    precip_type: ['none', 'rain', 'snow', 'none'],
                    snow_depth: [0, 0, 1, 1],
                    cloud_cover: [20, 60, 100, 40],
                    rh_2m: [30, 60, 90, 45]
                }
            }
        ],
        ...overrides
    };
}

describe('HRRR road forecast model', () => {
    it('normalizes the API response wrapper', () => {
        const forecast = {
            forecast_hours: [1],
            valid_times: ['2026-08-27T04:00:00Z'],
            routes: { us40: makeRoute() }
        };

        expect(normalizeHRRRForecastResponse({ success: true, forecast })).toBe(forecast);
        expect(() => normalizeHRRRForecastResponse({ success: true })).toThrow('payload is missing');
    });

    it('classifies freezing precipitation as high concern', () => {
        expect(classifyRoadHazard({
            temp_2m: -1,
            precip_1hr: 0.5,
            precip_type: 'snow',
            visibility: 8,
            wind_gust: 5
        })).toMatchObject({ level: 'danger', reason: 'Below freezing with precipitation' });
    });

    it('classifies near-freezing precipitation and low visibility as caution', () => {
        expect(classifyRoadHazard({
            temp_2m: 1.5,
            precip_1hr: 0.2,
            precip_type: 'rain',
            visibility: 1.2,
            wind_gust: 4
        })).toMatchObject({ level: 'caution' });
    });

    it('keeps benign forecast weather at low concern', () => {
        expect(classifyRoadHazard({
            temp_2m: 10,
            precip_1hr: 0,
            precip_type: 'none',
            visibility: 20,
            wind_gust: 5
        })).toMatchObject({ level: 'clear', label: 'Low concern' });
    });

    it('selects actual available hours closest to the display targets', () => {
        expect(selectForecastDisplayIndices([1, 2, 4, 8, 12])).toEqual([
            { index: 0, hour: 1 },
            { index: 1, hour: 2 },
            { index: 2, hour: 4 },
            { index: 4, hour: 12 }
        ]);
    });

    it('summarizes route periods and reports the first modeled hazard', () => {
        const forecast = {
            forecast_hours: [1, 3, 6, 12],
            valid_times: [
                '2026-08-27T04:00:00Z',
                '2026-08-27T06:00:00Z',
                '2026-08-27T09:00:00Z',
                '2026-08-27T15:00:00Z'
            ],
            routes: { us40: makeRoute() }
        };

        const summary = buildRouteForecastSummary(forecast, 'us40');
        expect(summary.periods).toHaveLength(4);
        expect(summary.periods[0].hazard.level).toBe('clear');
        expect(summary.periods[0].metrics).toEqual({
            minTemperature: 4,
            maxWindGust: 4,
            minVisibility: 20,
            maxPrecipitation: 0,
            precipitationTypes: []
        });
        expect(summary.periods[2].metrics.precipitationTypes).toEqual(['snow']);
        expect(summary.onset).toMatchObject({ hour: 3 });
        expect(summary.onset.worstPoint.name).toBe('Summit');
    });

    it('reports model-run freshness without treating future clock skew as stale', () => {
        const now = Date.parse('2026-08-27T05:00:00Z');
        expect(getForecastFreshness('2026-08-27T03:00:00Z', now)).toMatchObject({ level: 'fresh', ageHours: 2 });
        expect(getForecastFreshness('2026-08-27T06:00:00Z', now)).toMatchObject({ level: 'fresh', ageHours: 0 });
        expect(getForecastFreshness('not-a-date', now)).toMatchObject({ level: 'unavailable' });
    });
});
