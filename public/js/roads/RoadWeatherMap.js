/**
 * Road Weather Map Module
 * Main map class with UDOT, NWS, and Open-Meteo integration
 * Handles weather stations, cameras, traffic events, snow plows, mountain passes, rest areas
 * Extracted from roads.js as part of refactoring
 */

// Road Weather Map with UDOT, NWS, and Open-Meteo integration
class RoadWeatherMap {
    constructor(mapElementId, options = {}) {
        this.mapElement = document.getElementById(mapElementId);
        this.options = {
            center: options.center || [40.15, -110.1],
            zoom: options.zoom || 8,
            // refreshInterval: options.refreshInterval || 300000, // No longer needed - server handles refresh
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
        this.weatherStationsVisible = false;
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

        // Add zoom event listener for camera clustering
        this.map.on('zoomend', () => {
            this.updateCameraVisibility();
        });
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

        // Add camera-specific information with confidence taxonomy
        if (isCameraMonitored && segment.detectionData) {
            const detection = segment.detectionData;

            // Get confidence level info (if available from API, otherwise fallback)
            let confidenceBadge = '';
            if (detection.confidenceLevel) {
                const level = detection.confidenceLevel;
                confidenceBadge = `<span class="confidence-badge confidence-${level.badge}"
                                         style="background-color: ${level.color}; color: white; padding: 2px 8px; border-radius: 4px; font-size: 0.85em;"
                                         title="${level.name}: Based on camera analysis and temperature data">
                                        ${level.icon} ${level.displayText}
                                    </span>`;
            } else {
                // Fallback to simple percentage display
                confidenceBadge = `${Math.round(detection.confidence * 100)}%`;
            }

            popupContent += `
                <div class="camera-detection-info">
                    <p><strong>Snow Level:</strong> ${detection.snowLevel}</p>
                    <p><strong>Confidence:</strong> ${confidenceBadge}</p>
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
                        if (weatherData.current.visibility !== null && weatherData.current.visibility !== undefined) {
                            locationData.visibility = weatherData.current.visibility;
                            locationData.visibilityUnit = 'm';
                        }
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

        if (this.weatherStationsVisible) {
            marker.addTo(this.map);
        }
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
                         onclick="window.mapStateManager.navigateToWebcam('${camera.id}', window.roadWeatherMap?.map)"
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
                            if (weatherData.current.visibility !== null && weatherData.current.visibility !== undefined) {
                                locationData.visibility = weatherData.current.visibility;
                                locationData.visibilityUnit = 'm';
                            }
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

            // Store camera reference with marker for density calculation
            marker.camera = camera;

            this.cameraMarkers.set(camera.id, marker);
        });

        // Initial visibility update based on current zoom
        this.updateCameraVisibility();
    }

    /**
     * Update camera visibility based on current zoom level
     * Called on zoomend event and after rendering cameras
     */
    updateCameraVisibility() {
        if (!this.map || this.cameraMarkers.size === 0) return;

        const zoom = this.map.getZoom();
        const cameras = Array.from(this.cameraMarkers.values());

        cameras.forEach(marker => {
            const shouldShow = this.shouldShowCamera(marker.camera, zoom);

            if (shouldShow && !this.map.hasLayer(marker)) {
                marker.addTo(this.map);
            } else if (!shouldShow && this.map.hasLayer(marker)) {
                this.map.removeLayer(marker);
            }
        });
    }

    /**
     * Determine if a camera should be visible at the current zoom level
     * @param {Object} camera - Camera object with lat/lng
     * @param {number} zoom - Current map zoom level
     * @returns {boolean} - True if camera should be visible
     */
    shouldShowCamera(camera, zoom) {
        // Always show all cameras when fully zoomed in
        if (zoom >= 12) return true;

        // Calculate density if not already cached
        if (camera._density === undefined) {
            const allCameras = Array.from(this.cameraMarkers.values())
                .map(m => m.camera);
            camera._density = this.calculateCameraDensity(camera, allCameras);
        }

        // High zoom (11): Show most cameras
        if (zoom >= 11) {
            if (camera._density < 3) return true;
            if (camera._density < 6) return Math.random() < 0.7;
            return Math.random() < 0.5;
        }

        // Medium zoom (10): Show ~40% - more aggressive filtering
        if (zoom >= 10) {
            // Show isolated cameras only
            if (camera._density < 2) return true;
            // Show 30% of low-density clusters
            if (camera._density < 4) return Math.random() < 0.3;
            // Show 15% of high-density clusters
            return Math.random() < 0.15;
        }

        // Default zoom (9): Show ~25% - very aggressive
        if (zoom >= 9) {
            // Only show isolated cameras
            if (camera._density < 2) return true;
            // Show 20% of any clusters
            return Math.random() < 0.2;
        }

        // Low zoom (<9): Show cluster representatives only (~15%)
        // Show only very isolated cameras
        if (camera._density < 1) return true;
        // Show 10% of anything else
        return Math.random() < 0.1;
    }

    /**
     * Calculate camera density (number of nearby cameras within radius)
     * @param {Object} camera - Camera object with lat/lng
     * @param {Array} allCameras - Array of all camera objects
     * @param {number} radiusKm - Search radius in kilometers (default: 5km)
     * @returns {number} - Count of nearby cameras
     */
    calculateCameraDensity(camera, allCameras, radiusKm = 5) {
        let nearbyCount = 0;

        for (const other of allCameras) {
            if (camera.id === other.id) continue;

            const distance = this.haversineDistance(
                { lat: camera.lat, lng: camera.lng },
                { lat: other.lat, lng: other.lng }
            );

            if (distance < radiusKm) {
                nearbyCount++;
            }
        }

        return nearbyCount;
    }

    /**
     * Calculate distance between two coordinates using Haversine formula
     * @param {Object} coord1 - First coordinate {lat, lng}
     * @param {Object} coord2 - Second coordinate {lat, lng}
     * @returns {number} - Distance in kilometers
     */
    haversineDistance(coord1, coord2) {
        const R = 6371; // Earth radius in kilometers
        const dLat = (coord2.lat - coord1.lat) * Math.PI / 180;
        const dLng = (coord2.lng - coord1.lng) * Math.PI / 180;

        const a = Math.sin(dLat / 2) ** 2 +
                  Math.cos(coord1.lat * Math.PI / 180) *
                  Math.cos(coord2.lat * Math.PI / 180) *
                  Math.sin(dLng / 2) ** 2;

        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
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
                        <div class="legend-section">
                            <h5>Layer Toggles</h5>
                            <label class="legend-toggle-item">
                                <input type="checkbox" id="toggle-weather-stations">
                                <span>🌡️ Weather Stations</span>
                            </label>
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

                const stationToggle = document.getElementById('toggle-weather-stations');
                if (stationToggle) {
                    stationToggle.addEventListener('change', (e) => {
                        this.toggleWeatherStations(e.target.checked);
                    });
                }
            }, 100);

            return div;
        };

        legend.addTo(this.map);
    }

    toggleWeatherStations(visible) {
        this.weatherStationsVisible = visible;
        this.stationMarkers.forEach(marker => {
            if (visible) {
                marker.addTo(this.map);
            } else {
                this.map.removeLayer(marker);
            }
        });
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
        // Auto-refresh disabled - server now refreshes UDOT data in background
        // Users always get cached data, preventing API spam and rate limit violations
        // Manual refresh still works via refresh button
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
                         onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">
                    <div style="display: none; padding: 10px; background: #f3f4f6; border-radius: 4px; text-align: center; font-size: 12px; color: #6b7280;">
                        Rest area image unavailable
                    </div>
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

// TrafficEventsManager class moved to /public/js/roads/TrafficEventsManager.js

let trafficEventsManager;

// Route conditions functions moved to /public/js/roads/RouteConditions.js


// Utility functions moved to /public/js/roads/utils.js

// Units Toggle Functionality
