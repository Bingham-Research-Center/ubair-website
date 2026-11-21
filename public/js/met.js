// Small meteorology and unit helpers shared by pages that read the observation feed.
//
// The feed is raw SI (Celsius, m/s, Pascals) and api.js deliberately does not convert it, so
// each page converts at display time from the units the feed states. These converters accept
// only units they recognise and return null otherwise: a page then shows "--" rather than a
// confidently wrong number, which is how the sports page once showed a 19 °F wind chill on a
// 77 °F day. Pure functions only; importing this module has no side effects.

export function toCelsius(value, unit) {
    if (!Number.isFinite(value)) return null;
    if (unit === 'Celsius') return value;
    if (unit === 'Fahrenheit') return ((value - 32) * 5) / 9;
    if (unit === 'Kelvin') return value - 273.15;
    return null;
}

export function toFahrenheit(value, unit) {
    const c = toCelsius(value, unit);
    return c === null ? null : (c * 9) / 5 + 32;
}

export function toMph(value, unit) {
    if (!Number.isFinite(value)) return null;
    if (unit === 'm/s') return value * 2.23694;
    if (unit === 'mph') return value;
    if (unit === 'knots' || unit === 'kt') return value * 1.15078;
    return null;
}

export function toMetresPerSecond(value, unit) {
    const mph = toMph(value, unit);
    return mph === null ? null : mph / 2.23694;
}

export function toMillimetres(value, unit) {
    if (!Number.isFinite(value)) return null;
    if (unit === 'Millimeters' || unit === 'mm') return value;
    if (unit === 'Centimeters' || unit === 'cm') return value * 10;
    if (unit === 'Meters' || unit === 'm') return value * 1000;
    if (unit === 'Inches' || unit === 'in') return value * 25.4;
    return null;
}

// Visibility. The observation feed states it in statute miles (brc-tools #76, 2026-11-21), the
// one variable it does not send in SI; the road forecast states kilometres.
export function toMiles(value, unit) {
    if (!Number.isFinite(value)) return null;
    if (unit === 'Statute miles' || unit === 'miles' || unit === 'mi') return value;
    if (unit === 'Kilometers' || unit === 'km') return value / 1.609344;
    if (unit === 'Meters' || unit === 'm') return value / 1609.344;
    return null;
}

export function toKilometres(value, unit) {
    const miles = toMiles(value, unit);
    return miles === null ? null : miles * 1.609344;
}

/**
 * Relative humidity from temperature and dew point, via the Magnus formula.
 *
 * The feed carries no relative_humidity at all, but it does carry dew point: the temperature
 * the air would have to cool to before water condenses out, so a direct measure of the water
 * actually present. `es` is the most water this air could hold at its temperature; `e` is how
 * much is really there. RH is the ratio of the two.
 */
export function relativeHumidityFromDewPoint(tempC, dewPointC) {
    if (!Number.isFinite(tempC) || !Number.isFinite(dewPointC)) return null;
    const saturationPressure = (t) => 6.112 * Math.exp((17.67 * t) / (t + 243.5));
    const rh = (100 * saturationPressure(dewPointC)) / saturationPressure(tempC);
    return Math.min(100, Math.max(0, rh));
}

/**
 * Wind chill in °F, by the National Weather Service formula (2001).
 *
 * The formula is defined only at or below 50 °F with a wind of at least 3 mph. Outside that
 * range this returns null: there is no wind chill to report, and a caller that wants a
 * "feels like" number falls back to the air temperature itself (`feelsLikeColdF`).
 */
export function windChillF(tempF, windMph) {
    if (!Number.isFinite(tempF) || !Number.isFinite(windMph)) return null;
    if (tempF > 50 || windMph < 3) return null;
    const v = windMph ** 0.16;
    return 35.74 + 0.6215 * tempF - 35.75 * v + 0.4275 * tempF * v;
}

/**
 * How cold it feels, in °F: the wind chill where one is defined, otherwise the air temperature.
 * A calm night in a Basin cold pool is cold without any wind, and must not read as "no value".
 * Null only when the temperature itself is unknown.
 */
export function feelsLikeColdF(tempF, windMph) {
    if (!Number.isFinite(tempF)) return null;
    return windChillF(tempF, windMph) ?? tempF;
}
