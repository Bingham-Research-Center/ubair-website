import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { feelsLikeColdF, toFahrenheit, toKilometres, toMiles, toMph, windChillF } from '../met.js';
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

// Visibility joined the observation feed on 2026-11-21 (brc-tools #76) in statute miles, the
// one variable not sent in SI. The road forecast states kilometres.
describe('toMiles and toKilometres', () => {
    test('the feed\'s own unit passes through', () => {
        expect(toMiles(10, 'Statute miles')).toBe(10);
        expect(toKilometres(10, 'Statute miles')).toBeCloseTo(16.09, 2);
    });

    test('kilometres and metres convert', () => {
        expect(toMiles(16.09344, 'km')).toBeCloseTo(10, 6);
        expect(toMiles(1609.344, 'Meters')).toBeCloseTo(1, 6);
        expect(toKilometres(14.3, 'km')).toBeCloseTo(14.3, 6);
    });

    test('a unit it does not know, or no number, is null rather than a guess', () => {
        expect(toMiles(10, 'nautical miles')).toBeNull();
        expect(toMiles(10, undefined)).toBeNull();
        expect(toMiles(null, 'Statute miles')).toBeNull();
        expect(toKilometres(NaN, 'km')).toBeNull();
    });
});

// #306: one set of converters. A page that carried its own once printed Celsius as °F.
describe('temperature and wind conversions live in met.js', () => {
    test('from the units the feed states, and null for a unit it does not know', () => {
        expect(toFahrenheit(25, 'Celsius')).toBeCloseTo(77, 6);
        expect(toFahrenheit(46.4, 'Fahrenheit')).toBeCloseTo(46.4, 6);
        expect(toMph(4.63, 'm/s')).toBeCloseTo(10.36, 2);
        expect(toMph(10, 'mph')).toBe(10);
        expect(toFahrenheit(25, 'degrees')).toBeNull();
        expect(toMph(null, 'm/s')).toBeNull();
    });

    // roads/UnitsSystem.js is the roads page's imperial and metric switch, fed by UDOT in °F.
    // It is the one copy left; this list may shrink and must not grow.
    test('no other script in public/js converts by its own arithmetic', () => {
        const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
        const allowed = new Set(['met.js', 'roads/UnitsSystem.js']);
        const ownArithmetic = /\*\s*9\s*\/\s*5|\*\s*1\.8\b|2\.2369|2\.237|1\.15078/;
        const found = [];
        const walk = (dir) => {
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                if (entry.name === '__tests__') continue;
                const full = path.join(dir, entry.name);
                if (entry.isDirectory()) walk(full);
                else if (entry.name.endsWith('.js') && ownArithmetic.test(fs.readFileSync(full, 'utf8'))) {
                    found.push(path.relative(root, full));
                }
            }
        };
        walk(root);
        expect(found.filter((file) => !allowed.has(file))).toEqual([]);
        expect(found).toContain('met.js');
    });
});
