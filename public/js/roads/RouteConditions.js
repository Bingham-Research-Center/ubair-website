/**
 * Route Conditions Module
 * Handles loading and displaying conditions for US-40, US-191, and Basin Roads
 * Includes carousel functionality for secondary roads
 * Extracted from roads.js as part of refactoring
 */

/**
 * Load all route conditions in parallel
 */
async function loadRouteConditions() {
    await Promise.all([
        loadUS40Conditions(),
        loadUS191Conditions(),
        loadBasinRoadsConditions()
    ]);
}

/**
 * Load and display US-40 corridor conditions
 */
async function loadUS40Conditions() {
    const container = document.getElementById('us40-conditions');
    if (!container) return;

    try {
        // Get weather stations and traffic events for US-40
        const [stationsResponse, eventsResponse] = await Promise.all([
            fetch('/api/road-weather/stations'),
            fetch('/api/traffic-events')
        ]);

        const stationsData = await stationsResponse.json();
        const eventsData = await eventsResponse.json();

        // Populate cache for future units toggles
        routeDataCache.stations = stationsData;
        routeDataCache.events = eventsData;
        routeDataCache.lastUpdated = Date.now();

        // Filter data for US-40 corridor
        const us40Stations = stationsData.filter(station =>
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

        displayRouteConditions(container, {
            routeName: 'US-40',
            stations: us40Stations,
            events: us40Events,
            cities: ['Roosevelt', 'Vernal']
        });

    } catch (error) {
        console.error('Error loading US-40 conditions:', error);
        displayErrorState(container, 'Failed to load US-40 conditions');
    }
}

/**
 * Load and display US-191 corridor conditions
 */
async function loadUS191Conditions() {
    const container = document.getElementById('us191-conditions');
    if (!container) return;

    try {
        // Get weather stations and traffic events for US-191
        const [stationsResponse, eventsResponse] = await Promise.all([
            fetch('/api/road-weather/stations'),
            fetch('/api/traffic-events')
        ]);

        const stationsData = await stationsResponse.json();
        const eventsData = await eventsResponse.json();

        // Populate cache for future units toggles (if not already populated)
        if (!routeDataCache.stations) {
            routeDataCache.stations = stationsData;
            routeDataCache.events = eventsData;
            routeDataCache.lastUpdated = Date.now();
        }

        // Filter data for US-191 corridor
        const us191Stations = stationsData.filter(station =>
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

        displayRouteConditions(container, {
            routeName: 'US-191',
            stations: us191Stations,
            events: us191Events,
            cities: ['Vernal', 'Duchesne']
        });

    } catch (error) {
        console.error('Error loading US-191 conditions:', error);
        displayErrorState(container, 'Failed to load US-191 conditions');
    }
}

/**
 * Basin Roads Carousel Data
 */
const basinRoads = [
    {
        name: 'SR-87 (Duchesne-Price)',
        shortName: 'SR-87',
        description: 'Connects Duchesne to Price via Nine Mile Canyon',
        keywords: ['sr-87', 'state route 87', 'nine mile', 'duchesne', 'price'],
        coordinates: { lat: 40.1, lng: -110.4 },
        icon: '🏔️'
    },
    {
        name: 'SR-121 (Randlett-Neola)',
        shortName: 'SR-121',
        description: 'Local connector through Randlett and Neola areas',
        keywords: ['sr-121', 'state route 121', 'randlett', 'neola'],
        coordinates: { lat: 40.2, lng: -109.8 },
        icon: '🛤️'
    },
    {
        name: 'US-45 (Dinosaur Access)',
        shortName: 'US-45',
        description: 'Access route to Dinosaur National Monument',
        keywords: ['us-45', 'dinosaur', 'monument'],
        coordinates: { lat: 40.4, lng: -109.0 },
        icon: '🦕'
    },
    {
        name: 'Naples-Jensen Road',
        shortName: 'Naples Rd',
        description: 'Local route connecting Naples to Jensen area',
        keywords: ['naples', 'jensen', 'local'],
        coordinates: { lat: 40.4, lng: -109.4 },
        icon: '🏘️'
    },
    {
        name: 'Red Canyon Road',
        shortName: 'Red Canyon',
        description: 'Scenic route through Red Canyon area',
        keywords: ['red canyon', 'scenic', 'local'],
        coordinates: { lat: 40.3, lng: -109.6 },
        icon: '🏞️'
    },
    {
        name: 'Strawberry Reservoir Access',
        shortName: 'Strawberry',
        description: 'Mountain access to Strawberry Reservoir',
        keywords: ['strawberry', 'reservoir', 'mountain'],
        coordinates: { lat: 40.2, lng: -111.0 },
        icon: '🎣'
    }
];

let currentRoadIndex = 0;
let autoRotateTimer = null;

/**
 * Load and display Basin Roads carousel conditions
 */
async function loadBasinRoadsConditions() {
    const container = document.getElementById('basin-roads-conditions');
    if (!container) return;

    try {
        // Get weather stations and traffic events for Basin Roads
        const [stationsResponse, eventsResponse] = await Promise.all([
            fetch('/api/road-weather/stations'),
            fetch('/api/traffic-events')
        ]);

        const stationsData = await stationsResponse.json();
        const eventsData = await eventsResponse.json();

        // Populate cache for future units toggles (if not already populated)
        if (!routeDataCache.stations) {
            routeDataCache.stations = stationsData;
            routeDataCache.events = eventsData;
            routeDataCache.lastUpdated = Date.now();
        }

        // Initialize carousel
        initializeRoadCarousel(stationsData, eventsData.events || []);

    } catch (error) {
        console.error('Error loading basin roads conditions:', error);
        displayErrorState(container, 'Failed to load secondary road conditions');
    }
}

/**
 * Initialize the roads carousel with controls and indicators
 */
function initializeRoadCarousel(stationsData, eventsData) {
    // Remove loading state
    const container = document.getElementById('basin-roads-conditions');
    container.innerHTML = '';

    // Setup carousel indicators
    const indicatorsContainer = document.getElementById('carousel-indicators');
    indicatorsContainer.innerHTML = basinRoads.map((_, index) =>
        `<div class="carousel-indicator ${index === 0 ? 'active' : ''}" data-index="${index}"></div>`
    ).join('');

    // Add event listeners for manual controls (replace any existing handlers)
    const prevButton = document.getElementById('prev-road');
    const nextButton = document.getElementById('next-road');

    if (prevButton) {
        prevButton.onclick = () => {
            previousRoad(stationsData, eventsData);
        };
    }

    if (nextButton) {
        nextButton.onclick = () => {
            nextRoad(stationsData, eventsData);
        };
    }

    // Add indicator click handlers (replace any existing handler)
    indicatorsContainer.onclick = (e) => {
        if (e.target.classList.contains('carousel-indicator')) {
            const index = parseInt(e.target.dataset.index);
            showRoad(index, stationsData, eventsData);
        }
    };

    // Show first road and start auto-rotation
    showRoad(0, stationsData, eventsData);
    startAutoRotation(stationsData, eventsData);
}

/**
 * Show a specific road in the carousel
 */
function showRoad(index, stationsData, eventsData) {
    if (index < 0 || index >= basinRoads.length) return;

    currentRoadIndex = index;
    const road = basinRoads[index];

    // Update header
    document.getElementById('current-road-name').textContent = road.shortName;
    document.getElementById('road-description').textContent = road.description;

    // Update indicators
    document.querySelectorAll('.carousel-indicator').forEach((indicator, i) => {
        indicator.classList.toggle('active', i === index);
    });

    // Filter stations and events for this road
    const roadStations = filterStationsForRoad(stationsData, road);
    const roadEvents = filterEventsForRoad(eventsData, road);

    // Display conditions with slide animation
    const container = document.getElementById('basin-roads-conditions');
    displayRoadSlide(container, road, roadStations, roadEvents);
}

/**
 * Filter weather stations relevant to a specific road
 */
function filterStationsForRoad(stations, road) {
    // Get nearby stations based on coordinates and keywords
    return stations.filter(station => {
        const stationName = station.name.toLowerCase();
        const distance = calculateDistance(
            station.lat, station.lng,
            road.coordinates.lat, road.coordinates.lng
        );

        // Include if within 25 miles OR name matches road keywords
        return distance < 25 || road.keywords.some(keyword =>
            stationName.includes(keyword.toLowerCase())
        );
    });
}

/**
 * Filter traffic events relevant to a specific road
 */
function filterEventsForRoad(events, road) {
    return events.filter(event => {
        if (!event.roadwayName) return false;
        const roadwayName = event.roadwayName.toLowerCase();

        return road.keywords.some(keyword =>
            roadwayName.includes(keyword.toLowerCase())
        ) || roadwayName.includes(road.shortName.toLowerCase());
    });
}

/**
 * Display a road slide with animation
 */
function displayRoadSlide(container, road, stations, events) {
    // Create slide content
    const slideContent = createRoadSlideContent(road, stations, events);

    // Animate transition
    container.style.minHeight = container.offsetHeight + 'px';

    const currentSlide = container.querySelector('.road-slide.active');
    if (currentSlide) {
        currentSlide.classList.add('exiting');
        setTimeout(() => {
            currentSlide.remove();
            container.style.minHeight = '';
        }, 300);
    }

    const newSlide = document.createElement('div');
    newSlide.className = 'road-slide';
    newSlide.innerHTML = slideContent;
    container.appendChild(newSlide);

    // Trigger animation
    setTimeout(() => {
        newSlide.classList.add('active');
    }, 50);
}

/**
 * Create HTML content for a road slide
 */
function createRoadSlideContent(road, stations, events) {
    // Calculate metrics like the other route conditions
    const avgTemp = stations.length > 0 ?
        Math.round(stations.reduce((sum, s) => sum + (parseFloat(s.airTemperature) || 0), 0) / stations.length) : '--';

    const surfaceCondition = determineSurfaceCondition(stations);
    const incidentCount = events.length;
    const travelStatus = determineTravelStatus(stations, events);

    return `
        <div class="route-summary">
            <div class="route-metric temperature">
                <div class="metric-icon">🌡️</div>
                <div class="metric-value">${avgTemp !== '--' ? unitsSystem.formatTemperature(avgTemp) : `--${unitsSystem.getTempUnit()}`}</div>
                <div class="metric-label">Air Temperature</div>
                <div class="metric-status ${getTemperatureStatus(avgTemp)}">${getTemperatureStatusText(avgTemp)}</div>
            </div>

            <div class="route-metric surface">
                <div class="metric-icon">${road.icon}</div>
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
                <div class="metric-value">${stations.length}</div>
                <div class="metric-label">Nearby Stations</div>
                <div class="metric-status ${stations.length > 0 ? 'good' : 'caution'}">${stations.length > 0 ? 'Monitored' : 'Limited Data'}</div>
            </div>
        </div>

        ${events.length > 0 ? `
            <div class="route-incidents">
                <h4><i class="fas fa-exclamation-triangle"></i> Current Incidents on ${road.shortName}</h4>
                ${events.slice(0, 2).map(event => `
                    <div class="incident-item ${event.eventType === 'construction' ? 'construction' : ''}">
                        <strong>${event.eventType?.toUpperCase() || 'INCIDENT'}:</strong> ${event.description || event.message}
                        ${event.location ? `<br><small>📍 ${event.location}</small>` : ''}
                    </div>
                `).join('')}
                ${events.length > 2 ? `<small>... and ${events.length - 2} more incidents</small>` : ''}
            </div>
        ` : `
            <div class="route-incidents">
                <div class="no-incidents">✅ No current incidents reported on ${road.shortName}</div>
            </div>
        `}
    `;
}

/**
 * Navigate to previous road in carousel
 */
function previousRoad(stationsData, eventsData) {
    resetAutoRotation(stationsData, eventsData);
    const newIndex = currentRoadIndex === 0 ? basinRoads.length - 1 : currentRoadIndex - 1;
    showRoad(newIndex, stationsData, eventsData);
}

/**
 * Navigate to next road in carousel
 */
function nextRoad(stationsData, eventsData) {
    resetAutoRotation(stationsData, eventsData);
    const newIndex = currentRoadIndex === basinRoads.length - 1 ? 0 : currentRoadIndex + 1;
    showRoad(newIndex, stationsData, eventsData);
}

/**
 * Start automatic carousel rotation (30 seconds per slide)
 */
function startAutoRotation(stationsData, eventsData) {
    if (autoRotateTimer) {
        clearInterval(autoRotateTimer);
    }

    autoRotateTimer = setInterval(() => {
        const nextIndex = currentRoadIndex === basinRoads.length - 1 ? 0 : currentRoadIndex + 1;
        showRoad(nextIndex, stationsData, eventsData);
    }, 30000); // 30 seconds
}

/**
 * Reset the auto-rotation timer
 */
function resetAutoRotation(stationsData, eventsData) {
    if (autoRotateTimer) {
        clearInterval(autoRotateTimer);
        startAutoRotation(stationsData, eventsData);
    }
}
