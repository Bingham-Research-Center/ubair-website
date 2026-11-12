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
