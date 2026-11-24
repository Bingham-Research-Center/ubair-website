// Reading one hour out of an HRRR surface-layers run. A field is one flat array for the whole
// run, hour after hour, each hour a grid of rows x cols values. Pure functions only.

/** The grid of one field at one hour, as numbers, with NaN where the file has no value. */
export function sliceFieldForHour(payload, fieldName, hourIndex) {
    const flat = payload?.fields?.[fieldName];
    const shape = payload?.field_shape || [];
    if (!Array.isArray(flat) || shape.length !== 3) {
        return [];
    }

    const [, rows, cols] = shape;
    const sliceSize = rows * cols;
    const offset = hourIndex * sliceSize;
    return flat.slice(offset, offset + sliceSize).map(value => (
        value === null || value === undefined ? NaN : Number(value)
    ));
}

/**
 * The grid of a running total at one hour: for each point, the largest value from the start of
 * the run up to that hour.
 *
 * `snowfall_1h_mm` is this kind of field, whatever its name says. At a snowy point it reads
 * 0, 0.1, 0.3, 1.9, 10.0 ... 91.9, 0, 98.4, 98.6, 0: a total since the run began (509 mm at one
 * point in 18 hours on 19 Nov 2026), which drops to exactly zero in some hours and then picks
 * up where it left off. Taking the largest value so far gives the total back without the
 * dropouts. It is a total, so it is never shown as a rate.
 */
export function runningTotalForHour(payload, fieldName, hourIndex) {
    const flat = payload?.fields?.[fieldName];
    const shape = payload?.field_shape || [];
    if (!Array.isArray(flat) || shape.length !== 3) {
        return [];
    }

    const [, rows, cols] = shape;
    const sliceSize = rows * cols;
    const totals = new Array(sliceSize).fill(NaN);
    for (let hour = 0; hour <= hourIndex; hour += 1) {
        const offset = hour * sliceSize;
        for (let i = 0; i < sliceSize; i += 1) {
            const value = flat[offset + i];
            if (value === null || value === undefined || !Number.isFinite(Number(value))) continue;
            if (Number.isNaN(totals[i]) || Number(value) > totals[i]) totals[i] = Number(value);
        }
    }
    return totals;
}
