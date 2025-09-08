// Road Weather Map with UDOT, NWS, and Open-Meteo integration
class RoadWeatherMap {
    constructor(mapElementId, options = {}) {
        this.mapElement = document.getElementById(mapElementId);
        this.options = {
            center: options.center || [40.3033, -109.7],
            zoom: options.zoom || 10,
            refreshInterval: options.refreshInterval || 300000,
            ...options
        };
        
        this.map = null;
        this.roadLayers = new Map();
        this.stationMarkers = new Map();
        this.cameraMarkers = new Map();
        this.refreshTimer = null;
    }

    init() {
        this.initMap();
        this.addLegend();
        this.loadRoadWeatherData();
        this.startAutoRefresh();
        return this;
    }

    initMap() {
        this.map = L.map(this.mapElement, {
            zoomControl: true,
            scrollWheelZoom: true
        }).setView(this.options.center, this.options.zoom);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 15,
            minZoom: 8,
            attribution: '© OpenStreetMap | Road Data: UDOT, NWS, Open-Meteo'
        }).addTo(this.map);
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
            this.renderStation(station);
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

        // Format temperature values
        const airTemp = station.airTemperature ? `${parseFloat(station.airTemperature).toFixed(1)}°F` : '--';
        const surfaceTemp = station.surfaceTemp ? `${parseFloat(station.surfaceTemp).toFixed(1)}°F` : '--';
        const humidity = station.relativeHumidity ? `${station.relativeHumidity}%` : '--';
        const windSpeed = station.windSpeedAvg ? `${parseFloat(station.windSpeedAvg).toFixed(1)} mph` : '--';
        const windDir = station.windDirection || '--';
        const windGust = station.windSpeedGust ? `${parseFloat(station.windSpeedGust).toFixed(1)} mph` : '--';
        
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
                    conditionText = `Clear (${detection.temperature}°F)`;
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
                         style="cursor: pointer; position: relative;">
                        <img src="${view.url}" alt="${view.description}" 
                             style="max-width: 300px; width: 100%; height: auto; border-radius: 4px; transition: transform 0.2s ease;" 
                             onerror="this.style.display='none'; this.nextElementSibling.style.display='block';"
                             onmouseover="this.style.transform='scale(1.05)'"
                             onmouseout="this.style.transform='scale(1)'">
                        <div class="click-overlay" style="position: absolute; top: 5px; right: 5px; background: rgba(0,0,0,0.7); color: white; padding: 4px 8px; border-radius: 12px; font-size: 10px; font-weight: bold;">
                            🔍 Click to view full screen
                        </div>
                        <div style="display: none; padding: 10px; background: #f0f0f0; border-radius: 4px; text-align: center;">
                            Camera feed unavailable
                        </div>
                    </div>
                    <p style="margin: 5px 0; font-size: 12px; color: #666;">${view.description}</p>
                </div>`
            ).join('');

            // Add analysis info to popup if available
            let analysisInfo = '';
            if (detection) {
                analysisInfo = `
                    <div class="analysis-section" style="border-top: 1px solid #eee; margin-top: 10px; padding-top: 10px;">
                        <h5 style="margin: 0 0 5px 0; color: ${ringColor};">📊 Road Analysis</h5>
                        <p style="margin: 2px 0;"><strong>Condition:</strong> ${conditionText}</p>
                        <p style="margin: 2px 0;"><strong>Confidence:</strong> ${Math.round(detection.confidence * 100)}%</p>
                        ${detection.temperatureOverride ? 
                            `<p style="margin: 2px 0; font-size: 11px; color: #666;">🌡️ Temperature override active</p>` : 
                            `<p style="margin: 2px 0;"><strong>Snow Level:</strong> ${detection.snowLevel}</p>`
                        }
                        <p style="margin: 2px 0; font-size: 11px; color: #999;">Last updated: ${new Date(detection.timestamp).toLocaleTimeString()}</p>
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
            
            marker.bindPopup(`
                <div class="camera-popup">
                    <h4>📹 ${camera.name}</h4>
                    <p><strong>Roadway:</strong> ${camera.roadway}</p>
                    ${cameraViews}
                    ${analysisInfo}
                    <p style="font-size: 11px; color: #999; margin-top: 10px;">
                        Live feed from UDOT Traffic Cameras
                    </p>
                </div>
            `, {
                maxWidth: 350
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
            const div = L.DomUtil.create('div', 'road-legend');
            div.innerHTML = `
                <h4>Road Conditions</h4>
                <div class="legend-items">
                    <div class="legend-item">
                        <span class="color-box" style="background: #28a745;"></span>
                        <span>Clear - Normal driving</span>
                    </div>
                    <div class="legend-item">
                        <span class="color-box" style="background: #ffc107;"></span>
                        <span>Caution - Snow/Ice possible</span>
                    </div>
                    <div class="legend-item">
                        <span class="color-box" style="background: #dc3545;"></span>
                        <span>Dangerous - Travel not advised</span>
                    </div>
                    <div class="legend-item">
                        <span class="color-box" style="background: #6c757d;"></span>
                        <span>No Data Available</span>
                    </div>
                </div>
            `;
            return div;
        };
        
        legend.addTo(this.map);
    }

    clearLayers() {
        this.roadLayers.forEach(layer => this.map.removeLayer(layer));
        this.stationMarkers.forEach(marker => this.map.removeLayer(marker));
        this.cameraMarkers.forEach(marker => this.map.removeLayer(marker));
        this.roadLayers.clear();
        this.stationMarkers.clear();
        this.cameraMarkers.clear();
    }

    startAutoRefresh() {
        if (this.refreshTimer) clearInterval(this.refreshTimer);
        
        this.refreshTimer = setInterval(() => {
            this.loadRoadWeatherData();
            updateConditionCards();
        }, this.options.refreshInterval);
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
});

// Function to update cards with specific location data
function updateConditionCardsWithLocation(locationData) {
    // Location section has been removed - no need to update selected location text
    
    // Update road surface temperature
    const roadTempCard = document.querySelector('.condition-card-compact.road-temp .value');
    if (roadTempCard) {
        const temp = locationData.roadTemp || locationData.airTemp || locationData.temperature || '--';
        roadTempCard.textContent = temp !== '--' ? `${Math.round(temp)}°F` : '--°F';
    }
    
    // Update visibility
    const visCard = document.querySelector('.condition-card-compact.visibility .value');
    if (visCard) {
        const vis = locationData.visibility;
        if (vis && vis > 0) {
            visCard.textContent = vis > 10 ? '10+ mi' : `${Math.round(vis * 10) / 10} mi`;
        } else {
            visCard.textContent = '-- mi';
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
            windCard.textContent = `${Math.round(wind)} mph`;
        } else {
            windCard.textContent = '-- mph';
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
        
        // Update cards
        const roadTempCard = document.querySelector('.condition-card-compact.road-temp .value');
        if (roadTempCard) roadTempCard.textContent = `${avgTemp}°F`;
        
        const visibilityCard = document.querySelector('.condition-card-compact.visibility .value');
        if (visibilityCard) visibilityCard.textContent = `${avgVis} mi`;
        
        const windCard = document.querySelector('.condition-card-compact.wind .value');
        if (windCard) {
            windCard.textContent = `${avgWind} mph`;
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
                if (roadTempCard) roadTempCard.textContent = `${tempF}°F`;
                
                const windCard = document.querySelector('.condition-card-compact.wind .value');
                if (windCard) windCard.textContent = `${windMph} mph`;
            }
        }
    } catch (error) {
        console.error('Fallback also failed:', error);
    }
}

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

