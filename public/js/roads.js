// UnitsSystem class moved to /public/js/roads/UnitsSystem.js
// Data cache moved to /public/js/roads/DataCache.js


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
});

// Function to update cards with specific location data

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

// TrafficEventsManager class moved to /public/js/roads/TrafficEventsManager.js
// Digital road signs functionality removed - not needed

let trafficEventsManager;

// Route conditions functions moved to /public/js/roads/RouteConditions.js


// Utility functions moved to /public/js/roads/utils.js

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

