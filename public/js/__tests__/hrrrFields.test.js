import { runningTotalForHour, sliceFieldForHour } from '../hrrrFields.js';

// One hour out of an HRRR surface-layers run, and the snow field that is a running total.

// Two grid points over five hours. Point A is a real series from the 23Z run on 19 Nov 2026,
// shortened: a total since the run began that drops to zero in one hour and picks up again.
const payload = {
    field_shape: [5, 1, 2],
    fields: {
        snowfall_1h_mm: [
            0.0, 0.0,
            10.0, null,
            14.7, 0.3,
            0.0, 0.0,
            20.8, 0.0,
        ],
        rainfall_1h_mm: [0.0, 0.0, 0.8, 1.2, 0.0, 1.0, 0.2, 0.0, 4.0, 0.0],
    },
};

describe('sliceFieldForHour', () => {
    test('returns the grid for one hour, NaN where the file has no value', () => {
        expect(sliceFieldForHour(payload, 'snowfall_1h_mm', 2)).toEqual([14.7, 0.3]);
        expect(sliceFieldForHour(payload, 'snowfall_1h_mm', 1)).toEqual([10.0, NaN]);
        expect(sliceFieldForHour(payload, 'rainfall_1h_mm', 4)).toEqual([4.0, 0.0]);
    });

    test('is empty for a field or a shape the file does not have', () => {
        expect(sliceFieldForHour(payload, 'gusts', 0)).toEqual([]);
        expect(sliceFieldForHour({ fields: payload.fields }, 'snowfall_1h_mm', 0)).toEqual([]);
        expect(sliceFieldForHour(null, 'snowfall_1h_mm', 0)).toEqual([]);
    });
});

describe('runningTotalForHour', () => {
    test('gives the total so far at each point, through an hour that dropped to zero', () => {
        expect(runningTotalForHour(payload, 'snowfall_1h_mm', 0)).toEqual([0.0, 0.0]);
        expect(runningTotalForHour(payload, 'snowfall_1h_mm', 2)).toEqual([14.7, 0.3]);
        // Hour 3 reads 0.0 in the file: the total has not gone back to nothing.
        expect(runningTotalForHour(payload, 'snowfall_1h_mm', 3)).toEqual([14.7, 0.3]);
        expect(runningTotalForHour(payload, 'snowfall_1h_mm', 4)).toEqual([20.8, 0.3]);
    });

    test('never falls from one hour to the next', () => {
        for (let hour = 1; hour < 5; hour += 1) {
            const before = runningTotalForHour(payload, 'snowfall_1h_mm', hour - 1);
            const now = runningTotalForHour(payload, 'snowfall_1h_mm', hour);
            now.forEach((value, i) => expect(value).toBeGreaterThanOrEqual(before[i]));
        }
    });

    test('a point with no value yet is NaN, not zero', () => {
        const sparse = { field_shape: [2, 1, 1], fields: { snowfall_1h_mm: [null, null] } };
        expect(runningTotalForHour(sparse, 'snowfall_1h_mm', 1)).toEqual([NaN]);
        expect(runningTotalForHour(null, 'snowfall_1h_mm', 1)).toEqual([]);
    });
});
