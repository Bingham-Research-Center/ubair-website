/**
 * Utility Functions for Road Weather Map
 * Pure utility functions with no dependencies
 * Extracted from roads.js as part of refactoring
 */

/**
 * Escape user-controlled text before inserting into HTML templates
 * @param {*} value - Any value to escape
 * @returns {string} HTML-escaped string
 */
function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Restrict dynamic class token values
 * @param {*} value - Candidate token value
 * @param {string} fallback - Fallback token when value is invalid
 * @returns {string} Sanitized class token
 */
function sanitizeClassToken(value, fallback = 'unknown') {
    const token = String(value ?? '').toLowerCase().replace(/[^a-z0-9_-]/g, '');
    return token || fallback;
}

/**
 * Restrict dynamic identifier values used in inline handlers
 * @param {*} value - Candidate identifier value
 * @param {string} fallback - Fallback when value is invalid
 * @returns {string} Sanitized identifier
 */
function sanitizeIdentifier(value, fallback = '') {
    const identifier = String(value ?? '').replace(/[^A-Za-z0-9_-]/g, '');
    return identifier || fallback;
}

/**
 * Restrict dynamic URLs to http/https
 * @param {*} value - Candidate URL
 * @param {string} fallback - Fallback URL when value is invalid
 * @returns {string} Sanitized absolute URL or fallback
 */
function sanitizeHttpUrl(value, fallback = '') {
    if (typeof value !== 'string' || value.trim() === '') return fallback;
    try {
        const url = new URL(value, window.location.origin);
        if (url.protocol === 'http:' || url.protocol === 'https:') {
            return url.href;
        }
    } catch (error) {
        // Ignore invalid URLs and return fallback
    }
    return fallback;
}

/**
 * Calculate distance between two lat/lng coordinates using Haversine formula
 * @param {number} lat1 - First point latitude
 * @param {number} lng1 - First point longitude
 * @param {number} lat2 - Second point latitude
 * @param {number} lng2 - Second point longitude
 * @returns {number} Distance in miles
 */
function calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 3959; // Earth's radius in miles
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

/**
 * Display route conditions in a container
 * @param {HTMLElement} container - Container element to render into
 * @param {Object} data - Route data object
 */
function displayRouteConditions(container, data) {
    const { routeName, stations, events, cities } = data;
    const safeRouteName = escapeHtml(routeName);

    // Calculate metrics
    const avgTemp = stations.length > 0 ?
        Math.round(stations.reduce((sum, s) => sum + (parseFloat(s.airTemperature) || 0), 0) / stations.length) : '--';

    const surfaceCondition = determineSurfaceCondition(stations);
    const incidentCount = events.length;
    const travelStatus = determineTravelStatus(stations, events);

    const html = `
        <div class="route-summary">
            <div class="route-metric temperature">
                <div class="metric-icon">🌡️</div>
                <div class="metric-value">${avgTemp !== '--' ? unitsSystem.formatTemperature(avgTemp) : `--${unitsSystem.getTempUnit()}`}</div>
                <div class="metric-label">Air Temperature</div>
                <div class="metric-status ${getTemperatureStatus(avgTemp)}">${getTemperatureStatusText(avgTemp)}</div>
            </div>

            <div class="route-metric surface">
                <div class="metric-icon">🛣️</div>
                <div class="metric-value">${surfaceCondition.text}</div>
                <div class="metric-label">Surface Condition</div>
                <div class="metric-status ${surfaceCondition.status}">${surfaceCondition.statusText}</div>
            </div>

            <div class="route-metric incidents">
                <div class="metric-icon">🚧</div>
                <div class="metric-value">${incidentCount}</div>
                <div class="metric-label">Active Incidents</div>
                <div class="metric-status ${incidentCount === 0 ? 'good' : 'caution'}">${incidentCount === 0 ? 'Clear' : 'Active'}</div>
            </div>

            <div class="route-metric travel-time">
                <div class="metric-icon">⏱️</div>
                <div class="metric-value">${travelStatus.text}</div>
                <div class="metric-label">Travel Status</div>
                <div class="metric-status ${travelStatus.status}">${travelStatus.statusText}</div>
            </div>
        </div>

        ${events.length > 0 ? `
            <div class="route-incidents">
                <h4><i class="fas fa-exclamation-triangle"></i> Current Incidents on ${safeRouteName}</h4>
                ${events.slice(0, 3).map(event => `
                    <div class="incident-item ${event.eventType === 'construction' ? 'construction' : ''}">
                        <strong>${escapeHtml(event.eventType?.toUpperCase() || 'INCIDENT')}:</strong> ${escapeHtml(event.description || event.message || 'No details available')}
                        ${event.location ? `<br><small>📍 ${escapeHtml(event.location)}</small>` : ''}
                    </div>
                `).join('')}
                ${events.length > 3 ? `<small>... and ${events.length - 3} more incidents</small>` : ''}
            </div>
        ` : `
            <div class="route-incidents">
                <div class="no-incidents">✅ No current incidents reported on ${safeRouteName}</div>
            </div>
        `}
    `;

    container.innerHTML = html;
}

/**
 * Determine surface condition based on station temperatures
 * @param {Array} stations - Array of weather station data
 * @returns {Object} Surface condition with text, status, and statusText
 */
function determineSurfaceCondition(stations) {
    if (!stations.length) return { text: 'Unknown', status: 'caution', statusText: 'No Data' };

    const surfaceTemps = stations
        .map(s => parseFloat(s.surfaceTemp))
        .filter(temp => !isNaN(temp));

    if (!surfaceTemps.length) return { text: 'Unknown', status: 'caution', statusText: 'No Data' };

    const avgSurfaceTemp = surfaceTemps.reduce((sum, temp) => sum + temp, 0) / surfaceTemps.length;

    if (avgSurfaceTemp <= 32) {
        return { text: 'Icy', status: 'poor', statusText: 'Hazardous' };
    } else if (avgSurfaceTemp <= 40) {
        return { text: 'Cold', status: 'caution', statusText: 'Caution' };
    } else {
        return { text: 'Clear', status: 'good', statusText: 'Normal' };
    }
}

/**
 * Determine travel status based on conditions and events
 * @param {Array} stations - Array of weather station data
 * @param {Array} events - Array of traffic events
 * @returns {Object} Travel status with text, status, and statusText
 */
function determineTravelStatus(stations, events) {
    const hasIncidents = events.length > 0;
    const surfaceCondition = determineSurfaceCondition(stations);

    if (surfaceCondition.status === 'poor' || hasIncidents) {
        return { text: 'Caution', status: 'caution', statusText: 'Alert' };
    } else if (surfaceCondition.status === 'caution') {
        return { text: 'Monitor', status: 'caution', statusText: 'Watch' };
    } else {
        return { text: 'Normal', status: 'good', statusText: 'Clear' };
    }
}

/**
 * Get status class for temperature
 * @param {number|string} temp - Temperature value
 * @returns {string} Status class (good, caution, poor)
 */
function getTemperatureStatus(temp) {
    if (temp === '--') return 'caution';
    if (temp <= 32) return 'poor';
    if (temp <= 40) return 'caution';
    return 'good';
}

/**
 * Get human-readable temperature status text
 * @param {number|string} temp - Temperature value
 * @returns {string} Status text
 */
function getTemperatureStatusText(temp) {
    if (temp === '--') return 'No Data';
    if (temp <= 32) return 'Freezing';
    if (temp <= 40) return 'Cold';
    return 'Mild';
}

/**
 * Display error state in a container
 * @param {HTMLElement} container - Container element
 * @param {string} message - Error message to display
 */
function displayErrorState(container, message) {
    container.innerHTML = `
        <div class="conditions-loading">
            <i class="fas fa-exclamation-triangle"></i>
            <p>${escapeHtml(message)}</p>
        </div>
    `;
}
