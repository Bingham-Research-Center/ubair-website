import { describe, it, expect } from '@jest/globals';
import {
    currentConditions,
    temperatureLabel,
    humidityLabel,
    windLabel,
    stampLabel,
} from '../homepage-current.js';
import { toCelsius, toFahrenheit, toMph, relativeHumidityFromDewPoint } from '../met.js';

// Rows as the observation feed delivers them: raw SI with the unit on every row.
const at = '2026-11-12T07:00:00.000Z';
const rows = [
    { stid: 'UBHSP', variable: 'air_temp', value: 20, units: 'Celsius', date_time: at },
    { stid: 'KVEL', variable: 'air_temp', value: 2.0, units: 'Celsius', date_time: at },
    { stid: 'KVEL', variable: 'dew_point_temperature', value: -1.0, units: 'Celsius', date_time: at },
    { stid: 'KVEL', variable: 'wind_speed', value: 1.543, units: 'm/s', date_time: at },
    { stid: 'KVEL', variable: 'wind_direction', value: 270, units: 'Degrees', date_time: at },
];

describe('unit helpers', () => {
    it('converts only units it knows', () => {
        expect(toFahrenheit(0, 'Celsius')).toBe(32);
        expect(toCelsius(212, 'Fahrenheit')).toBeCloseTo(100, 6);
        expect(toMph(10, 'm/s')).toBeCloseTo(22.37, 2);
        expect(toFahrenheit(10, 'Rankine')).toBeNull();
        expect(toMph(undefined, 'm/s')).toBeNull();
    });

    it('derives humidity from dew point and refuses missing inputs', () => {
        expect(relativeHumidityFromDewPoint(10, 10)).toBeCloseTo(100, 6);
        expect(relativeHumidityFromDewPoint(2, -1)).toBeCloseTo(80.5, 1);
        expect(relativeHumidityFromDewPoint(undefined, -1)).toBeNull();
    });
});

describe('current conditions at KVEL', () => {
    it('reads one station and converts from SI', () => {
        const c = currentConditions(rows);
        expect(c.tempF).toBeCloseTo(35.6, 1);
        expect(c.rh).toBeCloseTo(80.5, 1);
        expect(c.windMph).toBeCloseTo(3.45, 2);
        expect(c.windDir).toBe(270);
        expect(c.time).toBe(at);
    });

    it('labels what a reader sees', () => {
        const c = currentConditions(rows);
        expect(temperatureLabel(c.tempF)).toBe('36°F');
        expect(humidityLabel(c.rh)).toBe('81%');
        expect(windLabel(c.windMph, c.windDir)).toBe('W 3 mph');
        expect(windLabel(0.2, 270)).toBe('Calm');
    });

    it('shows dashes, not a wrong number, for an unknown unit', () => {
        const odd = rows.map((r) => (r.variable === 'air_temp' ? { ...r, units: 'Rankine' } : r));
        const c = currentConditions(odd);
        expect(temperatureLabel(c.tempF)).toBe('--');
        expect(humidityLabel(c.rh)).toBe('--');
        expect(windLabel(c.windMph, c.windDir)).toBe('W 3 mph');
    });

    it('returns null when the station is missing', () => {
        expect(currentConditions(rows.filter((r) => r.stid !== 'KVEL'))).toBeNull();
    });

    it('says where and when, with the age once it is stale', () => {
        expect(stampLabel(at, Date.parse(at) + 10 * 60000))
            .toBe('At Vernal Regional Airport (KVEL), observed 12:00 AM MST.');
        expect(stampLabel(at, Date.parse(at) + 4 * 3600000))
            .toBe('At Vernal Regional Airport (KVEL), observed 12:00 AM MST (4 h ago).');
    });
});
