// Units System for Science Mode Toggle
class UnitsSystem {
    constructor() {
        this.isMetric = localStorage.getItem('unitsSystem') === 'metric';
    }

    // Temperature conversions
    formatTemperature(fahrenheit) {
        if (fahrenheit === '--' || fahrenheit === null || fahrenheit === undefined) return '--';
        const temp = parseFloat(fahrenheit);
        if (isNaN(temp)) return '--';

        if (this.isMetric) {
            const celsius = (temp - 32) * 5/9;
            return `${celsius.toFixed(1)}°C`;
        }
        return `${temp.toFixed(1)}°F`;
    }

    // Wind speed conversions
    formatWindSpeed(mph) {
        if (mph === '--' || mph === null || mph === undefined) return '--';
        const speed = parseFloat(mph);
        if (isNaN(speed)) return '--';

        if (this.isMetric) {
            const kmh = speed * 1.60934;
            return `${kmh.toFixed(1)} km/h`;
        }
        return `${speed.toFixed(1)} mph`;
    }

    // Visibility conversions
    formatVisibility(miles) {
        if (miles === '--' || miles === null || miles === undefined) return '--';
        const vis = parseFloat(miles);
        if (isNaN(vis)) return '--';

        if (this.isMetric) {
            const km = vis * 1.60934;
            return `${km.toFixed(1)} km`;
        }
        return `${vis.toFixed(1)} mi`;
    }

    // Toggle between systems
    toggle() {
        this.isMetric = !this.isMetric;
        localStorage.setItem('unitsSystem', this.isMetric ? 'metric' : 'imperial');
        return this.isMetric;
    }

    // Get current system name
    getSystemName() {
        return this.isMetric ? 'Metric' : 'Imperial';
    }

    // Get temperature unit symbol
    getTempUnit() {
        return this.isMetric ? '°C' : '°F';
    }

    // Get wind speed unit
    getWindUnit() {
        return this.isMetric ? 'km/h' : 'mph';
    }

    // Get visibility unit
    getVisibilityUnit() {
        return this.isMetric ? 'km' : 'mi';
    }
}

// Global units system instance
const unitsSystem = new UnitsSystem();

// Optimized data cache with intelligent refresh intervals
const routeDataCache = {
    stations: null,
    events: null,
    lastUpdated: null,
    refreshIntervals: {
        stations: 300000,    // 5 minutes for weather stations
        events: 600000,      // 10 minutes for traffic events  
        cameras: 1800000,    // 30 minutes for cameras
        restAreas: 86400000, // 24 hours for rest areas
        passes: 300000       // 5 minutes for mountain passes
    },
    lastRefreshAttempt: null,
    backoffMultiplier: 1,
    
    isValid(dataType = 'stations') {
        if (!this[dataType] || !this.lastUpdated) return false;
        const interval = this.refreshIntervals[dataType] * this.backoffMultiplier;
        return (Date.now() - this.lastUpdated) < interval;
    },

    async updateCache() {
        // Prevent rapid retry attempts
        if (this.lastRefreshAttempt && (Date.now() - this.lastRefreshAttempt) < 30000) {
            console.log('Skipping cache update - too recent attempt');
            return null;
        }
        
        this.lastRefreshAttempt = Date.now();
        
        try {
            const [stationsResponse, eventsResponse] = await Promise.all([
                fetch('/api/road-weather/stations'),
                fetch('/api/traffic-events')
            ]);

            if (stationsResponse.ok && eventsResponse.ok) {
                this.stations = await stationsResponse.json();
                this.events = await eventsResponse.json();
                this.lastUpdated = Date.now();
                this.backoffMultiplier = 1; // Reset backoff on success
                return { stations: this.stations, events: this.events };
            } else {
                throw new Error('API response not ok');
            }
        } catch (error) {
            console.error('Failed to update route data cache:', error);
            // Exponential backoff on failure
            this.backoffMultiplier = Math.min(this.backoffMultiplier * 2, 8);
            console.warn(`Cache update failed, backing off to ${this.backoffMultiplier}x interval`);
        }
        return null;
    },

    async getData() {
        if (!this.isValid()) {
            await this.updateCache();
        }
        return { stations: this.stations, events: this.events };
    },
    
    // Check API health and adjust refresh rates accordingly
    async checkApiHealth() {
        try {
            const response = await fetch('/api/cache-stats/api-health');
            if (response.ok) {
                const health = await response.json();
                if (health.health.overall === 'degraded') {
                    // Slow down refresh rates when API is under stress
                    this.backoffMultiplier = Math.max(this.backoffMultiplier, 2);
                    console.warn('API health degraded - reducing refresh frequency');
                }
                return health;
            }
        } catch (error) {
            console.warn('Failed to check API health:', error);
        }
        return null;
    }
};

// Road Weather Map with UDOT, NWS, and Open-Meteo integration
class RoadWeatherMap {
    constructor(mapElementId, options = {}) {
        this.mapElement = document.getElementById(mapElementId);
        this.options = {
            center: options.center || [40.15, -110.1],
            zoom: options.zoom || 8,
            refreshInterval: options.refreshInterval || 300000,
            ...options
        };

        this.map = null;
        this.roadLayers = new Map();
        this.stationMarkers = new Map();
        this.cameraMarkers = new Map();
        this.trafficEventMarkers = new Map();
        this.closureOverlays = new Map();
        this.snowPlowMarkers = new Map();
        this.snowPlowRoutes = new Map();
        this.mountainPassMarkers = new Map();
        this.restAreaMarkers = new Map();
        this.refreshTimer = null;
    }

    init() {
        this.initMap();
        this.addLegend();
        this.loadRoadWeatherData();
        this.loadTrafficEvents();
        this.loadTrafficAlerts();
        this.loadSnowPlows();
        this.loadMountainPasses();
        this.loadRestAreas();
        this.startAutoRefresh();
        return this;
    }

    initMap() {
        // Clear any existing map instance
        if (this.map) {
            this.map.remove();
            this.map = null;
        }

        // Check if map element already has Leaflet instance
        if (this.mapElement._leaflet_id) {
            this.mapElement._leaflet_id = null;
            this.mapElement.innerHTML = '';
        }

        // Ensure the container has dimensions before initialization
        if (this.mapElement.offsetWidth === 0 || this.mapElement.offsetHeight === 0) {
            console.warn('Map container has no dimensions, waiting for layout...');
            setTimeout(() => this.initMap(), 100);
            return;
        }

        this.map = L.map(this.mapElement, {
            zoomControl: true,
            scrollWheelZoom: true,
            dragging: true,
            touchZoom: true,
            doubleClickZoom: true,
            boxZoom: true,
            keyboard: true,
            tap: true,
            tapTolerance: 15
        }).setView(this.options.center, this.options.zoom);

        // Force enable dragging after initialization
        if (this.map.dragging) {
            this.map.dragging.enable();
        }

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 15,
            minZoom: 8,
            attribution: '© OpenStreetMap | Road Data: UDOT, NWS, Open-Meteo'
        }).addTo(this.map);

        // Create a custom pane for closures to ensure they're always on top
        this.map.createPane('closurePane');
        this.map.getPane('closurePane').style.zIndex = 10000;
        this.map.getPane('closurePane').style.pointerEvents = 'auto';
    }

    async loadRoadWeatherData() {
        try {
            const response = await fetch('/api/road-weather');
            if (!response.ok) {
                // Fallback to static/demo data
                this.loadStaticRoadData();
                return;
            }

            const data = await response.json();
            this.clearLayers();
            this.renderRoadSegments(data.segments);
            this.renderWeatherStations(data.stations);
            this.renderTrafficCameras(data.cameras, data.cameraDetections);

        } catch (error) {
            console.error('Error loading road weather data:', error);
            this.loadStaticRoadData();
        }
    }

    loadStaticRoadData() {
        // Default road segments for Uintah Basin
        const segments = [
            {
                id: 'us40',
                name: 'US-40: Vernal to Roosevelt',
                coordinates: [
                    [40.4555, -109.5287],
                    [40.4200, -109.7000],
                    [40.3200, -109.9000],
                    [40.2999, -109.9890]
                ],
                condition: 'green',
                status: 'Clear'
            },
            {
                id: 'us191',
                name: 'US-191: Vernal to Duchesne',
                coordinates: [
                    [40.4555, -109.5287],
                    [40.3500, -109.8000],
                    [40.2500, -110.2000],
                    [40.1632, -110.4026]
                ],
                condition: 'yellow',
                status: 'Use Caution'
            },
            {
                id: 'sr87',
                name: 'SR-87: Duchesne to Roosevelt',
                coordinates: [
                    [40.1632, -110.4026],
                    [40.2500, -110.1500],
                    [40.2999, -109.9890]
                ],
                condition: 'green',
                status: 'Clear'
            }
        ];

        this.clearLayers();
        segments.forEach(segment => {
            this.renderRoadSegment(segment);
        });

        // Add default weather stations
        const stations = [
            { name: 'Vernal', lat: 40.4555, lng: -109.5287, temp: 45, condition: 'good' },
            { name: 'Roosevelt', lat: 40.2999, lng: -109.9890, temp: 42, condition: 'good' },
            { name: 'Duchesne', lat: 40.1632, lng: -110.4026, temp: 40, condition: 'caution' }
        ];

        stations.forEach(station => {
            this.renderWeatherStation(station);
        });
    }

    renderRoadSegments(segments) {
        if (!segments || segments.length === 0) {
            this.loadStaticRoadData();
            return;
        }

        segments.forEach(segment => {
            this.renderRoadSegment({
                id: segment.id,
                name: segment.name,
                coordinates: segment.coordinates,
                condition: segment.overallCondition?.condition || 'gray',
                status: segment.overallCondition?.status || 'No Data',
                type: segment.type,
                detectionData: segment.detectionData,
                temperatureInfo: segment.temperatureInfo
            });
        });
    }

    renderRoadSegment(segment) {
        const color = this.getSegmentColor(segment.condition);
        const isEstimated = segment.type === 'estimated';
        const isCameraMonitored = segment.type === 'camera_monitored';

        let lineStyle = {
            color: color,
            weight: 6,
            opacity: 0.8,
            smoothFactor: 1,
            dashArray: null
        };

        let dataSource = 'Real-time UDOT data';
        let badgeClass = 'monitored-badge';

        // Adjust styling based on monitoring type
        if (isCameraMonitored) {
            dataSource = '📹 Camera Analysis';
            badgeClass = 'camera-monitored-badge';
            lineStyle.weight = 8;
            lineStyle.opacity = 0.9;
            lineStyle.dashArray = '15, 8'; // Distinctive dash pattern for camera monitoring
        } else if (isEstimated) {
            dataSource = 'Estimated from regional weather';
            badgeClass = 'estimated-badge';
            lineStyle.weight = 4;
            lineStyle.opacity = 0.6;
            lineStyle.dashArray = '5, 10';
        }

        // All roads now have proper multi-point coordinates
        const roadLayer = L.polyline(segment.coordinates, lineStyle);

        // Build popup content with additional info for camera-monitored segments
        let popupContent = `
            <div class="road-popup">
                <h4>${segment.name}</h4>
                <div class="road-status ${segment.condition}">
                    Status: ${segment.status}
                </div>
                <div class="${badgeClass}">
                    ${isCameraMonitored ? '📹 Camera Monitored' : (isEstimated ? '📊 Estimated' : '🛰️ Monitored')}
                </div>`;

        // Add camera-specific information
        if (isCameraMonitored && segment.detectionData) {
            const detection = segment.detectionData;
            popupContent += `
                <div class="camera-detection-info">
                    <p><strong>Snow Level:</strong> ${detection.snowLevel}</p>
                    <p><strong>Confidence:</strong> ${Math.round(detection.confidence * 100)}%</p>
                    <p><strong>Last Analysis:</strong> ${new Date(detection.timestamp).toLocaleTimeString()}</p>
                </div>`;
        }

        popupContent += `
                <p class="data-source">${dataSource}</p>
            </div>`;

        roadLayer.bindPopup(popupContent);

        // Add click event to update condition cards
        roadLayer.on('click', async function(e) {
            const locationData = {
                name: segment.name,
                condition: segment.status,
                roadCondition: segment.roadCondition
            };

            // Try to fetch weather data for the clicked point
            const clickLat = e.latlng.lat;
            const clickLng = e.latlng.lng;

            try {
                const weatherResponse = await fetch(`/api/road-weather/openmeteo/${clickLat}/${clickLng}`);
                if (weatherResponse.ok) {
                    const weatherData = await weatherResponse.json();
                    if (weatherData && weatherData.current) {
                        locationData.windSpeed = weatherData.current.windSpeed;
                        locationData.precipitation = weatherData.current.precipitation;
                        locationData.visibility = weatherData.current.visibility ? weatherData.current.visibility / 1000 : null;
                        locationData.temperature = weatherData.current.temperature;
                    }
                }
            } catch (error) {
                console.error('Error fetching road weather:', error);
            }

            updateConditionCardsWithLocation(locationData);
        });

        roadLayer.on('mouseover', function(e) {
            const hoverWeight = isCameraMonitored ? 10 : 8;
            this.setStyle({ weight: hoverWeight, opacity: 1 });
        });

        roadLayer.on('mouseout', function(e) {
            const normalWeight = isCameraMonitored ? 8 : 6;
            const normalOpacity = isCameraMonitored ? 0.9 : 0.8;
            this.setStyle({ weight: normalWeight, opacity: normalOpacity });
        });

        roadLayer.addTo(this.map);
        this.roadLayers.set(segment.id, roadLayer);
    }

    renderWeatherStations(stations) {
        if (!stations || stations.length === 0) return;

        stations.forEach(station => {
            this.renderWeatherStation(station);
        });
    }

    renderWeatherStation(station) {
        const color = this.getConditionColor(station.condition.condition);
        const marker = L.marker([station.lat, station.lng], {
            icon: L.divIcon({
                html: '🌡️',
                className: 'weather-station-marker',
                iconSize: [24, 24],
                iconAnchor: [12, 12]
            })
        });

        // Format temperature and wind values using units system
        const airTemp = station.airTemperature ? unitsSystem.formatTemperature(station.airTemperature) : '--';
        const surfaceTemp = station.surfaceTemp ? unitsSystem.formatTemperature(station.surfaceTemp) : '--';
        const humidity = station.relativeHumidity ? `${station.relativeHumidity}%` : '--';
        const windSpeed = station.windSpeedAvg ? unitsSystem.formatWindSpeed(station.windSpeedAvg) : '--';
        const windDir = station.windDirection || '--';
        const windGust = station.windSpeedGust ? unitsSystem.formatWindSpeed(station.windSpeedGust) : '--';

        marker.bindPopup(`
            <div class="weather-station-popup">
                <h4>🌡️ ${station.name}</h4>
                <div class="station-status ${station.condition.condition}">
                    ${station.condition.status}
                </div>

                <div class="weather-details">
                    <div class="weather-row">
                        <strong>Air Temperature:</strong> ${airTemp}
                    </div>
                    <div class="weather-row">
                        <strong>Surface Temperature:</strong> ${surfaceTemp}
                    </div>
                    <div class="weather-row">
                        <strong>Surface Status:</strong> ${station.surfaceStatus || 'Unknown'}
                    </div>
                    <div class="weather-row">
                        <strong>Humidity:</strong> ${humidity}
                    </div>
                    <div class="weather-row">
                        <strong>Wind:</strong> ${windSpeed} ${windDir}
                    </div>
                    ${station.windSpeedGust ? `<div class="weather-row"><strong>Wind Gusts:</strong> ${windGust}</div>` : ''}
                    ${station.precipitation ? `<div class="weather-row"><strong>Precipitation:</strong> ${station.precipitation}</div>` : ''}
                </div>

                <div class="data-timestamp">
                    Updated: ${new Date(station.lastUpdated).toLocaleTimeString()}
                </div>
                <div class="data-source">
                    Real-time UDOT Weather Station
                </div>
            </div>
        `, {
            maxWidth: 300
        });

        // Add click handler for weather station marker
        marker.on('click', (e) => {
            const locationData = {
                name: station.name,
                roadTemp: station.surfaceTemp,
                airTemp: station.airTemperature,
                temperature: station.airTemperature,
                windSpeed: station.windSpeedAvg,
                windGust: station.windSpeedGust,
                visibility: station.visibility,
                precipitation: station.precipitation || station.surfaceStatus,
                condition: station.condition.status,
                lat: station.lat,
                lng: station.lng
            };

            updateConditionCardsWithLocation(locationData);
        });

        marker.addTo(this.map);
        this.stationMarkers.set(station.id, marker);
    }


    renderTrafficCameras(cameras, cameraDetections = []) {
        if (!cameras || cameras.length === 0) return;

        // Store camera data for click events
        this.cameraData = cameras;
        this.cameraDetections = cameraDetections;

        cameras.forEach(camera => {
            // Find camera analysis data
            const detection = cameraDetections.find(d => d.cameraId === camera.id.toString());

            // Determine ring color based on analysis
            let ringColor = '#808080'; // Default gray for no analysis
            let ringOpacity = 0.3;
            let conditionText = 'No Analysis';

            if (detection) {
                if (detection.temperatureOverride) {
                    ringColor = '#28a745'; // Green for temperature override
                    conditionText = `Clear (${unitsSystem.formatTemperature(detection.temperature)})`;
                } else {
                    switch (detection.snowLevel) {
                        case 'none':
                            ringColor = '#28a745'; // Green
                            conditionText = 'Clear';
                            break;
                        case 'light':
                            ringColor = '#ffc107'; // Yellow
                            conditionText = 'Light Snow';
                            break;
                        case 'moderate':
                            ringColor = '#fd7e14'; // Orange
                            conditionText = 'Moderate Snow';
                            break;
                        case 'heavy':
                            ringColor = '#dc3545'; // Red
                            conditionText = 'Heavy Snow';
                            break;
                        default:
                            ringColor = '#6c757d'; // Gray
                            conditionText = 'Unknown';
                    }
                }
                ringOpacity = 0.7;
            }

            // Create camera marker with colored ring as part of the icon
            const marker = L.marker([camera.lat, camera.lng], {
                icon: L.divIcon({
                    html: `<div style="
                        width: 30px;
                        height: 30px;
                        border: 3px solid ${ringColor};
                        border-radius: 50%;
                        background: rgba(255,255,255,0.95);
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        box-shadow: 0 2px 6px rgba(0,0,0,0.3);
                        font-size: 16px;
                    ">📹</div>`,
                    className: 'camera-icon-with-condition',
                    iconSize: [36, 36],
                    iconAnchor: [18, 18]
                }),
                zIndexOffset: 1000 // Ensure camera appears above everything
            });

            // Create popup with camera feed and analysis info
            const cameraViews = camera.views.map(view =>
                `<div class="camera-view">
                    <div class="camera-image-container"
                         onclick="window.open('/webcam-viewer?id=${camera.id}', '_blank')"
                         style="cursor: pointer;">
                        <img src="${view.url}" alt="${view.description}"
                             onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">
                        <div class="click-overlay">
                            🔍 Click to view full screen
                        </div>
                        <div style="display: none; padding: 10px; background: #f0f0f0; border-radius: 4px; text-align: center;">
                            Camera feed unavailable
                        </div>
                    </div>
                    <p>${view.description}</p>
                </div>`
            ).join('');

            // Add analysis info to popup if available
            let analysisInfo = '';
            if (detection) {
                analysisInfo = `
                    <div class="analysis-section">
                        <p><strong>Condition:</strong> ${conditionText}</p>
                        <p><strong>Confidence:</strong> ${Math.round(detection.confidence * 100)}%</p>
                        ${!detection.temperatureOverride ? `<p><strong>Snow Level:</strong> ${detection.snowLevel}</p>` : ''}
                    </div>`;
            }

            // Add click event to update condition cards
            marker.on('click', async () => {
                // Combine camera data with detection data
                const locationData = {
                    name: camera.name,
                    temperature: detection?.temperature,
                    snowLevel: detection?.snowLevel,
                    confidence: detection?.confidence,
                    temperatureOverride: detection?.temperatureOverride,
                    condition: conditionText
                };

                // Try to fetch weather data for this location
                try {
                    const weatherResponse = await fetch(`/api/road-weather/openmeteo/${camera.lat}/${camera.lng}`);
                    if (weatherResponse.ok) {
                        const weatherData = await weatherResponse.json();
                        if (weatherData && weatherData.current) {
                            locationData.windSpeed = weatherData.current.windSpeed;
                            locationData.windGust = weatherData.current.windGust;
                            locationData.precipitation = weatherData.current.precipitation;
                            locationData.visibility = weatherData.current.visibility ? weatherData.current.visibility / 1000 : null; // Convert m to km
                            locationData.airTemp = weatherData.current.temperature;
                        }
                    }

                    // Try to get nearest weather station data
                    const stationsResponse = await fetch('/api/road-weather/stations');
                    if (stationsResponse.ok) {
                        const stations = await stationsResponse.json();
                        // Find nearest station
                        let nearestStation = null;
                        let minDistance = Infinity;
                        stations.forEach(station => {
                            const distance = Math.sqrt(
                                Math.pow(station.lat - camera.lat, 2) +
                                Math.pow(station.lng - camera.lng, 2)
                            );
                            if (distance < minDistance) {
                                minDistance = distance;
                                nearestStation = station;
                            }
                        });

                        if (nearestStation && minDistance < 0.5) { // Within ~30 miles
                            locationData.roadTemp = nearestStation.roadTemp;
                            locationData.airTemp = locationData.airTemp || nearestStation.airTemp;
                            locationData.windSpeed = locationData.windSpeed || nearestStation.windSpeed;
                        }
                    }
                } catch (error) {
                    console.error('Error fetching weather data:', error);
                }

                // Update the condition cards
                updateConditionCardsWithLocation(locationData);
            });

            // Minimal popup - just camera feed and analysis
            marker.bindPopup(`
                <div class="camera-popup">
                    <h4>${camera.name}</h4>
                    ${cameraViews}
                    ${analysisInfo}
                </div>
            `, {
                maxWidth: 260,
                minWidth: 220,
                className: 'camera-popup-marker',
                closeButton: true,
                autoPan: false,
                keepInView: false
            });

            // Simple solution: wait for images to load then adjust position
            marker.on('popupopen', () => {
                setTimeout(() => {
                    // Pan map to ensure popup is visible after images load
                    this.map.panTo(marker.getLatLng(), {
                        animate: true,
                        duration: 0.3
                    });
                }, 500); // Wait half second for images to load
            });


            // Add marker to map (no separate ring needed)
            marker.addTo(this.map);

            this.cameraMarkers.set(camera.id, marker);
        });
    }

    determineStationCondition(station) {
        const surfaceStatus = (station.surfaceStatus || '').toLowerCase();
        const temp = parseFloat(station.roadTemp) || parseFloat(station.airTemp);

        if (surfaceStatus.includes('ice') || surfaceStatus.includes('closed')) {
            return 'danger';
        } else if (surfaceStatus.includes('snow') || (temp && temp <= 32)) {
            return 'caution';
        }
        return 'good';
    }

    getSegmentColor(condition) {
        switch(condition) {
            case 'red': return '#dc3545';
            case 'yellow': return '#ffc107';
            case 'green': return '#28a745';
            default: return '#6c757d';
        }
    }

    getConditionColor(condition) {
        switch(condition) {
            case 'danger': return '#dc3545';
            case 'caution': return '#ffc107';
            case 'good': return '#28a745';
            default: return '#6c757d';
        }
    }

    interpretWeatherCode(code) {
        // Open-Meteo weather codes interpretation
        const weatherCodes = {
            0: 'Clear',
            1: 'Mainly Clear', 2: 'Partly Cloudy', 3: 'Overcast',
            45: 'Fog', 48: 'Depositing Rime Fog',
            51: 'Light Drizzle', 53: 'Moderate Drizzle', 55: 'Dense Drizzle',
            56: 'Light Freezing Drizzle', 57: 'Dense Freezing Drizzle',
            61: 'Light Rain', 63: 'Moderate Rain', 65: 'Heavy Rain',
            66: 'Light Freezing Rain', 67: 'Heavy Freezing Rain',
            71: 'Light Snow', 73: 'Moderate Snow', 75: 'Heavy Snow',
            77: 'Snow Grains',
            80: 'Light Rain Showers', 81: 'Moderate Rain Showers', 82: 'Violent Rain Showers',
            85: 'Slight Snow Showers', 86: 'Heavy Snow Showers',
            95: 'Thunderstorm', 96: 'Thunderstorm with Light Hail', 99: 'Thunderstorm with Heavy Hail'
        };
        return weatherCodes[code] || 'Unknown';
    }

    addLegend() {
        const legend = L.control({ position: 'bottomright' });

        legend.onAdd = () => {
            const div = L.DomUtil.create('div', 'road-legend-collapsible');
            div.innerHTML = `
                <div class="legend-toggle" id="legend-toggle">
                    <i class="fas fa-info-circle"></i>
                    <span>Legend</span>
                    <i class="fas fa-chevron-up legend-arrow" id="legend-arrow"></i>
                </div>
                <div class="legend-content" id="legend-content">
                    <div class="legend-items">
                        <div class="legend-section">
                            <h5>Road Conditions</h5>
                            <div class="legend-item">
                                <span class="color-box" style="background: #28a745;"></span>
                                <span>Clear</span>
                            </div>
                            <div class="legend-item">
                                <span class="color-box" style="background: #ffc107;"></span>
                                <span>Caution</span>
                            </div>
                            <div class="legend-item">
                                <span class="color-box" style="background: #dc3545;"></span>
                                <span>Dangerous</span>
                            </div>
                            <div class="legend-item">
                                <span class="color-box" style="background: #6c757d;"></span>
                                <span>No Data</span>
                            </div>
                        </div>
                        <div class="legend-section">
                            <h5>Map Icons</h5>
                            <div class="legend-item">
                                <span class="icon-box">🌡️</span>
                                <span>Weather</span>
                            </div>
                            <div class="legend-item">
                                <span class="icon-box">📹</span>
                                <span>Camera</span>
                            </div>
                            <div class="legend-item">
                                <span class="icon-box">🚧</span>
                                <span>Construction</span>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            // Add click event for toggle
            setTimeout(() => {
                const toggle = document.getElementById('legend-toggle');
                const content = document.getElementById('legend-content');
                const arrow = document.getElementById('legend-arrow');

                toggle.addEventListener('click', () => {
                    const isExpanded = content.classList.contains('expanded');

                    if (isExpanded) {
                        content.classList.remove('expanded');
                        arrow.classList.remove('rotated');
                    } else {
                        content.classList.add('expanded');
                        arrow.classList.add('rotated');
                    }
                });
            }, 100);

            return div;
        };

        legend.addTo(this.map);
    }

    clearLayers() {
        this.roadLayers.forEach(layer => this.map.removeLayer(layer));
        this.stationMarkers.forEach(marker => this.map.removeLayer(marker));
        this.cameraMarkers.forEach(marker => this.map.removeLayer(marker));
        this.restAreaMarkers.forEach(marker => this.map.removeLayer(marker));
        this.roadLayers.clear();
        this.stationMarkers.clear();
        this.cameraMarkers.clear();
        this.restAreaMarkers.clear();

        // Note: Traffic event markers and closure overlays are intentionally NOT cleared here
        // They have their own lifecycle managed by loadTrafficEvents() and loadTrafficAlerts()
    }

    startAutoRefresh() {
        if (this.refreshTimer) clearInterval(this.refreshTimer);
        
        // Intelligent refresh intervals based on data type and API health
        const scheduleRefresh = () => {
            // Check API health periodically
            routeDataCache.checkApiHealth();
            
            // Different refresh intervals for different data types
            const intervals = {
                roadWeather: 5 * 60 * 1000,  // 5 minutes - road conditions change frequently
                traffic: 10 * 60 * 1000,     // 10 minutes - traffic events moderate frequency
                snowPlows: 2 * 60 * 1000,    // 2 minutes - snow plows move frequently
                passes: 5 * 60 * 1000,       // 5 minutes - mountain passes change with weather
                restAreas: 24 * 60 * 60 * 1000 // 24 hours - rest areas rarely change
            };
            
            // Staggered refresh to avoid API overload
            setTimeout(() => this.loadRoadWeatherData(), 0);
            setTimeout(() => this.loadTrafficEvents(), 2000);
            setTimeout(() => this.loadSnowPlows(), 4000);
            setTimeout(() => this.loadMountainPasses(), 6000);
            setTimeout(() => updateConditionCards(), 8000);
            
            // Only refresh rest areas once per day
            if (!this.lastRestAreaRefresh || (Date.now() - this.lastRestAreaRefresh) > intervals.restAreas) {
                setTimeout(() => {
                    this.loadRestAreas();
                    this.lastRestAreaRefresh = Date.now();
                }, 10000);
            }
        };
        
        // Initial load
        scheduleRefresh();
        
        // Set up periodic refresh with the shortest interval needed
        this.refreshTimer = setInterval(scheduleRefresh, 2 * 60 * 1000); // 2 minutes base interval
    }

    destroy() {
        if (this.refreshTimer) clearInterval(this.refreshTimer);
        this.clearLayers();
        if (this.map) {
            this.map.remove();
            this.map = null;
        }
    }
}

// Initialize on page load
let roadWeatherMap = null;

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
        zoom: 10,
        refreshInterval: 300000 // 5 minutes
    });

    roadWeatherMap.init();

    // Update the condition cards with real data
    updateConditionCards();

    // Initialize Emma Park Road Easter Egg
    initEmmaEasterEgg();

    // Initialize the traffic events manager
    try {
        trafficEventsManager = new TrafficEventsManager();
    } catch (error) {
        console.error('Error initializing traffic events manager:', error);
    }

    // Initialize route conditions
    loadRouteConditions();
});

// Function to update cards with specific location data
function updateConditionCardsWithLocation(locationData) {
    // Location section has been removed - no need to update selected location text

    // Update road surface temperature
    const roadTempCard = document.querySelector('.condition-card-compact.road-temp .value');
    if (roadTempCard) {
        const temp = locationData.roadTemp || locationData.airTemp || locationData.temperature || '--';
        roadTempCard.textContent = temp !== '--' ? unitsSystem.formatTemperature(temp) : `--${unitsSystem.getTempUnit()}`;
    }

    // Update visibility
    const visCard = document.querySelector('.condition-card-compact.visibility .value');
    if (visCard) {
        const vis = locationData.visibility;
        if (vis && vis > 0) {
            const maxVis = unitsSystem.isMetric ? 16 : 10; // 16 km ≈ 10 mi
            visCard.textContent = vis > maxVis ? `${maxVis}+ ${unitsSystem.getVisibilityUnit()}` : unitsSystem.formatVisibility(vis);
        } else {
            visCard.textContent = `-- ${unitsSystem.getVisibilityUnit()}`;
        }
    }

    // Update precipitation
    const precipCard = document.querySelector('.condition-card-compact.precipitation .value');
    if (precipCard) {
        const precip = locationData.precipitation || locationData.snowLevel || locationData.condition;
        if (precip) {
            if (typeof precip === 'string') {
                precipCard.textContent = precip === 'none' ? 'None' : precip;
            } else {
                precipCard.textContent = precip > 0 ? `${precip} in/hr` : 'None';
            }
        } else {
            precipCard.textContent = '--';
        }
    }

    // Update wind
    const windCard = document.querySelector('.condition-card-compact.wind .value');
    if (windCard) {
        const wind = locationData.windSpeed || locationData.windGust;
        if (wind && wind > 0) {
            windCard.textContent = unitsSystem.formatWindSpeed(wind);
        } else {
            windCard.textContent = `-- ${unitsSystem.getWindUnit()}`;
        }
    }
}

async function updateConditionCards() {
    try {
        const response = await fetch('/api/road-weather/stations');
        if (!response.ok) {
            // Use fallback data
            updateCardsWithFallback();
            return;
        }

        const stations = await response.json();
        if (!stations || stations.length === 0) {
            updateCardsWithFallback();
            return;
        }

        // Calculate averages
        const temps = stations.map(s => parseFloat(s.roadTemp) || parseFloat(s.airTemp)).filter(t => !isNaN(t));
        const avgTemp = temps.length > 0 ? Math.round(temps.reduce((a, b) => a + b, 0) / temps.length) : '--';

        const visibilities = stations.map(s => parseFloat(s.visibility)).filter(v => !isNaN(v));
        const avgVis = visibilities.length > 0 ? Math.round(visibilities.reduce((a, b) => a + b, 0) / visibilities.length * 10) / 10 : '--';

        const windSpeeds = stations.map(s => parseFloat(s.windSpeed)).filter(w => !isNaN(w));
        const avgWind = windSpeeds.length > 0 ? Math.round(windSpeeds.reduce((a, b) => a + b, 0) / windSpeeds.length) : '--';

        // Update cards with units system
        const roadTempCard = document.querySelector('.condition-card-compact.road-temp .value');
        if (roadTempCard) roadTempCard.textContent = avgTemp !== '--' ? unitsSystem.formatTemperature(avgTemp) : `--${unitsSystem.getTempUnit()}`;

        const visibilityCard = document.querySelector('.condition-card-compact.visibility .value');
        if (visibilityCard) visibilityCard.textContent = avgVis !== '--' ? unitsSystem.formatVisibility(avgVis) : `-- ${unitsSystem.getVisibilityUnit()}`;

        const windCard = document.querySelector('.condition-card-compact.wind .value');
        if (windCard) {
            windCard.textContent = avgWind !== '--' ? unitsSystem.formatWindSpeed(avgWind) : `-- ${unitsSystem.getWindUnit()}`;
        }
    } catch (error) {
        console.error('Error updating condition cards:', error);
        updateCardsWithFallback();
    }
}

async function updateCardsWithFallback() {
    // Try Open-Meteo as fallback
    try {
        const response = await fetch('/api/road-weather/openmeteo/40.3033/-109.7');
        if (response.ok) {
            const data = await response.json();
            if (data && data.current) {
                const tempF = Math.round(data.current.temperature * 9/5 + 32);
                const windMph = Math.round(data.current.windSpeed * 2.237);

                const roadTempCard = document.querySelector('.condition-card-compact.road-temp .value');
                if (roadTempCard) roadTempCard.textContent = unitsSystem.formatTemperature(tempF);

                const windCard = document.querySelector('.condition-card-compact.wind .value');
                if (windCard) windCard.textContent = unitsSystem.formatWindSpeed(windMph);
            }
        }
    } catch (error) {
        console.error('Fallback also failed:', error);
    }
}

// Road Weather Map Class Methods Extension
RoadWeatherMap.prototype.loadTrafficEvents = async function() {
        try {
            const response = await fetch('/api/traffic-events/map');
            if (!response.ok) {
                console.error('Failed to load traffic events:', response.status);
                return;
            }

            const data = await response.json();
            if (data.success && data.events) {
                this.addTrafficEventsToMap(data.events);
            }
        } catch (error) {
            console.error('Error loading traffic events:', error);
            // Don't let traffic event errors break the map
        }
    }

RoadWeatherMap.prototype.addTrafficEventsToMap = function(events) {
        // Clear existing traffic event markers
        this.trafficEventMarkers.forEach(marker => {
            this.map.removeLayer(marker);
        });
        this.trafficEventMarkers.clear();

        events.forEach(event => {
            if (!event.latitude || !event.longitude) return;

            // Create custom icon based on event type
            const iconHtml = `
                <div style="
                    background-color: ${event.displayColor};
                    color: white;
                    border-radius: 50%;
                    width: 30px;
                    height: 30px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 16px;
                    border: 2px solid white;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.3);
                    font-weight: bold;
                ">
                    ${event.displayIcon}
                </div>
            `;

            const marker = L.marker([event.latitude, event.longitude], {
                icon: L.divIcon({
                    html: iconHtml,
                    className: 'traffic-event-marker',
                    iconSize: [30, 30],
                    iconAnchor: [15, 15]
                }),
                zIndexOffset: 500
            });

            // Create popup content
            const popupContent = `
                <div class="traffic-event-popup" style="max-width: 300px;">
                    <h4 style="margin: 0 0 10px 0; color: ${event.displayColor};">
                        ${event.displayIcon} ${event.name}
                    </h4>
                    <div style="margin-bottom: 8px;">
                        <strong>Road:</strong> ${event.roadwayName}
                    </div>
                    <div style="margin-bottom: 8px;">
                        <strong>Type:</strong> ${event.eventType.replace(/([A-Z])/g, ' $1').trim()}
                    </div>
                    ${event.isFullClosure ? '<div style="color: #dc2626; font-weight: bold; margin-bottom: 8px;">⚠️ FULL CLOSURE</div>' : ''}
                    <div style="margin-bottom: 8px;">
                        <strong>Description:</strong><br>
                        <div style="background: #f8f9fa; padding: 8px; border-radius: 4px; font-size: 14px; margin-top: 4px;">
                            ${event.shortDescription}
                        </div>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 10px; font-size: 12px; color: #666;">
                        <span><strong>Priority:</strong> ${event.priority}/10</span>
                        ${event.severity ? `<span><strong>Severity:</strong> ${event.severity}</span>` : ''}
                    </div>
                    <div style="margin-top: 8px; font-size: 11px; color: #999;">
                        <strong>Start:</strong> ${new Date(event.startDate).toLocaleString()}<br>
                        ${event.plannedEndDate ? `<strong>End:</strong> ${new Date(event.plannedEndDate).toLocaleString()}` : ''}
                    </div>
                </div>
            `;

            marker.bindPopup(popupContent);
            marker.addTo(this.map);

            this.trafficEventMarkers.set(event.id, marker);
        });


        // Add road closure overlays
        this.addRoadClosureOverlays(events);
    }

RoadWeatherMap.prototype.addRoadClosureOverlays = function(events) {
        // Clear existing closure overlays
        this.closureOverlays.forEach(overlay => {
            this.map.removeLayer(overlay);
        });
        this.closureOverlays.clear();

        events.forEach(event => {
            // Only show closures for full closures or high-priority disruptions
            const shouldShowClosure = event.isFullClosure ||
                                    event.priority >= 15 ||
                                    event.eventType === 'closures' ||
                                    (event.description && event.description.toLowerCase().includes('closed'));

            if (!shouldShowClosure || !event.encodedPolyline) {
                return;
            }

            try {
                // Decode the polyline to get coordinates
                const coordinates = this.decodePolyline(event.encodedPolyline);

                if (coordinates.length > 1) {
                    // Create a red polyline overlay for the closure
                    const closureOverlay = L.polyline(coordinates, {
                        color: '#dc2626',
                        weight: 12,
                        opacity: 1.0,
                        className: 'road-closure-overlay',
                        pane: 'closurePane'
                    });

                    // Add popup with closure information
                    const popupContent = `
                        <div class="closure-popup">
                            <h4 style="margin: 0 0 8px 0; color: #dc2626;">
                                🚫 Road Closure
                            </h4>
                            <p style="margin: 0 0 4px 0;"><strong>${event.roadwayName}</strong></p>
                            <p style="margin: 0 0 8px 0; font-size: 12px;">${event.location}</p>
                            <p style="margin: 0; font-size: 11px; color: #666;">
                                Click marker for full details
                            </p>
                        </div>
                    `;

                    closureOverlay.bindPopup(popupContent);
                    closureOverlay.addTo(this.map);

                    this.closureOverlays.set(event.id, closureOverlay);
                }
            } catch (error) {
                console.error('Error creating closure overlay for event', event.id, error);
            }
        });
    }

RoadWeatherMap.prototype.decodePolyline = function(encoded) {
        // Google Polyline Algorithm 5 decoder
        let index = 0;
        const len = encoded.length;
        let lat = 0;
        let lng = 0;
        const coordinates = [];

        while (index < len) {
            let b;
            let shift = 0;
            let result = 0;

            do {
                b = encoded.charCodeAt(index++) - 63;
                result |= (b & 0x1f) << shift;
                shift += 5;
            } while (b >= 0x20);

            const dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
            lat += dlat;

            shift = 0;
            result = 0;

            do {
                b = encoded.charCodeAt(index++) - 63;
                result |= (b & 0x1f) << shift;
                shift += 5;
            } while (b >= 0x20);

            const dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
            lng += dlng;

            coordinates.push([lat / 1e5, lng / 1e5]);
        }

        return coordinates;
    }

RoadWeatherMap.prototype.loadTrafficAlerts = async function() {
        try {
            const response = await fetch('/api/alerts');
            if (!response.ok) throw new Error('Failed to fetch alerts');

            const data = await response.json();
            if (data.success && data.alerts) {
                this.addAlertBasedClosures(data.alerts);
            }
        } catch (error) {
            console.error('Error loading traffic alerts for map:', error);
        }
    }

RoadWeatherMap.prototype.addAlertBasedClosures = function(alerts) {
        alerts.forEach(alert => {
            // Check if alert indicates a road closure
            const message = alert.message.toLowerCase();
            const isClosure = message.includes('closed') || message.includes('closure');

            if (!isClosure) return;

            // Extract highway information
            const highwayMatch = alert.message.match(/(US-\d+|I-\d+|SR-\d+)/gi);
            const milepointMatch = alert.message.match(/MP\s*(\d+)(?:-(\d+))?/i);

            if (highwayMatch && milepointMatch) {
                const highway = highwayMatch[0];
                const mpStart = parseInt(milepointMatch[1]);
                const mpEnd = milepointMatch[2] ? parseInt(milepointMatch[2]) : mpStart;

                // Create approximate coordinates based on highway and milepoints
                const closureCoords = this.approximateHighwayCoordinates(highway, mpStart, mpEnd);

                if (closureCoords.length > 0) {
                    const alertOverlay = L.polyline(closureCoords, {
                        color: '#dc2626',
                        weight: 15,
                        opacity: 1.0,
                        dashArray: '15, 10',
                        className: 'alert-closure-overlay',
                        pane: 'closurePane'
                    });

                    const popupContent = `
                        <div class="alert-closure-popup">
                            <h4 style="margin: 0 0 8px 0; color: #dc2626;">
                                🚨 UDOT Alert: Road Closure
                            </h4>
                            <p style="margin: 0 0 8px 0; font-weight: bold;">${highway}</p>
                            <p style="margin: 0 0 8px 0; font-size: 12px;">${alert.message}</p>
                            <p style="margin: 0; font-size: 10px; color: #666;">
                                Severity: ${alert.severity} | Until: ${alert.endTime ? new Date(alert.endTime).toLocaleString() : 'Unknown'}
                            </p>
                        </div>
                    `;

                    alertOverlay.bindPopup(popupContent);
                    alertOverlay.addTo(this.map);

                    this.closureOverlays.set(`alert-${alert.id}`, alertOverlay);
                }
            }
        });
    }

RoadWeatherMap.prototype.loadSnowPlows = async function() {
    try {
        const response = await fetch('/api/road-weather/snow-plows');
        if (!response.ok) {
            console.error('Failed to load snow plows:', response.status);
            return;
        }

        const data = await response.json();
        if (data.success && data.plows) {
            this.renderSnowPlows(data.plows);
        }
    } catch (error) {
        console.error('Error loading snow plows:', error);
    }
}

RoadWeatherMap.prototype.renderSnowPlows = function(plows) {
    // Clear existing snow plow markers and routes
    this.snowPlowMarkers.forEach(marker => this.map.removeLayer(marker));
    this.snowPlowMarkers.clear();
    this.snowPlowRoutes.forEach(route => this.map.removeLayer(route));
    this.snowPlowRoutes.clear();

    plows.forEach(plow => {
        // Create custom icon based on plow status
        let iconColor = '#10b981'; // Green for active
        let iconSize = 32;
        let pulseAnimation = '';

        if (plow.status === 'active') {
            iconColor = '#10b981'; // Green
            pulseAnimation = 'animation: pulse 2s infinite;';
        } else if (plow.status === 'recent') {
            iconColor = '#f59e0b'; // Yellow
        } else if (plow.status === 'idle') {
            iconColor = '#6b7280'; // Gray
            iconSize = 28;
        } else {
            iconColor = '#9ca3af'; // Light gray for inactive
            iconSize = 24;
        }

        // Create rotating plow icon based on bearing
        const iconHtml = `
            <div style="
                position: relative;
                width: ${iconSize}px;
                height: ${iconSize}px;
                ${pulseAnimation}
            ">
                <div style="
                    width: ${iconSize}px;
                    height: ${iconSize}px;
                    background: ${iconColor};
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transform: rotate(${plow.bearingAngle}deg);
                    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                    border: 2px solid white;
                ">
                    <div style="
                        transform: rotate(-${plow.bearingAngle}deg);
                        font-size: ${iconSize * 0.5}px;
                    ">🚜</div>
                </div>
                ${plow.isActive ? `<div style="
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    width: ${iconSize * 1.5}px;
                    height: ${iconSize * 1.5}px;
                    border: 2px solid ${iconColor};
                    border-radius: 50%;
                    opacity: 0;
                    animation: ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;
                "></div>` : ''}
            </div>
            <style>
                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.8; }
                }
                @keyframes ping {
                    0% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
                    100% { transform: translate(-50%, -50%) scale(2); opacity: 0; }
                }
            </style>
        `;

        const marker = L.marker([plow.latitude, plow.longitude], {
            icon: L.divIcon({
                html: iconHtml,
                className: 'snow-plow-marker',
                iconSize: [iconSize, iconSize],
                iconAnchor: [iconSize/2, iconSize/2]
            }),
            zIndexOffset: 2000 // Ensure plows appear above other markers
        });

        // Create popup with plow details
        const popupContent = `
            <div class="snow-plow-popup" style="min-width: 250px;">
                <h4 style="margin: 0 0 10px 0; color: ${iconColor};">
                    🚜 Snow Plow ${plow.fleetId}
                </h4>
                <div style="margin-bottom: 8px;">
                    <strong>Status:</strong>
                    <span style="
                        padding: 2px 8px;
                        border-radius: 12px;
                        background: ${iconColor}20;
                        color: ${iconColor};
                        font-weight: bold;
                    ">${plow.status.toUpperCase()}</span>
                </div>
                <div style="margin-bottom: 8px;">
                    <strong>Direction:</strong> ${plow.bearing}
                </div>
                <div style="margin-bottom: 8px;">
                    <strong>Last Update:</strong> ${plow.lastUpdateMinutesAgo} minutes ago
                </div>
                <div style="font-size: 11px; color: #666; margin-top: 10px;">
                    Vehicle ID: ${plow.name}
                </div>
            </div>
        `;

        marker.bindPopup(popupContent);
        marker.addTo(this.map);
        this.snowPlowMarkers.set(plow.id, marker);

        // Draw the plow's route if available
        if (plow.route && plow.route.length > 1) {
            const routeLine = L.polyline(plow.route, {
                color: iconColor,
                weight: 3,
                opacity: 0.5,
                dashArray: '5, 10',
                className: 'snow-plow-route'
            });

            routeLine.bindPopup(`
                <div style="font-size: 12px;">
                    <strong>🚜 Plow ${plow.fleetId} Route</strong><br>
                    Recent path traveled
                </div>
            `);

            routeLine.addTo(this.map);
            this.snowPlowRoutes.set(plow.id, routeLine);
        }
    });
}

RoadWeatherMap.prototype.loadMountainPasses = async function() {
    try {
        const response = await fetch('/api/road-weather/mountain-passes');
        if (!response.ok) {
            console.error('Failed to load mountain passes:', response.status);
            return;
        }

        const data = await response.json();
        if (data.success && data.passes) {
            this.renderMountainPasses(data.passes);
        }
    } catch (error) {
        console.error('Error loading mountain passes:', error);
    }
}

RoadWeatherMap.prototype.renderMountainPasses = function(passes) {
    // Clear existing mountain pass markers
    this.mountainPassMarkers.forEach(marker => this.map.removeLayer(marker));
    this.mountainPassMarkers.clear();

    passes.forEach(pass => {
        // Determine icon and color based on pass status
        let iconColor, statusEmoji, statusText;

        switch(pass.status) {
            case 'closed':
                iconColor = '#dc2626'; // Red
                statusEmoji = '🚫';
                statusText = 'CLOSED';
                break;
            case 'hazardous':
                iconColor = '#dc2626'; // Red
                statusEmoji = '⚠️';
                statusText = 'HAZARDOUS';
                break;
            case 'caution':
                iconColor = '#f59e0b'; // Yellow
                statusEmoji = '⚠️';
                statusText = 'CAUTION';
                break;
            case 'windy':
                iconColor = '#3b82f6'; // Blue
                statusEmoji = '💨';
                statusText = 'WINDY';
                break;
            default:
                iconColor = '#10b981'; // Green
                statusEmoji = '✅';
                statusText = 'OPEN';
        }

        // Create mountain pass icon with elevation badge
        const iconHtml = `
            <div style="position: relative;">
                <div style="
                    width: 36px;
                    height: 36px;
                    background: ${iconColor};
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                    border: 2px solid white;
                    font-size: 20px;
                ">⛰️</div>
                <div style="
                    position: absolute;
                    bottom: -5px;
                    left: 50%;
                    transform: translateX(-50%);
                    background: white;
                    border: 1px solid ${iconColor};
                    border-radius: 10px;
                    padding: 1px 4px;
                    font-size: 9px;
                    font-weight: bold;
                    white-space: nowrap;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.2);
                ">${pass.elevation}</div>
            </div>
        `;

        const marker = L.marker([pass.latitude, pass.longitude], {
            icon: L.divIcon({
                html: iconHtml,
                className: 'mountain-pass-marker',
                iconSize: [36, 46],
                iconAnchor: [18, 23]
            }),
            zIndexOffset: 1500 // Above roads but below plows
        });

        // Build detailed popup content
        let weatherInfo = '';
        if (pass.airTemperature || pass.windSpeed || pass.surfaceStatus !== 'Unknown') {
            weatherInfo = `
                <div style="margin: 10px 0; padding: 10px; background: #f8f9fa; border-radius: 4px;">
                    <h5 style="margin: 0 0 8px 0; font-size: 12px; color: #666;">Current Conditions</h5>
                    ${pass.airTemperature ? `<div><strong>Air Temp:</strong> ${unitsSystem.formatTemperature(pass.airTemperature)}</div>` : ''}
                    ${pass.surfaceTemp ? `<div><strong>Surface:</strong> ${unitsSystem.formatTemperature(pass.surfaceTemp)}</div>` : ''}
                    ${pass.surfaceStatus !== 'Unknown' ? `<div><strong>Surface:</strong> ${pass.surfaceStatus}</div>` : ''}
                    ${pass.windSpeed ? `<div><strong>Wind:</strong> ${unitsSystem.formatWindSpeed(pass.windSpeed)} ${pass.windDirection || ''}</div>` : ''}
                    ${pass.windGust ? `<div><strong>Gusts:</strong> ${unitsSystem.formatWindSpeed(pass.windGust)}</div>` : ''}
                    ${pass.visibility ? `<div><strong>Visibility:</strong> ${pass.visibility}</div>` : ''}
                </div>
            `;
        }

        let seasonalInfo = '';
        if (pass.seasonalInfo && pass.seasonalInfo.length > 0) {
            const info = pass.seasonalInfo[0];
            seasonalInfo = `
                <div style="margin: 10px 0; padding: 10px; background: ${info.isClosed ? '#fee2e2' : '#dcfce7'}; border-radius: 4px;">
                    <h5 style="margin: 0 0 8px 0; font-size: 12px; color: #666;">Seasonal Closure</h5>
                    <div style="font-weight: bold; color: ${info.isClosed ? '#dc2626' : '#10b981'};">
                        ${info.status}
                    </div>
                    <div style="font-size: 11px; margin-top: 4px; color: #666;">
                        ${info.description}
                    </div>
                </div>
            `;
        }

        const popupContent = `
            <div class="mountain-pass-popup" style="min-width: 280px; max-width: 350px;">
                <h4 style="margin: 0 0 10px 0; display: flex; align-items: center; gap: 8px;">
                    ⛰️ ${pass.name}
                </h4>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <span style="
                        padding: 4px 12px;
                        border-radius: 12px;
                        background: ${iconColor}20;
                        color: ${iconColor};
                        font-weight: bold;
                        font-size: 12px;
                    ">${statusEmoji} ${statusText}</span>
                    <span style="font-size: 12px; color: #666;">
                        Elev: ${pass.elevation}
                    </span>
                </div>
                <div style="margin-bottom: 8px;">
                    <strong>Highway:</strong> ${pass.roadway}
                </div>
                ${weatherInfo}
                ${seasonalInfo}
                ${pass.stationName ? `
                    <div style="font-size: 11px; color: #999; margin-top: 10px;">
                        Data from: ${pass.stationName}
                    </div>
                ` : ''}
            </div>
        `;

        marker.bindPopup(popupContent, {
            maxWidth: 350
        });

        marker.addTo(this.map);
        this.mountainPassMarkers.set(pass.id, marker);
    });
}

RoadWeatherMap.prototype.loadRestAreas = async function() {
    try {
        const response = await fetch('/api/road-weather/rest-areas');
        if (!response.ok) {
            console.error('Failed to load rest areas:', response.status);
            return;
        }

        const data = await response.json();
        if (data.success && data.restAreas) {
            this.renderRestAreas(data.restAreas);
        }
    } catch (error) {
        console.error('Error loading rest areas:', error);
    }
}

RoadWeatherMap.prototype.renderRestAreas = function(restAreas) {
    // Clear existing rest area markers
    this.restAreaMarkers.forEach(marker => this.map.removeLayer(marker));
    this.restAreaMarkers.clear();

    restAreas.forEach(restArea => {
        // Create rest area icon with stall count indicator
        const iconHtml = `
            <div style="position: relative;">
                <div style="
                    width: 32px;
                    height: 32px;
                    background: #059669;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                    border: 2px solid white;
                    font-size: 18px;
                ">🅿️</div>
                ${restArea.totalStalls > 0 ? `
                    <div style="
                        position: absolute;
                        bottom: -3px;
                        right: -3px;
                        background: #dc2626;
                        color: white;
                        border-radius: 10px;
                        padding: 1px 4px;
                        font-size: 9px;
                        font-weight: bold;
                        min-width: 16px;
                        text-align: center;
                        box-shadow: 0 1px 3px rgba(0,0,0,0.3);
                    ">${restArea.totalStalls}</div>
                ` : ''}
            </div>
        `;

        const marker = L.marker([restArea.lat, restArea.lng], {
            icon: L.divIcon({
                html: iconHtml,
                className: 'rest-area-marker',
                iconSize: [36, 36],
                iconAnchor: [18, 18]
            }),
            zIndexOffset: 1200 // Above roads but below most other markers
        });

        // Build detailed popup content
        let facilitiesInfo = '';
        if (restArea.carStalls > 0 || restArea.truckStalls > 0) {
            facilitiesInfo = `
                <div style="margin: 10px 0; padding: 10px; background: #f8f9fa; border-radius: 4px;">
                    <h5 style="margin: 0 0 8px 0; font-size: 12px; color: #666;">Parking Facilities</h5>
                    ${restArea.carStalls > 0 ? `<div><strong>Car Stalls:</strong> ${restArea.carStalls}</div>` : ''}
                    ${restArea.truckStalls > 0 ? `<div><strong>Truck Stalls:</strong> ${restArea.truckStalls}</div>` : ''}
                    <div><strong>Total:</strong> ${restArea.totalStalls} stalls</div>
                </div>
            `;
        }

        let imageSection = '';
        if (restArea.imageUrl && restArea.imageUrl !== '') {
            imageSection = `
                <div class="rest-area-image" style="margin: 10px 0;">
                    <img src="${restArea.imageUrl}"
                         alt="${restArea.name}"
                         style="max-width: 280px; width: 100%; height: auto; border-radius: 4px; cursor: pointer;"
                         onclick="window.open('${restArea.imageUrl}', '_blank')"
                         onerror="this.style.display='none'">
                </div>
            `;
        }

        const popupContent = `
            <div class="rest-area-popup" style="min-width: 250px; max-width: 300px;">
                <h4 style="margin: 0 0 10px 0; display: flex; align-items: center; gap: 8px;">
                    🅿️ ${restArea.name}
                </h4>
                <div style="margin-bottom: 8px;">
                    <strong>Location:</strong> ${restArea.location}
                </div>
                ${restArea.yearBuilt ? `
                    <div style="margin-bottom: 8px;">
                        <strong>Year Built:</strong> ${restArea.yearBuilt}
                    </div>
                ` : ''}
                ${facilitiesInfo}
                ${restArea.nearestCommunities ? `
                    <div style="margin: 10px 0; font-size: 11px; color: #666;">
                        <strong>Nearest Communities:</strong><br>
                        ${restArea.nearestCommunities}
                    </div>
                ` : ''}
                ${imageSection}
                <div style="font-size: 11px; color: #999; margin-top: 10px;">
                    UDOT Rest Area
                </div>
            </div>
        `;

        marker.bindPopup(popupContent, {
            maxWidth: 320
        });

        marker.addTo(this.map);
        this.restAreaMarkers.set(restArea.id, marker);
    });
}

RoadWeatherMap.prototype.approximateHighwayCoordinates = function(highway, mpStart, mpEnd) {
        // Approximate coordinates for major Uintah Basin highways
        // These are rough approximations based on known highway routes
        const highwayRoutes = {
            'US-40': {
                // US-40 runs east-west through Uintah Basin
                startLat: 40.2999, startLng: -109.9890, // Roosevelt area
                endLat: 40.4555, endLng: -109.5287,     // Vernal area
                direction: 'ew'
            },
            'US-191': {
                // US-191 calibrated using actual UDOT traffic event coordinates
                // MP 272: Lat 39.926392, Lng -110.680996
                // MP 285: Lat 40.060614, Lng -110.520283
                // MP 364-368: Lat 40.609466, Lng -109.470841
                // Helper/US-6 intersection is around MP 252-253 area
                startLat: 39.9, startLng: -110.75,       // Closer to Helper/US-6 intersection
                endLat: 40.6095, endLng: -109.4708,      // North of Vernal (MP ~370)
                direction: 'ns',
                mpRange: { start: 250, end: 370 },       // Milepost range
                knownPoints: [
                    { mp: 252, lat: 39.9, lng: -110.75 },    // Estimated Helper/US-6 area
                    { mp: 272, lat: 39.926392, lng: -110.680996 },
                    { mp: 285, lat: 40.060614, lng: -110.520283 },
                    { mp: 365, lat: 40.609466, lng: -109.470841 }
                ]
            }
        };

        const route = highwayRoutes[highway];
        if (!route) return [];

        // Create coordinates based on milepost positioning if available
        const coords = [];

        if (route.mpRange) {
            let startLat, startLng, endLat, endLng;

            if (route.knownPoints && route.knownPoints.length >= 2) {
                // Use interpolation between known points for better accuracy
                startLat = this.interpolateLatLng(mpStart, route.knownPoints, 'lat');
                startLng = this.interpolateLatLng(mpStart, route.knownPoints, 'lng');
                endLat = this.interpolateLatLng(mpEnd, route.knownPoints, 'lat');
                endLng = this.interpolateLatLng(mpEnd, route.knownPoints, 'lng');
            } else {
                // Fallback to simple linear interpolation
                const totalMpRange = route.mpRange.end - route.mpRange.start;
                const startRatio = (mpStart - route.mpRange.start) / totalMpRange;
                const endRatio = (mpEnd - route.mpRange.start) / totalMpRange;

                startLat = route.startLat + (route.endLat - route.startLat) * startRatio;
                startLng = route.startLng + (route.endLng - route.startLng) * startRatio;
                endLat = route.startLat + (route.endLat - route.startLat) * endRatio;
                endLng = route.startLng + (route.endLng - route.startLng) * endRatio;
            }

            // Create multiple points for smooth line
            const steps = Math.max(2, Math.abs(mpEnd - mpStart));
            for (let i = 0; i <= steps; i++) {
                const ratio = i / steps;
                const lat = startLat + (endLat - startLat) * ratio;
                const lng = startLng + (endLng - startLng) * ratio;
                coords.push([lat, lng]);
            }
        } else {
            // Fallback to simple interpolation
            const steps = Math.max(2, Math.abs(mpEnd - mpStart));
            for (let i = 0; i <= steps; i++) {
                const ratio = i / steps;
                const lat = route.startLat + (route.endLat - route.startLat) * ratio;
                const lng = route.startLng + (route.endLng - route.startLng) * ratio;
                coords.push([lat, lng]);
            }
        }

        return coords;
    }

RoadWeatherMap.prototype.interpolateLatLng = function(targetMp, knownPoints, coordType) {
        // Sort points by milepost
        const sortedPoints = knownPoints.sort((a, b) => a.mp - b.mp);

        // If target is outside the range, extrapolate
        if (targetMp <= sortedPoints[0].mp) {
            return sortedPoints[0][coordType];
        }
        if (targetMp >= sortedPoints[sortedPoints.length - 1].mp) {
            return sortedPoints[sortedPoints.length - 1][coordType];
        }

        // Find the two points to interpolate between
        for (let i = 0; i < sortedPoints.length - 1; i++) {
            const point1 = sortedPoints[i];
            const point2 = sortedPoints[i + 1];

            if (targetMp >= point1.mp && targetMp <= point2.mp) {
                // Linear interpolation
                const ratio = (targetMp - point1.mp) / (point2.mp - point1.mp);
                return point1[coordType] + (point2[coordType] - point1[coordType]) * ratio;
            }
        }

        // Fallback (should not reach here)
        return sortedPoints[0][coordType];
    }

// Removed duplicate clearLayers method - using instance method instead

function initEmmaEasterEgg() {
    const toggle = document.getElementById('easter-egg-toggle');
    const content = document.getElementById('easter-egg-content');
    const icon = document.getElementById('toggle-icon');

    if (toggle && content && icon) {
        toggle.addEventListener('click', () => {
            const isActive = toggle.classList.contains('active');

            if (isActive) {
                toggle.classList.remove('active');
                content.classList.remove('active');
            } else {
                toggle.classList.add('active');
                content.classList.add('active');
            }
        });
    }
}

// Traffic Events Tab System
class TrafficEventsManager {
    constructor() {
        this.currentTab = 'active';
        this.eventsData = {
            active: [],
            upcoming: [],
            all: []
        };
        this.init();
    }

    init() {
        this.initTabButtons();
        this.loadAllEventsData();
        this.loadAlerts();
        this.startAutoRefresh();
    }

    initTabButtons() {
        const tabButtons = document.querySelectorAll('.tab-btn');
        tabButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tabName = e.target.dataset.tab;
                this.switchTab(tabName);
            });
        });
    }

    switchTab(tabName) {
        // Update active tab button
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

        // Update active tab content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(`${tabName}-events`).classList.add('active');

        this.currentTab = tabName;
        this.displayEvents(tabName);
    }

    async loadAllEventsData() {
        try {
            const [activeResponse, upcomingResponse, allResponse] = await Promise.all([
                fetch('/api/traffic-events/active'),
                fetch('/api/traffic-events/upcoming'),
                fetch('/api/traffic-events')
            ]);

            if (activeResponse.ok) {
                const activeData = await activeResponse.json();
                this.eventsData.active = activeData.events || [];
            }

            if (upcomingResponse.ok) {
                const upcomingData = await upcomingResponse.json();
                this.eventsData.upcoming = upcomingData.events || [];
            }

            if (allResponse.ok) {
                const allData = await allResponse.json();
                this.eventsData.all = allData.events || [];
            }

            this.displayEvents(this.currentTab);
        } catch (error) {
            console.error('Error loading traffic events data:', error);
            this.showError('Failed to load traffic events');
        }
    }

    displayEvents(tabName) {
        const container = document.getElementById(`${tabName}-events`);
        const events = this.eventsData[tabName];

        if (!container) {
            console.error(`TrafficEventsManager: Container not found for tab: ${tabName}`);
            return;
        }

        if (events.length === 0) {
            container.innerHTML = `
                <div class="no-events" style="text-align: center; padding: 40px; color: #666;">
                    <i class="fas fa-check-circle" style="font-size: 48px; margin-bottom: 16px; color: #10b981;"></i>
                    <h3 style="margin: 0 0 8px 0;">No ${tabName} events</h3>
                    <p style="margin: 0;">All clear on Uintah Basin roads!</p>
                </div>
            `;
            return;
        }

        const eventsHtml = events.map(event => this.createEventCard(event)).join('');
        container.innerHTML = `<div class="events-list">${eventsHtml}</div>`;
    }

    createEventCard(event) {
        const startDate = new Date(event.startDate);
        const endDate = event.plannedEndDate ? new Date(event.plannedEndDate) : null;
        const now = new Date();

        let statusClass = 'status-info';
        let statusText = 'Scheduled';

        if (startDate <= now && (!endDate || endDate >= now)) {
            statusClass = 'status-active';
            statusText = 'Active';
        } else if (endDate && endDate < now) {
            statusClass = 'status-completed';
            statusText = 'Completed';
        }

        return `
            <div class="event-card" style="
                border: 1px solid #e5e7eb;
                border-radius: 8px;
                padding: 16px;
                margin-bottom: 16px;
                background: white;
                box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            ">
                <div class="event-header" style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
                    <div class="event-title" style="flex: 1;">
                        <h4 style="margin: 0 0 4px 0; color: ${event.displayColor}; display: flex; align-items: center; gap: 8px;">
                            ${event.displayIcon} ${event.name || event.description.substring(0, 60)}
                            ${event.isFullClosure ? '<span style="background: #dc2626; color: white; font-size: 10px; padding: 2px 6px; border-radius: 12px; margin-left: 8px;">CLOSURE</span>' : ''}
                        </h4>
                        <p style="margin: 0; color: #666; font-size: 14px;">${event.roadwayName}</p>
                    </div>
                    <div class="event-status">
                        <span class="${statusClass}" style="
                            padding: 4px 8px;
                            border-radius: 12px;
                            font-size: 12px;
                            font-weight: 500;
                        ">${statusText}</span>
                        <div style="text-align: right; margin-top: 4px; font-size: 11px; color: #999;">
                            Priority: ${event.priority}/10
                        </div>
                    </div>
                </div>

                <div class="event-description" style="margin-bottom: 12px;">
                    <p style="margin: 0; font-size: 14px; line-height: 1.4;">${event.description}</p>
                </div>

                <div class="event-details" style="
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 12px;
                    font-size: 12px;
                    color: #666;
                ">
                    <div>
                        <strong>Type:</strong> ${event.eventType.replace(/([A-Z])/g, ' $1').trim()}
                    </div>
                    <div>
                        <strong>Severity:</strong> ${event.severity || 'Unknown'}
                    </div>
                    <div>
                        <strong>Start:</strong> ${startDate.toLocaleDateString()} ${startDate.toLocaleTimeString()}
                    </div>
                    <div>
                        <strong>End:</strong> ${endDate ? `${endDate.toLocaleDateString()} ${endDate.toLocaleTimeString()}` : 'TBD'}
                    </div>
                </div>

                ${event.comment ? `
                    <div class="event-comment" style="
                        margin-top: 12px;
                        padding: 8px;
                        background: #f8f9fa;
                        border-radius: 4px;
                        font-size: 13px;
                        color: #555;
                    ">
                        <strong>Additional Info:</strong> ${event.comment}
                    </div>
                ` : ''}
            </div>
        `;
    }

    showError(message) {
        const activeContainer = document.getElementById('active-events');
        if (activeContainer) {
            activeContainer.innerHTML = `
                <div class="events-error" style="text-align: center; padding: 40px; color: #dc2626;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 48px; margin-bottom: 16px;"></i>
                    <h3 style="margin: 0 0 8px 0;">Error Loading Events</h3>
                    <p style="margin: 0;">${message}</p>
                    <button onclick="trafficEventsManager.loadAllEventsData()"
                            style="margin-top: 16px; padding: 8px 16px; background: #dc2626; color: white; border: none; border-radius: 4px; cursor: pointer;">
                        Retry
                    </button>
                </div>
            `;
        }
    }

    async loadAlerts() {
        try {
            const [alertsResponse, signsResponse] = await Promise.all([
                fetch('/api/alerts'),
                fetch('/api/road-weather/digital-signs')
            ]);

            if (!alertsResponse.ok) {
                throw new Error(`Alerts HTTP ${alertsResponse.status}`);
            }

            const alertsData = await alertsResponse.json();
            let digitalSigns = [];

            // Digital signs are optional - don't fail if unavailable
            if (signsResponse.ok) {
                const signsData = await signsResponse.json();
                if (signsData.success && signsData.signs) {
                    digitalSigns = signsData.signs;
                }
            }

            if (alertsData.success && alertsData.alerts) {
                this.displayAlertsAndSigns(alertsData.alerts, digitalSigns);
            } else {
                throw new Error('Invalid response format');
            }
        } catch (error) {
            console.error('Error loading alerts:', error);
            this.showAlertsError('Failed to load alerts');
        }
    }

    displayAlertsAndSigns(alerts, digitalSigns = []) {
        const container = document.getElementById('alerts-container');
        if (!container) {
            console.error('TrafficEventsManager: Alerts container not found');
            return;
        }

        // Filter digital signs by priority - show high priority (1-2) messages first
        const prioritySigns = digitalSigns.filter(sign => sign.priority <= 2).slice(0, 5);

        if (alerts.length === 0 && prioritySigns.length === 0) {
            container.innerHTML = `
                <div class="no-alerts">
                    <i class="fas fa-check-circle"></i>
                    <h4>No Active Alerts</h4>
                    <p>All clear - no UDOT alerts or digital sign messages for the region.</p>
                </div>
            `;
            return;
        }

        let content = '';

        // Add alerts first
        if (alerts.length > 0) {
            const alertsHtml = alerts.map(alert => this.createAlertCard(alert)).join('');
            content += `<div class="alerts-list">${alertsHtml}</div>`;
        }

        // Add digital signs section
        if (prioritySigns.length > 0) {
            const signsHtml = prioritySigns.map(sign => this.createDigitalSignCard(sign)).join('');
            content += `
                <div class="digital-signs-section">
                    <h4 style="margin: 1.5rem 0 1rem 0; padding-left: 1rem; color: #1e40af;">
                        <i class="fas fa-sign"></i> Digital Highway Signs
                    </h4>
                    <div class="signs-list">${signsHtml}</div>
                </div>
            `;
        }

        container.innerHTML = content;
    }

    displayAlerts(alerts) {
        // Backward compatibility - call the new method with empty signs
        this.displayAlertsAndSigns(alerts, []);
    }

    createAlertCard(alert) {
        const startDate = new Date(alert.startTime);
        const endDate = alert.endTime ? new Date(alert.endTime) : null;

        return `
            <div class="alert-card ${alert.severity}-importance">
                <div class="alert-header">
                    <div class="alert-info">
                        <span class="alert-severity ${alert.severity}">${alert.severity}</span>
                        ${alert.highImportance ? '<i class="fas fa-exclamation-triangle" style="color: #dc2626; margin-left: 8px;" title="High Importance"></i>' : ''}
                        ${alert.sendNotification ? '<i class="fas fa-bell" style="color: #f59e0b; margin-left: 4px;" title="Notification Alert"></i>' : ''}
                    </div>
                </div>

                <div class="alert-message">
                    ${alert.message}
                </div>

                ${alert.notes ? `
                    <div class="alert-notes">
                        <strong>Additional Info:</strong> ${alert.notes}
                    </div>
                ` : ''}

                <div class="alert-times">
                    <span><strong>Started:</strong> ${startDate.toLocaleString()}</span>
                    ${endDate ? `<span><strong>Ends:</strong> ${endDate.toLocaleString()}</span>` : '<span><strong>End:</strong> TBD</span>'}
                </div>

                ${alert.regions && alert.regions.length > 0 ? `
                    <div class="alert-regions">
                        <strong>Regions:</strong> ${alert.regions.join(', ')}
                    </div>
                ` : ''}
            </div>
        `;
    }

    createDigitalSignCard(sign) {
        // Get category icon
        const categoryIcon = {
            'construction': 'fas fa-hard-hat',
            'incident': 'fas fa-exclamation-triangle',
            'weather': 'fas fa-cloud-snow',
            'closure': 'fas fa-road-barrier',
            'traffic': 'fas fa-traffic-light',
            'advisory': 'fas fa-info-circle'
        }[sign.category] || 'fas fa-sign';

        // Get priority styling
        const priorityClass = sign.priority === 1 ? 'high-priority' : 'medium-priority';
        const priorityLabel = sign.priority === 1 ? 'High' : sign.priority === 2 ? 'Medium' : 'Low';

        return `
            <div class="digital-sign-card ${priorityClass}">
                <div class="sign-header">
                    <div class="sign-info">
                        <i class="${categoryIcon}" style="color: #1e40af; margin-right: 8px;"></i>
                        <span class="sign-location">${sign.location}</span>
                        <span class="sign-priority ${priorityClass}">${priorityLabel} Priority</span>
                    </div>
                    <div class="sign-category">${sign.category.charAt(0).toUpperCase() + sign.category.slice(1)}</div>
                </div>

                <div class="sign-message">
                    ${sign.message}
                </div>

                <div class="sign-details">
                    <span><strong>Highway:</strong> ${sign.roadway}</span>
                    <span><strong>Direction:</strong> ${sign.direction}</span>
                    ${sign.distance ? `<span><strong>Distance:</strong> ${unitsSystem.formatVisibility(sign.distance)}</span>` : ''}
                </div>
            </div>
        `;
    }

    showAlertsError(message) {
        const container = document.getElementById('alerts-container');
        if (container) {
            container.innerHTML = `
                <div style="text-align: center; padding: 2rem; color: #dc2626;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 2rem; margin-bottom: 1rem;"></i>
                    <h4 style="margin: 0 0 0.5rem 0;">Error Loading Alerts</h4>
                    <p style="margin: 0;">${message}</p>
                </div>
            `;
        }
    }

    startAutoRefresh() {
        // Refresh every 5 minutes
        setInterval(() => {
            this.loadAllEventsData();
            this.loadAlerts();
        }, 300000);
    }
}

// Initialize everything when page loads
// Variables already declared above, no need to redeclare
let trafficEventsManager;

// Route Conditions Functions
async function loadRouteConditions() {
    await Promise.all([
        loadUS40Conditions(),
        loadUS191Conditions(),
        loadBasinRoadsConditions()
    ]);
}

async function loadUS40Conditions() {
    const container = document.getElementById('us40-conditions');
    if (!container) return;

    try {
        // Get weather stations and traffic events for US-40 (original API calls)
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

async function loadUS191Conditions() {
    const container = document.getElementById('us191-conditions');
    if (!container) return;

    try {
        // Get weather stations and traffic events for US-191 (original API calls)
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

// Basin Roads Carousel Data
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

async function loadBasinRoadsConditions() {
    const container = document.getElementById('basin-roads-conditions');
    if (!container) return;

    try {
        // Get weather stations and traffic events for Basin Roads (original API calls)
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

function initializeRoadCarousel(stationsData, eventsData) {
    // Remove loading state
    const container = document.getElementById('basin-roads-conditions');
    container.innerHTML = '';

    // Setup carousel indicators
    const indicatorsContainer = document.getElementById('carousel-indicators');
    indicatorsContainer.innerHTML = basinRoads.map((_, index) =>
        `<div class="carousel-indicator ${index === 0 ? 'active' : ''}" data-index="${index}"></div>`
    ).join('');

    // Add event listeners for manual controls
    document.getElementById('prev-road').addEventListener('click', () => {
        previousRoad(stationsData, eventsData);
    });

    document.getElementById('next-road').addEventListener('click', () => {
        nextRoad(stationsData, eventsData);
    });

    // Add indicator click handlers
    indicatorsContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('carousel-indicator')) {
            const index = parseInt(e.target.dataset.index);
            showRoad(index, stationsData, eventsData);
        }
    });

    // Show first road and start auto-rotation
    showRoad(0, stationsData, eventsData);
    startAutoRotation(stationsData, eventsData);
}

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

function filterEventsForRoad(events, road) {
    return events.filter(event => {
        if (!event.roadwayName) return false;
        const roadwayName = event.roadwayName.toLowerCase();

        return road.keywords.some(keyword =>
            roadwayName.includes(keyword.toLowerCase())
        ) || roadwayName.includes(road.shortName.toLowerCase());
    });
}

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

function previousRoad(stationsData, eventsData) {
    resetAutoRotation(stationsData, eventsData);
    const newIndex = currentRoadIndex === 0 ? basinRoads.length - 1 : currentRoadIndex - 1;
    showRoad(newIndex, stationsData, eventsData);
}

function nextRoad(stationsData, eventsData) {
    resetAutoRotation(stationsData, eventsData);
    const newIndex = currentRoadIndex === basinRoads.length - 1 ? 0 : currentRoadIndex + 1;
    showRoad(newIndex, stationsData, eventsData);
}

function startAutoRotation(stationsData, eventsData) {
    autoRotateTimer = setInterval(() => {
        const nextIndex = currentRoadIndex === basinRoads.length - 1 ? 0 : currentRoadIndex + 1;
        showRoad(nextIndex, stationsData, eventsData);
    }, 30000); // 30 seconds
}

function resetAutoRotation(stationsData, eventsData) {
    if (autoRotateTimer) {
        clearInterval(autoRotateTimer);
        startAutoRotation(stationsData, eventsData);
    }
}

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

function displayRouteConditions(container, data) {
    const { routeName, stations, events, cities } = data;

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
                <h4><i class="fas fa-exclamation-triangle"></i> Current Incidents on ${routeName}</h4>
                ${events.slice(0, 3).map(event => `
                    <div class="incident-item ${event.eventType === 'construction' ? 'construction' : ''}">
                        <strong>${event.eventType?.toUpperCase() || 'INCIDENT'}:</strong> ${event.description || event.message}
                        ${event.location ? `<br><small>📍 ${event.location}</small>` : ''}
                    </div>
                `).join('')}
                ${events.length > 3 ? `<small>... and ${events.length - 3} more incidents</small>` : ''}
            </div>
        ` : `
            <div class="route-incidents">
                <div class="no-incidents">✅ No current incidents reported on ${routeName}</div>
            </div>
        `}
    `;

    container.innerHTML = html;
}

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

function getTemperatureStatus(temp) {
    if (temp === '--') return 'caution';
    if (temp <= 32) return 'poor';
    if (temp <= 40) return 'caution';
    return 'good';
}

function getTemperatureStatusText(temp) {
    if (temp === '--') return 'No Data';
    if (temp <= 32) return 'Freezing';
    if (temp <= 40) return 'Cold';
    return 'Mild';
}

function displayErrorState(container, message) {
    container.innerHTML = `
        <div class="conditions-loading">
            <i class="fas fa-exclamation-triangle"></i>
            <p>${message}</p>
        </div>
    `;
}

// Units Toggle Functionality
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

function refreshUnitsDisplays() {
    // Refresh condition cards on the map
    updateConditionCards();

    // Update default unit labels in HTML
    const roadTempCard = document.querySelector('.condition-card-compact.road-temp .value');
    if (roadTempCard && roadTempCard.textContent.includes('--')) {
        roadTempCard.textContent = `--${unitsSystem.getTempUnit()}`;
    }

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

// Smart refresh functions that use cached data instead of reloading everything
async function smartRefreshRoutes() {
    // Close any open popups to avoid stale unit displays
    if (window.roadMap && window.roadMap.map) {
        window.roadMap.map.closePopup();
    }

    // Get cached data (or refresh if needed)
    const data = await routeDataCache.getData();
    if (!data) {
        console.error('Failed to get route data for units refresh');
        return;
    }

    // Refresh each route section with cached data and new units
    await Promise.all([
        smartRefreshUS40(data),
        smartRefreshUS191(data),
        smartRefreshBasinRoads(data),
        smartRefreshAlerts()
    ]);

    // Refresh map components that show units (but reuse existing markers)
    if (window.roadMap) {
        // Only refresh station popups, not reload all data
        refreshStationPopups();

        // Reload mountain passes with new units (these come from different API)
        window.roadMap.loadMountainPasses();
    }
}

async function smartRefreshUS40(data) {
    const container = document.getElementById('us40-conditions');
    if (!container) return;

    try {
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

async function smartRefreshUS191(data) {
    const container = document.getElementById('us191-conditions');
    if (!container) return;

    try {
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

async function smartRefreshAlerts() {
    // Only refresh digital signs that show distance units
    const container = document.getElementById('alerts-container');
    if (!container) return;

    try {
        // Re-fetch digital signs data to refresh any distance displays
        const signsResponse = await fetch('/api/road-weather/digital-signs');
        if (signsResponse.ok) {
            const signsData = await signsResponse.json();
            if (signsData.success && signsData.signs) {
                // Update any visible digital signs with new distance units
                const signCards = container.querySelectorAll('.digital-sign-card');
                signCards.forEach((card, index) => {
                    const sign = signsData.signs[index];
                    if (sign && sign.distance) {
                        const distanceSpan = card.querySelector('.sign-details span:last-child');
                        if (distanceSpan && distanceSpan.textContent.includes('Distance:')) {
                            distanceSpan.innerHTML = `<strong>Distance:</strong> ${unitsSystem.formatVisibility(sign.distance)}`;
                        }
                    }
                });
            }
        }
    } catch (error) {
        console.error('Error refreshing digital signs for units:', error);
    }
}

function refreshStationPopups() {
    // Refresh any open weather station popups with new units
    if (window.roadMap && window.roadMap.stationMarkers) {
        window.roadMap.stationMarkers.forEach((marker, stationId) => {
            if (marker.isPopupOpen()) {
                marker.closePopup();
            }
        });
    }
}

// Initialize units toggle when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    initializeUnitsToggle();
});

// Initialization moved to the first DOMContentLoaded listener above

