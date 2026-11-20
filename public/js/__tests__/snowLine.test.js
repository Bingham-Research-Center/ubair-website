import { TYPE_ICONS, TYPE_WORDS, hillsideView, inSnowLineRange, snowLineSentence } from '../snowLine.js';

// "Where rain turns to snow": the server's answer turned into rows and words. The server
// decides the range (server/statusLights.js snowLineAt); this module only says and draws it.

const BODY = {
    status: 'ok',
    hours: ['2026-11-20T06:00:00Z', '2026-11-20T07:00:00Z', '2026-11-20T08:00:00Z'],
    places: [
        { name: 'Daniels Summit', elevationFt: 8000, types: ['snow', 'snow', 'dry'] },
        { name: 'Duchesne', elevationFt: 5750, types: ['rain', 'snow', 'dry'] },
        { name: 'Maeser', elevationFt: 5250, types: ['snow', 'mix', null] },
        { name: 'Ouray', elevationFt: 4800, types: ['rain', 'rain', 'dry'] },
    ],
    snowLine: [{ kind: 'zone', lowFt: 5250, highFt: 5750 }, { kind: 'between', lowFt: 5250, highFt: 5750 }, null],
    detail: 'HRRR forecast run at 9 PM.',
};

describe('snowLineSentence', () => {
    test('says each kind of answer as a range between heights, never as one height', () => {
        expect(snowLineSentence({ kind: 'between', lowFt: 5750, highFt: 6700 }))
            .toBe('Snow from about 6,700 ft up; rain or a mix at 5,750 ft and below.');
        expect(snowLineSentence({ kind: 'zone', lowFt: 5250, highFt: 5850 }))
            .toBe('Snow as low as 5,250 ft, and rain or a mix as high as 5,850 ft: both fall in between.');
        expect(snowLineSentence({ kind: 'snow', downToFt: 5200 })).toBe('Snow at every point with precipitation, down to 5,200 ft.');
        expect(snowLineSentence({ kind: 'rain', upToFt: 6000 })).toBe('Rain or a mix at every point with precipitation, up to 6,000 ft. No snow.');
    });

    test('says there is no precipitation when there is no line, and for anything it does not know', () => {
        for (const none of [null, undefined, {}, { kind: 'sideways' }]) {
            expect(snowLineSentence(none)).toBe('No precipitation at any forecast point.');
        }
    });
});

describe('inSnowLineRange', () => {
    test('true for a point between the two heights, ends included', () => {
        const line = { kind: 'zone', lowFt: 5250, highFt: 5850 };
        expect([5250, 5500, 5850].map((ft) => inSnowLineRange(line, ft))).toEqual([true, true, true]);
        expect([5249, 5851, 8000].map((ft) => inSnowLineRange(line, ft))).toEqual([false, false, false]);
        expect(inSnowLineRange({ kind: 'between', lowFt: 5750, highFt: 6700 }, 6000)).toBe(true);
    });

    test('all snow, all rain and no precipitation shade nothing', () => {
        for (const line of [{ kind: 'snow', downToFt: 5200 }, { kind: 'rain', upToFt: 6000 }, null]) {
            expect(inSnowLineRange(line, 5200)).toBe(false);
        }
    });
});

describe('hillsideView', () => {
    const view = hillsideView(BODY);

    test('one row per place, highest first, with how far up the slope it is', () => {
        expect(view.rows.map((row) => row.name)).toEqual(['Daniels Summit', 'Duchesne', 'Maeser', 'Ouray']);
        expect(view.rows.map((row) => row.elevation)).toEqual(['8,000 ft', '5,750 ft', '5,250 ft', '4,800 ft']);
        expect(view.rows[0].slope).toBe(1);
        expect(view.rows.at(-1).slope).toBe(0);
        expect(view.rows[1].slope).toBeCloseTo((5750 - 4800) / 3200, 10);
    });

    test('a column per hour in Mountain time, with the day where it changes', () => {
        // 06Z on 20 Nov is 11 PM on Thursday the 19th; 07Z is midnight on Friday.
        expect(view.columns).toEqual(['Thu 11 PM', 'Fri 12 AM', '1 AM']);
    });

    test('each cell says its type in a word and icons, and whether it is in the hour\'s range', () => {
        expect(view.rows[1].cells[0]).toEqual({ type: 'rain', words: 'Rain', icons: ['fa-cloud-rain'], inRange: true });
        expect(view.rows[0].cells[0]).toEqual({ type: 'snow', words: 'Snow', icons: ['fa-snowflake'], inRange: false });
        expect(view.rows[2].cells[1]).toEqual({ type: 'mix', words: 'Mix', icons: ['fa-cloud-rain', 'fa-snowflake'], inRange: true });
        expect(view.rows[3].cells[2]).toEqual({ type: 'dry', words: 'Dry', icons: [], inRange: false });
        // The model gave Maeser no type in the last hour: the cell says so, and shows nothing.
        expect(view.rows[2].cells[2]).toEqual({ type: null, words: 'No forecast', icons: [], inRange: false });
        expect(Object.keys(TYPE_ICONS)).toEqual(Object.keys(TYPE_WORDS));
    });

    test('one sentence per hour', () => {
        expect(view.sentences).toEqual([
            'Snow as low as 5,250 ft, and rain or a mix as high as 5,750 ft: both fall in between.',
            'Snow from about 5,750 ft up; rain or a mix at 5,250 ft and below.',
            'No precipitation at any forecast point.',
        ]);
    });

    test('null when the forecast is unavailable or lists no places: nothing is drawn', () => {
        expect(hillsideView(null)).toBeNull();
        expect(hillsideView({ status: 'unavailable', hours: [], bands: [], detail: 'x' })).toBeNull();
        expect(hillsideView({ ...BODY, places: [] })).toBeNull();
        expect(hillsideView({ ...BODY, places: undefined })).toBeNull();
        expect(hillsideView({ ...BODY, hours: [] })).toBeNull();
    });

    test('a type it does not know is "No forecast", not a guess', () => {
        const odd = hillsideView({ ...BODY, places: [{ name: 'X', elevationFt: 5000, types: ['hail', 'snow', 'dry'] }] });
        expect(odd.rows[0].cells[0]).toMatchObject({ type: null, words: 'No forecast', icons: [] });
        expect(odd.rows[0].slope).toBe(0);
    });
});
