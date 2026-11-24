/**
 * What the stations paired with the forecast towns have measured since a model run began.
 *
 * The weather page draws a town's forecast with dots for what its station actually measured
 * in the hours of the run that are already past: the plainest check there is on a forecast.
 * These functions pick the stations and gather their readings out of the ten-minute
 * observation files. Pure: the route (routes/weatherForecast.js) reads the files.
 *
 * Nothing is filled in. A town whose paired station is not in our feed gets no series, and
 * the page says so; a reading is passed on in the units the feed states, with its own time.
 */

// The model point for Vernal is paired by the producer with a town station. The homepage's
// current conditions are Vernal Regional Airport, and the two should not disagree on the same
// site, so Vernal's forecast is held against the airport (JRL, 2026-11-20).
export const STATION_OVERRIDES = Object.freeze({ vernal: 'KVEL' });

// A station that stands where the model point does, but that our feed does not carry yet. It
// takes the town over once it reports; until then the producer's choice stands, so naming it
// early costs no dots. Dinosaur's model point is on US-40 in Colorado, 0.4 km from the climate
// reference site DNOC2 (6,046 ft). The producer pairs it with the monitor at the Monument's
// quarry, 35 km away and 1,250 ft lower, because Synoptic refuses the token Colorado (asked
// in Nov 2026). CHPC already requests DNOC2, so it arrives with no change there.
export const PREFERRED_WHEN_REPORTING = Object.freeze({ dinosaur: 'DNOC2' });

export const OBSERVED_VARIABLES = Object.freeze(['air_temp', 'wind_speed']);

/**
 * [{ townId, stid }] for every town in a waypoints run that names a station, with `preferred`
 * added where a better-placed station is waited for (PREFERRED_WHEN_REPORTING).
 */
export function pairedStations(forecast) {
    return (Array.isArray(forecast?.stations) ? forecast.stations : [])
        .filter((station) => typeof station?.id === 'string')
        .map((station) => {
            const preferred = PREFERRED_WHEN_REPORTING[station.id] ?? null;
            const stid = STATION_OVERRIDES[station.id] ?? station.reference_stid ?? preferred;
            return preferred && preferred !== stid ? { townId: station.id, stid, preferred } : { townId: station.id, stid };
        })
        .filter((pair) => typeof pair.stid === 'string' && pair.stid !== '');
}

/** Every station whose readings the pairs could use: each town's own, and the one it waits for. */
export function wantedStids(pairs) {
    return new Set((Array.isArray(pairs) ? pairs : []).flatMap((pair) => [pair.stid, pair.preferred]).filter(Boolean));
}

/**
 * The rows of one observation file worth keeping: the wanted stations and variables, with a
 * number, a unit and a time. `[{ stid, variable, time, value, units }]`.
 */
export function wantedRows(rows, stids) {
    const kept = [];
    for (const row of Array.isArray(rows) ? rows : []) {
        if (!stids.has(row?.stid) || !OBSERVED_VARIABLES.includes(row.variable)) continue;
        if (!Number.isFinite(row.value) || typeof row.units !== 'string' || !Number.isFinite(Date.parse(row.date_time))) continue;
        kept.push({ stid: row.stid, variable: row.variable, time: new Date(row.date_time).toISOString(), value: row.value, units: row.units });
    }
    return kept;
}

/**
 * Each town's station and its readings from `sinceMs` to `now`, oldest first.
 *
 * The same reading appears in file after file until the station reports again, so readings
 * are kept once per station, variable and time. A variable whose readings do not all state
 * the same unit is dropped rather than mixed.
 *
 * A town that waits for a better-placed station (`preferred`) is given that station's readings
 * as soon as one falls in the window, and its usual station's until then.
 *
 * @param pairs  from `pairedStations`
 * @param rows   every `wantedRows` row from the files in the window
 * @param meta   station metadata rows `{ stid, name, elevation }`, for the station's name
 */
export function observedByTown(pairs, rows, meta, sinceMs, now) {
    const names = new Map((Array.isArray(meta) ? meta : []).map((station) => [station?.stid, station]));
    const series = new Map(); // "stid|variable" -> Map(time -> row)
    for (const row of rows) {
        const t = Date.parse(row.time);
        if (t < sinceMs || t > now) continue;
        const key = `${row.stid}|${row.variable}`;
        if (!series.has(key)) series.set(key, new Map());
        series.get(key).set(row.time, row);
    }

    const reports = (stid) => OBSERVED_VARIABLES.some((variable) => series.has(`${stid}|${variable}`));

    const towns = {};
    for (const { townId, stid: paired, preferred } of pairs) {
        // One station's readings or the other's, never a mix of the two.
        const stid = preferred && reports(preferred) ? preferred : paired;
        const station = names.get(stid);
        const town = {
            stid,
            name: typeof station?.name === 'string' ? station.name : null,
            elevationFt: Number.isFinite(station?.elevation) ? station.elevation : null,
        };
        for (const variable of OBSERVED_VARIABLES) {
            const readings = [...(series.get(`${stid}|${variable}`)?.values() ?? [])].sort((a, b) => a.time.localeCompare(b.time));
            const units = new Set(readings.map((reading) => reading.units));
            town[variable] = readings.length > 0 && units.size === 1
                ? { units: readings[0].units, points: readings.map((reading) => [reading.time, reading.value]) }
                : null;
        }
        towns[townId] = town;
    }
    return towns;
}
