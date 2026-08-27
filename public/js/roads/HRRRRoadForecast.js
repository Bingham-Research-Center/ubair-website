import {
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

function formatMountainTime(value) {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? mountainTimeFormatter.format(date) : 'time unavailable';
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
    }

    async init() {
        if (!this.panel || !this.statusElement || !this.metaElement) return;

        await this.load();
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
    }

    destroy() {
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
