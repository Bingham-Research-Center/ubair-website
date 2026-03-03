/**
 * Initialization Module
 * Handles page initialization, units toggle, and smart refresh functions
 * Coordinates initialization of all road weather components
 * Extracted from roads.js as part of refactoring
 */

// Global map instance
let roadWeatherMap = null;

/**
 * Main initialization when page loads
 */
document.addEventListener('DOMContentLoaded', function() {
    // Prevent duplicate initialization
    if (roadWeatherMap) {
        console.warn('Road weather map already initialized, skipping...');
        return;
    }

    const mapElement = document.getElementById('road-map');
    if (!mapElement) {
        console.error('Road map element not found');
        return;
    }

    // Initialize the road weather map
    roadWeatherMap = new RoadWeatherMap('road-map', {
        center: [40.3033, -109.7],
        zoom: 10
        // No refreshInterval needed - server handles background refresh
    });

    // Make globally accessible for state management
    window.roadWeatherMap = roadWeatherMap;

    roadWeatherMap.init();

    // Set up state management after map initialization with a small delay
    setTimeout(() => {
        if (roadWeatherMap.map) {
            // Initialize auto-save functionality
            window.mapStateManager.initAutoSave(roadWeatherMap.map);

            // Restore state if coming back from webcam viewer
            if (window.mapStateManager.shouldRestoreState()) {
                console.log('Restoring map state from previous session');
                window.mapStateManager.restoreMapState(roadWeatherMap.map);
            }
        }
    }, 100);

    // Update the condition cards with real data
    updateConditionCards();

    // Initialize the traffic events manager
    try {
        trafficEventsManager = new TrafficEventsManager();
    } catch (error) {
        console.error('Error initializing traffic events manager:', error);
    }

    // Initialize route conditions
    loadRouteConditions();

    // Initialize units toggle
    initializeUnitsToggle();

    // Initialize experimental road AI toggle
    initializeExperimentalRoadToggle();
});

/**
 * Initialize the units toggle button
 * Sets up event listener for Imperial/Metric switching
 */
function initializeUnitsToggle() {
    const unitsToggle = document.getElementById('units-toggle');
    const unitsLabel = document.getElementById('units-label');

    if (!unitsToggle || !unitsLabel) return;

    // Set initial label
    unitsLabel.textContent = unitsSystem.getSystemName();

    // Add click handler
    unitsToggle.addEventListener('click', function() {
        // Toggle the units system
        const isMetric = unitsSystem.toggle();

        // Update button label
        unitsLabel.textContent = unitsSystem.getSystemName();

        // Refresh all displays that use units
        refreshUnitsDisplays();
    });
}

/**
 * Refresh all unit displays when units are toggled
 * Updates condition cards, routes, and map components
 */
function refreshUnitsDisplays() {
    // Refresh condition cards on the map
    updateConditionCards();

    // Update default unit labels in HTML when showing placeholders
    const windCard = document.querySelector('.condition-card-compact.wind .value');
    if (windCard && windCard.textContent.includes('--')) {
        windCard.textContent = `-- ${unitsSystem.getWindUnit()}`;
    }

    const visCard = document.querySelector('.condition-card-compact.visibility .value');
    if (visCard && visCard.textContent.includes('--')) {
        visCard.textContent = `-- ${unitsSystem.getVisibilityUnit()}`;
    }

    // Smart refresh that uses cached data instead of reloading everything
    smartRefreshRoutes();
}

/**
 * Smart refresh that uses cached data instead of reloading everything
 * Prevents unnecessary API calls when toggling units
 */
async function smartRefreshRoutes() {
    // Close any open popups to avoid stale unit displays
    if (window.roadWeatherMap && window.roadWeatherMap.map) {
        window.roadWeatherMap.map.closePopup();
    }

    // Get cached data (or refresh if needed)
    const data = await routeDataCache.getData();
    if (!data || !Array.isArray(data.stations) || !data.events) {
        console.error('Failed to get route data for units refresh');
        return;
    }

    // Refresh each route section with cached data and new units
    await Promise.all([
        smartRefreshUS40(data),
        smartRefreshUS191(data),
        smartRefreshBasinRoads(data)
    ]);

    // Refresh map components that show units (but reuse existing markers)
    if (window.roadWeatherMap) {
        // Only refresh station popups, not reload all data
        refreshStationPopups();

        // Reload mountain passes with new units (these come from different API)
        window.roadWeatherMap.loadMountainPasses();
    }
}

/**
 * Smart refresh US-40 corridor with cached data
 */
async function smartRefreshUS40(data) {
    const container = document.getElementById('us40-conditions');
    if (!container) return;

    try {
        const eventsData = data.events || {};

        // Filter data for US-40 corridor (match original filtering logic)
        const us40Stations = data.stations.filter(station =>
            station.name.toLowerCase().includes('roosevelt') ||
            station.name.toLowerCase().includes('vernal') ||
            (station.lat >= 40.2 && station.lat <= 40.5 &&
             station.lng >= -110.2 && station.lng <= -109.3)
        );

        const us40Events = eventsData.events ? eventsData.events.filter(event =>
            event.roadwayName && (
                event.roadwayName.includes('US-40') ||
                event.roadwayName.includes('US 40')
            )
        ) : [];

        // Use existing displayRouteConditions function
        displayRouteConditions(container, {
            routeName: 'US-40',
            stations: us40Stations,
            events: us40Events
        });

    } catch (error) {
        console.error('Error refreshing US-40 conditions:', error);
        container.innerHTML = `
            <div class="conditions-loading">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Failed to refresh US-40 conditions</p>
            </div>
        `;
    }
}

/**
 * Smart refresh US-191 corridor with cached data
 */
async function smartRefreshUS191(data) {
    const container = document.getElementById('us191-conditions');
    if (!container) return;

    try {
        const eventsData = data.events || {};

        // Filter data for US-191 corridor (match original filtering logic)
        const us191Stations = data.stations.filter(station =>
            station.name.toLowerCase().includes('duchesne') ||
            (station.lat >= 40.0 && station.lat <= 40.6 &&
             station.lng >= -110.8 && station.lng <= -110.0)
        );

        const us191Events = eventsData.events ? eventsData.events.filter(event =>
            event.roadwayName && (
                event.roadwayName.includes('US-191') ||
                event.roadwayName.includes('US 191')
            )
        ) : [];

        // Use existing displayRouteConditions function
        displayRouteConditions(container, {
            routeName: 'US-191',
            stations: us191Stations,
            events: us191Events
        });

    } catch (error) {
        console.error('Error refreshing US-191 conditions:', error);
        container.innerHTML = `
            <div class="conditions-loading">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Failed to refresh US-191 conditions</p>
            </div>
        `;
    }
}

/**
 * Smart refresh Basin Roads with cached data
 */
async function smartRefreshBasinRoads(data) {
    const container = document.getElementById('basin-roads-conditions');
    if (!container) return;

    try {
        // Basin roads gets all stations/events, filtering happens in carousel logic
        const basinStations = data.stations;
        const basinEvents = data.events.events || [];

        // Basin roads uses a carousel, so reinitialize it
        initializeRoadCarousel(basinStations, basinEvents);

    } catch (error) {
        console.error('Error refreshing Basin Roads conditions:', error);
        container.innerHTML = `
            <div class="conditions-loading">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Failed to refresh Basin Roads conditions</p>
            </div>
        `;
    }
}

/**
 * Refresh station popups when units change
 * Closes any open popups to prevent displaying stale unit data
 */
function refreshStationPopups() {
    // Refresh any open weather station popups with new units
    if (window.roadWeatherMap && window.roadWeatherMap.stationMarkers) {
        window.roadWeatherMap.stationMarkers.forEach((marker, stationId) => {
            if (marker.isPopupOpen()) {
                marker.closePopup();
            }
        });
    }
}

const EXPERIMENTAL_ROAD_MODE_KEY = 'roadsExperimentalMode';

/**
 * Initialize the experimental road AI toggle
 * Enables per-view camera breakdown in camera popups
 */
function initializeExperimentalRoadToggle() {
    const experimentalToggle = document.getElementById('experimental-road-toggle');
    const experimentalStatus = document.getElementById('experimental-road-status');

    if (!experimentalToggle) return;

    const isEnabled = localStorage.getItem(EXPERIMENTAL_ROAD_MODE_KEY) === 'true';
    experimentalToggle.checked = isEnabled;

    if (experimentalStatus) {
        experimentalStatus.textContent = isEnabled ? 'Enabled' : 'Disabled';
    }

    if (window.roadWeatherMap) {
        window.roadWeatherMap.experimentalRoadMode = isEnabled;
    }

    experimentalToggle.addEventListener('change', function() {
        const enabled = this.checked;
        localStorage.setItem(EXPERIMENTAL_ROAD_MODE_KEY, enabled ? 'true' : 'false');

        if (experimentalStatus) {
            experimentalStatus.textContent = enabled ? 'Enabled' : 'Disabled';
        }

        if (window.roadWeatherMap) {
            window.roadWeatherMap.experimentalRoadMode = enabled;
            window.roadWeatherMap.loadRoadWeatherData();
        }
    });
}
