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
            this.renderTrafficCameras(data.cameras);
            
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
                status: segment.overallCondition?.status || 'No Data'
            });
        });
    }

    renderRoadSegment(segment) {
        const color = this.getSegmentColor(segment.condition);
        const isEstimated = segment.type === 'estimated';
        
        const polyline = L.polyline(segment.coordinates, {
            color: color,
            weight: isEstimated ? 4 : 6,  // Thinner for estimated roads
            opacity: isEstimated ? 0.6 : 0.8,  // More transparent for estimated
            smoothFactor: 1,
            dashArray: isEstimated ? '5, 10' : null  // Dashed for estimated roads
        });

        const dataSource = isEstimated ? 'Estimated from regional weather' : 'Real-time UDOT data';
        const badgeClass = isEstimated ? 'estimated-badge' : 'monitored-badge';
        
        polyline.bindPopup(`
            <div class="road-popup">
                <h4>${segment.name}</h4>
                <div class="road-status ${segment.condition}">
                    Status: ${segment.status}
                </div>
                <div class="${badgeClass}">
                    ${isEstimated ? '📊 Estimated' : '🛰️ Monitored'}
                </div>
                <p class="data-source">${dataSource}</p>
            </div>
        `);

        polyline.on('mouseover', function(e) {
            this.setStyle({ weight: 8, opacity: 1 });
        });

        polyline.on('mouseout', function(e) {
            this.setStyle({ weight: 6, opacity: 0.8 });
        });

        polyline.addTo(this.map);
        this.roadLayers.set(segment.id, polyline);
    }

    renderWeatherStations(stations) {
        if (!stations) return;
        
        stations.forEach(station => {
            const condition = this.determineStationCondition(station);
            this.renderStation({
                name: station.name,
                lat: station.lat,
                lng: station.lng,
                temp: station.roadTemp || station.airTemp,
                condition: condition
            });
        });
    }

    renderStation(station) {
        const color = this.getConditionColor(station.condition);
        const marker = L.circleMarker([station.lat, station.lng], {
            radius: 8,
            fillColor: color,
            color: 'white',
            weight: 2,
            opacity: 1,
            fillOpacity: 0.8
        });

        marker.bindPopup(`
            <div class="station-popup">
                <h4>${station.name}</h4>
                <p>Temperature: ${station.temp || '--'}°F</p>
                <p>Condition: ${station.condition}</p>
            </div>
        `);

        marker.addTo(this.map);
        this.stationMarkers.set(station.name, marker);
    }

    renderTrafficCameras(cameras) {
        if (!cameras || cameras.length === 0) return;

        cameras.forEach(camera => {
            const marker = L.marker([camera.lat, camera.lng], {
                icon: L.divIcon({
                    html: '📹',
                    className: 'camera-marker',
                    iconSize: [20, 20],
                    iconAnchor: [10, 10]
                })
            });

            // Create popup with camera feed
            const cameraViews = camera.views.map(view => 
                `<div class="camera-view">
                    <img src="${view.url}" alt="${view.description}" 
                         style="max-width: 300px; width: 100%; height: auto; border-radius: 4px;" 
                         onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">
                    <div style="display: none; padding: 10px; background: #f0f0f0; border-radius: 4px; text-align: center;">
                        Camera feed unavailable
                    </div>
                    <p style="margin: 5px 0; font-size: 12px; color: #666;">${view.description}</p>
                </div>`
            ).join('');

            marker.bindPopup(`
                <div class="camera-popup">
                    <h4>📹 ${camera.name}</h4>
                    <p><strong>Roadway:</strong> ${camera.roadway}</p>
                    ${cameraViews}
                    <p style="font-size: 11px; color: #999; margin-top: 10px;">
                        Live feed from UDOT Traffic Cameras
                    </p>
                </div>
            `, {
                maxWidth: 350
            });

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
                <h4 style="margin-top: 15px;">Data Sources</h4>
                <div class="legend-items">
                    <div class="legend-item">
                        <span class="legend-line" style="border-top: 4px solid #333; width: 20px;"></span>
                        <span>🛰️ UDOT Monitored</span>
                    </div>
                    <div class="legend-item">
                        <span class="legend-line" style="border-top: 3px dashed #333; width: 20px;"></span>
                        <span>📊 Weather Estimated</span>
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
        const roadTempCard = document.querySelector('.condition-card.road-temp .current-value');
        if (roadTempCard) roadTempCard.textContent = `${avgTemp}°F`;
        
        const visibilityCard = document.querySelector('.condition-card.visibility .current-value');
        if (visibilityCard) visibilityCard.textContent = `${avgVis} mi`;
        
        const windCard = document.querySelector('.condition-card.wind .current-value');
        if (windCard) {
            windCard.textContent = `${avgWind} mph`;
            const windTrend = document.querySelector('.condition-card.wind .trend');
            if (windTrend && avgWind > 30) {
                windTrend.textContent = 'High-profile vehicle alert';
                windTrend.style.color = '#ffc107';
            }
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
                
                const roadTempCard = document.querySelector('.condition-card.road-temp .current-value');
                if (roadTempCard) roadTempCard.textContent = `${tempF}°F`;
                
                const windCard = document.querySelector('.condition-card.wind .current-value');
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

// Add CSS styles for the map
const style = document.createElement('style');
style.textContent = `
.road-legend {
    background: white;
    padding: 10px;
    border-radius: 4px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
}
.road-legend h4 {
    margin: 0 0 8px 0;
    font-size: 14px;
}
.legend-items {
    font-size: 12px;
}
.legend-item {
    display: flex;
    align-items: center;
    margin: 4px 0;
}
.color-box {
    width: 20px;
    height: 4px;
    margin-right: 8px;
    border-radius: 2px;
}
.legend-line {
    display: inline-block;
    height: 0;
    margin-right: 8px;
    margin-top: 2px;
}
.road-popup h4, .station-popup h4, .camera-popup h4 {
    margin: 0 0 8px 0;
}
.road-status {
    padding: 4px 8px;
    border-radius: 4px;
    font-weight: bold;
    margin: 8px 0;
}
.road-status.green { background: #d4edda; color: #155724; }
.road-status.yellow { background: #fff3cd; color: #856404; }
.road-status.red { background: #f8d7da; color: #721c24; }
.road-status.gray { background: #e9ecef; color: #495057; }
.monitored-badge {
    background: #007bff;
    color: white;
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 11px;
    margin: 4px 0;
}
.estimated-badge {
    background: #6c757d;
    color: white;
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 11px;
    margin: 4px 0;
}
.data-source {
    font-size: 11px;
    color: #666;
    margin: 4px 0 0 0;
}
.camera-marker {
    background: rgba(0, 123, 255, 0.1);
    border: 2px solid #007bff;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
}
.camera-popup {
    max-width: 350px;
}
.camera-view {
    margin: 10px 0;
}
.camera-view img {
    display: block;
    margin: 5px 0;
}
`;
document.head.appendChild(style);