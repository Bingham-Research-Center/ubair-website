import {
    buildForecastMapData,
    buildRouteForecastSummary,
    getForecastFreshness,
    normalizeHRRRForecastResponse,
    selectForecastDisplayIndices
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

function pointPrecipitationSummary(forecast) {
    const amount = Number.isFinite(forecast.precip_1hr) ? forecast.precip_1hr : null;
    const type = String(forecast.precip_type || 'none').toLowerCase();
    if ((amount === null || amount <= 0) && type === 'none') return 'Dry';
    return `${titleCase(type)} · ${formatPrecipitationFromMm(amount)}`;
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
        this.mapControls = document.getElementById('hrrr-map-controls');
        this.mapStatus = document.getElementById('hrrr-map-status');
        this.mapHourControl = document.getElementById('hrrr-map-hour-control');
        this.mapHours = document.getElementById('hrrr-map-hours');
        this.mapLegend = document.getElementById('hrrr-map-legend');
        this.mapModeButtons = [...document.querySelectorAll('[data-hrrr-map-mode]')];
        this.forecastModeButton = document.querySelector('[data-hrrr-map-mode="forecast"]');
        this.mapMode = 'observed';
        this.selectedForecastIndex = 0;
        this.forecastLayerGroup = null;

        this.handleUnitsToggle = () => {
            this.renderRouteForecasts();
            if (this.mapMode === 'forecast') this.renderForecastMapLayer();
        };
        this.handleMapModeClick = event => this.setMapMode(event.currentTarget.dataset.hrrrMapMode);
        this.handleForecastHourClick = event => {
            const button = event.target.closest('[data-hrrr-forecast-index]');
            if (!button || button.disabled) return;
            this.setForecastIndex(Number(button.dataset.hrrrForecastIndex));
        };
        this.handleMapLayersRendered = () => {
            if (this.mapMode === 'forecast') this.applyMapMode();
        };
    }

    async init() {
        if (!this.panel || !this.statusElement || !this.metaElement) return;

        this.mapModeButtons.forEach(button => button.addEventListener('click', this.handleMapModeClick));
        this.mapHours?.addEventListener('click', this.handleForecastHourClick);
        window.addEventListener('roads-map:layers-rendered', this.handleMapLayersRendered);
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
        this.renderMapHourButtons();
        if (this.mapMode === 'forecast') this.applyMapMode();
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

        if (!retainingPreviousRun) {
            this.renderRouteUnavailable(message);
            this.renderMapUnavailable();
        }
    }

    renderMapHourButtons() {
        if (!this.forecast || !this.mapHours) return;

        const selections = selectForecastDisplayIndices(this.forecast.forecast_hours);
        if (!selections.some(selection => selection.index === this.selectedForecastIndex)) {
            this.selectedForecastIndex = selections[0]?.index ?? 0;
        }

        const buttons = selections.map(selection => {
            const button = createElement('button', '', `+${selection.hour}h`);
            button.type = 'button';
            button.dataset.hrrrForecastIndex = String(selection.index);
            button.setAttribute('aria-label', `Show HRRR forecast for ${formatMountainHour(this.forecast.valid_times[selection.index])}, plus ${selection.hour} hours`);
            const time = createElement('small', '', formatMountainHour(this.forecast.valid_times[selection.index]));
            button.append(time);
            return button;
        });

        this.mapHours.replaceChildren(...buttons);
        if (this.forecastModeButton) this.forecastModeButton.disabled = false;
        this.updateMapControlState();
    }

    renderMapUnavailable() {
        if (this.forecastModeButton) this.forecastModeButton.disabled = true;
        if (this.mapHours) this.mapHours.textContent = 'Forecast unavailable';
        this.setMapMode('observed');
    }

    setMapMode(mode) {
        if (mode === 'forecast' && (!this.forecast || this.forecastModeButton?.disabled)) return;
        this.mapMode = mode === 'forecast' ? 'forecast' : 'observed';
        this.updateMapControlState();
        this.applyMapMode();
    }

    setForecastIndex(index) {
        if (!Number.isInteger(index) || !this.forecast?.forecast_hours?.[index]) return;
        this.selectedForecastIndex = index;
        this.updateMapControlState();
        if (this.mapMode === 'forecast') this.renderForecastMapLayer();
    }

    updateMapControlState() {
        this.mapModeButtons.forEach(button => {
            const isActive = button.dataset.hrrrMapMode === this.mapMode;
            button.classList.toggle('is-active', isActive);
            button.setAttribute('aria-pressed', String(isActive));
        });

        const forecastActive = this.mapMode === 'forecast';
        if (this.mapHourControl) this.mapHourControl.setAttribute('aria-disabled', String(!forecastActive));
        this.mapHours?.querySelectorAll('button').forEach(button => {
            const isSelected = Number(button.dataset.hrrrForecastIndex) === this.selectedForecastIndex;
            button.disabled = !forecastActive;
            button.classList.toggle('is-active', isSelected);
            button.setAttribute('aria-pressed', String(isSelected));
        });
        if (this.mapLegend) this.mapLegend.hidden = !forecastActive;
    }

    applyMapMode() {
        if (this.mapMode === 'forecast') {
            this.setCurrentMapChromeVisible(false);
            this.hideCurrentRoadLayers();
            this.renderForecastMapLayer();
            return;
        }

        this.clearForecastMapLayer();
        this.showCurrentRoadLayers();
        this.setCurrentMapChromeVisible(true);
        if (this.mapStatus) {
            this.mapStatus.textContent = 'Map showing the current UDOT, station, camera, and model blend.';
        }
    }

    hideCurrentRoadLayers() {
        const roadWeatherMap = window.roadWeatherMap;
        if (!roadWeatherMap?.map || !roadWeatherMap.roadLayers) return;
        roadWeatherMap.roadLayers.forEach(layer => {
            if (roadWeatherMap.map.hasLayer(layer)) roadWeatherMap.map.removeLayer(layer);
        });
    }

    setCurrentMapChromeVisible(visible) {
        [
            document.querySelector('.conditions-overlay'),
            document.querySelector('.road-legend-collapsible')
        ].filter(Boolean).forEach(element => {
            element.hidden = !visible;
            element.setAttribute('aria-hidden', String(!visible));
        });
    }

    showCurrentRoadLayers() {
        const roadWeatherMap = window.roadWeatherMap;
        if (!roadWeatherMap?.map || !roadWeatherMap.roadLayers) return;
        roadWeatherMap.roadLayers.forEach(layer => {
            if (!roadWeatherMap.map.hasLayer(layer)) layer.addTo(roadWeatherMap.map);
        });
    }

    renderForecastMapLayer() {
        const roadWeatherMap = window.roadWeatherMap;
        if (!this.forecast || !roadWeatherMap?.map || !window.L) return;

        this.clearForecastMapLayer();
        this.hideCurrentRoadLayers();

        const mapData = buildForecastMapData(this.forecast, this.selectedForecastIndex);
        const layerGroup = window.L.layerGroup();

        mapData.routes.forEach(route => {
            route.segments.forEach(segment => {
                const line = window.L.polyline(
                    [[segment.start.lat, segment.start.lon], [segment.end.lat, segment.end.lon]],
                    {
                        color: segment.hazard.color,
                        weight: 7,
                        opacity: 0.9,
                        dashArray: '12, 7',
                        lineCap: 'round'
                    }
                );
                line.bindPopup(
                    this.createForecastPopup(route.routeName, segment.worstPointName, segment.forecast, segment.hazard, mapData),
                    { maxWidth: 300, autoPanPaddingTopLeft: [300, 130], autoPanPaddingBottomRight: [40, 80] }
                );
                line.addTo(layerGroup);
            });

            route.points.forEach(point => {
                const marker = window.L.circleMarker([point.lat, point.lon], {
                    radius: 5,
                    color: '#ffffff',
                    weight: 2,
                    fillColor: point.hazard.color,
                    fillOpacity: 1
                });
                marker.bindPopup(
                    this.createForecastPopup(route.routeName, point.name, point.forecast, point.hazard, mapData),
                    { maxWidth: 300, autoPanPaddingTopLeft: [300, 130], autoPanPaddingBottomRight: [40, 80] }
                );
                marker.addTo(layerGroup);
            });
        });

        layerGroup.addTo(roadWeatherMap.map);
        this.forecastLayerGroup = layerGroup;

        if (this.mapStatus) {
            this.mapStatus.textContent = `Map showing HRRR +${mapData.hour}h guidance for ${formatMountainTime(mapData.validTime)}. Dashed lines connect forecast waypoints and are not exact road geometry.`;
        }
    }

    createForecastPopup(routeName, pointName, forecast, hazard, mapData) {
        const popup = createElement('div', 'hrrr-map-popup');
        popup.append(
            createElement('span', 'hrrr-map-popup-kicker', `HRRR +${mapData.hour}h guidance`),
            createElement('h4', '', routeName),
            createElement('p', 'hrrr-map-popup-location', pointName),
            createElement('p', `hrrr-map-popup-hazard is-${hazard.level}`, `${hazard.label}: ${hazard.reason}`)
        );

        const metrics = createElement('dl', 'hrrr-map-popup-metrics');
        [
            ['Valid', formatMountainTime(mapData.validTime)],
            ['Temperature', formatTemperatureFromCelsius(forecast.temp_2m)],
            ['Wind gust', formatWindFromMetersPerSecond(forecast.wind_gust)],
            ['Visibility', formatVisibilityFromKm(forecast.visibility)],
            ['Precipitation', pointPrecipitationSummary(forecast)]
        ].forEach(([label, value]) => {
            const row = createElement('div', '');
            row.append(createElement('dt', '', label), createElement('dd', '', value));
            metrics.append(row);
        });

        popup.append(metrics, createElement('p', 'hrrr-map-popup-note', 'Atmospheric model guidance—not an observed pavement condition.'));
        return popup;
    }

    clearForecastMapLayer() {
        const map = window.roadWeatherMap?.map;
        if (map && this.forecastLayerGroup && map.hasLayer(this.forecastLayerGroup)) {
            map.removeLayer(this.forecastLayerGroup);
        }
        this.forecastLayerGroup = null;
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
        periodGrid.tabIndex = 0;
        periodGrid.setAttribute('aria-label', `${summary.routeName} forecast periods. Scroll horizontally for later hours on smaller screens.`);
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
        this.clearForecastMapLayer();
        this.showCurrentRoadLayers();
        this.setCurrentMapChromeVisible(true);
        document.getElementById('units-toggle')?.removeEventListener('click', this.handleUnitsToggle);
        this.mapModeButtons.forEach(button => button.removeEventListener('click', this.handleMapModeClick));
        this.mapHours?.removeEventListener('click', this.handleForecastHourClick);
        window.removeEventListener('roads-map:layers-rendered', this.handleMapLayersRendered);
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
