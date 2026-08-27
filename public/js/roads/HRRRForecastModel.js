/**
 * Pure helpers for turning the reduced HRRR road forecast into conservative
 * road-weather guidance. These functions intentionally describe atmospheric
 * hazards, not observed pavement conditions.
 */

export const HRRR_HAZARD_LEVELS = Object.freeze({
    unavailable: Object.freeze({ severity: -1, label: 'Unavailable', color: '#64748b' }),
    clear: Object.freeze({ severity: 0, label: 'Low concern', color: '#16a34a' }),
    caution: Object.freeze({ severity: 1, label: 'Use caution', color: '#d97706' }),
    danger: Object.freeze({ severity: 2, label: 'High concern', color: '#dc2626' })
});

const DEFAULT_DISPLAY_HOURS = Object.freeze([1, 3, 6, 12]);

function finiteNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function valueAt(values, index) {
    if (!Array.isArray(values) || index < 0 || index >= values.length) return null;
    return values[index];
}

function normalizePrecipType(value) {
    return String(value || 'none').trim().toLowerCase().replaceAll('_', ' ');
}

function summarizeNumericValues(values, method) {
    const finiteValues = values.map(finiteNumber).filter(value => value !== null);
    return finiteValues.length > 0 ? Math[method](...finiteValues) : null;
}

/**
 * Accept either the API wrapper ({ success, forecast }) or the forecast body.
 * Throws for malformed payloads so callers can render a truthful unavailable state.
 */
export function normalizeHRRRForecastResponse(payload) {
    const isApiWrapper = payload && Object.prototype.hasOwnProperty.call(payload, 'success');
    const forecast = isApiWrapper ? payload.forecast : payload;

    if (!forecast || typeof forecast !== 'object') {
        throw new TypeError('HRRR forecast payload is missing');
    }
    if (!Array.isArray(forecast.forecast_hours) || forecast.forecast_hours.length === 0) {
        throw new TypeError('HRRR forecast hours are missing');
    }
    if (!Array.isArray(forecast.valid_times) || forecast.valid_times.length !== forecast.forecast_hours.length) {
        throw new TypeError('HRRR valid times do not match forecast hours');
    }
    if (!forecast.routes || typeof forecast.routes !== 'object' || Object.keys(forecast.routes).length === 0) {
        throw new TypeError('HRRR road routes are missing');
    }

    return forecast;
}

/**
 * Convert a route waypoint's parallel forecast arrays into one hourly record.
 */
export function getWaypointForecastAtIndex(waypoint, index, validTime = null) {
    const values = waypoint?.forecasts || {};

    return {
        valid_time: validTime,
        temp_2m: finiteNumber(valueAt(values.temp_2m, index)),
        wind_speed_10m: finiteNumber(valueAt(values.wind_speed_10m, index)),
        wind_gust: finiteNumber(valueAt(values.wind_gust, index)),
        visibility: finiteNumber(valueAt(values.visibility, index)),
        precip_1hr: finiteNumber(valueAt(values.precip_1hr, index)),
        precip_type: normalizePrecipType(valueAt(values.precip_type, index)),
        snow_depth: finiteNumber(valueAt(values.snow_depth, index)),
        cloud_cover: finiteNumber(valueAt(values.cloud_cover, index)),
        rh_2m: finiteNumber(valueAt(values.rh_2m, index))
    };
}

/**
 * Classify modeled atmospheric hazards using deliberately conservative labels.
 * HRRR does not provide observed pavement temperature in this feed.
 */
export function classifyRoadHazard(forecast = {}) {
    const temp = finiteNumber(forecast.temp_2m);
    const precip = finiteNumber(forecast.precip_1hr) ?? 0;
    const visibility = finiteNumber(forecast.visibility);
    const gust = finiteNumber(forecast.wind_gust);
    const precipType = normalizePrecipType(forecast.precip_type);
    const candidates = [];

    const addCandidate = (level, reason) => {
        candidates.push({ level, reason, ...HRRR_HAZARD_LEVELS[level] });
    };

    const freezingType = precipType.includes('freez') || precipType.includes('ice') || precipType.includes('sleet');
    const snowType = precipType.includes('snow');

    if (freezingType) {
        addCandidate('danger', 'Freezing precipitation signal');
    } else if (temp !== null && temp <= 0 && precip > 0) {
        addCandidate('danger', 'Below freezing with precipitation');
    } else if (temp !== null && temp <= 2 && precip > 0) {
        addCandidate('caution', 'Near freezing with precipitation');
    }

    if (snowType && precip >= 2) {
        addCandidate('danger', 'Heavy snow signal');
    } else if (snowType && precip > 0) {
        addCandidate('caution', 'Snow signal');
    }

    if (visibility !== null && visibility < 0.4) {
        addCandidate('danger', 'Visibility below 0.25 mi');
    } else if (visibility !== null && visibility < 1.6) {
        addCandidate('caution', 'Visibility below 1 mi');
    }

    if (gust !== null && gust >= 20) {
        addCandidate('danger', 'Wind gusts above 45 mph');
    } else if (gust !== null && gust >= 13.4) {
        addCandidate('caution', 'Wind gusts above 30 mph');
    }

    if (precip >= 7.6) {
        addCandidate('danger', 'Very heavy precipitation');
    } else if (precip >= 2.5) {
        addCandidate('caution', 'Heavy precipitation');
    }

    const hasAtmosphericData = [temp, visibility, gust].some(value => value !== null) || precip > 0 || precipType !== 'none';
    if (!hasAtmosphericData) {
        return { level: 'unavailable', reason: 'Forecast values unavailable', ...HRRR_HAZARD_LEVELS.unavailable };
    }

    if (candidates.length === 0) {
        return { level: 'clear', reason: 'No modeled weather hazard', ...HRRR_HAZARD_LEVELS.clear };
    }

    candidates.sort((a, b) => b.severity - a.severity);
    return candidates[0];
}

/**
 * Select the requested forecast hours while preserving the actual available hour.
 */
export function selectForecastDisplayIndices(forecastHours, requestedHours = DEFAULT_DISPLAY_HOURS) {
    if (!Array.isArray(forecastHours) || forecastHours.length === 0) return [];

    const numericHours = forecastHours.map(finiteNumber);
    const selected = [];
    const usedIndices = new Set();

    requestedHours.forEach(requestedHour => {
        let bestIndex = -1;
        let bestDistance = Infinity;

        numericHours.forEach((hour, index) => {
            if (hour === null || usedIndices.has(index)) return;
            const distance = Math.abs(hour - requestedHour);
            if (distance < bestDistance) {
                bestDistance = distance;
                bestIndex = index;
            }
        });

        if (bestIndex >= 0) {
            usedIndices.add(bestIndex);
            selected.push({ index: bestIndex, hour: numericHours[bestIndex] });
        }
    });

    return selected.sort((a, b) => a.hour - b.hour);
}

/**
 * Find the worst modeled atmospheric hazard across one route for one hour.
 */
export function summarizeRouteAtIndex(route, index, validTime = null) {
    const waypointSummaries = (route?.waypoints || []).map(waypoint => {
        const forecast = getWaypointForecastAtIndex(waypoint, index, validTime);
        return {
            name: waypoint.name || 'Forecast point',
            lat: finiteNumber(waypoint.lat),
            lon: finiteNumber(waypoint.lon),
            elevation_m: finiteNumber(waypoint.elevation_m),
            forecast,
            hazard: classifyRoadHazard(forecast)
        };
    });

    if (waypointSummaries.length === 0) {
        return {
            routeName: route?.name || 'Route',
            validTime,
            hazard: { level: 'unavailable', reason: 'Route forecast unavailable', ...HRRR_HAZARD_LEVELS.unavailable },
            worstPoint: null,
            waypoints: []
        };
    }

    const ranked = [...waypointSummaries].sort((a, b) => b.hazard.severity - a.hazard.severity);
    const worstPoint = ranked[0];
    const precipitationTypes = [...new Set(waypointSummaries
        .map(point => point.forecast.precip_type)
        .filter(type => type && type !== 'none'))];

    return {
        routeName: route.name || 'Route',
        validTime,
        hazard: worstPoint.hazard,
        worstPoint,
        waypoints: waypointSummaries,
        metrics: {
            minTemperature: summarizeNumericValues(waypointSummaries.map(point => point.forecast.temp_2m), 'min'),
            maxWindGust: summarizeNumericValues(waypointSummaries.map(point => point.forecast.wind_gust), 'max'),
            minVisibility: summarizeNumericValues(waypointSummaries.map(point => point.forecast.visibility), 'min'),
            maxPrecipitation: summarizeNumericValues(waypointSummaries.map(point => point.forecast.precip_1hr), 'max'),
            precipitationTypes
        }
    };
}

/**
 * Build the compact +1/+3/+6/+12 route summary used by the page.
 */
export function buildRouteForecastSummary(forecast, routeId, requestedHours = DEFAULT_DISPLAY_HOURS) {
    const route = forecast?.routes?.[routeId];
    if (!route) return null;

    const selections = selectForecastDisplayIndices(forecast.forecast_hours, requestedHours);
    const periods = selections.map(selection => ({
        ...selection,
        ...summarizeRouteAtIndex(route, selection.index, forecast.valid_times[selection.index])
    }));

    const onset = forecast.forecast_hours.map((hour, index) => ({
        hour: finiteNumber(hour),
        index,
        ...summarizeRouteAtIndex(route, index, forecast.valid_times[index])
    })).find(period => period.hazard.severity >= HRRR_HAZARD_LEVELS.caution.severity) || null;

    return {
        routeId,
        routeName: route.name || routeId,
        periods,
        onset
    };
}

/**
 * Build map-ready forecast points and adjoining route segments for one hour.
 * Coordinates remain the reduced HRRR waypoints and are not exact road geometry.
 */
export function buildForecastMapData(forecast, index) {
    const hour = finiteNumber(forecast?.forecast_hours?.[index]);
    const validTime = forecast?.valid_times?.[index] || null;

    const routes = Object.entries(forecast?.routes || {}).map(([routeId, route]) => {
        const points = (route.waypoints || []).map(waypoint => {
            const lat = finiteNumber(waypoint.lat);
            const lon = finiteNumber(waypoint.lon);
            if (lat === null || lon === null) return null;

            const pointForecast = getWaypointForecastAtIndex(waypoint, index, validTime);
            return {
                name: waypoint.name || 'Forecast point',
                lat,
                lon,
                elevation_m: finiteNumber(waypoint.elevation_m),
                forecast: pointForecast,
                hazard: classifyRoadHazard(pointForecast)
            };
        }).filter(Boolean);

        const segments = points.slice(0, -1).map((start, pointIndex) => {
            const end = points[pointIndex + 1];
            const worstPoint = start.hazard.severity >= end.hazard.severity ? start : end;
            return {
                id: `${routeId}-${pointIndex}`,
                start,
                end,
                hazard: worstPoint.hazard,
                forecast: worstPoint.forecast,
                worstPointName: worstPoint.name
            };
        });

        return {
            routeId,
            routeName: route.name || routeId,
            points,
            segments
        };
    });

    return { index, hour, validTime, routes };
}

export function getForecastFreshness(initTime, now = Date.now()) {
    const initMs = new Date(initTime).getTime();
    if (!Number.isFinite(initMs)) {
        return { level: 'unavailable', ageHours: null, label: 'Initialization time unavailable' };
    }

    const ageHours = Math.max(0, (Number(now) - initMs) / 3600000);
    if (ageHours <= 3) return { level: 'fresh', ageHours, label: 'Current model run' };
    if (ageHours <= 6) return { level: 'aging', ageHours, label: 'Older model run' };
    return { level: 'stale', ageHours, label: 'Stale model run' };
}
