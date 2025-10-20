// Provo Canyon Enhanced Map - Full UDOT Integration with Azure Maps
// Implements enterprise architecture with cameras, weather stations, road conditions

class ProvoCanyonEnhancedMap {
    constructor() {
        this.map = null;
        this.dataSources = {
            cameras: null,
            weatherStations: null,
            roadConditions: null,
            events: null
        };

        this.layers = {
            roadConditions: null,
            cameras: null,
            weatherStations: null,
            events: null
        };

        this.azureKey = null;

        // Provo Canyon / Deer Creek area
        this.mapCenter = [-111.5, 40.4];
        this.mapZoom = 10;

        // Layer visibility state
        this.layerVisibility = {
            traffic: true,
            roadConditions: true,
            cameras: true,
            weatherStations: true,
            events: true
        };

        // Refresh interval: 5 minutes
        this.refreshInterval = 300000;
        this.refreshTimer = null;
    }

    async init() {
        try {
            await this.fetchAzureKey();
            await this.initMap();

            // Load all UDOT data layers
            await this.loadAllUDOTData();

            // Add layer controls
            this.addLayerControls();

            // Add traffic layers (Azure Maps native)
            this.addTrafficLayers();

            // Hide loading indicator
            const loadingEl = document.getElementById('map-loading');
            if (loadingEl) {
                loadingEl.style.display = 'none';
            }

            // Start auto-refresh
            this.startAutoRefresh();

            console.log('Provo Canyon Enhanced Map initialized successfully');
        } catch (error) {
            console.error('Error initializing map:', error);
            this.showError('Unable to load map. Please refresh the page.');
        }
    }

    async fetchAzureKey() {
        const response = await fetch('/api/azure-maps-key');
        if (!response.ok) {
            throw new Error('Failed to fetch Azure Maps API key');
        }
        const data = await response.json();
        this.azureKey = data.key;
    }

    async initMap() {
        try {
            this.map = new atlas.Map('provo-canyon-map', {
                center: this.mapCenter,
                zoom: this.mapZoom,
                language: 'en-US',
                authOptions: {
                    authType: 'subscriptionKey',
                    subscriptionKey: this.azureKey
                },
                style: 'grayscale_light',
                showFeedbackLink: false,
                showLogo: false
            });

            await new Promise(resolve => {
                this.map.events.add('ready', () => {
                    console.log('Azure Maps ready');

                    // Initialize data sources
                    this.dataSources.cameras = new atlas.source.DataSource();
                    this.dataSources.weatherStations = new atlas.source.DataSource();
                    this.dataSources.roadConditions = new atlas.source.DataSource();
                    this.dataSources.events = new atlas.source.DataSource();

                    this.map.sources.add(Object.values(this.dataSources));

                    // Add controls
                    this.map.controls.add([
                        new atlas.control.ZoomControl(),
                        new atlas.control.CompassControl(),
                        new atlas.control.PitchControl(),
                        new atlas.control.StyleControl({
                            mapStyles: ['road', 'grayscale_light', 'satellite', 'night']
                        })
                    ], {
                        position: 'top-right'
                    });

                    resolve();
                });
            });
        } catch (error) {
            console.error('Error creating Azure Map:', error);
            throw error;
        }
    }

    /**
     * Load all UDOT data sources
     */
    async loadAllUDOTData() {
        try {
            console.log('Loading all UDOT data for Provo Canyon...');

            const response = await fetch('/api/udot/map-data/provo-canyon');

            if (!response.ok) {
                throw new Error(`HTTP error: ${response.status}`);
            }

            const { success, data } = await response.json();

            if (!success) {
                throw new Error('Failed to fetch UDOT data');
            }

            // Load each data layer
            this.loadRoadConditions(data.roadConditions);
            this.loadCameras(data.cameras);
            this.loadWeatherStations(data.weatherStations);

            console.log('All UDOT data loaded successfully');
        } catch (error) {
            console.error('Error loading UDOT data:', error);
            this.showError('Unable to load road condition data');
        }
    }

    /**
     * Load and visualize road conditions with data-driven styling
     */
    loadRoadConditions(geojson) {
        if (!geojson || !geojson.features) {
            console.warn('No road condition data available');
            return;
        }

        console.log(`Loading ${geojson.features.length} road condition features`);

        this.dataSources.roadConditions.setShapes(geojson.features);

        // Create data-driven line layer for road segments
        // Note: Current implementation uses Point data; production would use LineString
        this.layers.roadConditions = new atlas.layer.BubbleLayer(
            this.dataSources.roadConditions,
            'road-conditions-layer',
            {
                // Data-driven color based on condition_level
                color: [
                    'case',
                    ['==', ['get', 'condition_level'], 1], '#00A000', // Green: Clear
                    ['==', ['get', 'condition_level'], 2], '#FFFF00', // Yellow: Wet
                    ['==', ['get', 'condition_level'], 3], '#FFA500', // Orange: Snow/Ice
                    ['==', ['get', 'condition_level'], 4], '#FF0000', // Red: Hazardous
                    ['==', ['get', 'condition_level'], 5], '#000000', // Black: Closed
                    '#CCCCCC' // Default: Gray
                ],

                // Bubble size based on zoom
                radius: [
                    'interpolate',
                    ['linear'],
                    ['zoom'],
                    8, 4,   // Zoom 8: 4px
                    12, 8,  // Zoom 12: 8px
                    15, 12  // Zoom 15: 12px
                ],

                opacity: 0.8,
                strokeColor: '#FFFFFF',
                strokeWidth: 1,

                // Only show at appropriate zoom levels
                minZoom: 8
            }
        );

        this.map.layers.add(this.layers.roadConditions);

        // Add click event for road condition details
        this.map.events.add('click', this.layers.roadConditions, (e) => {
            if (e.shapes && e.shapes.length > 0) {
                const properties = e.shapes[0].getProperties();
                this.showRoadConditionPopup(e.position, properties);
            }
        });

        // Add hover effect
        this.map.events.add('mousemove', this.layers.roadConditions, () => {
            this.map.getCanvasContainer().style.cursor = 'pointer';
        });

        this.map.events.add('mouseleave', this.layers.roadConditions, () => {
            this.map.getCanvasContainer().style.cursor = 'grab';
        });
    }

    /**
     * Load and visualize UDOT cameras with image popups
     */
    loadCameras(geojson) {
        if (!geojson || !geojson.features) {
            console.warn('No camera data available');
            return;
        }

        console.log(`Loading ${geojson.features.length} camera features`);

        this.dataSources.cameras.setShapes(geojson.features);

        // Create symbol layer for cameras
        this.layers.cameras = new atlas.layer.SymbolLayer(
            this.dataSources.cameras,
            'cameras-layer',
            {
                iconOptions: {
                    image: 'camera',
                    size: 1.2,
                    anchor: 'center',
                    allowOverlap: true
                },
                textOptions: {
                    textField: ['get', 'name'],
                    offset: [0, 1.5],
                    size: 11,
                    color: '#0044AA',
                    haloColor: '#FFFFFF',
                    haloWidth: 2
                },
                minZoom: 9
            }
        );

        this.map.layers.add(this.layers.cameras);

        // Add click event to show camera image
        this.map.events.add('click', this.layers.cameras, (e) => {
            if (e.shapes && e.shapes.length > 0) {
                const properties = e.shapes[0].getProperties();
                this.showCameraPopup(e.position, properties);
            }
        });

        // Hover effects
        this.map.events.add('mousemove', this.layers.cameras, () => {
            this.map.getCanvasContainer().style.cursor = 'pointer';
        });

        this.map.events.add('mouseleave', this.layers.cameras, () => {
            this.map.getCanvasContainer().style.cursor = 'grab';
        });
    }

    /**
     * Load and visualize weather stations
     */
    loadWeatherStations(geojson) {
        if (!geojson || !geojson.features) {
            console.warn('No weather station data available');
            return;
        }

        console.log(`Loading ${geojson.features.length} weather station features`);

        this.dataSources.weatherStations.setShapes(geojson.features);

        // Create symbol layer for weather stations
        this.layers.weatherStations = new atlas.layer.SymbolLayer(
            this.dataSources.weatherStations,
            'weather-stations-layer',
            {
                iconOptions: {
                    image: 'pin-blue',
                    size: 1.0,
                    anchor: 'bottom',
                    allowOverlap: true
                },
                textOptions: {
                    textField: [
                        'concat',
                        ['to-string', ['get', 'temperature']],
                        '°F'
                    ],
                    offset: [0, -2],
                    size: 12,
                    color: '#0044AA',
                    haloColor: '#FFFFFF',
                    haloWidth: 2
                },
                minZoom: 9
            }
        );

        this.map.layers.add(this.layers.weatherStations);

        // Add click event for weather details
        this.map.events.add('click', this.layers.weatherStations, (e) => {
            if (e.shapes && e.shapes.length > 0) {
                const properties = e.shapes[0].getProperties();
                this.showWeatherStationPopup(e.position, properties);
            }
        });

        // Hover effects
        this.map.events.add('mousemove', this.layers.weatherStations, () => {
            this.map.getCanvasContainer().style.cursor = 'pointer';
        });

        this.map.events.add('mouseleave', this.layers.weatherStations, () => {
            this.map.getCanvasContainer().style.cursor = 'grab';
        });
    }

    /**
     * Show camera popup with embedded image
     */
    showCameraPopup(position, properties) {
        const popup = new atlas.Popup({
            content: `
                <div class="azure-event-popup" style="min-width: 320px;">
                    <h3 style="margin: 0 0 10px 0; color: #0044AA;">
                        <i class="fas fa-video"></i> ${properties.name}
                    </h3>
                    ${properties.image_url ? `
                        <div style="margin: 10px 0;">
                            <img src="${properties.image_url}"
                                 alt="${properties.name}"
                                 style="width: 100%; max-width: 400px; border-radius: 4px; border: 2px solid #ddd;"
                                 onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">
                            <p style="display: none; color: #999; font-style: italic;">Image not available</p>
                        </div>
                    ` : '<p style="color: #999; font-style: italic;">No image available</p>'}
                    <p style="margin: 5px 0;"><strong>Location:</strong> ${properties.roadway || 'Unknown'}</p>
                    ${properties.description ? `<p style="margin: 5px 0;"><strong>Description:</strong> ${properties.description}</p>` : ''}
                    ${properties.last_updated ? `
                        <p style="margin: 5px 0; font-size: 0.85em; color: #666;">
                            <strong>Updated:</strong> ${new Date(properties.last_updated).toLocaleString()}
                        </p>
                    ` : ''}
                </div>
            `,
            position: position,
            pixelOffset: [0, -10],
            closeButton: true
        });

        popup.open(this.map);
    }

    /**
     * Show weather station popup
     */
    showWeatherStationPopup(position, properties) {
        const popup = new atlas.Popup({
            content: `
                <div class="azure-event-popup">
                    <h3 style="margin: 0 0 10px 0; color: #0044AA;">
                        <i class="fas fa-cloud-sun"></i> ${properties.name}
                    </h3>
                    <p style="margin: 5px 0;"><strong>Temperature:</strong> ${properties.temperature || 'N/A'}°F</p>
                    <p style="margin: 5px 0;"><strong>Road Temperature:</strong> ${properties.road_temperature || 'N/A'}°F</p>
                    <p style="margin: 5px 0;"><strong>Wind Speed:</strong> ${properties.wind_speed || 'N/A'} mph</p>
                    ${properties.wind_direction ? `<p style="margin: 5px 0;"><strong>Wind Direction:</strong> ${properties.wind_direction}°</p>` : ''}
                    ${properties.visibility ? `<p style="margin: 5px 0;"><strong>Visibility:</strong> ${properties.visibility} miles</p>` : ''}
                    <p style="margin: 5px 0;"><strong>Road Condition:</strong> ${properties.road_condition || 'Unknown'}</p>
                    ${properties.last_updated ? `
                        <p style="margin: 10px 0 0 0; font-size: 0.85em; color: #666;">
                            Updated: ${new Date(properties.last_updated).toLocaleString()}
                        </p>
                    ` : ''}
                </div>
            `,
            position: position,
            pixelOffset: [0, -10],
            closeButton: true
        });

        popup.open(this.map);
    }

    /**
     * Show road condition popup
     */
    showRoadConditionPopup(position, properties) {
        const conditionColors = {
            1: '#00A000',
            2: '#FFFF00',
            3: '#FFA500',
            4: '#FF0000',
            5: '#000000'
        };

        const conditionLabels = {
            1: 'Clear/Dry',
            2: 'Wet/Minor Impacts',
            3: 'Snow/Ice - High Caution',
            4: 'Hazardous - Travel Not Recommended',
            5: 'Road Closed'
        };

        const level = properties.condition_level || 1;
        const color = conditionColors[level];
        const label = conditionLabels[level];

        const popup = new atlas.Popup({
            content: `
                <div class="azure-event-popup">
                    <h3 style="margin: 0 0 10px 0; color: ${color};">
                        <i class="fas fa-road"></i> Road Conditions
                    </h3>
                    <p style="margin: 5px 0;"><strong>Roadway:</strong> ${properties.roadway || 'Unknown'}</p>
                    <p style="margin: 5px 0;">
                        <strong>Condition:</strong>
                        <span style="color: ${color}; font-weight: bold;">${label}</span>
                    </p>
                    ${properties.weather_description ? `
                        <p style="margin: 5px 0;"><strong>Details:</strong> ${properties.weather_description}</p>
                    ` : ''}
                    ${properties.direction ? `<p style="margin: 5px 0;"><strong>Direction:</strong> ${properties.direction}</p>` : ''}
                    ${properties.last_updated ? `
                        <p style="margin: 10px 0 0 0; font-size: 0.85em; color: #666;">
                            Updated: ${new Date(properties.last_updated).toLocaleString()}
                        </p>
                    ` : ''}
                </div>
            `,
            position: position,
            pixelOffset: [0, -10],
            closeButton: true
        });

        popup.open(this.map);
    }

    /**
     * Add layer visibility controls
     */
    addLayerControls() {
        const controlContainer = document.createElement('div');
        controlContainer.className = 'layer-control-container';
        controlContainer.style.cssText = `
            position: absolute;
            top: 10px;
            left: 10px;
            background: white;
            padding: 15px;
            border-radius: 4px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
            z-index: 1000;
            font-family: 'Roboto', sans-serif;
            max-width: 250px;
        `;

        controlContainer.innerHTML = `
            <h4 style="margin: 0 0 10px 0; font-size: 1rem; color: #0044AA;">
                <i class="fas fa-layer-group"></i> Map Layers
            </h4>
            <div style="display: flex; flex-direction: column; gap: 8px;">
                <label style="display: flex; align-items: center; cursor: pointer;">
                    <input type="checkbox" id="toggle-traffic" checked style="margin-right: 8px;">
                    <span>Traffic Flow</span>
                </label>
                <label style="display: flex; align-items: center; cursor: pointer;">
                    <input type="checkbox" id="toggle-road-conditions" checked style="margin-right: 8px;">
                    <span>Road Conditions</span>
                </label>
                <label style="display: flex; align-items: center; cursor: pointer;">
                    <input type="checkbox" id="toggle-cameras" checked style="margin-right: 8px;">
                    <span>Cameras</span>
                </label>
                <label style="display: flex; align-items: center; cursor: pointer;">
                    <input type="checkbox" id="toggle-weather-stations" checked style="margin-right: 8px;">
                    <span>Weather Stations</span>
                </label>
            </div>
        `;

        document.getElementById('provo-canyon-map').appendChild(controlContainer);

        // Add event listeners
        document.getElementById('toggle-traffic').addEventListener('change', (e) => {
            this.toggleTrafficLayer(e.target.checked);
        });

        document.getElementById('toggle-road-conditions').addEventListener('change', (e) => {
            this.toggleLayer(this.layers.roadConditions, e.target.checked);
        });

        document.getElementById('toggle-cameras').addEventListener('change', (e) => {
            this.toggleLayer(this.layers.cameras, e.target.checked);
        });

        document.getElementById('toggle-weather-stations').addEventListener('change', (e) => {
            this.toggleLayer(this.layers.weatherStations, e.target.checked);
        });
    }

    toggleLayer(layer, visible) {
        if (layer) {
            layer.setOptions({ visible });
        }
    }

    toggleTrafficLayer(visible) {
        this.map.setTraffic({
            flow: visible ? 'relative' : 'none',
            incidents: visible
        });
    }

    addTrafficLayers() {
        this.map.setTraffic({
            flow: 'relative',
            incidents: true
        });
    }

    startAutoRefresh() {
        this.refreshTimer = setInterval(() => {
            console.log('Auto-refreshing UDOT data...');
            this.loadAllUDOTData();
        }, this.refreshInterval);
    }

    showError(message) {
        const loadingEl = document.getElementById('map-loading');
        if (loadingEl) {
            loadingEl.innerHTML = `<i class="fas fa-exclamation-triangle"></i> ${message}`;
            loadingEl.style.color = '#d32f2f';
            loadingEl.style.display = 'block';
        }
    }

    destroy() {
        if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
        }
        if (this.map) {
            this.map.dispose();
        }
    }
}

// Initialize map when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    console.log('Initializing Provo Canyon Enhanced Map...');
    const provoCanyonMap = new ProvoCanyonEnhancedMap();
    provoCanyonMap.init();

    // Initialize countdown timer (existing functionality)
    console.log('Initializing FCAB countdown timer...');
    const countdown = new ClosureCountdown();
    countdown.init();
});

// Countdown Timer Class (from existing implementation)
class ClosureCountdown {
    constructor() {
        this.schedules = {
            weeknight: { start: 22, end: 6 },
            saturday: { start: 23, end: 6 },
            sunday: { start: 22, end: 9 }
        };
    }

    init() {
        this.updateCountdown();
        setInterval(() => this.updateCountdown(), 1000);
    }

    updateCountdown() {
        const now = new Date();
        const day = now.getDay();
        const hours = now.getHours();

        const schedule = this.getCurrentSchedule(day);
        const { nextEvent, timeUntil } = this.calculateNextEvent(now, day, hours, schedule);

        const labelEl = document.getElementById('countdown-label');
        const timeEl = document.getElementById('countdown-time');

        if (labelEl && timeEl) {
            labelEl.textContent = nextEvent;
            timeEl.textContent = this.formatTime(timeUntil);
        }
    }

    getCurrentSchedule(day) {
        if (day === 6) return this.schedules.saturday;
        if (day === 0) return this.schedules.sunday;
        return this.schedules.weeknight;
    }

    calculateNextEvent(now, day, hours, schedule) {
        const isInClosure = this.isCurrentlyInClosure(hours, schedule);

        if (isInClosure) {
            const endTime = new Date(now);
            endTime.setHours(schedule.end, 0, 0, 0);
            if (schedule.end < hours) {
                endTime.setDate(endTime.getDate() + 1);
            }
            return {
                nextEvent: 'Reopening In',
                timeUntil: endTime - now
            };
        } else {
            const startTime = new Date(now);
            startTime.setHours(schedule.start, 0, 0, 0);
            if (schedule.start < hours || (schedule.start === hours && now.getMinutes() > 0)) {
                startTime.setDate(startTime.getDate() + 1);
            }
            return {
                nextEvent: 'Next Closure',
                timeUntil: startTime - now
            };
        }
    }

    isCurrentlyInClosure(hours, schedule) {
        if (schedule.end < schedule.start) {
            return hours >= schedule.start || hours < schedule.end;
        } else {
            return hours >= schedule.start && hours < schedule.end;
        }
    }

    formatTime(milliseconds) {
        if (milliseconds < 0) return '--:--:--';

        const totalSeconds = Math.floor(milliseconds / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        return `${this.pad(hours)}:${this.pad(minutes)}:${this.pad(seconds)}`;
    }

    pad(num) {
        return String(num).padStart(2, '0');
    }
}
