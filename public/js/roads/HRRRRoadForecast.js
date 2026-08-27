import {
    buildRouteForecastSummary,
    getForecastFreshness,
    normalizeHRRRForecastResponse
} from './HRRRForecastModel.js';

const HRRR_ENDPOINT = '/api/road-weather/forecast';
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

const mountainTimeFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Denver',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short'
});

const mountainHourFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Denver',
    hour: 'numeric',
    minute: '2-digit'
});

function formatMountainTime(value) {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? mountainTimeFormatter.format(date) : 'time unavailable';
}

function formatMountainHour(value) {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? mountainHourFormatter.format(date) : '--';
}

function isMetricMode() {
    return localStorage.getItem('unitsSystem') === 'metric';
}

function formatTemperatureFromCelsius(value) {
    if (!Number.isFinite(value)) return '--';
    return isMetricMode() ? `${value.toFixed(0)}°C` : `${(value * 9 / 5 + 32).toFixed(0)}°F`;
}

function formatWindFromMetersPerSecond(value) {
    if (!Number.isFinite(value)) return '--';
    return isMetricMode() ? `${(value * 3.6).toFixed(0)} km/h` : `${(value * 2.23694).toFixed(0)} mph`;
}

function formatVisibilityFromKm(value) {
    if (!Number.isFinite(value)) return '--';
    return isMetricMode() ? `${value.toFixed(1)} km` : `${(value / 1.60934).toFixed(1)} mi`;
}

function formatPrecipitationFromMm(value) {
    if (!Number.isFinite(value)) return '--';
    return isMetricMode() ? `${value.toFixed(1)} mm` : `${(value / 25.4).toFixed(2)} in`;
}

function titleCase(value) {
    return String(value || '').replace(/\b\w/g, character => character.toUpperCase());
}

function precipitationSummary(metrics) {
    const types = metrics.precipitationTypes || [];
    if ((metrics.maxPrecipitation || 0) <= 0 && types.length === 0) return 'Dry';
    const type = types.length > 0 ? titleCase(types.join('/')) : 'Precip';
    return `${type} ${formatPrecipitationFromMm(metrics.maxPrecipitation)}`;
}

function createElement(tagName, className, text = null) {
    const element = document.createElement(tagName);
    if (className) element.className = className;
    if (text !== null) element.textContent = text;
    return element;
}

function hazardIconClass(level) {
    if (level === 'danger') return 'fas fa-triangle-exclamation';
    if (level === 'caution') return 'fas fa-exclamation-circle';
    if (level === 'clear') return 'fas fa-check-circle';
    return 'fas fa-circle-question';
}

function createMetaItem(iconClass, text) {
    const item = document.createElement('span');
    const icon = document.createElement('i');
    icon.className = iconClass;
    icon.setAttribute('aria-hidden', 'true');
    item.append(icon, document.createTextNode(text));
    return item;
}

function countForecastPoints(forecast) {
    if (Array.isArray(forecast.points)) return forecast.points.length;
    return Object.values(forecast.routes || {}).reduce((total, route) => total + (route.waypoints?.length || 0), 0);
}

export class HRRRRoadForecastController {
    constructor({ endpoint = HRRR_ENDPOINT, refreshIntervalMs = REFRESH_INTERVAL_MS } = {}) {
        this.endpoint = endpoint;
        this.refreshIntervalMs = refreshIntervalMs;
        this.forecast = null;
        this.refreshTimer = null;
        this.panel = document.getElementById('hrrr-guidance-panel');
        this.statusElement = document.getElementById('hrrr-guidance-status');
        this.metaElement = document.getElementById('hrrr-guidance-meta');
        this.handleUnitsToggle = () => this.renderRouteForecasts();
    }

    async init() {
        if (!this.panel || !this.statusElement || !this.metaElement) return;

        await this.load();
        document.getElementById('units-toggle')?.addEventListener('click', this.handleUnitsToggle);
        this.refreshTimer = window.setInterval(() => this.load({ isRefresh: true }), this.refreshIntervalMs);
        window.addEventListener('pagehide', () => this.destroy(), { once: true });
    }

    async load({ isRefresh = false } = {}) {
        if (!isRefresh || !this.forecast) this.renderLoading();

        try {
            const response = await fetch(this.endpoint, {
                headers: { Accept: 'application/json' },
                cache: 'no-store'
            });

            if (!response.ok) {
                throw new Error(response.status === 404 ? 'No current HRRR road run is available' : `Forecast request failed (${response.status})`);
            }

            const payload = await response.json();
            this.forecast = normalizeHRRRForecastResponse(payload);
            this.renderForecast();

            window.dispatchEvent(new CustomEvent('hrrr-road-forecast:ready', {
                detail: { forecast: this.forecast }
            }));
        } catch (error) {
            console.error('Unable to load HRRR road guidance:', error);
            this.renderUnavailable(error.message, Boolean(this.forecast));
        }
    }

    renderLoading() {
        this.panel.dataset.state = 'loading';
        this.statusElement.className = 'hrrr-guidance-status is-loading';
        this.statusElement.textContent = 'Checking the latest model run…';
        this.metaElement.textContent = 'Forecast initialization and coverage will appear here.';
    }

    renderForecast() {
        const freshness = getForecastFreshness(this.forecast.init_time);
        const model = String(this.forecast.model || 'HRRR').toUpperCase();
        const pointCount = countForecastPoints(this.forecast);
        const hourCount = this.forecast.forecast_hours.length;
        const routeCount = Object.keys(this.forecast.routes).length;

        this.panel.dataset.state = freshness.level;
        this.statusElement.className = `hrrr-guidance-status is-${freshness.level}`;
        this.statusElement.textContent = freshness.level === 'fresh'
            ? 'Current model run available'
            : freshness.label;

        this.metaElement.replaceChildren(
            createMetaItem('fas fa-clock', `${model} initialized ${formatMountainTime(this.forecast.init_time)}`),
            createMetaItem('fas fa-route', `${pointCount} forecast points across ${routeCount} route groups`),
            createMetaItem('fas fa-forward', `${hourCount}-hour guidance through ${formatMountainTime(this.forecast.valid_times.at(-1))}`)
        );

        this.renderRouteForecasts();
    }

    renderUnavailable(message, retainingPreviousRun = false) {
        this.panel.dataset.state = 'unavailable';
        this.statusElement.className = 'hrrr-guidance-status is-unavailable';
        this.statusElement.textContent = retainingPreviousRun
            ? 'Latest update delayed'
            : 'HRRR guidance unavailable';
        this.metaElement.textContent = retainingPreviousRun
            ? `The previously loaded run remains visible. ${message}`
            : message;

        if (!retainingPreviousRun) this.renderRouteUnavailable(message);
    }

    renderRouteForecasts() {
        if (!this.forecast) return;

        document.querySelectorAll('[data-hrrr-route]').forEach(container => {
            const summary = buildRouteForecastSummary(this.forecast, container.dataset.hrrrRoute);
            if (!summary) {
                this.renderSingleRouteUnavailable(container, 'No forecast points are configured for this route.');
                return;
            }
            this.renderSingleRouteForecast(container, summary);
        });
    }

    renderSingleRouteForecast(container, summary) {
        container.dataset.state = 'ready';
        container.setAttribute('aria-label', `${summary.routeName} HRRR model guidance`);

        const header = createElement('div', 'hrrr-route-header');
        const title = createElement('div', 'hrrr-route-title');
        title.append(
            createElement('span', 'hrrr-route-kicker', 'HRRR outlook'),
            createElement('strong', '', summary.routeName)
        );

        const onset = createElement('div', `hrrr-hazard-onset is-${summary.onset?.hazard.level || 'clear'}`);
        const onsetIcon = createElement('i', hazardIconClass(summary.onset?.hazard.level || 'clear'));
        onsetIcon.setAttribute('aria-hidden', 'true');

        if (summary.onset) {
            const pointName = summary.onset.worstPoint?.name || 'the route';
            onset.append(
                onsetIcon,
                document.createTextNode(`First concern: ${summary.onset.hazard.reason} near ${pointName} at ${formatMountainHour(summary.onset.validTime)} (+${summary.onset.hour}h)`)
            );
        } else {
            const finalPeriod = summary.periods.at(-1);
            onset.append(
                onsetIcon,
                document.createTextNode(`No modeled weather hazards through ${formatMountainHour(finalPeriod?.validTime)}`)
            );
        }

        header.append(title, onset);

        const periodGrid = createElement('div', 'hrrr-period-grid');
        periodGrid.setAttribute('role', 'list');
        periodGrid.setAttribute('aria-label', `${summary.routeName} forecast periods`);
        summary.periods.forEach(period => periodGrid.append(this.createPeriodCard(period)));

        container.replaceChildren(header, periodGrid);
    }

    createPeriodCard(period) {
        const card = createElement('article', `hrrr-period-card is-${period.hazard.level}`);
        card.setAttribute('role', 'listitem');

        const timeRow = createElement('div', 'hrrr-period-time');
        const relativeTime = createElement('strong', '', `+${period.hour}h`);
        const validTime = createElement('time', '', formatMountainHour(period.validTime));
        validTime.dateTime = period.validTime || '';
        timeRow.append(relativeTime, validTime);

        const hazard = createElement('div', `hrrr-period-hazard is-${period.hazard.level}`);
        const icon = createElement('i', hazardIconClass(period.hazard.level));
        icon.setAttribute('aria-hidden', 'true');
        hazard.append(icon, document.createTextNode(period.hazard.label));

        const reason = createElement('p', 'hrrr-period-reason', period.hazard.reason);
        if (period.hazard.severity > 0 && period.worstPoint?.name) {
            reason.append(document.createTextNode(` · ${period.worstPoint.name}`));
        }

        const metrics = createElement('dl', 'hrrr-period-metrics');
        const metricValues = [
            ['Low', formatTemperatureFromCelsius(period.metrics?.minTemperature)],
            ['Gust', formatWindFromMetersPerSecond(period.metrics?.maxWindGust)],
            ['Vis', formatVisibilityFromKm(period.metrics?.minVisibility)],
            ['Precip', precipitationSummary(period.metrics || {})]
        ];

        metricValues.forEach(([label, value]) => {
            const metric = createElement('div', 'hrrr-period-metric');
            metric.append(createElement('dt', '', label), createElement('dd', '', value));
            metrics.append(metric);
        });

        card.append(timeRow, hazard, reason, metrics);
        return card;
    }

    renderRouteUnavailable(message) {
        document.querySelectorAll('[data-hrrr-route]').forEach(container => {
            this.renderSingleRouteUnavailable(container, message);
        });
    }

    renderSingleRouteUnavailable(container, message) {
        container.dataset.state = 'unavailable';
        const unavailable = createElement('p', 'hrrr-route-unavailable');
        const icon = createElement('i', 'fas fa-cloud-slash');
        icon.setAttribute('aria-hidden', 'true');
        unavailable.append(icon, document.createTextNode(message));
        container.replaceChildren(unavailable);
    }

    destroy() {
        document.getElementById('units-toggle')?.removeEventListener('click', this.handleUnitsToggle);
        if (this.refreshTimer !== null) {
            window.clearInterval(this.refreshTimer);
            this.refreshTimer = null;
        }
    }
}

function bootHRRRRoadForecast() {
    if (!document.getElementById('hrrr-guidance-panel')) return;
    const controller = new HRRRRoadForecastController();
    window.hrrrRoadForecastController = controller;
    controller.init();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootHRRRRoadForecast, { once: true });
} else {
    bootHRRRRoadForecast();
}
