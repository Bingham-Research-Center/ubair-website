import fs from 'fs';
import { LEVEL_WORDS, LEVELS, PRECIP_WORDS, lightView, precipRows } from '../homepage-lights.js';

// The homepage status lights, browser side (issue #403). The server decides; this module
// draws. What must hold here: anything unexpected draws as grey, and nothing is invented.

describe('lightView', () => {
    test('passes through what the server decided, with a word for the colour', () => {
        expect(lightView({ level: 'red', line: 'Snow covered: US-191 north of Vernal', detail: 'UDOT reports.' })).toEqual({
            level: 'red', word: 'Warning', line: 'Snow covered: US-191 north of Vernal', detail: 'UDOT reports.',
        });
        expect(LEVELS.map((level) => LEVEL_WORDS[level])).toEqual(['Warning', 'Caution', 'Clear', 'No data']);
    });

    test('draws grey for a level it does not know, a missing light, or an empty line', () => {
        for (const odd of [undefined, null, {}, { level: 'blue', line: 'x' }, { level: 'GREEN', line: 'x' }]) {
            expect(lightView(odd).level).toBe('grey');
        }
        expect(lightView(undefined)).toEqual({ level: 'grey', word: 'No data', line: 'Status unavailable', detail: '' });
        expect(lightView({ level: 'green', line: '   ' }).line).toBe('Status unavailable');
    });
});

describe('precipRows', () => {
    const band = (type, extent = null) => ({ label: 'Floor', range: 'below 5,900 ft', type, extent, detail: 'd' });

    test('one row per band, in the order sent, with a word and its icons', () => {
        const rows = precipRows({ status: 'ok', bands: [
            { label: 'Passes', range: 'above 7,500 ft', type: 'snow', extent: null, detail: 'a' },
            { label: 'Benches', range: '5,900 to 7,500 ft', type: 'mix', extent: null, detail: 'b' },
            band('rain', 'at times'), band('dry'),
        ] });
        expect(rows.map((row) => `${row.label}: ${row.words} [${row.icons.join(' ')}]`)).toEqual([
            'Passes: Snow [fa-snowflake]',
            'Benches: Mix [fa-cloud-rain fa-snowflake]',
            'Floor: Rain at times [fa-cloud-rain]',
            'Floor: Dry []',
        ]);
        expect(Object.keys(PRECIP_WORDS)).toEqual(['snow', 'rain', 'mix', 'dry']);
    });

    test('a band with no forecast, or a type it does not know, says so and shows no icon', () => {
        for (const type of [null, undefined, 'hail']) {
            expect(precipRows({ status: 'ok', bands: [band(type)] })[0]).toMatchObject({ words: 'No forecast', icons: [] });
        }
    });

    test('no rows at all when the forecast is unavailable: the tile then says so', () => {
        for (const precip of [null, undefined, { status: 'unavailable', bands: [] }, { status: 'ok' }]) {
            expect(precipRows(precip)).toEqual([]);
        }
    });
});

describe('the module', () => {
    const source = fs.readFileSync(new URL('../homepage-lights.js', import.meta.url), 'utf8');

    test('puts server text into the page as text, never as HTML', () => {
        expect(source).not.toMatch(/innerHTML|insertAdjacentHTML|outerHTML/);
    });

    test('holds no thresholds of its own: the rules are the server\'s', () => {
        expect(source).not.toMatch(/mph|RISK|snow covered|GUST|\b(30|40|45|7500|5900)\b/);
    });
});
