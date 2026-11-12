import { describe, it, expect } from '@jest/globals';
import { createStationPopup, describeObservedTime } from '../mapUtils.js';

// One popup for both AQ maps. The feed is raw SI with its own unit names (api.js does not
// convert), so these fixtures use the units the feed actually sends.
const UNITS = {
    Ozone: 'ppb', NOx: 'ppb', 'PM2.5': 'ug/m3', Temperature: 'Celsius',
    'Wind Speed': 'm/s', 'Wind Direction': 'Degrees', 'Snow Depth': 'Millimeters'
};
const NOW = new Date('2026-11-12T10:42:00Z'); // 3:42 am MST

// The popup's rows as "label: value" text, markup stripped.
function rows(html) {
    return [...html.matchAll(/<dt>(.*?)<\/dt><dd>(.*?)<\/dd>/g)]
        .map(([, label, value]) => `${label}: ${value.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()}`);
}

describe('createStationPopup', () => {
    const myton = {
        Ozone: 17, NOx: 4.8, Temperature: 0.7, 'Wind Speed': 2.4, 'Wind Direction': 292,
        'Snow Depth': 0, Pressure: 102000
    };

    it('lists pollutants, then weather, converted for display', () => {
        const html = createStationPopup('Myton', myton, { units: UNITS, now: NOW });
        expect(rows(html)).toEqual([
            'Ozone: 17 ppb Good',
            'NOx: 4.8 ppb',
            'Temperature: 33 °F',
            'Wind: WNW 5 mph',
            'Snow depth: 0 in'
        ]);
    });

    it('switches to °C, m/s and cm together', () => {
        const html = createStationPopup('Myton', { ...myton, 'Snow Depth': 120 }, { units: UNITS, imperial: false, now: NOW });
        expect(rows(html).slice(2)).toEqual(['Temperature: 1 °C', 'Wind: WNW 2 m/s', 'Snow depth: 12 cm']);
    });

    // Live AQ printed "Wind Direction: N Degrees" and "Snow Depth: 0.0 Millimeters".
    it('never prints the feed unit names', () => {
        const html = createStationPopup('Myton', myton, { units: UNITS, now: NOW });
        expect(html).not.toMatch(/Degrees|Millimeters|Celsius/);
    });

    // A popup must never show a Celsius number labelled °F (CLAUDE.md, Data pipeline).
    it('leaves out a value whose unit it does not know rather than guess', () => {
        const html = createStationPopup('X', { Temperature: 30, Ozone: 40 }, { units: { Temperature: 'furlongs', Ozone: 'ppb' }, now: NOW });
        expect(rows(html)).toEqual(['Ozone: 40 ppb Good']);
    });

    it('colours ozone by its EPA band', () => {
        const html = createStationPopup('X', { Ozone: 72 }, { units: UNITS, now: NOW });
        expect(html).toContain('data-status="sensitive"');
        expect(rows(html)).toEqual(['Ozone: 72 ppb Unhealthy for sensitive groups']);
    });

    it('says calm instead of 0 mph', () => {
        const html = createStationPopup('X', { 'Wind Speed': 0.1, 'Wind Direction': 90 }, { units: UNITS, now: NOW });
        expect(rows(html)).toEqual(['Wind: Calm']);
    });

    it('says so when a station has reported nothing', () => {
        const html = createStationPopup('Horsepool', { Ozone: null, Temperature: null }, { units: UNITS, now: NOW });
        expect(rows(html)).toEqual([]);
        expect(html).toContain('No recent observations from this station.');
    });

    it('escapes station names taken from metadata', () => {
        expect(createStationPopup('<b>Bad</b>', {}, { now: NOW })).toContain('&lt;b&gt;Bad&lt;/b&gt;');
    });

    it('links road weather stations to the roads page', () => {
        expect(createStationPopup('Daniels Summit', { Temperature: 1 }, { units: UNITS, isRoadStation: true, now: NOW }))
            .toContain('href="/roads"');
    });
});

describe('describeObservedTime', () => {
    it('gives Mountain time and age', () => {
        expect(describeObservedTime('2026-11-12T10:30:00Z', NOW)).toEqual({
            text: 'Observed 3:30 am MT · 12 min ago', stale: false
        });
    });

    it('adds the date when the reading is from another day, and flags it stale', () => {
        expect(describeObservedTime('2026-11-11T22:00:00Z', NOW)).toEqual({
            text: 'Observed Nov 11, 3:00 pm MT · 13 h ago', stale: true
        });
    });

    it('returns null for no time', () => {
        expect(describeObservedTime(null, NOW)).toBeNull();
        expect(describeObservedTime('not a date', NOW)).toBeNull();
    });
});
