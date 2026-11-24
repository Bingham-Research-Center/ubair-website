import { buildRouteForecastSummary, HRRR_HAZARD_LEVELS } from './HRRRForecastModel.js';

const HOURS = [1, 3, 6, 12];
const LEVELS = { unavailable: -1, clear: 0, caution: 1, danger: 2 };
const LEVEL_LABELS = { unavailable: 'No data', clear: 'Clear', caution: 'Caution', danger: 'Hazard' };
const noData = () => ({ level: 'unavailable', text: 'No data' });
const roadKey = value => String(value).toLowerCase().replace(/[^a-z0-9]/g, '');

function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

/** Keep every road from the existing rotation, even when its feeds are missing. */
export function corridorRoads() {
    return [
        { id: 'us40', shortName: 'US-40', name: 'US-40 Corridor' },
        { id: 'us191', shortName: 'US-191', name: 'US-191 North-South' },
        ...basinRoads.map(road => ({ ...road, id: roadKey(road.shortName) }))
    ];
}

/**
 * Local roads have location-based forecast points, not individual API groups.
 * Reuse their existing nearby-station matching rule for those model locations.
 * Never substitute the entire Basin forecast group for an individual road.
 */
export function corridorForecast(forecast, road) {
    if (!forecast) return null;
    const directRoute = Object.entries(forecast.routes).find(([id]) => roadKey(id) === road.id)?.[1];
    if (directRoute) return { ...forecast, routes: { [road.id]: directRoute } };
    if (!road.coordinates) return null;

    const points = Object.values(forecast.routes).flatMap(route => route.waypoints || []);
    const locations = points.map(point => ({ ...point, name: point.name || '', lng: point.lon }));
    const nearby = filterStationsForRoad(locations, road);
    const unique = new Map(nearby.map(point => [`${point.lat},${point.lon}`, point]));
    if (!unique.size) return null;
    return { ...forecast, routes: { [road.id]: { name: road.name, waypoints: [...unique.values()] } } };
}

export function forecastStatus(period) {
    const hazard = period?.hazard;
    if (!hazard || hazard.level === 'unavailable') return noData();
    const reason = hazard.reason || '';
    let text = 'Clear';
    if (/wind gust/i.test(reason)) {
        const gust = period.worstPoint?.forecast.wind_gust ?? period.metrics?.maxWindGust;
        text = Number.isFinite(gust)
            ? `Gusts ${Math.round(gust * (unitsSystem.isMetric ? 3.6 : 2.23694))} ${unitsSystem.isMetric ? 'km/h' : 'mph'}`
            : 'Strong gusts';
    } else if (/heavy snow/i.test(reason)) text = 'Heavy snow';
    else if (/freezing precipitation/i.test(reason)) text = 'Freezing precipitation';
    else if (/snow/i.test(reason) || period.metrics?.precipitationTypes?.includes('snow') && /freezing/i.test(reason)) text = 'Snow likely';
    else if (/freezing/i.test(reason)) text = 'Wintry precipitation';
    else if (/visibility/i.test(reason)) text = 'Low visibility';
    else if (/precipitation/i.test(reason)) text = 'Heavy precipitation';
    return { level: hazard.level, text, description: reason };
}

export function currentStatus(stations, events, available) {
    if (!available) return noData();
    if (events.some(event => event.isFullClosure)) return { level: 'danger', text: 'Road closed' };
    const surface = determineSurfaceCondition(stations);
    const travel = determineTravelStatus(stations, events);
    if (surface.status === 'poor') return { level: 'danger', text: 'Icy surface' };
    if (surface.text !== 'Unknown' && surface.status === 'caution') return { level: 'caution', text: 'Cold surface' };
    if (events.length && travel.status === 'caution') return { level: 'caution', text: 'Travel caution' };
    if (surface.text === 'Unknown') return noData();
    return { level: 'clear', text: 'Clear' };
}

export function incidentStatus(events, available) {
    if (!available) return noData();
    if (!events.length) return { level: 'clear', text: 'None reported' };
    const closures = events.filter(event => event.isFullClosure);
    if (closures.length) return {
        level: 'danger', text: closures.length === events.length
            ? `${events.length} closure${events.length === 1 ? '' : 's'}` : `${events.length} incidents`
    };
    const roadwork = events.every(event => /construction|roadwork|maintenance/i.test(event.eventType || ''));
    return { level: 'caution', text: `${events.length} ${roadwork ? 'roadwork' : events.length === 1 ? 'incident' : 'incidents'}` };
}

export function buildCorridorRows(data, forecast) {
    const available = Array.isArray(data?.stations) && Array.isArray(data?.events?.events) && data.events.success !== false;
    const now = Date.now();
    return corridorRoads().map(road => {
        const { stations, events: reportedEvents } = getCorridorConditions(road, available ? data : null);
        const events = reportedEvents.filter(event => {
            const start = Date.parse(event.startDate);
            const end = Date.parse(event.plannedEndDate);
            // Undated reports remain visible; explicit future/expired windows do not.
            return (!Number.isFinite(start) || start <= now) && (!Number.isFinite(end) || end >= now);
        });
        const source = corridorForecast(forecast, road);
        const summary = source ? buildRouteForecastSummary(source, road.id) : null;
        // Fixed column labels must never silently display a different lead hour.
        const periods = HOURS.map(hour => summary?.periods.find(period => period.hour === hour) || {
            hour, validTime: null,
            hazard: { level: 'unavailable', reason: 'No forecast for this road and hour', ...HRRR_HAZARD_LEVELS.unavailable }
        });
        return {
            road, stations, events, available, periods,
            now: currentStatus(stations, events, available),
            incidents: incidentStatus(events, available),
            pointNames: [...new Set(source?.routes[road.id]?.waypoints.map(point => point.name) || [])]
        };
    }).sort((a, b) => LEVELS[b.now.level] - LEVELS[a.now.level]);
}

function statusLabel(status) {
    const label = element('span', 'corridor-status');
    const dot = element('span', `corridor-status-dot is-${status.level}`);
    dot.setAttribute('aria-hidden', 'true');
    label.append(dot, element('span', 'corridor-sr-only', `${LEVEL_LABELS[status.level]}: `), element('span', '', status.text));
    if (status.description) label.title = status.description;
    return label;
}

export class CorridorTable {
    constructor(renderForecastCard) {
        this.body = document.getElementById('corridor-summary-body');
        this.renderForecastCard = renderForecastCard;
        this.data = null;
        this.forecast = null;
        this.expanded = new Set();
        this.handleClick = event => {
            const row = event.target.closest('[data-corridor-row]');
            if (row) this.toggle(row.dataset.corridorRow);
        };
        this.handleCurrentData = event => {
            this.data = event.detail.data;
            this.render();
        };
    }

    async init() {
        if (!this.body) return;
        this.body.addEventListener('click', this.handleClick);
        window.addEventListener('roads-route-data:updated', this.handleCurrentData);
        this.render();
        this.data = await routeDataCache.getData();
        this.render();
    }

    setForecast(forecast) {
        this.forecast = forecast;
        this.render();
    }

    toggle(id) {
        if (this.expanded.has(id)) this.expanded.delete(id);
        else this.expanded.add(id);
        const expanded = this.expanded.has(id);
        document.getElementById(`corridor-toggle-${id}`).setAttribute('aria-expanded', String(expanded));
        document.getElementById(`corridor-detail-${id}`).hidden = !expanded;
    }

    render() {
        if (!this.body) return;
        const focusedId = this.body.contains(document.activeElement) ? document.activeElement.id : null;
        const rows = buildCorridorRows(this.data, this.forecast);
        this.body.replaceChildren(...rows.flatMap(row => this.createRows(row)));
        if (focusedId) document.getElementById(focusedId)?.focus({ preventScroll: true });
    }

    createRows(data) {
        const { road, now, incidents, periods } = data;
        const row = element('tr', 'corridor-row');
        row.dataset.corridorRow = road.id;
        const heading = element('th');
        heading.scope = 'row';
        const button = element('button', 'corridor-toggle');
        button.type = 'button';
        button.id = `corridor-toggle-${road.id}`;
        button.setAttribute('aria-expanded', String(this.expanded.has(road.id)));
        button.setAttribute('aria-controls', `corridor-detail-${road.id}`);
        const chevron = element('span', 'corridor-chevron', '›');
        chevron.setAttribute('aria-hidden', 'true');
        // Spell out local names instead of the abbreviations needed by the carousel.
        const name = road.id === 'us40' || road.id === 'us191' || /^SR-|^US-/.test(road.shortName)
            ? road.shortName : road.name;
        button.append(chevron, element('span', '', name));
        heading.append(button);
        row.append(heading);
        [now, ...periods.map(forecastStatus), incidents].forEach(status => {
            const cell = element('td');
            cell.append(statusLabel(status));
            row.append(cell);
        });

        const detailRow = element('tr', 'corridor-detail-row');
        detailRow.id = `corridor-detail-${road.id}`;
        detailRow.hidden = !this.expanded.has(road.id);
        const detailCell = element('td');
        detailCell.colSpan = 7;
        const detail = element('div', 'corridor-detail');
        detail.setAttribute('role', 'region');
        detail.setAttribute('aria-labelledby', button.id);
        detail.append(element('h3', '', road.name));

        const grid = element('div', 'hrrr-period-grid');
        grid.setAttribute('role', 'list');
        grid.setAttribute('aria-label', `${road.shortName} HRRR forecast details`);
        periods.forEach(period => {
            const card = this.renderForecastCard(period);
            card.querySelector('.hrrr-period-hazard').replaceChildren(statusLabel(forecastStatus(period)));
            grid.append(card);
        });
        detail.append(grid);
        if (data.pointNames.length) {
            detail.append(element('p', 'corridor-point-note', `Model locations: ${data.pointNames.join(', ')}.`));
        }
        detail.append(this.currentDetails(data));
        if (data.events.length) {
            const event = data.events[0];
            const description = String(event.description || event.message || event.eventType || 'Traffic incident');
            const summary = description.length > 120 ? `${description.slice(0, 117).trimEnd()}…` : description;
            const note = element('p', 'corridor-incident-note', `${summary} · ${formatUDOTReportAge(event)}. `);
            const link = element('a', '', 'View travel advisories');
            link.href = '#travel-advisories';
            note.append(link);
            detail.append(note);
        }
        detailCell.append(detail);
        detailRow.append(detailCell);
        return [row, detailRow];
    }

    currentDetails({ stations, events, available }) {
        const metrics = element('dl', 'corridor-current-details');
        const surface = determineSurfaceCondition(stations);
        const values = [
            ['Air temperature', unitsSystem.formatTemperature(averageReportedTemperature(stations))],
            ['Surface condition', surface.text === 'Unknown' ? 'No data' : surface.text],
            ['Incidents', available ? String(events.length) : 'No data'],
            ['Travel status', available && (surface.text !== 'Unknown' || events.length)
                ? determineTravelStatus(stations, events).text : 'No data']
        ];
        values.forEach(([label, value]) => {
            const item = element('div');
            item.append(element('dt', '', label), element('dd', '', value === '--' ? 'No data' : value));
            metrics.append(item);
        });
        return metrics;
    }

    destroy() {
        this.body?.removeEventListener('click', this.handleClick);
        window.removeEventListener('roads-route-data:updated', this.handleCurrentData);
    }
}
