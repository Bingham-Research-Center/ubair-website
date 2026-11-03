import { basinCountyRings, basinApproaches } from './basinAlertArea.js';

const basinCounty = /\b(?:uintah|duchesne)\b/i;
const basinPlace = /\b(?:uintah county|duchesne|uintah basin|uinta basin|vernal|roosevelt|ballard|altamont|myton|tabiona|talmage|neola|randlett|jensen|bonanza|whiterocks|tridell|lapoint|bluebell)\b/i;
const outsidePlace = /\b(?:bluff|moab|blanding|monticello|montezuma creek|mexican hat|san juan|grand county|emery county|green river|crescent junction|wellington|park city|silver creek|jordanelle|summit county|provo|salt lake|daggett|manila|dutch john|colorado|wyoming)\b/i;
const westernApproach = /\b(?:heber(?: city)?|strawberry|daniels (?:canyon|summit)|soldier creek|currant creek)\b/i;
const southernApproach = /\b(?:price|helper|indian canyon|emma park|castle gate|carbon county)\b/i;
const northeasternRegion = /\bnorth[ -]?eastern utah\b/i;

function text(value) {
    if (Array.isArray(value)) return value.map(text).join(' ');
    if (value && typeof value === 'object') return text(value.name ?? value.Name ?? value.region ?? value.Region);
    return typeof value === 'string' ? value : '';
}

/** Preserve optional location fields if UDOT supplies them in addition to Regions. */
export function alertLocation(alert) {
    const regions = alert.regions ?? alert.Regions ?? [];
    return {
        regions: (Array.isArray(regions) ? regions : [regions]).map(text).filter(Boolean),
        county: alert.county ?? alert.County ?? null,
        roadwayName: alert.roadwayName ?? alert.RoadwayName ?? alert.routeName ?? alert.RouteName ?? alert.route ?? alert.Route ?? null,
        location: alert.location ?? alert.Location ?? null,
        latitude: alert.latitude ?? alert.Latitude ?? null,
        longitude: alert.longitude ?? alert.Longitude ?? null,
        latitudeSecondary: alert.latitudeSecondary ?? alert.LatitudeSecondary ?? null,
        longitudeSecondary: alert.longitudeSecondary ?? alert.LongitudeSecondary ?? null
    };
}

function routeMatches(value) {
    return [...value.matchAll(/\b(?:u\.?\s*s\.?(?:\s*(?:route|highway))?|s\.?\s*r\.?|state\s+(?:route|road)|interstate|i|highway|hwy|route)\s*[-\u2010-\u2015]?\s*0*(\d+)\b/gi)];
}

function coordinate(longitude, latitude) {
    if (longitude === null || longitude === undefined || latitude === null || latitude === undefined ||
        String(longitude).trim() === '' || String(latitude).trim() === '') return null;
    const point = [Number(longitude), Number(latitude)];
    return point.every(Number.isFinite) && Math.abs(point[0]) <= 180 && Math.abs(point[1]) <= 90 ? point : null;
}

function inRing([x, y], ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [ax, ay] = ring[i];
        const [bx, by] = ring[j];
        if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
    }
    return inside;
}

function nearPath(point, path) {
    // Local equirectangular projection in km; sufficient for a 2 km road buffer.
    const scaleX = 111.32 * Math.cos(point[1] * Math.PI / 180);
    for (let i = 1; i < path.length; i++) {
        const a = [(path[i - 1][0] - point[0]) * scaleX, (path[i - 1][1] - point[1]) * 111.32];
        const b = [(path[i][0] - point[0]) * scaleX, (path[i][1] - point[1]) * 111.32];
        const dx = b[0] - a[0], dy = b[1] - a[1];
        const lengthSquared = dx * dx + dy * dy;
        const t = lengthSquared ? Math.max(0, Math.min(1, -(a[0] * dx + a[1] * dy) / lengthSquared)) : 0;
        if (Math.hypot(a[0] + t * dx, a[1] + t * dy) <= 2) return true;
    }
    return false;
}

export function isAlertRelevantToBasin(alert) {
    if (!alert || typeof alert !== 'object') return false;
    const location = alertLocation(alert);
    const regions = text(location.regions);
    const county = text(location.county);
    const message = text(alert.message ?? alert.Message);
    const notes = text(alert.notes ?? alert.Notes);
    const road = text(location.roadwayName);
    const place = text(location.location);
    const detail = [road, place, message, notes].join(' ');
    const routeSource = [road, place, message, notes, regions].find(value => routeMatches(value).length) || '';
    const routes = routeMatches(routeSource);
    // A junction or detour reference must not turn an unrelated road into US-191.
    const route = routes.length ? Number(routes[0][1]) : null;
    const points = [
        coordinate(location.longitude, location.latitude),
        coordinate(location.longitudeSecondary, location.latitudeSecondary)
    ].filter(Boolean);

    // Specific coordinates outrank a broad region or an incidental route mention.
    if (points.length) {
        return points.some(point => basinCountyRings.some(ring => inRing(point, ring)) ||
            Object.entries(basinApproaches).some(([name, path]) =>
                (route === null || name === `US-${route}` || (route === 6 && name === 'US-191')) && nearPath(point, path)));
    }

    if (basinCounty.test(county)) return true;
    if (outsidePlace.test([county, detail].join(' '))) return false;
    if (basinCounty.test(regions) || basinPlace.test(regions) || basinPlace.test(detail)) return true;

    // UDOT labels the shared Price–Helper approach as US-6 in some alerts.
    if (route === 6 && /\b(?:price|helper|castle gate)\b/i.test(detail)) return true;

    if (route === 40 || route === 191) {
        // Only Wasatch's US-40 and Carbon's US-191 approaches extend beyond the two counties.
        if (county && !(route === 40 ? /\bwasatch\b/i : /\bcarbon\b/i).test(county)) return false;
        const approach = route === 40 ? westernApproach : southernApproach;
        if (approach.test(detail)) return true;

        // Mileposts apply to the primary route, stopping before any junction route.
        const routeText = routeSource === road ? `${road} ${message} ${notes}` : routeSource.slice(routes[0].index + routes[0][0].length, routes[1]?.index);
        const mileposts = routeText.match(/\b(?:mp|mile\s*(?:post|point)s?)\s*[:#]?\s*(\d+(?:\.\d+)?)(?:\s*(?:-|\u2013|to)\s*(?:mp\s*)?(\d+(?:\.\d+)?))?/i);
        if (mileposts) {
            const start = Number(mileposts[1]);
            const end = Number(mileposts[2] ?? mileposts[1]);
            // UDOT's milepoint samples place Heber at MP 15+, Indian Canyon at
            // MP 252+, and the northern Uintah County limit near US-191 MP 379.
            const [minimum, maximum] = route === 40 ? [15, 175] : [252, 379];
            return Math.max(start, end) >= minimum && Math.min(start, end) <= maximum;
        }

        // A broad southeastern region alone cannot locate US-191 near the Basin.
        if (regions && !northeasternRegion.test(regions) &&
            !(route === 40 ? westernApproach : southernApproach).test(regions) &&
            !(route === 40 && /\bwasatch\b/i.test(regions))) return false;
        return true;
    }

    if (county) return false;
    // These state routes lie in the Basin; SR-121 is explicitly part of the requested area.
    if ([45, 87, 88, 121].includes(route)) return true;
    // Regions are useful when the feed has no more precise road/location information.
    return northeasternRegion.test(regions);
}

function timestamp(value) {
    if (value === null || value === undefined || value === '' || value === 0) return null;
    const time = typeof value === 'number' ? value * 1000 : Date.parse(value);
    return Number.isFinite(time) ? time : null;
}

export function filterBasinAlerts(alerts, now = Date.now()) {
    return (Array.isArray(alerts) ? alerts : []).filter(alert => {
        if (!isAlertRelevantToBasin(alert)) return false;
        const start = timestamp(alert.startTime ?? alert.StartTime);
        const end = timestamp(alert.endTime ?? alert.EndTime);
        return (start === null || start <= now) && (end === null || end >= now);
    });
}
