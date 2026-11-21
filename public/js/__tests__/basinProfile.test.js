import fs from 'fs';
import { chooseLabels, pointSentence, profileHour, profilePoints, profileSummary, tempBand } from '../basinProfile.js';

// "Across the Basin": the HRRR waypoints run in profile along US-40. The fixture is the real
// 02Z run of 20 Nov 2026, cut down to four of its fourteen places.

const RUN = JSON.parse(fs.readFileSync(new URL('./fixtures/hrrr_waypoints_20261120_0200Z.json', import.meta.url), 'utf8'));
const fToC = (f) => ((f - 32) * 5) / 9;
const VARIABLES = {
    temp_2m_c: { units: 'Celsius' }, wind_speed_10m_ms: { units: 'm/s' }, wind_dir_10m_deg: { units: 'deg_true' }, rainfall_1h_mm: { units: 'mm' },
};
const place = (id, name, elevationFt, lon, tempsF, extra = {}) => ({
    id, name, lat: 40.2, lon, elevation_m: elevationFt / 3.28084,
    forecasts: { temp_2m_c: tempsF.map(fToC), wind_speed_10m_ms: [2.2352], wind_dir_10m_deg: [270], rainfall_1h_mm: [0], ...extra },
});

describe('profilePoints', () => {
    const points = profilePoints(RUN);

    test('the places west to east as the file lists them, each with its height in feet', () => {
        expect(points.map((point) => point.id)).toEqual(['daniels_summit', 'duchesne', 'roosevelt', 'vernal']);
        expect(points.map((point) => point.elevationFt)).toEqual([8190, 5520, 5180, 5320]);
    });

    test('and how far along the line each one is, in straight-line miles', () => {
        expect(points[0].miles).toBe(0);
        // Daniels Summit to Vernal is about 90 miles as the crow flies.
        expect(points.at(-1).miles).toBeGreaterThan(88);
        expect(points.at(-1).miles).toBeLessThan(96);
        expect(points.every((point, i) => i === 0 || point.miles > points[i - 1].miles)).toBe(true);
    });

    test('a place without a position or a height is left off the drawing', () => {
        expect(profilePoints({ stations: [{ id: 'a', name: 'A', lat: 40, lon: -110 }, { id: 'b', name: 'B', lat: 40, lon: -110, elevation_m: 1500 }] }))
            .toEqual([{ id: 'b', name: 'B', elevationFt: 4920, miles: 0 }]);
        expect(profilePoints(null)).toEqual([]);
    });
});

describe('profileHour', () => {
    test('every place at one hour, converted from the units the file states', () => {
        const hour = profileHour(RUN, 0);
        expect(Object.keys(hour)).toEqual(['daniels_summit', 'duchesne', 'roosevelt', 'vernal']);
        // -3.9 °C at Daniels Summit.
        expect(hour.daniels_summit.tempF).toBeCloseTo(24.98, 2);
        for (const values of Object.values(hour)) {
            expect(Number.isFinite(values.tempF)).toBe(true);
            expect(Number.isFinite(values.windMph)).toBe(true);
            expect(typeof values.windFrom).toBe('string');
        }
    });

    test('null, never a wrong number, for a unit it does not know or an hour the run lacks', () => {
        const odd = { variables: { temp_2m_c: { units: 'Rankine' } }, stations: [place('a', 'A', 5000, -110, [30])] };
        expect(profileHour(odd, 0).a).toEqual({ tempF: null, windMph: null, windFrom: 'W', precipIn: null });
        expect(profileHour({ variables: VARIABLES, stations: [place('a', 'A', 5000, -110, [30])] }, 5).a)
            .toEqual({ tempF: null, windMph: null, windFrom: null, precipIn: null });
    });
});

describe('pointSentence', () => {
    const point = { name: 'Myton', elevationFt: 5100 };

    test('a place in a sentence: height, temperature, wind, precipitation', () => {
        expect(pointSentence(point, { tempF: 27.6, windMph: 6.2, windFrom: 'W', precipIn: 0 }))
            .toBe('Myton, 5,100 ft: 28°F, wind W 6 mph, no precipitation.');
        expect(pointSentence(point, { tempF: 31, windMph: 0.3, windFrom: 'N', precipIn: 0.052 }))
            .toBe('Myton, 5,100 ft: 31°F, calm, 0.05 in of precipitation in the hour.');
    });

    test('says less when the run says less', () => {
        expect(pointSentence(point, { tempF: 31, windMph: null, windFrom: null, precipIn: null })).toBe('Myton, 5,100 ft: 31°F.');
        expect(pointSentence(point, { tempF: null, windMph: 5, windFrom: 'W', precipIn: 0 })).toBe('Myton, 5,100 ft: no forecast for this hour.');
        expect(pointSentence(point, undefined)).toBe('Myton, 5,100 ft: no forecast for this hour.');
    });
});

describe('profileSummary', () => {
    const run = (pass, benches, floor) => ({
        variables: VARIABLES,
        stations: [place('daniels_summit', 'Daniels Summit', 8190, -111.25, [pass]), place('fruitland', 'Fruitland', 6570, -110.84, [benches]),
            place('myton', 'Myton', 5100, -110.06, [floor])],
    });
    const summary = (forecast) => profileSummary(profilePoints(forecast), profileHour(forecast, 0));

    test('names the coldest and the warmest place, never an average', () => {
        expect(summary(run(18, 26, 34))).toBe('Coldest: Daniels Summit 18°F. Warmest: Myton 34°F.');
        expect(summary(run(30, 30.2, 30.4))).toBe('About 30°F all along the road.');
    });

    test('an inversion: the floor colder than the highest pass by 2°F or more', () => {
        expect(summary(run(31, 27, 22))).toBe('Coldest: Myton 22°F. Warmest: Daniels Summit 31°F. '
            + 'It is colder on the Basin floor than up at Daniels Summit (31°F, 8,190 ft): cold air is pooled low, which is a temperature inversion.');
        // One degree is within the model's noise: not called an inversion.
        expect(summary(run(25, 27, 24))).toBe('Coldest: Myton 24°F. Warmest: Fruitland 27°F.');
    });

    test('says so when the hour has no temperatures', () => {
        expect(profileSummary(profilePoints(RUN), {})).toBe('The run has no temperatures for this hour.');
    });

    test('the real evening of 19 Nov 2026: no inversion, the pass is coldest', () => {
        expect(summary(RUN)).toMatch(/^Coldest: Daniels Summit 25°F\. Warmest: /);
        expect(summary(RUN)).not.toMatch(/inversion/);
    });
});

describe('chooseLabels', () => {
    const points = [{ id: 'daniels_summit' }, { id: 'starvation' }, { id: 'duchesne' }, { id: 'vernal' }, { id: 'asphalt_ridge' }, { id: 'unlisted' }];

    test('keeps the better-known place when two labels would run into each other', () => {
        const extents = { daniels_summit: [0, 90], starvation: [180, 240], duchesne: [200, 260], asphalt_ridge: [420, 500], vernal: [470, 510], unlisted: [600, 650] };
        expect([...chooseLabels(points, extents)].sort()).toEqual(['daniels_summit', 'duchesne', 'unlisted', 'vernal']);
    });

    test('labels everything when there is room, and leaves a gap between neighbours', () => {
        const roomy = Object.fromEntries(points.map((point, i) => [point.id, [i * 100, i * 100 + 60]]));
        expect(chooseLabels(points, roomy).size).toBe(points.length);
        // Nine pixels apart is too close when ten are asked for.
        expect(chooseLabels([{ id: 'vernal' }, { id: 'roosevelt' }], { vernal: [0, 50], roosevelt: [59, 120] }).size).toBe(1);
        expect(chooseLabels([{ id: 'vernal' }, { id: 'roosevelt' }], { vernal: [0, 50], roosevelt: [60, 120] }).size).toBe(2);
    });

    test('a place with no room worked out for it is not labelled', () => {
        expect([...chooseLabels(points, { vernal: [0, 40] })]).toEqual(['vernal']);
    });
});

describe('tempBand', () => {
    test('the same bands and colours as the map: cold arm, neutral about freezing, warm arm', () => {
        expect(tempBand(12).ramp).toBe('cold');
        expect(tempBand(32)).toEqual({ ramp: 'freezing', t: 0 });
        expect(tempBand(55).ramp).toBe('warm');
        expect(tempBand(NaN)).toBeNull();
        expect(tempBand(null)).toBeNull();
    });
});
