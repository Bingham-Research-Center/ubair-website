/**
 * How a UDOT road report becomes a colour. One set of rules, used by the roads page
 * (roadWeatherService.mapUDOTConditionToColor) and the homepage roads light
 * (statusLights.js), so the two can never disagree about the same stretch of road.
 *
 * Pure functions only.
 */

// The roads Basin people drive to get in, out and across: US-40 from Heber to Colorado, US-191
// from Helper to Wyoming, and SR-87. Snow covering one of these is red, on the roads page and
// on the homepage alike (JRL, 2026-11-20). Elsewhere it stays "use caution".
const MAJOR_ROUTES = new Set(['US-40', 'US-191', 'SR-87']);

// UDOT's road-conditions feed reaches the Wasatch Back and Carbon County. A major route counts
// as the Basin's only where it runs inside this box: from the east side of Heber Valley (so
// Daniels Canyon is in, Mayflower and Park City are out) and north of Helper.
export const BASIN_ROUTE_BOX = Object.freeze({ south: 39.72, north: 41.0, west: -111.3, east: -109.0 });

/**
 * The route a UDOT segment is named for: "US-40", "SR-87", "I-80". UDOT names start with the
 * route ("US-40 Through Daniels Canyon"); a route mentioned later in the name is where the
 * segment ends, not what it is ("I-80 Jeremy Ranch to US 40 at Silver Ck Jct" is I-80).
 */
export function routeOf(name) {
    const match = /^\s*(US|SR|I)[\s-]?(\d+)/i.exec(String(name ?? ''));
    return match ? `${match[1].toUpperCase()}-${match[2]}` : null;
}

const inBox = (lat, lng, box) => (
    Number.isFinite(lat) && Number.isFinite(lng)
    && lat >= box.south && lat <= box.north && lng >= box.west && lng <= box.east
);

/** True for a stretch of US-40, US-191 or SR-87 with at least one point inside the Basin box. */
export function isMajorBasinRoute({ name, coordinates } = {}) {
    if (!MAJOR_ROUTES.has(routeOf(name))) return false;
    return Array.isArray(coordinates) && coordinates.some((point) => inBox(point?.[0], point?.[1], BASIN_ROUTE_BOX));
}

/** True for a point (a traffic event) on the Basin's part of a major route. */
export function isMajorBasinPoint(roadwayName, lat, lng) {
    return MAJOR_ROUTES.has(routeOf(roadwayName)) && inBox(lat, lng, BASIN_ROUTE_BOX);
}

// What kind of report it is, worst first. The homepage names the worst kind it finds.
export const ROAD_KINDS = Object.freeze(['closed', 'ice', 'snow-covered', 'restriction', 'snow', 'wet', 'dry', 'unknown']);

/**
 * Classify one UDOT report.
 *
 * Returns `{ condition, status, reason, kind }`, where condition is 'red' | 'yellow' | 'green' |
 * 'gray'. `major` is whether the stretch is one of the Basin's major routes: there, a snow
 * covered or snow packed surface is red. Everything else is the same on every road.
 */
export function classifyUdotRoad(roadCondition, weatherCondition, restriction, { major = false } = {}) {
    const road = (roadCondition || '').toLowerCase();
    const weather = (weatherCondition || '').toLowerCase();
    const restrict = (restriction || '').toLowerCase();

    // Red: closed or icy, on any road
    if (restrict.includes('closed') || restrict.includes('no travel')) {
        return { condition: 'red', status: 'Dangerous', reason: `${roadCondition} - ${restriction}`, kind: 'closed' };
    }
    if (road.includes('icy') || road.includes('ice')) {
        return { condition: 'red', status: 'Dangerous', reason: `${roadCondition} - ${restriction}`, kind: 'ice' };
    }

    // Red on a major route: the surface itself is covered
    const covered = ['snow covered', 'snow packed', 'packed snow', 'snowpacked'].some((phrase) => road.includes(phrase));
    if (covered && major) {
        return { condition: 'red', status: 'Snow Covered', reason: `${roadCondition} on a major route`, kind: 'snow-covered' };
    }

    // Yellow: caution
    if (restrict.includes('chain') || restrict.includes('traction')) {
        return { condition: 'yellow', status: 'Use Caution', reason: `${roadCondition} - ${weatherCondition}`, kind: 'restriction' };
    }
    if (covered) {
        return { condition: 'yellow', status: 'Use Caution', reason: `${roadCondition} - ${weatherCondition}`, kind: 'snow-covered' };
    }
    if (road.includes('slush') || road.includes('snow') || weather.includes('snow') || weather.includes('storm')) {
        return { condition: 'yellow', status: 'Use Caution', reason: `${roadCondition} - ${weatherCondition}`, kind: 'snow' };
    }
    if (road.includes('wet')) {
        return { condition: 'yellow', status: 'Wet Roads', reason: 'Use caution on wet pavement', kind: 'wet' };
    }

    if (road.includes('dry')) {
        return { condition: 'green', status: 'Clear', reason: 'Dry road surface reported', kind: 'dry' };
    }

    return { condition: 'gray', status: 'No Data', reason: 'Road condition not reported or not recognized', kind: 'unknown' };
}
