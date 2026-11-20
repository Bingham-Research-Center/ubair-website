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
const layers = read('public/js/mapLayers.js');

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
        // The panes above the map hold their height before their data arrives. If they started
        // short, the map would be on screen at load and the run would be fetched every time.
        const css = read('public/css/weather-panes.css');
        expect(css).toMatch(/\.weather-hazards\s*\{\s*min-height:\s*22rem;/);
        expect(css).toMatch(/\.town-forecast\s*\{\s*min-height:\s*36rem;/);
    });

    test('the ensemble charts sit in a closed drawer and load when it is opened', () => {
        expect(main).toMatch(/<details class="expert-drawer pane" id="expert-drawer">/);
        expect(main).not.toMatch(/<details[^>]*id="expert-drawer"[^>]*\bopen\b/);
        expect(script).toMatch(/drawer\.addEventListener\('toggle'/);
        expect(script.match(/\binitializeMeteograms\(\)/g)).toHaveLength(2);
        const drawer = main.slice(main.indexOf('id="expert-drawer"'));
        expect(drawer).toContain('id="meteogram-current"');
    });

    test('snow on the map is a total since the run began, never a rate', async () => {
        // The file's snowfall_1h_mm is a running total (public/js/hrrrFields.js). Until 1.7.6 the
        // map and its notes showed it as inches per hour: 20 in/hr in the Uintas on 19 Nov 2026.
        const { SCALES, layerByKey } = await import('../../public/js/mapLayers.js');
        const snow = layerByKey('snowfall_1h_mm');
        expect(snow).toMatchObject({ label: 'Snow since the run began', runningTotal: true });
        expect(SCALES[snow.scale].unit).toBe('in');
        expect(script).toMatch(/in since this run began, somewhere on the map/);
        for (const text of [script, layers]) {
            expect(text).not.toMatch(/sliceFieldForHour\(payload, 'snowfall_1h_mm'/);
        }
    });

    test('the map is one picture of colour bands, drawn in the browser from the run already fetched', () => {
        // Until 1.7.7 it was 1,368 circle markers, redrawn every hour.
        expect(script).not.toMatch(/circleMarker/);
        expect(script).toMatch(/rasterise\(values, rows, cols, RASTER_FACTOR, scale, colours/);
        expect(script).toMatch(/fitGrid\(surfaceState\.payload\.grid\)/);
        // Changing layer or hour asks the server for nothing: one fetch per run, then a cache.
        expect(script.match(/fetch\(`\$\{API_FORECASTS\}\/\$\{filename\}`\)/g)).toHaveLength(1);
        expect(script).toMatch(/surfaceState\.cache\.set\(filename, payload\)/);
        expect(html).toContain('/public/css/weather-map.css');
    });

    test('the map\'s colours come from the theme tokens, not from the script', () => {
        for (const text of [script, layers]) {
            expect(text).not.toMatch(/#[0-9a-fA-F]{6}\b/);
            expect(text).not.toMatch(/style=["'`]/);
        }
        expect(script).toMatch(/`--scale-\$\{name\}-\$\{step\}`/);
        const tokens = read('public/css/theme/tokens.css');
        for (const ramp of ['cold', 'warm', 'wind', 'rain', 'snow', 'cloud']) {
            for (const step of [1, 2, 3, 4, 5]) expect(tokens).toMatch(new RegExp(`--scale-${ramp}-${step}:`));
        }
        expect(tokens).toMatch(/--scale-freezing:/);
        // Every ramp a layer's scale names has tokens behind it.
        const named = new Set([...layers.matchAll(/ramp: '([a-z]+)'/g)].map((m) => m[1]));
        named.add('wind').add('rain').add('snow').add('cloud');
        for (const ramp of named) {
            expect(tokens).toMatch(ramp === 'freezing' ? /--scale-freezing:/ : new RegExp(`--scale-${ramp}-1:`));
        }
    });

    test('the layer picker is filled from what the run carries; the page source offers only temperature', () => {
        const picker = main.slice(main.indexOf('<select id="weather-variable"'), main.indexOf('</select>', main.indexOf('<select id="weather-variable"')));
        expect([...picker.matchAll(/<option value="([^"]*)"/g)].map((m) => m[1])).toEqual(['temperature']);
        expect(script).toMatch(/availableLayers\(payload\)/);
    });

    test('time is a slider with a play button, opening on the hour under way', () => {
        expect(main).toMatch(/<input type="range" id="forecast-hour"/);
        expect(main).toMatch(/<button type="button" id="forecast-play" class="map-play" aria-pressed="false">/);
        expect(main).not.toMatch(/id="forecast-time"/);
        // A run's first hours are past when it arrives: the slider starts at the hour under way.
        expect(script).toMatch(/surfaceState\.hourIndex = firstHourFromNow\(surfaceState\.payload\.valid_times, Date\.now\(\)\)/);
        expect(script).toMatch(/surfaceState\.fromHour = surfaceState\.hourIndex/);
        expect(script).toMatch(/hourSlider\.min = String\(Math\.min\(surfaceState\.fromHour, last\)\)/);
        expect(script).toMatch(/hourSlider\.value = String\(surfaceState\.hourIndex\)/);
    });

    test('nothing plays until asked: a click, or ?kiosk=1 for a wall screen', () => {
        // The old kiosk panel is gone; its job is the play button's.
        expect(main).not.toMatch(/kiosk-controls|kiosk-toggle|Kiosk Mode/);
        expect(script).toMatch(/get\('kiosk'\) === '1'/);
        expect(script.match(/\bstartPlaying\(\)/g)).toHaveLength(3); // its definition, the button, the kiosk start
        expect(script).toMatch(/if \(kioskRequested\(\)\) \{\s*surfaceState\.playMs = KIOSK_PLAY_MS;\s*startPlaying\(\);/);
    });

    test('the hazards pane and the town table start empty, never with a made-up value', () => {
        expect(main).toMatch(/id="hazard-alerts" data-state="loading"/);
        expect(main).toMatch(/<table class="town-table" id="town-table" hidden>/);
        expect(main).toMatch(/<div class="precip-hours-wrap" id="precip-hours-wrap" hidden>/);
        expect(main).not.toMatch(/No (active )?alerts|--°F|\d+°F/);
    });

    test('loads its three scripts and its pane styles', () => {
        for (const file of ['/public/js/weatherHazards.js', '/public/js/townForecast.js', '/public/js/forecast_weather.js',
            '/public/css/weather-panes.css', '/public/css/weather-map.css']) {
            expect(html).toContain(file);
        }
    });

    test('carries only icons that do something: play, expand and close', () => {
        const icons = [...main.matchAll(/<i class="([^"]*)"/g)].map((m) => m[1]);
        expect(icons).toEqual(['fas fa-play', 'fas fa-expand', 'fas fa-times']);
    });

    test('its tables scroll inside their own box, so the page does not scroll sideways (#101)', () => {
        const css = read('public/css/weather-panes.css');
        const rule = css.match(/\.precip-hours-wrap,\s*\.town-table-wrap\s*\{([^}]*)\}/)[1];
        expect(rule).toMatch(/overflow-x:\s*auto/);
        // The screen-reader labels in the cells are absolutely placed. Unless their scrolling box
        // is their containing block they escape it and widen the page by the table's hidden part.
        expect(rule).toMatch(/position:\s*relative/);
    });

});
