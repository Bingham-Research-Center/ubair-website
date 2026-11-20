import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// The weather forecast page as reworked in 1.7.6 (issue #407): what a visitor wants first,
// nothing computed that describes no real place, and nothing loaded before it is wanted.

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (file) => fs.readFileSync(path.join(repoRoot, file), 'utf8');
const html = read('views/forecast_weather.html');
const main = html.slice(html.indexOf('<main'), html.indexOf('</main>'));
const script = read('public/js/forecast_weather.js');

describe('weather forecast page', () => {
    test('runs top to bottom: hazards, town forecasts, the map, then the expert drawer', () => {
        const order = ['id="weather-hazards"', 'id="town-forecast"', 'id="weather-map-section"', 'id="expert-drawer"']
            .map((marker) => main.indexOf(marker));
        expect(order.every((index) => index > -1)).toBe(true);
        expect([...order].sort((a, b) => a - b)).toEqual(order);
    });

    test('computes no Basin-wide average and invents no update time', () => {
        for (const text of [html, script]) {
            expect(text).not.toMatch(/Basin Average|basin-average|temperature-range|trend-indicator/);
            expect(text).not.toMatch(/Next Update|next-update-time/);
            expect(text).not.toMatch(/Forecast Snapshots|Current Summary|Model Information/);
        }
        // The old "next update" was the run time plus one hour.
        expect(script).not.toMatch(/setUTCHours\(/);
        expect(script).not.toMatch(/computeTrendText|updateForecastSnapshots|updateWeatherSummary/);
    });

    test('says times in Mountain time on the map, not UTC', () => {
        expect(script).toContain("from './mountainTime.js'");
        expect(script).not.toMatch(/formatDateUTC|formatIsoTimestamp/);
    });

    test('the 1.5 MB model run is fetched when the reader reaches the map, not on load', () => {
        expect(script).toMatch(/whenNear\(document\.getElementById\('weather-map-section'\), startMap\)/);
        expect(script).toMatch(/new IntersectionObserver/);
        // Nothing but startMap sets up the map or asks for a run.
        expect(script.match(/\bsetupWeatherMap\(\)/g)).toHaveLength(2);       // its definition and one call
        expect(script.match(/\binitializeSurfaceForecasts\(\)/g)).toHaveLength(2);
        expect(main).toContain('The map loads when you scroll to it.');
    });

    test('the ensemble charts sit in a closed drawer and load when it is opened', () => {
        expect(main).toMatch(/<details class="expert-drawer pane" id="expert-drawer">/);
        expect(main).not.toMatch(/<details[^>]*id="expert-drawer"[^>]*\bopen\b/);
        expect(script).toMatch(/drawer\.addEventListener\('toggle'/);
        expect(script.match(/\binitializeMeteograms\(\)/g)).toHaveLength(2);
        const drawer = main.slice(main.indexOf('id="expert-drawer"'));
        expect(drawer).toContain('id="meteogram-current"');
    });

    test('kiosk mode is off the page unless the address asks for it', () => {
        expect(main).toMatch(/<div class="kiosk-controls" id="kiosk-controls" hidden>/);
        expect(script).toMatch(/get\('kiosk'\) === '1'/);
        expect(script.match(/\binitializeKioskMode\(\)/g)).toHaveLength(2);
    });

    test('the hazards pane and the town table start empty, never with a made-up value', () => {
        expect(main).toMatch(/id="hazard-alerts" data-state="loading"/);
        expect(main).toMatch(/<table class="town-table" id="town-table" hidden>/);
        expect(main).toMatch(/<div class="precip-hours-wrap" id="precip-hours-wrap" hidden>/);
        expect(main).not.toMatch(/No (active )?alerts|--°F|\d+°F/);
    });

    test('loads its three scripts and its pane styles', () => {
        for (const file of ['/public/js/weatherHazards.js', '/public/js/townForecast.js', '/public/js/forecast_weather.js',
            '/public/css/weather-panes.css']) {
            expect(html).toContain(file);
        }
    });

    test('carries only icons that do something: play, expand and close', () => {
        const icons = [...main.matchAll(/<i class="([^"]*)"/g)].map((m) => m[1]);
        expect(icons).toEqual(['fas fa-play', 'fas fa-expand', 'fas fa-times']);
    });

    test('its tables scroll inside their own box, so the page does not scroll sideways (#101)', () => {
        const css = read('public/css/weather-panes.css');
        expect(css).toMatch(/\.precip-hours-wrap,\s*\.town-table-wrap\s*\{[^}]*overflow-x:\s*auto/);
    });
});
