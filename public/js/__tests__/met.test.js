import { feelsLikeColdF, windChillF } from '../met.js';
import { mountainHour } from '../mountainTime.js';

// Wind chill for the homepage forecast tile and the weather map. The numbers are the National
// Weather Service's own chart (weather.gov/safety/cold-wind-chill-chart).

describe('windChillF', () => {
    test.each([
        [40, 5, 36], [30, 10, 21], [20, 20, 4], [10, 20, -9], [0, 15, -19], [-10, 30, -39], [-25, 45, -65],
    ])('%i°F in a %i mph wind feels like %i°F', (tempF, windMph, chart) => {
        expect(Math.round(windChillF(tempF, windMph))).toBe(chart);
    });

    test('is not defined above 50°F or under 3 mph: null, never a made-up number', () => {
        expect(windChillF(51, 20)).toBeNull();
        expect(windChillF(20, 2.9)).toBeNull();
        expect(windChillF(50, 3)).not.toBeNull();
        expect(windChillF(null, 10)).toBeNull();
        expect(windChillF(20, undefined)).toBeNull();
        expect(windChillF(NaN, 10)).toBeNull();
    });
});

describe('feelsLikeColdF', () => {
    test('the wind chill where there is one, otherwise the air temperature', () => {
        expect(Math.round(feelsLikeColdF(10, 20))).toBe(-9);
        // A calm night in a cold pool: no wind chill, and the cold is real all the same.
        expect(feelsLikeColdF(-12, 0)).toBe(-12);
        expect(feelsLikeColdF(-12, null)).toBe(-12);
        expect(feelsLikeColdF(70, 25)).toBe(70);
        expect(feelsLikeColdF(null, 10)).toBeNull();
    });
});

describe('mountainHour', () => {
    test('the hour of the day in Mountain time, standard or daylight', () => {
        expect(mountainHour(Date.parse('2026-11-20T07:00:00Z'))).toBe(0);  // MST
        expect(mountainHour(Date.parse('2026-11-20T06:59:00Z'))).toBe(23);
        expect(mountainHour(Date.parse('2026-07-01T18:00:00Z'))).toBe(12); // MDT
    });
});
