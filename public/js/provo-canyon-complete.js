// Provo Canyon Complete Map - ALL Azure Maps Features Integrated
// Enterprise-grade implementation with full Azure Maps REST API suite

class ProvoCanyonCompleteMap {
    constructor() {
        this.map = null;
        this.azureKey = null;

        // Data sources
        this.dataSources = {
            cameras: null,
            roadConditions: null,
            trafficIncidents: null,
            routes: null,
            isochrone: null,
            constructionEvents: null
        };

        // Markers
        this.cameraMarkers = [];
        this.constructionEventMarkers = [];

        // Layers
        this.layers = {};

        // Weather radar layer reference
        this.radarLayer = null;
        this.radarLegend = null;

        // Map center (Deer Creek Reservoir - actual coordinates)
        this.mapCenter = [-111.49, 40.44];
        this.mapZoom = 13;

        // Weather data
        this.weatherData = null;

        // UI state
        this.uiState = {
            weatherPanelOpen: true,
            routePlannerOpen: false,
            poiSearchOpen: false,
            showWeatherRadar: false,
            showIsochrone: false
        };
    }

    async init() {
        try {
            await this.fetchAzureKey();
            await this.initMap();
            await this.loadAllData();
            this.setupUI();
            this.hideLoading();

            console.log('Provo Canyon Complete Map initialized successfully');
        } catch (error) {
            console.error('Error initializing map:', error);
            this.showError('Unable to load map. Please refresh the page.');
        }
    }

    async fetchAzureKey() {
        const response = await fetch('/api/azure-maps-key');
        if (!response.ok) throw new Error('Failed to fetch Azure Maps API key');
        const data = await response.json();
        this.azureKey = data.key;
    }

    async initMap() {
        this.map = new atlas.Map('provo-canyon-map', {
            center: this.mapCenter,
            zoom: this.mapZoom,
            language: 'en-US',
            authOptions: {
                authType: 'subscriptionKey',
                subscriptionKey: this.azureKey
            },
            style: 'road',
            showFeedbackLink: false,
            showLogo: false
        });

        await new Promise(resolve => {
            this.map.events.add('ready', () => {
                // Initialize all data sources
                Object.keys(this.dataSources).forEach(key => {
                    this.dataSources[key] = new atlas.source.DataSource();
                    this.map.sources.add(this.dataSources[key]);
                });

                // Add standard controls
                this.map.controls.add([
                    new atlas.control.ZoomControl(),
                    new atlas.control.CompassControl(),
                    new atlas.control.PitchControl(),
                    new atlas.control.StyleControl({
                        mapStyles: ['road', 'grayscale_light', 'satellite_road_labels', 'night', 'road_shaded_relief']
                    })
                ], { position: 'top-right' });

                // Enable traffic flow only (no incident markers)
                this.map.setTraffic({ flow: 'relative', incidents: false });

                resolve();
            });
        });
    }

    async loadAllData() {
        try {
            const startTime = performance.now();
            const cacheKey = 'provo_canyon_udot_data';
            const cacheTTL = 10 * 60 * 1000; // 10 minutes

            // 1. Try to load from localStorage cache first (INSTANT LOAD)
            const cachedData = this.loadFromLocalStorage(cacheKey, cacheTTL);
            if (cachedData) {
                console.log(`✓ Loaded UDOT data from browser cache (${Math.round(performance.now() - startTime)}ms)`);
                this.loadUDOTData(cachedData);

                // Fetch fresh data in background to keep cache warm
                this.refreshUDOTDataInBackground(cacheKey).catch(err =>
                    console.warn('Background refresh failed:', err)
                );
            } else {
                // 2. Cache miss - fetch from server with loading indicator
                console.log('⚠ Browser cache miss - fetching UDOT data from server...');
                this.showLoadingMessage('Loading traffic cameras and road conditions...');

                const udotResponse = await fetch('/api/udot/map-data/provo-canyon');
                const udotData = await udotResponse.json();

                if (udotData.success) {
                    // Save to localStorage for next time
                    this.saveToLocalStorage(cacheKey, udotData.data);

                    this.loadUDOTData(udotData.data);
                    console.log(`✓ Loaded fresh UDOT data from server (${Math.round(performance.now() - startTime)}ms)`);
                }

                this.hideLoadingMessage();
            }

            // Load Azure Maps data in parallel (weather and traffic)
            await Promise.all([
                this.loadWeatherData(),
                this.loadTrafficIncidents()
            ]);

        } catch (error) {
            console.error('Error loading data:', error);
            this.hideLoadingMessage();
        }
    }

    /**
     * Load data from browser localStorage with TTL check
     */
    loadFromLocalStorage(key, maxAge) {
        try {
            const item = localStorage.getItem(key);
            if (!item) return null;

            const parsed = JSON.parse(item);
            const age = Date.now() - parsed.timestamp;

            if (age < maxAge) {
                return parsed.data;
            } else {
                // Expired - remove from cache
                localStorage.removeItem(key);
                return null;
            }
        } catch (error) {
            console.warn('Error reading from localStorage:', error);
            return null;
        }
    }

    /**
     * Save data to browser localStorage with timestamp
     */
    saveToLocalStorage(key, data) {
        try {
            const item = {
                data: data,
                timestamp: Date.now()
            };
            localStorage.setItem(key, JSON.stringify(item));
        } catch (error) {
            console.warn('Error writing to localStorage:', error);
        }
    }

    /**
     * Background refresh for client-side stale-while-revalidate
     */
    async refreshUDOTDataInBackground(cacheKey) {
        try {
            console.log('🔄 Background: Fetching fresh UDOT data...');
            const udotResponse = await fetch('/api/udot/map-data/provo-canyon');
            const udotData = await udotResponse.json();

            if (udotData.success) {
                // Update cache
                this.saveToLocalStorage(cacheKey, udotData.data);

                // Optionally update the map with fresh data
                // (For now we'll just update the cache for next load)
                console.log('✓ Background: Cache updated with fresh data');
            }
        } catch (error) {
            console.warn('Background refresh failed:', error);
        }
    }

    /**
     * Show loading message overlay
     */
    showLoadingMessage(message) {
        const existingOverlay = document.getElementById('udot-loading-overlay');
        if (existingOverlay) existingOverlay.remove();

        const overlay = document.createElement('div');
        overlay.id = 'udot-loading-overlay';
        overlay.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(255, 255, 255, 0.95);
            padding: 20px 30px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 1000;
            text-align: center;
            font-family: 'Inter', sans-serif;
        `;
        overlay.innerHTML = `
            <i class="fas fa-spinner fa-spin" style="font-size: 24px; color: #0078d4; margin-bottom: 10px;"></i>
            <p style="margin: 10px 0 0 0; color: #333; font-weight: 500;">${message}</p>
        `;

        const mapContainer = document.getElementById('provo-canyon-map');
        if (mapContainer) {
            mapContainer.style.position = 'relative';
            mapContainer.appendChild(overlay);
        }
    }

    /**
     * Hide loading message overlay
     */
    hideLoadingMessage() {
        const overlay = document.getElementById('udot-loading-overlay');
        if (overlay) overlay.remove();
    }

    loadUDOTData(data) {
        console.log('=== LOADING UDOT DATA ===');
        console.log('Full UDOT data object:', JSON.stringify(data, null, 2));

        // Road conditions
        if (data.roadConditions?.features) {
            console.log('Loading road conditions:', data.roadConditions.features.length, 'features');
            this.dataSources.roadConditions.setShapes(data.roadConditions.features);
            this.addRoadConditionsLayer();
        } else {
            console.warn('No road conditions data available');
        }

        // Cameras
        if (data.cameras?.features) {
            console.log('Loading cameras:', data.cameras.features.length, 'cameras');
            console.log('Camera features:', JSON.stringify(data.cameras.features.slice(0, 2), null, 2));
            this.dataSources.cameras.setShapes(data.cameras.features);

            // Add small delay to ensure shapes are added
            setTimeout(() => {
                this.addCamerasLayer();
            }, 100);
        } else {
            console.warn('⚠️ NO CAMERA DATA AVAILABLE');
            console.log('data.cameras:', data.cameras);
        }

        // Construction Events
        if (data.constructionEvents?.features) {
            console.log('Loading construction events:', data.constructionEvents.features.length, 'events');
            this.dataSources.constructionEvents.setShapes(data.constructionEvents.features);

            // Add small delay to ensure shapes are added
            setTimeout(() => {
                this.addConstructionEventsLayer();
            }, 100);
        } else {
            console.log('No construction events available');
        }

        // Alerts
        if (data.alerts && data.alerts.length > 0) {
            console.log('Loading alerts:', data.alerts.length, 'alerts');
            this.displayAlerts(data.alerts);
        } else {
            console.log('No active alerts');
        }
    }

    async loadWeatherData() {
        const weatherContent = document.getElementById('weather-content');
        if (!weatherContent) {
            console.warn('Weather content element not found');
            return;
        }

        console.log('=== WEATHER DEBUG START ===');
        console.log('Fetching from: /api/azure/weather/provo-canyon');
        console.log('Timestamp:', new Date().toISOString());

        try {
            // Add timeout to fetch request
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

            weatherContent.innerHTML = '<div style="text-align: center; padding: 20px; color: #666;"><i class="fas fa-spinner fa-spin"></i><br><p style="margin-top: 10px;">Loading weather data...</p></div>';

            const fetchStart = Date.now();
            const response = await fetch('/api/azure/weather/provo-canyon', {
                signal: controller.signal
            });
            const fetchTime = Date.now() - fetchStart;

            clearTimeout(timeoutId);

            console.log('Weather API response status:', response.status);
            console.log('Weather API response time:', fetchTime, 'ms');
            console.log('Weather API response headers:', Object.fromEntries(response.headers.entries()));

            if (!response.ok) {
                const errorText = await response.text();
                console.error('Weather API error response (status ' + response.status + '):', errorText);
                throw new Error(`HTTP ${response.status}: ${errorText.substring(0, 200)}`);
            }

            const responseText = await response.text();
            console.log('Weather raw response (first 500 chars):', responseText.substring(0, 500));

            const data = JSON.parse(responseText);
            console.log('Weather parsed data structure:', {
                success: data.success,
                has_location: !!data.location,
                has_current: !!data.current,
                has_hourly: !!data.hourly,
                has_daily: !!data.daily,
                has_alerts: !!data.alerts,
                alert_count: data.alerts?.length || 0
            });

            if (data.success) {
                console.log('Weather data SUCCESS - updating panel');
                this.weatherData = data;
                this.updateWeatherPanel(data);

                // Show weather alerts if any
                if (data.alerts && data.alerts.length > 0) {
                    console.log('Weather alerts found:', data.alerts.length);
                    this.showWeatherAlerts(data.alerts);
                }
                console.log('=== WEATHER DEBUG END (SUCCESS) ===');
            } else {
                console.error('Weather data success=false:', data);
                throw new Error(data.error || 'Weather data fetch was not successful');
            }
        } catch (error) {
            console.error('=== WEATHER DEBUG END (ERROR) ===');
            console.error('Error type:', error.name);
            console.error('Error message:', error.message);
            console.error('Error stack:', error.stack);

            // Show user-friendly error message
            if (weatherContent) {
                if (error.name === 'AbortError') {
                    weatherContent.innerHTML = `
                        <div style="text-align: center; padding: 20px; color: #d32f2f;">
                            <i class="fas fa-exclamation-triangle"></i>
                            <p style="margin-top: 10px; font-size: 0.9rem;">Weather data request timed out</p>
                            <p style="font-size: 0.85rem; color: #666; margin-top: 5px;">Check console for details</p>
                            <button onclick="window.location.reload()" style="margin-top: 10px; padding: 8px 16px; background: #00263A; color: white; border: none; border-radius: 4px; cursor: pointer;">
                                Retry
                            </button>
                        </div>
                    `;
                } else {
                    weatherContent.innerHTML = `
                        <div style="text-align: center; padding: 20px; color: #d32f2f;">
                            <i class="fas fa-exclamation-triangle"></i>
                            <p style="margin-top: 10px; font-size: 0.9rem;">Unable to load weather data</p>
                            <p style="font-size: 0.85rem; color: #666; margin-top: 5px;">${error.message}</p>
                            <p style="font-size: 0.8rem; color: #999; margin-top: 5px;">Check browser console for details</p>
                            <button onclick="window.location.reload()" style="margin-top: 10px; padding: 8px 16px; background: #00263A; color: white; border: none; border-radius: 4px; cursor: pointer;">
                                Retry
                            </button>
                        </div>
                    `;
                }
            }
        }
    }

    async loadTrafficIncidents() {
        try {
            const bbox = '-111.7,40.2,-111.3,40.6';
            const response = await fetch(`/api/azure/traffic/incidents?bbox=${bbox}`);
            const data = await response.json();

            if (data.success && data.incidents) {
                this.displayTrafficIncidents(data.incidents);
            }
        } catch (error) {
            console.error('Error loading traffic incidents:', error);
        }
    }


    // ============= LAYER RENDERING =============

    addRoadConditionsLayer() {
        this.layers.roadConditions = new atlas.layer.BubbleLayer(
            this.dataSources.roadConditions,
            'road-conditions-layer',
            {
                color: [
                    'case',
                    ['==', ['get', 'condition_level'], 1], '#00A000',
                    ['==', ['get', 'condition_level'], 2], '#FFFF00',
                    ['==', ['get', 'condition_level'], 3], '#FFA500',
                    ['==', ['get', 'condition_level'], 4], '#FF0000',
                    ['==', ['get', 'condition_level'], 5], '#000000',
                    '#CCCCCC'
                ],
                radius: ['interpolate', ['linear'], ['zoom'], 8, 4, 12, 8, 15, 12],
                opacity: 0.8,
                strokeColor: '#FFFFFF',
                strokeWidth: 1,
                minZoom: 8
            }
        );

        this.map.layers.add(this.layers.roadConditions);

        this.map.events.add('click', this.layers.roadConditions, (e) => {
            if (e.shapes && e.shapes.length > 0) {
                this.showRoadConditionPopup(e.position, e.shapes[0].getProperties());
            }
        });
    }

    addCamerasLayer() {
        console.log('Adding UDOT cameras layer with HtmlMarkers...');

        // Get all camera features from the data source
        const cameraFeatures = this.dataSources.cameras.getShapes();
        console.log(`Found ${cameraFeatures.length} camera features to render`);

        // Store camera markers for later reference
        if (!this.cameraMarkers) {
            this.cameraMarkers = [];
        }

        // Create an HtmlMarker for each camera (like roads.js)
        cameraFeatures.forEach((feature, index) => {
            const coords = feature.getCoordinates();
            const props = feature.getProperties();

            console.log(`Creating camera marker ${index + 1}:`, props.name, coords);

            // Create HTML marker with camera emoji (like roads page)
            const markerHTML = document.createElement('div');
            markerHTML.style.cssText = `
                width: 30px;
                height: 30px;
                border: 3px solid #0078d4;
                border-radius: 50%;
                background: rgba(255,255,255,0.95);
                display: flex;
                align-items: center;
                justify-content: center;
                box-shadow: 0 2px 6px rgba(0,0,0,0.3);
                font-size: 16px;
                cursor: pointer;
                pointer-events: auto;
                box-sizing: border-box;
                transition: box-shadow 0.2s, background 0.2s;
            `;
            markerHTML.innerHTML = '📹';
            markerHTML.title = props.name;

            // Add hover effect (stable - no transform that shifts position)
            markerHTML.addEventListener('mouseenter', () => {
                markerHTML.style.boxShadow = '0 4px 12px rgba(0,120,212,0.6)';
                markerHTML.style.background = 'rgba(0,120,212,0.1)';
            });
            markerHTML.addEventListener('mouseleave', () => {
                markerHTML.style.boxShadow = '0 2px 6px rgba(0,0,0,0.3)';
                markerHTML.style.background = 'rgba(255,255,255,0.95)';
            });

            // Create the HtmlMarker with explicit position coordinates
            const marker = new atlas.HtmlMarker({
                position: new atlas.data.Position(coords[0], coords[1]),
                htmlContent: markerHTML,
                anchor: 'center',
                pixelOffset: [0, 0]
            });

            // Add click event to show popup
            markerHTML.addEventListener('click', (e) => {
                // Prevent event from bubbling to map
                e.stopPropagation();
                e.preventDefault();

                console.log('=== CAMERA CLICKED ===');
                console.log('Camera ID:', props.id);
                console.log('Camera name:', props.name);
                console.log('Has views array:', !!props.views);
                console.log('Number of views:', props.views?.length || 0);
                console.log('Views data:', props.views);
                console.log('===================');

                this.showCameraPopup(coords, props);
            });

            // Add marker to map
            this.map.markers.add(marker);
            this.cameraMarkers.push(marker);
        });

        console.log(`Successfully added ${this.cameraMarkers.length} camera markers to map`);
    }

    addConstructionEventsLayer() {
        console.log('Adding construction events layer with HtmlMarkers...');

        // Get all event features from the data source
        const eventFeatures = this.dataSources.constructionEvents.getShapes();
        console.log(`Found ${eventFeatures.length} construction event features to render`);

        // Store event markers for later reference
        if (!this.constructionEventMarkers) {
            this.constructionEventMarkers = [];
        }

        // Create an HtmlMarker for each construction event
        eventFeatures.forEach((feature, index) => {
            const coords = feature.getCoordinates();
            const props = feature.getProperties();

            console.log(`Creating construction event marker ${index + 1}:`, props.name, coords);

            // Get display properties
            const displayIcon = props.display_icon || '🚧';
            const displayColor = props.display_color || '#f59e0b';

            // Create HTML marker with construction icon
            const markerHTML = document.createElement('div');
            markerHTML.style.cssText = `
                width: 34px;
                height: 34px;
                border: 3px solid ${displayColor};
                border-radius: 50%;
                background: rgba(255,255,255,0.95);
                display: flex;
                align-items: center;
                justify-content: center;
                box-shadow: 0 2px 6px rgba(0,0,0,0.3);
                font-size: 18px;
                cursor: pointer;
                pointer-events: auto;
                box-sizing: border-box;
                transition: box-shadow 0.2s, background 0.2s;
            `;
            markerHTML.innerHTML = displayIcon;
            markerHTML.title = props.name;

            // Add hover effect
            markerHTML.addEventListener('mouseenter', () => {
                markerHTML.style.boxShadow = `0 4px 12px ${displayColor}99`;
                markerHTML.style.background = `${displayColor}20`;
            });
            markerHTML.addEventListener('mouseleave', () => {
                markerHTML.style.boxShadow = '0 2px 6px rgba(0,0,0,0.3)';
                markerHTML.style.background = 'rgba(255,255,255,0.95)';
            });

            // Create the HtmlMarker with explicit position coordinates
            const marker = new atlas.HtmlMarker({
                position: new atlas.data.Position(coords[0], coords[1]),
                htmlContent: markerHTML,
                anchor: 'center',
                pixelOffset: [0, 0]
            });

            // Add click event to show popup
            markerHTML.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();

                console.log('=== CONSTRUCTION EVENT CLICKED ===');
                console.log('Event ID:', props.id);
                console.log('Event name:', props.name);
                console.log('Event type:', props.event_type);
                console.log('=================================');

                this.showConstructionEventPopup(coords, props);
            });

            // Add marker to map
            this.map.markers.add(marker);
            this.constructionEventMarkers.push(marker);
        });

        console.log(`Successfully added ${this.constructionEventMarkers.length} construction event markers to map`);
    }


    displayTrafficIncidents(incidents) {
        const features = incidents.map(incident => ({
            type: 'Feature',
            geometry: incident.geometry,
            properties: {
                id: incident.id,
                type: incident.type,
                description: incident.description,
                magnitude: incident.magnitude,
                delay: incident.delay
            }
        }));

        this.dataSources.trafficIncidents.setShapes(features);

        this.layers.trafficIncidents = new atlas.layer.SymbolLayer(
            this.dataSources.trafficIncidents,
            'traffic-incidents-layer',
            {
                iconOptions: {
                    image: 'marker-red',
                    size: 1.0
                }
            }
        );

        this.map.layers.add(this.layers.trafficIncidents);

        this.map.events.add('click', this.layers.trafficIncidents, (e) => {
            if (e.shapes && e.shapes.length > 0) {
                this.showTrafficIncidentPopup(e.position, e.shapes[0].getProperties());
            }
        });
    }


    // ============= POPUP RENDERING =============

    showCameraPopup(position, properties) {
        console.log('=== Camera Popup Debug ===');
        console.log('Full camera properties:', JSON.stringify(properties, null, 2));
        console.log('Camera name:', properties.name);
        console.log('Camera has views:', !!properties.views);
        console.log('Views array:', properties.views);
        console.log('Camera image_url (fallback):', properties.image_url);
        console.log('Camera roadway:', properties.roadway);
        console.log('Camera id:', properties.id);

        // Build camera views HTML (support multiple angles like roads.js)
        let cameraViewsHTML = '';
        const timestamp = Date.now(); // Cache-busting

        if (properties.views && properties.views.length > 0) {
            console.log(`Rendering ${properties.views.length} camera view(s) as images`);

            cameraViewsHTML = properties.views.map((view, idx) => `
                <div class="camera-view">
                    <div class="camera-image-container"
                         onclick="window.open('${view.url}', '_blank')"
                         style="cursor: pointer; position: relative; display: block; margin: 0 auto; border-radius: 6px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); background: #f5f5f5; max-width: 200px; width: 100%;">
                        <img src="${view.url}?t=${timestamp}"
                             alt="${view.description || properties.name}"
                             style="width: 100% !important; max-width: 200px !important; height: auto !important; display: block !important; border-radius: 6px !important;"
                             onerror="this.style.display='none'; this.parentElement.querySelector('.error-message').style.display='block';">
                        <div class="click-overlay" style="position: absolute; top: 4px; right: 4px; background: rgba(0,0,0,0.7); color: white; padding: 2px 6px; border-radius: 10px; font-size: 9px; font-weight: bold; pointer-events: none;">
                            🔍 Click to view full screen
                        </div>
                        <div class="error-message" style="display: none; padding: 10px; text-align: center; color: #666;">
                            Camera feed unavailable
                        </div>
                    </div>
                    <p style="margin: 4px 0 0 0; font-size: 11px; color: #666; text-align: center;">
                        ${view.description || `View ${idx + 1}`}
                    </p>
                </div>
            `).join('');
        } else if (properties.image_url) {
            // Fallback to single image URL
            console.log('No views array, using fallback image_url');
            cameraViewsHTML = `
                <div class="camera-view">
                    <div class="camera-image-container"
                         onclick="window.open('${properties.image_url}', '_blank')"
                         style="cursor: pointer; position: relative; display: block; margin: 0 auto; border-radius: 6px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); background: #f5f5f5; max-width: 200px; width: 100%;">
                        <img src="${properties.image_url}?t=${timestamp}"
                             alt="${properties.name}"
                             style="width: 100% !important; max-width: 200px !important; height: auto !important; display: block !important; border-radius: 6px !important;"
                             onerror="this.style.display='none'; this.parentElement.querySelector('.error-message').style.display='block';">
                        <div class="click-overlay" style="position: absolute; top: 4px; right: 4px; background: rgba(0,0,0,0.7); color: white; padding: 2px 6px; border-radius: 10px; font-size: 9px; font-weight: bold; pointer-events: none;">
                            🔍 Click to view full screen
                        </div>
                        <div class="error-message" style="display: none; padding: 10px; text-align: center; color: #666;">
                            Camera feed unavailable
                        </div>
                    </div>
                    <p style="margin: 4px 0 0 0; font-size: 11px; color: #666; text-align: center;">
                        ${properties.name}
                    </p>
                </div>
            `;
        } else {
            console.warn('No camera views or image_url available');
            cameraViewsHTML = `
                <div style="padding: 20px; background: #f0f0f0; border-radius: 6px; text-align: center; margin: 10px 0;">
                    <i class="fas fa-video-slash" style="font-size: 2rem; color: #999; margin-bottom: 10px;"></i>
                    <p style="color: #666;">No camera feed available</p>
                </div>
            `;
        }

        const popup = new atlas.Popup({
            content: `
                <div class="azure-event-popup" style="min-width: 340px; max-width: 450px;">
                    <h3 style="background: linear-gradient(135deg, #00263A 0%, #003E5C 100%); color: white; padding: 12px 40px 12px 16px; margin: -12px -16px 12px -16px; border-radius: 8px 8px 0 0; word-wrap: break-word; overflow-wrap: break-word; white-space: normal; line-height: 1.3; font-size: 0.95rem;">
                        <i class="fas fa-video"></i> ${properties.name || 'UDOT Camera'}
                        ${properties.views && properties.views.length > 1 ? `<span style="font-size: 0.8rem; margin-left: 8px; opacity: 0.9;">(${properties.views.length} views)</span>` : ''}
                    </h3>
                    ${cameraViewsHTML}
                    <div style="background: #f8f9fa; padding: 12px; border-radius: 6px; margin: 10px 0;">
                        ${properties.roadway && properties.roadway !== 'Unknown' ? `<p style="margin: 4px 0;"><strong><i class="fas fa-road"></i> Roadway:</strong> ${properties.roadway}</p>` : ''}
                        ${properties.direction && properties.direction !== 'Unknown' ? `<p style="margin: 4px 0;"><strong><i class="fas fa-compass"></i> Direction:</strong> ${properties.direction}</p>` : ''}
                        ${properties.source ? `<p style="margin: 4px 0;"><strong><i class="fas fa-broadcast-tower"></i> Source:</strong> ${properties.source} (${properties.source_id || 'N/A'})</p>` : ''}
                    </div>
                    <p style="font-size: 0.75em; color: #999; margin-top: 8px; padding: 6px; background: #f0f0f0; border-radius: 4px;">
                        <i class="fas fa-info-circle"></i> Camera ID: ${properties.id} | UDOT Live Feed
                    </p>
                </div>
            `,
            position,
            pixelOffset: [0, -20],
            closeButton: true,
            fillColor: 'white',
            closeOnMove: false
        });

        popup.open(this.map);
        console.log('Camera popup opened successfully with', properties.views?.length || 0, 'view(s)');
    }

    showConstructionEventPopup(position, properties) {
        console.log('=== Construction Event Popup ===');
        console.log('Event properties:', properties);

        // Format dates
        const formatDate = (dateString) => {
            if (!dateString) return 'Not specified';
            try {
                const date = new Date(dateString);
                return date.toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit'
                });
            } catch (e) {
                return dateString;
            }
        };

        // Get display properties
        const displayIcon = properties.display_icon || '🚧';
        const displayColor = properties.display_color || '#f59e0b';
        const isFullClosure = properties.is_full_closure;

        // Build description with truncation for long text
        let description = properties.description || 'No description available';
        const maxDescLength = 300;
        if (description.length > maxDescLength) {
            description = description.substring(0, maxDescLength) + '...';
        }

        // Simplified popup - show only essential info, link to details section
        const popup = new atlas.Popup({
            content: `
                <div class="azure-event-popup" style="min-width: 280px; max-width: 350px;">
                    <h3 style="background: linear-gradient(135deg, ${displayColor} 0%, ${displayColor}dd 100%); color: white; padding: 12px 16px; margin: -12px -16px 12px -16px; border-radius: 8px 8px 0 0; font-size: 1rem; line-height: 1.3;">
                        ${displayIcon} ${properties.name || 'Construction Event'}
                    </h3>

                    ${isFullClosure ? `
                    <div style="background: #dc2626; color: white; padding: 8px 12px; border-radius: 6px; margin: 10px 0; text-align: center; font-weight: bold;">
                        ⚠️ FULL ROAD CLOSURE
                    </div>
                    ` : ''}

                    <div style="margin: 12px 0;">
                        ${properties.roadway ? `<p style="margin: 6px 0; font-size: 0.9rem;"><strong><i class="fas fa-road"></i> Roadway:</strong> ${properties.roadway}</p>` : ''}
                        ${properties.location ? `<p style="margin: 6px 0; font-size: 0.9rem; color: #666;"><i class="fas fa-map-marker-alt"></i> ${properties.location}</p>` : ''}
                    </div>

                    <button
                        onclick="window.provoCanyonMap.showEventDetails(${JSON.stringify(properties).replace(/"/g, '&quot;')}); this.closest('.atlas-popup').querySelector('.atlas-popup-close-button').click();"
                        style="width: 100%; padding: 10px; background: var(--usu-blue, #00263A); color: white; border: none; border-radius: 6px; font-size: 0.95rem; font-weight: 600; cursor: pointer; margin-top: 12px; transition: background 0.2s ease;"
                        onmouseover="this.style.background='#003E5C'"
                        onmouseout="this.style.background='var(--usu-blue, #00263A)'"
                    >
                        <i class="fas fa-info-circle"></i> View Full Details
                    </button>
                </div>
            `,
            position,
            pixelOffset: [0, -20],
            closeButton: true,
            fillColor: 'white',
            closeOnMove: false
        });

        popup.open(this.map);
        console.log('Simplified construction event popup opened');
    }

    displayAlerts(alerts) {
        if (!alerts || alerts.length === 0) {
            console.log('No alerts to display');
            return;
        }

        console.log('Displaying', alerts.length, 'alert(s)');

        // Create alerts container if it doesn't exist
        let alertsContainer = document.querySelector('.provo-alerts-container');
        if (!alertsContainer) {
            alertsContainer = document.createElement('div');
            alertsContainer.className = 'provo-alerts-container';
            alertsContainer.style.cssText = `
                position: fixed;
                top: 80px;
                right: 20px;
                z-index: 1000;
                max-width: 400px;
                display: flex;
                flex-direction: column;
                gap: 10px;
            `;
            document.body.appendChild(alertsContainer);
        }

        // Clear existing alerts
        alertsContainer.innerHTML = '';

        // Add each alert
        alerts.forEach((alert, index) => {
            const alertBox = document.createElement('div');
            const alertColor = alert.high_importance ? '#dc2626' : '#f59e0b';

            alertBox.className = `provo-alert alert-${index}`;
            alertBox.style.cssText = `
                background: white;
                border-left: 4px solid ${alertColor};
                border-radius: 8px;
                padding: 16px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                animation: slideInRight 0.3s ease-out;
            `;

            alertBox.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
                    <h4 style="margin: 0; color: ${alertColor}; font-size: 1rem;">
                        ${alert.high_importance ? '🚨' : '⚠️'} ${alert.high_importance ? 'High Priority Alert' : 'Alert'}
                    </h4>
                    <button onclick="this.closest('.provo-alert').remove()" style="background: none; border: none; font-size: 1.2rem; cursor: pointer; color: #999; padding: 0; line-height: 1;">×</button>
                </div>
                <p style="margin: 0 0 8px 0; font-size: 0.9rem; line-height: 1.4;">${alert.message}</p>
                ${alert.notes ? `<p style="margin: 8px 0 0 0; padding-top: 8px; border-top: 1px solid #e0e0e0; font-size: 0.85rem; color: #666;">${alert.notes}</p>` : ''}
                ${alert.end_time ? `<p style="margin: 8px 0 0 0; font-size: 0.75rem; color: #999;"><i class="fas fa-clock"></i> Until: ${new Date(alert.end_time).toLocaleString()}</p>` : ''}
            `;

            alertsContainer.appendChild(alertBox);
        });

        // Add CSS animation
        const style = document.createElement('style');
        style.textContent = `
            @keyframes slideInRight {
                from {
                    transform: translateX(100%);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }
        `;
        if (!document.querySelector('style[data-provo-alerts]')) {
            style.setAttribute('data-provo-alerts', 'true');
            document.head.appendChild(style);
        }
    }


    showRoadConditionPopup(position, properties) {
        const conditionColors = {
            1: '#00A000', 2: '#FFFF00', 3: '#FFA500', 4: '#FF0000', 5: '#000000'
        };

        const conditionLabels = {
            1: 'Clear/Dry',
            2: 'Wet/Minor Impacts',
            3: 'Snow/Ice - High Caution',
            4: 'Hazardous - Travel Not Recommended',
            5: 'Road Closed'
        };

        const level = properties.condition_level || 1;

        const popup = new atlas.Popup({
            content: `
                <div class="azure-event-popup" style="min-width: 280px;">
                    <h3 style="color: ${conditionColors[level]}; border-bottom: 2px solid ${conditionColors[level]}; padding-bottom: 8px;">
                        <i class="fas fa-road"></i> Road Conditions
                    </h3>
                    <p style="margin: 12px 0 8px 0;"><strong>Roadway:</strong> ${properties.roadway || 'Unknown'}</p>
                    <p style="margin: 8px 0;"><strong>Condition:</strong> <span style="color: ${conditionColors[level]}; font-weight: bold; padding: 4px 8px; background: rgba(0,0,0,0.05); border-radius: 4px;">${conditionLabels[level]}</span></p>
                    ${properties.weather_description ? `<p style="margin: 8px 0; font-style: italic; color: #666;">${properties.weather_description}</p>` : ''}
                </div>
            `,
            position,
            pixelOffset: [0, -15],
            closeButton: true,
            closeOnMove: false
        });

        popup.open(this.map);
    }

    showTrafficIncidentPopup(position, properties) {
        const popup = new atlas.Popup({
            content: `
                <div class="azure-event-popup" style="min-width: 280px;">
                    <h3 style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: white; padding: 12px 16px; margin: -12px -16px 12px -16px; border-radius: 8px 8px 0 0;">
                        <i class="fas fa-exclamation-triangle"></i> Traffic Incident
                    </h3>
                    <p style="margin: 12px 0 8px 0;"><strong>Type:</strong> ${properties.type || 'Unknown'}</p>
                    <p style="margin: 8px 0;">${properties.description || 'No description available'}</p>
                    ${properties.delay ? `
                        <p style="margin: 12px 0 0 0; padding: 8px; background: #fff3cd; border-left: 4px solid #fbbf24; border-radius: 4px;">
                            <strong><i class="fas fa-clock"></i> Expected Delay:</strong> ${Math.round(properties.delay / 60)} minutes
                        </p>
                    ` : ''}
                </div>
            `,
            position,
            pixelOffset: [0, -15],
            closeButton: true,
            closeOnMove: false
        });

        popup.open(this.map);
    }


    // ============= UI PANELS =============

    setupUI() {
        // Hide weather panel, layer controls, and toolbar for cleaner interface
        // this.createWeatherPanel();
        // this.createRoutePlannerPanel();
        // this.createLayerControls();
        // this.createToolbar();
    }

    createWeatherPanel() {
        const panel = document.createElement('div');
        panel.id = 'weather-panel';
        panel.className = 'info-panel';
        panel.style.cssText = `
            position: absolute;
            top: 80px;
            right: 10px;
            background: white;
            padding: 15px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
            z-index: 1000;
            width: 300px;
            max-height: 400px;
            overflow-y: auto;
            font-family: 'Roboto', sans-serif;
        `;

        panel.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <h3 style="margin: 0;"><i class="fas fa-cloud-sun"></i> Weather</h3>
                <button id="close-weather-panel" style="border: none; background: none; cursor: pointer; font-size: 1.2rem;">&times;</button>
            </div>
            <div id="weather-content">Loading...</div>
        `;

        document.getElementById('provo-canyon-map').appendChild(panel);

        document.getElementById('close-weather-panel').addEventListener('click', () => {
            panel.style.display = 'none';
            this.uiState.weatherPanelOpen = false;
        });
    }

    updateWeatherPanel(data) {
        const content = document.getElementById('weather-content');
        if (!content) return;

        const current = data.current;
        const hourly = data.hourly?.slice(0, 6) || [];

        content.innerHTML = `
            <div style="margin-bottom: 15px;">
                <div style="display: flex; align-items: center; justify-content: space-between;">
                    <div>
                        <div style="font-size: 2.5rem; font-weight: bold;">${current?.temperature || '--'}°F</div>
                        <div style="color: #666;">${current?.condition || 'Unknown'}</div>
                    </div>
                    <div style="text-align: right; color: #666; font-size: 0.9rem;">
                        <div>Feels like: ${current?.realFeel || '--'}°F</div>
                        <div>Humidity: ${current?.relativeHumidity || '--'}%</div>
                        <div>Wind: ${current?.windSpeed || '--'} mph</div>
                    </div>
                </div>
            </div>
            ${data.alerts && data.alerts.length > 0 ? `
                <div style="background: #FFF3CD; padding: 10px; border-radius: 4px; border-left: 4px solid #FFC107; margin-bottom: 10px;">
                    <strong><i class="fas fa-exclamation-triangle"></i> ${data.alerts.length} Active Alert(s)</strong>
                    ${data.alerts.map(alert => `
                        <div style="margin-top: 5px; font-size: 0.9rem;">${alert.description || alert.category}</div>
                    `).join('')}
                </div>
            ` : ''}
            <div>
                <h4 style="margin: 10px 0 5px 0;">Hourly Forecast</h4>
                <div style="display: flex; gap: 10px; overflow-x: auto;">
                    ${hourly.map(hour => `
                        <div style="text-align: center; min-width: 60px;">
                            <div style="font-size: 0.8rem; color: #666;">${new Date(hour.dateTime).getHours()}:00</div>
                            <div style="font-size: 1.1rem; font-weight: bold; margin: 5px 0;">${hour.temperature}°</div>
                            <div style="font-size: 0.8rem; color: #666;">${hour.precipitationProbability || 0}% 💧</div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    createRoutePlannerPanel() {
        const panel = document.createElement('div');
        panel.id = 'route-planner-panel';
        panel.className = 'info-panel';
        panel.style.cssText = `
            position: absolute;
            top: 80px;
            left: 10px;
            background: white;
            padding: 15px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
            z-index: 1000;
            width: 300px;
            display: none;
            font-family: 'Roboto', sans-serif;
        `;

        panel.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <h3 style="margin: 0;"><i class="fas fa-route"></i> Route Planner</h3>
                <button id="close-route-panel" style="border: none; background: none; cursor: pointer; font-size: 1.2rem; color: #666;">&times;</button>
            </div>
            <div>
                <input type="text" id="route-start" placeholder="Start: e.g., Provo, UT" style="width: 100%; padding: 8px; margin-bottom: 10px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box;">
                <input type="text" id="route-end" placeholder="End: e.g., Heber City, UT" style="width: 100%; padding: 8px; margin-bottom: 10px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box;">
                <button id="calculate-route-btn" style="width: 100%; padding: 10px; background: #00263A; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">
                    <i class="fas fa-directions"></i> Calculate Route
                </button>
                <button id="clear-route-btn" style="width: 100%; padding: 8px; background: #f0f0f0; color: #333; border: none; border-radius: 4px; cursor: pointer; margin-top: 8px; display: none;">
                    Clear Route
                </button>
            </div>
            <div id="route-results" style="margin-top: 15px;"></div>
        `;

        document.getElementById('provo-canyon-map').appendChild(panel);

        // Add event listeners
        document.getElementById('close-route-panel').addEventListener('click', () => {
            panel.style.display = 'none';
        });

        document.getElementById('calculate-route-btn').addEventListener('click', () => {
            this.calculateRoute();
        });

        document.getElementById('clear-route-btn').addEventListener('click', () => {
            this.clearRoute();
        });
    }

    async calculateRoute() {
        const startInput = document.getElementById('route-start').value.trim();
        const endInput = document.getElementById('route-end').value.trim();
        const resultsDiv = document.getElementById('route-results');
        const calculateBtn = document.getElementById('calculate-route-btn');
        const clearBtn = document.getElementById('clear-route-btn');

        if (!startInput || !endInput) {
            resultsDiv.innerHTML = '<p style="color: #d32f2f; font-size: 0.9rem;">Please enter both start and end locations</p>';
            return;
        }

        // Show loading
        calculateBtn.disabled = true;
        calculateBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Calculating...';
        resultsDiv.innerHTML = '<p style="color: #666; font-size: 0.9rem;"><i class="fas fa-spinner fa-spin"></i> Searching for locations...</p>';

        try {
            // Geocode start and end locations using Azure Maps Search API
            const searchUrl = `https://atlas.microsoft.com/search/address/json?api-version=1.0&subscription-key=${this.azureKey}`;

            const [startResponse, endResponse] = await Promise.all([
                fetch(`${searchUrl}&query=${encodeURIComponent(startInput)}`),
                fetch(`${searchUrl}&query=${encodeURIComponent(endInput)}`)
            ]);

            const startData = await startResponse.json();
            const endData = await endResponse.json();

            if (!startData.results || startData.results.length === 0) {
                throw new Error('Could not find start location');
            }
            if (!endData.results || endData.results.length === 0) {
                throw new Error('Could not find end location');
            }

            const startPos = startData.results[0].position;
            const endPos = endData.results[0].position;

            resultsDiv.innerHTML = '<p style="color: #666; font-size: 0.9rem;"><i class="fas fa-spinner fa-spin"></i> Calculating route...</p>';

            // Calculate route using Azure Maps Route API with detailed instructions
            const routeUrl = `https://atlas.microsoft.com/route/directions/json?api-version=1.0&subscription-key=${this.azureKey}&query=${startPos.lat},${startPos.lon}:${endPos.lat},${endPos.lon}&instructionsType=text&routeRepresentation=polyline&computeTravelTimeFor=all&report=effectiveSettings`;

            const routeResponse = await fetch(routeUrl);
            const routeData = await routeResponse.json();

            console.log('Route API response:', routeData);

            if (!routeData.routes || routeData.routes.length === 0) {
                throw new Error('Could not calculate route');
            }

            const route = routeData.routes[0];
            const summary = route.summary;
            const legs = route.legs[0];

            // Display route on map
            this.displayRoute(route);

            // Show results
            const distance = (summary.lengthInMeters * 0.000621371).toFixed(1); // Convert to miles
            const duration = Math.round(summary.travelTimeInSeconds / 60); // Convert to minutes
            const trafficDelay = summary.trafficDelayInSeconds ? Math.round(summary.trafficDelayInSeconds / 60) : 0;
            const hours = Math.floor(duration / 60);
            const minutes = duration % 60;
            const timeStr = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

            // Get turn-by-turn directions
            const directions = this.parseTurnByTurnDirections(legs);
            console.log('Parsed directions:', directions);

            // Check for hazards along route
            const hazards = await this.checkRouteHazards(legs.points);
            console.log('Route hazards found:', hazards);

            // Build directions HTML
            let directionsHTML = '';
            if (directions.length > 0) {
                directionsHTML = `
                    <div style="margin-top: 12px; border: 1px solid #e0e0e0; border-radius: 6px; overflow: hidden;">
                        <button id="toggle-directions" style="width: 100%; padding: 10px; background: #00263A; color: white; border: none; cursor: pointer; font-weight: bold; text-align: left; display: flex; justify-content: space-between; align-items: center;">
                            <span><i class="fas fa-directions"></i> Turn-by-Turn Directions (${directions.length} steps)</span>
                            <i class="fas fa-chevron-down" id="directions-arrow"></i>
                        </button>
                        <div id="directions-list" style="display: none; max-height: 300px; overflow-y: auto; background: white; padding: 12px;">
                            ${directions.map((dir, idx) => `
                                <div style="padding: 8px; border-bottom: 1px solid #f0f0f0; ${idx === directions.length - 1 ? 'border-bottom: none;' : ''}">
                                    <div style="display: flex; align-items: flex-start; gap: 10px;">
                                        <div style="min-width: 24px; height: 24px; background: #00263A; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.75rem; font-weight: bold;">
                                            ${idx + 1}
                                        </div>
                                        <div style="flex: 1;">
                                            <p style="margin: 0 0 4px 0; font-weight: 500; color: #333;">${dir.instruction}</p>
                                            ${dir.distance ? `<p style="margin: 0; font-size: 0.85rem; color: #666;"><i class="fas fa-arrows-alt-h"></i> ${dir.distance}</p>` : ''}
                                        </div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;
            }

            // Build hazards HTML
            let hazardsHTML = '';
            if (hazards.length > 0) {
                hazardsHTML = `
                    <div style="margin-top: 12px; padding: 10px; background: #fff3cd; border-left: 4px solid #ff6600; border-radius: 4px;">
                        <p style="margin: 0 0 8px 0; font-weight: bold; color: #856404;">
                            <i class="fas fa-exclamation-triangle"></i> Hazards Along Route (${hazards.length})
                        </p>
                        ${hazards.map(hazard => {
                            const icon = hazard.type === 'construction' ? '🚧' :
                                         hazard.type === 'incident' ? '⚠️' :
                                         hazard.type === 'closure' ? '🚫' : '⚠️';
                            return `
                                <div style="margin: 6px 0; padding: 8px; background: rgba(255,255,255,0.7); border-radius: 4px;">
                                    <p style="margin: 0 0 4px 0; font-weight: 600; color: #856404;">${icon} ${hazard.title}</p>
                                    <p style="margin: 0; font-size: 0.85rem; color: #666;">${hazard.description}</p>
                                    ${hazard.delay ? `<p style="margin: 4px 0 0 0; font-size: 0.85rem; color: #d32f2f;"><i class="fas fa-clock"></i> Delay: ~${hazard.delay} min</p>` : ''}
                                </div>
                            `;
                        }).join('')}
                    </div>
                `;
            }

            resultsDiv.innerHTML = `
                <div style="background: #f0f0f0; padding: 12px; border-radius: 6px; font-size: 0.9rem;">
                    <p style="margin: 0 0 8px 0; font-weight: bold; color: #00263A;">
                        <i class="fas fa-check-circle" style="color: #10b981;"></i> Route Found
                    </p>
                    <p style="margin: 4px 0; color: #333;">
                        <i class="fas fa-road"></i> Distance: <strong>${distance} miles</strong>
                    </p>
                    <p style="margin: 4px 0; color: #333;">
                        <i class="fas fa-clock"></i> Duration: <strong>${timeStr}</strong>
                    </p>
                    ${trafficDelay > 0 ? `
                        <p style="margin: 4px 0; color: #ef4444;">
                            <i class="fas fa-traffic-light"></i> Traffic Delay: <strong>+${trafficDelay} min</strong>
                        </p>
                    ` : `
                        <p style="margin: 4px 0; color: #10b981;">
                            <i class="fas fa-check"></i> No traffic delays
                        </p>
                    `}
                </div>
                ${hazardsHTML}
                ${directionsHTML}
            `;

            // Add toggle functionality for directions
            if (directions.length > 0) {
                setTimeout(() => {
                    const toggleBtn = document.getElementById('toggle-directions');
                    const directionsList = document.getElementById('directions-list');
                    const arrow = document.getElementById('directions-arrow');

                    if (toggleBtn) {
                        toggleBtn.addEventListener('click', () => {
                            const isHidden = directionsList.style.display === 'none';
                            directionsList.style.display = isHidden ? 'block' : 'none';
                            arrow.className = isHidden ? 'fas fa-chevron-up' : 'fas fa-chevron-down';
                        });
                    }
                }, 100);
            }

            clearBtn.style.display = 'block';

        } catch (error) {
            console.error('Route calculation error:', error);
            resultsDiv.innerHTML = `<p style="color: #d32f2f; font-size: 0.9rem;"><i class="fas fa-exclamation-triangle"></i> ${error.message}</p>`;
        } finally {
            calculateBtn.disabled = false;
            calculateBtn.innerHTML = '<i class="fas fa-directions"></i> Calculate Route';
        }
    }

    displayRoute(route) {
        // Clear previous route
        this.clearRoute();

        // Get route coordinates
        const legs = route.legs[0];
        const points = legs.points.map(point => [point.longitude, point.latitude]);

        // Create line data source and add to map
        this.dataSources.routes.setShapes([
            new atlas.data.LineString(points)
        ]);

        // Add route layer if it doesn't exist
        if (!this.layers.routes) {
            this.layers.routes = new atlas.layer.LineLayer(this.dataSources.routes, null, {
                strokeColor: '#00263A',
                strokeWidth: 5,
                strokeOpacity: 0.8
            });
            this.map.layers.add(this.layers.routes);
        } else {
            this.layers.routes.setOptions({ visible: true });
        }

        // Add start and end markers
        const startPoint = points[0];
        const endPoint = points[points.length - 1];

        const startMarker = new atlas.HtmlMarker({
            position: startPoint,
            htmlContent: '<div style="background: #10b981; color: white; padding: 8px 12px; border-radius: 20px; font-weight: bold; box-shadow: 0 2px 8px rgba(0,0,0,0.3);"><i class="fas fa-map-marker-alt"></i> Start</div>'
        });

        const endMarker = new atlas.HtmlMarker({
            position: endPoint,
            htmlContent: '<div style="background: #ef4444; color: white; padding: 8px 12px; border-radius: 20px; font-weight: bold; box-shadow: 0 2px 8px rgba(0,0,0,0.3);"><i class="fas fa-flag-checkered"></i> End</div>'
        });

        this.map.markers.add([startMarker, endMarker]);
        this.routeMarkers = [startMarker, endMarker];

        // Fit map to route bounds
        // points are in [lon, lat] format, fromPositions expects [lon, lat]
        const bounds = atlas.data.BoundingBox.fromPositions(points);
        this.map.setCamera({
            bounds: bounds,
            padding: 80
        });
    }

    clearRoute() {
        // Clear route line
        if (this.dataSources.routes) {
            this.dataSources.routes.clear();
        }

        // Hide route layer
        if (this.layers.routes) {
            this.layers.routes.setOptions({ visible: false });
        }

        // Remove route markers
        if (this.routeMarkers) {
            this.routeMarkers.forEach(marker => this.map.markers.remove(marker));
            this.routeMarkers = null;
        }

        // Clear results and hide clear button
        const resultsDiv = document.getElementById('route-results');
        const clearBtn = document.getElementById('clear-route-btn');
        if (resultsDiv) resultsDiv.innerHTML = '';
        if (clearBtn) clearBtn.style.display = 'none';

        // Reset map view to Provo Canyon
        this.map.setCamera({
            center: this.mapCenter,
            zoom: this.mapZoom
        });
    }

    parseTurnByTurnDirections(legs) {
        const directions = [];

        if (!legs || !legs.points) {
            return directions;
        }

        // Azure Maps provides guidance in the legs
        if (legs.summary && legs.summary.lengthInMeters) {
            // Add start instruction
            directions.push({
                instruction: 'Start at your location',
                distance: ''
            });

            // If we have instruction points, parse them
            if (legs.points && legs.points.length > 0) {
                // Create simple waypoint-based directions
                const totalDistance = legs.summary.lengthInMeters;
                const pointInterval = Math.max(1, Math.floor(legs.points.length / 5)); // Show ~5 waypoints

                for (let i = pointInterval; i < legs.points.length - 1; i += pointInterval) {
                    const point = legs.points[i];
                    const distanceFromStart = (i / legs.points.length) * totalDistance;
                    const miles = (distanceFromStart * 0.000621371).toFixed(1);

                    directions.push({
                        instruction: `Continue on route`,
                        distance: `${miles} miles from start`
                    });
                }
            }

            // Add arrival instruction
            const totalMiles = (legs.summary.lengthInMeters * 0.000621371).toFixed(1);
            directions.push({
                instruction: 'Arrive at your destination',
                distance: `${totalMiles} miles total`
            });
        }

        return directions;
    }

    async checkRouteHazards(routePoints) {
        const hazards = [];

        if (!routePoints || routePoints.length === 0) {
            return hazards;
        }

        try {
            // Get traffic incidents
            const bbox = this.calculateBoundingBox(routePoints);
            const incidentsResponse = await fetch(`/api/azure/traffic/incidents?bbox=${bbox.join(',')}`);

            if (incidentsResponse.ok) {
                const incidentsData = await incidentsResponse.json();

                if (incidentsData.success && incidentsData.incidents) {
                    console.log('Checking incidents along route:', incidentsData.incidents);

                    // Check each incident to see if it's near the route
                    incidentsData.incidents.forEach(incident => {
                        if (incident.geometry && incident.geometry.coordinates) {
                            const incidentCoords = incident.geometry.coordinates;

                            // Check if incident is within ~1 mile of route
                            const isNearRoute = routePoints.some(point => {
                                const distance = this.calculateDistance(
                                    point.latitude, point.longitude,
                                    incidentCoords[1], incidentCoords[0]
                                );
                                return distance < 1.6; // 1 mile in km
                            });

                            if (isNearRoute) {
                                hazards.push({
                                    type: this.categorizeIncident(incident),
                                    title: incident.properties?.type || 'Traffic Incident',
                                    description: incident.properties?.description || 'No details available',
                                    delay: incident.properties?.delay ? Math.round(incident.properties.delay / 60) : null
                                });
                            }
                        }
                    });
                }
            }

            // Check for construction zones (if UDOT data available)
            // This would require additional UDOT API integration

            console.log(`Found ${hazards.length} hazards along route`);
        } catch (error) {
            console.error('Error checking route hazards:', error);
        }

        return hazards;
    }

    categorizeIncident(incident) {
        const type = (incident.properties?.type || '').toLowerCase();
        const desc = (incident.properties?.description || '').toLowerCase();

        if (desc.includes('construction') || desc.includes('roadwork')) {
            return 'construction';
        } else if (desc.includes('closed') || desc.includes('closure')) {
            return 'closure';
        } else {
            return 'incident';
        }
    }

    calculateBoundingBox(points) {
        let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;

        points.forEach(point => {
            minLat = Math.min(minLat, point.latitude);
            maxLat = Math.max(maxLat, point.latitude);
            minLon = Math.min(minLon, point.longitude);
            maxLon = Math.max(maxLon, point.longitude);
        });

        // Add buffer of ~5 miles
        const buffer = 0.1;
        return [minLon - buffer, minLat - buffer, maxLon + buffer, maxLat + buffer];
    }

    calculateDistance(lat1, lon1, lat2, lon2) {
        // Haversine formula for distance in kilometers
        const R = 6371; // Earth's radius in km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    }

    createLayerControls() {
        const controls = document.createElement('div');
        controls.className = 'layer-controls';
        controls.style.cssText = `
            position: absolute;
            top: 10px;
            left: 10px;
            background: white;
            padding: 15px;
            border-radius: 4px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
            z-index: 1000;
            font-family: 'Roboto', sans-serif;
        `;

        controls.innerHTML = `
            <h4 style="margin: 0 0 10px 0;"><i class="fas fa-layer-group"></i> Map Layers</h4>
            <div style="display: flex; flex-direction: column; gap: 8px;">
                <label style="cursor: pointer;"><input type="checkbox" id="toggle-traffic" checked> Traffic Flow</label>
                <label style="cursor: pointer;"><input type="checkbox" id="toggle-road-conditions" checked> Road Conditions (UDOT)</label>
                <label style="cursor: pointer;"><input type="checkbox" id="toggle-cameras" checked> Cameras (UDOT)</label>
                <label style="cursor: pointer;"><input type="checkbox" id="toggle-weather-radar"> Weather Radar</label>
            </div>
        `;

        document.getElementById('provo-canyon-map').appendChild(controls);

        // Event listeners
        document.getElementById('toggle-traffic').addEventListener('change', (e) => {
            this.map.setTraffic({ flow: e.target.checked ? 'relative' : 'none', incidents: false });
        });

        document.getElementById('toggle-road-conditions').addEventListener('change', (e) => {
            if (this.layers.roadConditions) this.layers.roadConditions.setOptions({ visible: e.target.checked });
        });

        document.getElementById('toggle-cameras').addEventListener('change', (e) => {
            if (this.layers.cameras) this.layers.cameras.setOptions({ visible: e.target.checked });
        });

        document.getElementById('toggle-weather-radar').addEventListener('change', (e) => {
            this.toggleWeatherRadar(e.target.checked);
        });
    }

    createToolbar() {
        const toolbar = document.createElement('div');
        toolbar.className = 'map-toolbar';
        toolbar.style.cssText = `
            position: absolute;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: white;
            padding: 10px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
            z-index: 1000;
            display: flex;
            gap: 10px;
        `;

        toolbar.innerHTML = `
            <button id="show-route-planner" class="toolbar-btn" title="Route Planner">
                <i class="fas fa-route"></i> Route
            </button>
            <button id="show-isochrone" class="toolbar-btn" title="Reachable Range">
                <i class="fas fa-circle"></i> Range
            </button>
            <button id="show-elevation" class="toolbar-btn" title="Elevation Profile">
                <i class="fas fa-chart-area"></i> Elevation
            </button>
        `;

        document.getElementById('provo-canyon-map').appendChild(toolbar);

        // Styling for toolbar buttons
        const style = document.createElement('style');
        style.innerHTML = `
            .toolbar-btn {
                padding: 10px 15px;
                border: none;
                background: #0044AA;
                color: white;
                border-radius: 4px;
                cursor: pointer;
                font-family: 'Roboto', sans-serif;
                font-weight: 500;
                transition: background 0.2s;
            }
            .toolbar-btn:hover {
                background: #003388;
            }
        `;
        document.head.appendChild(style);

        // Event listeners
        document.getElementById('show-route-planner').addEventListener('click', () => {
            const panel = document.getElementById('route-planner-panel');
            panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
        });

        document.getElementById('show-isochrone').addEventListener('click', () => {
            this.showIsochroneDialog();
        });

        document.getElementById('show-elevation').addEventListener('click', () => {
            this.showElevationProfile();
        });
    }

    toggleWeatherRadar(show) {
        if (show) {
            // Add weather radar tile layer
            if (!this.radarLayer) {
                this.radarLayer = new atlas.layer.TileLayer({
                    tileUrl: `https://atlas.microsoft.com/map/tile?api-version=2.0&tilesetId=microsoft.weather.radar.main&zoom={z}&x={x}&y={y}&subscription-key=${this.azureKey}`,
                    opacity: 0.6,
                    tileSize: 256
                });
                this.map.layers.add(this.radarLayer, 'labels');
            } else {
                this.radarLayer.setOptions({ visible: true });
            }

            // Show radar legend
            this.showRadarLegend();
            this.uiState.showWeatherRadar = true;
        } else {
            // Hide radar layer
            if (this.radarLayer) {
                this.radarLayer.setOptions({ visible: false });
            }

            // Hide radar legend
            this.hideRadarLegend();
            this.uiState.showWeatherRadar = false;
        }
    }

    showRadarLegend() {
        if (this.radarLegend) {
            this.radarLegend.style.display = 'block';
            return;
        }

        // Create radar legend
        this.radarLegend = document.createElement('div');
        this.radarLegend.className = 'radar-legend';
        this.radarLegend.style.cssText = `
            position: absolute;
            bottom: 100px;
            right: 20px;
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(10px);
            padding: 15px;
            border-radius: 12px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            z-index: 1000;
            font-family: 'Inter', 'Roboto', sans-serif;
            border: 1px solid rgba(0, 0, 0, 0.1);
        `;

        this.radarLegend.innerHTML = `
            <h4 style="margin: 0 0 10px 0; font-size: 0.9rem; color: #00263A; font-weight: 700;">
                <i class="fas fa-cloud-rain"></i> Precipitation Intensity
            </h4>
            <div style="display: flex; flex-direction: column; gap: 6px;">
                <div style="display: flex; align-items: center; gap: 8px; font-size: 0.85rem;">
                    <div style="width: 30px; height: 12px; background: #00E5FF; border-radius: 2px;"></div>
                    <span style="color: #00263A;">Light</span>
                </div>
                <div style="display: flex; align-items: center; gap: 8px; font-size: 0.85rem;">
                    <div style="width: 30px; height: 12px; background: #00FF00; border-radius: 2px;"></div>
                    <span style="color: #00263A;">Moderate</span>
                </div>
                <div style="display: flex; align-items: center; gap: 8px; font-size: 0.85rem;">
                    <div style="width: 30px; height: 12px; background: #FFFF00; border-radius: 2px;"></div>
                    <span style="color: #00263A;">Heavy</span>
                </div>
                <div style="display: flex; align-items: center; gap: 8px; font-size: 0.85rem;">
                    <div style="width: 30px; height: 12px; background: #FF0000; border-radius: 2px;"></div>
                    <span style="color: #00263A;">Intense</span>
                </div>
                <div style="display: flex; align-items: center; gap: 8px; font-size: 0.85rem;">
                    <div style="width: 30px; height: 12px; background: #FF00FF; border-radius: 2px;"></div>
                    <span style="color: #00263A;">Severe</span>
                </div>
            </div>
        `;

        document.getElementById('provo-canyon-map').appendChild(this.radarLegend);
    }

    hideRadarLegend() {
        if (this.radarLegend) {
            this.radarLegend.style.display = 'none';
        }
    }

    async showIsochroneDialog() {
        const timeBudget = prompt('Enter time budget in minutes (5-120):', '30');
        if (!timeBudget) return;

        const time = parseInt(timeBudget);
        if (isNaN(time) || time < 5 || time > 120) {
            alert('Please enter a valid time between 5 and 120 minutes');
            return;
        }

        // Create loading popup
        const loadingPopup = new atlas.Popup({
            position: this.mapCenter,
            content: '<div style="padding: 15px; text-align: center;"><i class="fas fa-spinner fa-spin"></i> Calculating reachable area...</div>',
            closeButton: false
        });
        loadingPopup.open(this.map);

        try {
            const response = await fetch(`/api/azure/route/reachable-range?lat=${this.mapCenter[1]}&lon=${this.mapCenter[0]}&timeBudget=${time * 60}`);
            const data = await response.json();

            loadingPopup.close();

            if (data.success && data.range) {
                // Clear previous isochrone
                this.dataSources.isochrone.clear();

                // Get the boundary coordinates
                const boundary = data.range.boundary;

                // Create polygon feature
                const polygon = new atlas.data.Polygon([boundary]);

                this.dataSources.isochrone.add(polygon);

                // Add or show isochrone layer
                if (!this.layers.isochrone) {
                    this.layers.isochrone = new atlas.layer.PolygonLayer(this.dataSources.isochrone, null, {
                        fillColor: 'rgba(0, 38, 58, 0.2)',
                        strokeColor: '#00263A',
                        strokeWidth: 3
                    });
                    this.map.layers.add(this.layers.isochrone, 'labels');
                } else {
                    this.layers.isochrone.setOptions({ visible: true });
                }

                // Add center marker
                const centerMarker = new atlas.HtmlMarker({
                    position: this.mapCenter,
                    htmlContent: '<div style="background: #00263A; color: white; padding: 8px 12px; border-radius: 20px; font-weight: bold; box-shadow: 0 2px 8px rgba(0,0,0,0.3);"><i class="fas fa-map-marker-alt"></i> Origin</div>'
                });
                this.map.markers.add(centerMarker);
                this.isochroneMarker = centerMarker;

                // Fit map to isochrone bounds
                const bounds = atlas.data.BoundingBox.fromData(polygon);
                this.map.setCamera({
                    bounds: bounds,
                    padding: 80
                });

                // Show success popup
                const successPopup = new atlas.Popup({
                    position: this.mapCenter,
                    content: `<div style="padding: 15px; text-align: center;"><i class="fas fa-check-circle" style="color: #10b981;"></i><br><strong>Reachable area within ${timeBudget} minutes</strong><br><button onclick="document.querySelector('.atlas-popup-close-button').click()" style="margin-top: 10px; padding: 6px 12px; background: #00263A; color: white; border: none; border-radius: 4px; cursor: pointer;">Close</button></div>`,
                    closeButton: true
                });
                successPopup.open(this.map);

            } else {
                throw new Error('No reachable range data returned');
            }
        } catch (error) {
            loadingPopup.close();
            console.error('Error showing isochrone:', error);
            alert('Failed to calculate reachable range. Please try again.');
        }
    }

    clearIsochrone() {
        if (this.dataSources.isochrone) {
            this.dataSources.isochrone.clear();
        }
        if (this.layers.isochrone) {
            this.layers.isochrone.setOptions({ visible: false });
        }
        if (this.isochroneMarker) {
            this.map.markers.remove(this.isochroneMarker);
            this.isochroneMarker = null;
        }
    }

    async showElevationProfile() {
        if (this.elevationMode) {
            // Already in elevation mode, cancel it
            this.cancelElevationMode();
            return;
        }

        // Enter elevation mode
        this.elevationMode = true;
        this.elevationPoints = [];

        // Show instruction popup
        const instructionPopup = new atlas.Popup({
            position: this.mapCenter,
            content: '<div style="padding: 15px; text-align: center; max-width: 250px;"><i class="fas fa-mountain"></i><br><strong>Elevation Profile</strong><br><p style="margin: 10px 0; font-size: 0.9rem;">Click two points on the map to see the elevation profile between them.</p><button id="cancel-elevation-btn" style="padding: 6px 12px; background: #ef4444; color: white; border: none; border-radius: 4px; cursor: pointer; margin-top: 8px;">Cancel</button></div>',
            closeButton: false
        });
        instructionPopup.open(this.map);

        // Add cancel button listener
        setTimeout(() => {
            const cancelBtn = document.getElementById('cancel-elevation-btn');
            if (cancelBtn) {
                cancelBtn.addEventListener('click', () => {
                    instructionPopup.close();
                    this.cancelElevationMode();
                });
            }
        }, 100);

        // Change cursor
        this.map.getCanvasContainer().style.cursor = 'crosshair';

        // Add click listener for elevation points
        this.elevationClickHandler = async (e) => {
            const position = e.position;
            this.elevationPoints.push(position);

            // Add marker
            const marker = new atlas.HtmlMarker({
                position: position,
                htmlContent: `<div style="background: #00263A; color: white; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; box-shadow: 0 2px 8px rgba(0,0,0,0.3);">${this.elevationPoints.length}</div>`
            });
            this.map.markers.add(marker);
            if (!this.elevationMarkers) this.elevationMarkers = [];
            this.elevationMarkers.push(marker);

            // If we have two points, calculate elevation profile
            if (this.elevationPoints.length === 2) {
                instructionPopup.close();
                await this.calculateElevationProfile();
                this.cancelElevationMode();
            }
        };

        this.map.events.add('click', this.elevationClickHandler);
    }

    async calculateElevationProfile() {
        const start = this.elevationPoints[0];
        const end = this.elevationPoints[1];

        // Create loading popup
        const loadingPopup = new atlas.Popup({
            position: [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2],
            content: '<div style="padding: 15px; text-align: center;"><i class="fas fa-spinner fa-spin"></i> Calculating elevation...</div>',
            closeButton: false
        });
        loadingPopup.open(this.map);

        try {
            // Generate points along the line
            const numPoints = 50;
            const points = [];
            for (let i = 0; i <= numPoints; i++) {
                const t = i / numPoints;
                const lon = start[0] + (end[0] - start[0]) * t;
                const lat = start[1] + (end[1] - start[1]) * t;
                points.push({ lat, lon });
            }

            // Get elevation data
            const response = await fetch('/api/azure/elevation', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ coordinates: points })
            });

            const data = await response.json();
            loadingPopup.close();

            if (data.success && data.elevations) {
                // Draw line on map
                const lineCoords = this.elevationPoints;
                const line = new atlas.data.LineString(lineCoords);

                if (!this.dataSources.elevationLine) {
                    this.dataSources.elevationLine = new atlas.source.DataSource();
                    this.map.sources.add(this.dataSources.elevationLine);
                }

                this.dataSources.elevationLine.add(line);

                if (!this.layers.elevationLine) {
                    this.layers.elevationLine = new atlas.layer.LineLayer(this.dataSources.elevationLine, null, {
                        strokeColor: '#FF6600',
                        strokeWidth: 4,
                        strokeOpacity: 0.8
                    });
                    this.map.layers.add(this.layers.elevationLine);
                }

                // Display elevation profile
                this.displayElevationProfile(data.elevations);
            } else {
                throw new Error('Failed to get elevation data');
            }
        } catch (error) {
            loadingPopup.close();
            console.error('Error calculating elevation:', error);
            alert('Failed to calculate elevation profile. Azure Maps elevation service may not be available in this region.');
        }
    }

    displayElevationProfile(elevations) {
        // Create elevation profile panel
        let profilePanel = document.getElementById('elevation-profile-panel');

        if (!profilePanel) {
            profilePanel = document.createElement('div');
            profilePanel.id = 'elevation-profile-panel';
            profilePanel.style.cssText = `
                position: absolute;
                bottom: 120px;
                left: 50%;
                transform: translateX(-50%);
                background: white;
                padding: 20px;
                border-radius: 12px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.2);
                z-index: 1000;
                width: 500px;
                max-width: 90vw;
                font-family: 'Roboto', sans-serif;
            `;
            document.getElementById('provo-canyon-map').appendChild(profilePanel);
        }

        // Calculate statistics
        const elevs = elevations.map(e => e.elevationInMeter * 3.28084); // Convert to feet
        const minElev = Math.min(...elevs);
        const maxElev = Math.max(...elevs);
        const elevGain = maxElev - minElev;

        // Create simple ASCII-style elevation chart
        const chartHeight = 100;
        const chartPoints = elevs.map((elev, i) => {
            const x = (i / (elevs.length - 1)) * 100;
            const y = 100 - ((elev - minElev) / (maxElev - minElev)) * 100;
            return `${x},${y}`;
        }).join(' ');

        profilePanel.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                <h3 style="margin: 0; color: #00263A;"><i class="fas fa-mountain"></i> Elevation Profile</h3>
                <button id="close-elevation-profile" style="border: none; background: none; cursor: pointer; font-size: 1.2rem; color: #666;">&times;</button>
            </div>
            <svg width="100%" height="${chartHeight}" style="background: #f0f0f0; border-radius: 6px; margin-bottom: 15px;">
                <polyline points="${chartPoints}" fill="none" stroke="#00263A" stroke-width="2" vector-effect="non-scaling-stroke"/>
                <polyline points="${chartPoints} 100,100 0,100" fill="rgba(0, 38, 58, 0.1)" stroke="none"/>
            </svg>
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; font-size: 0.9rem;">
                <div style="text-align: center; padding: 10px; background: #f0f0f0; border-radius: 6px;">
                    <div style="font-weight: bold; color: #00263A;">${minElev.toFixed(0)} ft</div>
                    <div style="color: #666; font-size: 0.85rem;">Min Elevation</div>
                </div>
                <div style="text-align: center; padding: 10px; background: #f0f0f0; border-radius: 6px;">
                    <div style="font-weight: bold; color: #00263A;">${maxElev.toFixed(0)} ft</div>
                    <div style="color: #666; font-size: 0.85rem;">Max Elevation</div>
                </div>
                <div style="text-align: center; padding: 10px; background: #f0f0f0; border-radius: 6px;">
                    <div style="font-weight: bold; color: #00263A;">${elevGain.toFixed(0)} ft</div>
                    <div style="color: #666; font-size: 0.85rem;">Elevation Gain</div>
                </div>
            </div>
        `;

        // Add close button listener
        document.getElementById('close-elevation-profile').addEventListener('click', () => {
            this.clearElevationProfile();
        });
    }

    cancelElevationMode() {
        this.elevationMode = false;
        this.elevationPoints = [];
        this.map.getCanvasContainer().style.cursor = 'grab';

        if (this.elevationClickHandler) {
            this.map.events.remove('click', this.elevationClickHandler);
            this.elevationClickHandler = null;
        }
    }

    clearElevationProfile() {
        // Remove panel
        const profilePanel = document.getElementById('elevation-profile-panel');
        if (profilePanel) profilePanel.remove();

        // Clear line
        if (this.dataSources.elevationLine) {
            this.dataSources.elevationLine.clear();
        }
        if (this.layers.elevationLine) {
            this.layers.elevationLine.setOptions({ visible: false });
        }

        // Remove markers
        if (this.elevationMarkers) {
            this.elevationMarkers.forEach(marker => this.map.markers.remove(marker));
            this.elevationMarkers = [];
        }

        this.elevationPoints = [];
    }

    showWeatherAlerts(alerts) {
        alerts.forEach(alert => {
            if (alert.severity >= 3) { // Only show major alerts
                const notification = document.createElement('div');
                notification.style.cssText = `
                    position: absolute;
                    top: 20px;
                    left: 50%;
                    transform: translateX(-50%);
                    background: #FFC107;
                    color: #000;
                    padding: 15px 20px;
                    border-radius: 8px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                    z-index: 10000;
                    max-width: 400px;
                    font-weight: bold;
                `;

                notification.innerHTML = `
                    <i class="fas fa-exclamation-triangle"></i> ${alert.description}
                    <button onclick="this.parentElement.remove()" style="float: right; border: none; background: none; cursor: pointer; font-size: 1.2rem;">&times;</button>
                `;

                document.getElementById('provo-canyon-map').appendChild(notification);

                // Auto-remove after 10 seconds
                setTimeout(() => notification.remove(), 10000);
            }
        });
    }

    hideLoading() {
        const loading = document.getElementById('map-loading');
        if (loading) loading.style.display = 'none';
    }

    showError(message) {
        const loading = document.getElementById('map-loading');
        if (loading) {
            loading.innerHTML = `<i class="fas fa-exclamation-triangle"></i> ${message}`;
            loading.style.color = '#d32f2f';
        }
    }

    /**
     * Show full event details in dedicated section below map
     */
    showEventDetails(properties) {
        console.log('Showing event details for:', properties.name);

        const section = document.getElementById('event-details-section');
        const content = document.getElementById('event-details-content');

        if (!section || !content) {
            console.error('Event details section not found');
            return;
        }

        // Format dates
        const formatDate = (dateString) => {
            if (!dateString) return 'Not specified';
            try {
                const date = new Date(dateString);
                return date.toLocaleString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit'
                });
            } catch (e) {
                return dateString;
            }
        };

        // Build HTML content
        const displayIcon = properties.display_icon || '🚧';
        const displayColor = properties.display_color || '#f59e0b';
        const isFullClosure = properties.is_full_closure;

        content.innerHTML = `
            <div class="event-detail-header">
                <h3>${displayIcon} ${properties.name || 'Construction Event'}</h3>
                ${isFullClosure ? '<span class="event-status-badge closure">⚠️ FULL ROAD CLOSURE</span>' : ''}
                <div class="event-detail-meta">
                    ${properties.roadway ? `
                    <div class="event-meta-item">
                        <strong>Roadway</strong>
                        <div>${properties.roadway}</div>
                    </div>
                    ` : ''}
                    ${properties.direction && properties.direction !== 'None' ? `
                    <div class="event-meta-item">
                        <strong>Direction</strong>
                        <div>${properties.direction}</div>
                    </div>
                    ` : ''}
                    ${properties.event_type ? `
                    <div class="event-meta-item">
                        <strong>Event Type</strong>
                        <div>${properties.event_type.replace(/([A-Z])/g, ' $1').trim()}</div>
                    </div>
                    ` : ''}
                    ${properties.severity && properties.severity !== 'Unknown' ? `
                    <div class="event-meta-item">
                        <strong>Severity</strong>
                        <div style="color: ${displayColor}; font-weight: bold;">${properties.severity}</div>
                    </div>
                    ` : ''}
                </div>
            </div>

            ${properties.description ? `
            <div class="event-detail-section">
                <h4><i class="fas fa-info-circle"></i> Description</h4>
                <p>${properties.description}</p>
            </div>
            ` : ''}

            ${properties.location ? `
            <div class="event-detail-section">
                <h4><i class="fas fa-map-marker-alt"></i> Location Details</h4>
                <p>${properties.location}</p>
                ${properties.county ? `<p><strong>County:</strong> ${properties.county}</p>` : ''}
                ${properties.mp_start ? `<p><strong>Mile Post:</strong> ${properties.mp_start}${properties.mp_end ? ` - ${properties.mp_end}` : ''}</p>` : ''}
            </div>
            ` : ''}

            <div class="event-detail-section">
                <h4><i class="fas fa-clock"></i> Schedule</h4>
                <div class="event-detail-grid">
                    <div class="event-detail-item">
                        <strong>Start Date</strong>
                        <div>${formatDate(properties.start_date)}</div>
                    </div>
                    ${properties.planned_end_date ? `
                    <div class="event-detail-item">
                        <strong>Planned End</strong>
                        <div>${formatDate(properties.planned_end_date)}</div>
                    </div>
                    ` : ''}
                    ${properties.last_updated ? `
                    <div class="event-detail-item">
                        <strong>Last Updated</strong>
                        <div>${formatDate(properties.last_updated)}</div>
                    </div>
                    ` : ''}
                </div>
            </div>

            ${properties.lanes_affected || properties.event_category ? `
            <div class="event-detail-section">
                <h4><i class="fas fa-road"></i> Impact Details</h4>
                <div class="event-detail-grid">
                    ${properties.lanes_affected && properties.lanes_affected !== 'No Data' ? `
                    <div class="event-detail-item">
                        <strong>Lanes Affected</strong>
                        <div>${properties.lanes_affected}</div>
                    </div>
                    ` : ''}
                    ${properties.event_category ? `
                    <div class="event-detail-item">
                        <strong>Category</strong>
                        <div>${properties.event_category}</div>
                    </div>
                    ` : ''}
                </div>
            </div>
            ` : ''}

            ${properties.comment ? `
            <div class="event-detail-section" style="background: #fff3cd; border-left-color: #ffc107;">
                <h4><i class="fas fa-comment"></i> Additional Information</h4>
                <p>${properties.comment}</p>
            </div>
            ` : ''}

            ${properties.detour_instructions ? `
            <div class="event-detail-section" style="background: #e3f2fd; border-left-color: #2196f3;">
                <h4><i class="fas fa-directions"></i> Detour Information</h4>
                <p>${properties.detour_instructions}</p>
            </div>
            ` : ''}

            <div style="margin-top: 1.5rem; padding: 1rem; background: #f0f0f0; border-radius: 8px; font-size: 0.9rem; color: #666;">
                <p style="margin: 0;"><i class="fas fa-database"></i> <strong>Event ID:</strong> ${properties.id}</p>
                <p style="margin: 5px 0 0 0;"><i class="fas fa-building"></i> <strong>Source:</strong> UDOT Traffic Management Center</p>
            </div>
        `;

        // Show the section and scroll to it
        section.style.display = 'block';
        setTimeout(() => {
            section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
    }

    /**
     * Hide event details section
     */
    hideEventDetails() {
        const section = document.getElementById('event-details-section');
        if (section) {
            section.style.display = 'none';
        }
    }
}

// Initialize complete map
document.addEventListener('DOMContentLoaded', () => {
    console.log('Initializing Provo Canyon Complete Map with all Azure Maps features...');
    const completeMap = new ProvoCanyonCompleteMap();
    completeMap.init();

    // Make map instance globally accessible for popup buttons and HTML onclick handlers
    window.provoCanyonMap = completeMap;

    // Initialize countdown timer
    const countdown = new ClosureCountdown();
    countdown.init();
});

// Countdown Timer (from existing implementation)
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
            if (schedule.end < hours) endTime.setDate(endTime.getDate() + 1);
            return { nextEvent: 'Reopening In', timeUntil: endTime - now };
        } else {
            const startTime = new Date(now);
            startTime.setHours(schedule.start, 0, 0, 0);
            if (schedule.start < hours || (schedule.start === hours && now.getMinutes() > 0)) {
                startTime.setDate(startTime.getDate() + 1);
            }
            return { nextEvent: 'Next Closure', timeUntil: startTime - now };
        }
    }

    isCurrentlyInClosure(hours, schedule) {
        if (schedule.end < schedule.start) {
            return hours >= schedule.start || hours < schedule.end;
        }
        return hours >= schedule.start && hours < schedule.end;
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
