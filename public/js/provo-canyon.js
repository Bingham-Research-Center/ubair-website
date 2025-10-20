// Provo Canyon Construction Map - Azure Maps with UDOT integration
// Real-time traffic flow, incidents, and construction data for US-189

class ProvoCanyonMap {
    constructor() {
        this.map = null;
        this.dataSource = null;
        this.constructionMarkers = [];
        this.trafficLayer = null;

        // Azure Maps subscription key - fetched from server
        this.azureKey = null;

        // Provo Canyon / Deer Creek area - centered on the construction zone
        this.mapCenter = [-111.5, 40.4]; // [longitude, latitude] for Azure Maps
        this.mapZoom = 10;

        // Refresh interval: 5 minutes
        this.refreshInterval = 300000;
        this.refreshTimer = null;
    }

    async init() {
        try {
            // Fetch Azure Maps API key from server
            await this.fetchAzureKey();
            await this.initMap();
            this.addTrafficLayers();
            this.loadAzureTrafficIncidents();

            // Load UDOT traffic events for Provo Canyon
            this.loadUDOTTrafficEvents();

            // Hide loading indicator
            const loadingEl = document.getElementById('map-loading');
            if (loadingEl) {
                loadingEl.style.display = 'none';
            }
        } catch (error) {
            console.error('Error initializing Provo Canyon map:', error);
            const loadingEl = document.getElementById('map-loading');
            if (loadingEl && !loadingEl.innerHTML.includes('WebGL')) {
                loadingEl.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Unable to load map. Please refresh the page or try a different browser.';
                loadingEl.style.color = '#d32f2f';
            }
        }
    }

    async fetchAzureKey() {
        try {
            const response = await fetch('/api/azure-maps-key');
            if (!response.ok) {
                throw new Error('Failed to fetch Azure Maps API key');
            }
            const data = await response.json();
            this.azureKey = data.key;
            console.log('Azure Maps API key loaded from server');
        } catch (error) {
            console.error('Error fetching Azure Maps key:', error);
            throw error;
        }
    }

    async initMap() {
        const mapElement = document.getElementById('provo-canyon-map');
        if (!mapElement) {
            console.error('Map element not found');
            return;
        }

        try {
            // Initialize Azure Map with Light Gray Canvas basemap for government compliance
            this.map = new atlas.Map('provo-canyon-map', {
                center: this.mapCenter,
                zoom: this.mapZoom,
                language: 'en-US',
                authOptions: {
                    authType: 'subscriptionKey',
                    subscriptionKey: this.azureKey
                },
                style: 'grayscale_light', // Light gray canvas - low distraction basemap
                showFeedbackLink: false,
                showLogo: false
            });
        } catch (error) {
            console.error('Error creating Azure Map:', error);
            const loadingEl = document.getElementById('map-loading');
            if (loadingEl) {
                loadingEl.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Map requires WebGL support. Please use a modern browser or enable hardware acceleration.';
                loadingEl.style.color = '#d32f2f';
            }
            throw error;
        }

        // Wait for map to be ready
        await new Promise(resolve => {
            this.map.events.add('ready', () => {
                console.log('Azure Maps ready');

                // Create data source for markers
                this.dataSource = new atlas.source.DataSource();
                this.map.sources.add(this.dataSource);

                // Add controls
                this.map.controls.add([
                    new atlas.control.ZoomControl(),
                    new atlas.control.CompassControl(),
                    new atlas.control.PitchControl(),
                    new atlas.control.StyleControl({
                        mapStyles: ['road', 'satellite', 'road_shaded_relief', 'night']
                    })
                ], {
                    position: 'top-right'
                });

                resolve();
            });
        });
    }

    addTrafficLayers() {
        if (!this.map) return;

        // Add traffic flow layer (shows live traffic congestion)
        this.map.setTraffic({
            flow: 'relative',  // Shows traffic flow relative to free-flow speed
            incidents: true     // Shows traffic incidents
        });

        console.log('Traffic layers added');
    }

    async loadUDOTTrafficEvents() {
        try {
            console.log('Fetching UDOT traffic events...');
            const response = await fetch('/api/traffic-events');

            if (!response.ok) {
                throw new Error(`HTTP error: ${response.status}`);
            }

            const data = await response.json();
            console.log('UDOT traffic events received:', data);

            if (data.success && data.events) {
                // Filter events for Provo Canyon / US-189 / Deer Creek area
                const relevantEvents = this.filterProvoCanyonEvents(data.events);
                console.log('Relevant Provo Canyon events:', relevantEvents.length);

                this.displayUDOTEvents(relevantEvents);
            }

            // Hide loading indicator
            const loadingEl = document.getElementById('map-loading');
            if (loadingEl) {
                loadingEl.style.display = 'none';
            }
        } catch (error) {
            console.error('Error loading UDOT traffic events:', error);
            const loadingEl = document.getElementById('map-loading');
            if (loadingEl) {
                loadingEl.innerHTML = '<i class="fas fa-exclamation-circle"></i> Error loading traffic data';
            }
        }
    }

    filterProvoCanyonEvents(events) {
        // Keywords to identify Provo Canyon events
        const provoCanyonKeywords = [
            'provo canyon',
            'us-189',
            'us 189',
            'sr-189',
            'sr 189',
            'deer creek',
            'state route 189',
            'highway 189'
        ];

        return events.filter(event => {
            const description = (event.description || '').toLowerCase();
            const roadway = (event.roadwayName || '').toLowerCase();
            const name = (event.name || '').toLowerCase();

            // Check if event mentions Provo Canyon keywords
            const matchesKeywords = provoCanyonKeywords.some(keyword =>
                description.includes(keyword) ||
                roadway.includes(keyword) ||
                name.includes(keyword)
            );

            // Also check geographic boundaries (rough Provo Canyon area)
            const inGeographicArea = event.latitude && event.longitude &&
                event.latitude >= 40.2 && event.latitude <= 40.6 &&
                event.longitude >= -111.7 && event.longitude <= -111.3;

            return matchesKeywords || inGeographicArea;
        });
    }

    displayUDOTEvents(events) {
        if (!this.map || !this.dataSource) return;

        events.forEach(event => {
            if (!event.latitude || !event.longitude) return;

            const icon = this.getEventIcon(event);
            const color = icon.color;

            // Create HTML marker for construction/event
            const marker = new atlas.HtmlMarker({
                position: [event.longitude, event.latitude],
                htmlContent: `<div class="azure-custom-marker" style="color: ${color}; font-size: 28px;">
                    <i class="fas ${icon.icon}"></i>
                </div>`,
                anchor: 'center'
            });

            // Create popup content
            const popupContent = this.createEventPopup(event);

            // Create popup
            const popup = new atlas.Popup({
                content: popupContent,
                pixelOffset: [0, -30],
                closeButton: true
            });

            // Add click event to show popup
            this.map.events.add('click', marker, () => {
                popup.setOptions({
                    position: [event.longitude, event.latitude]
                });
                popup.open(this.map);
            });

            this.map.markers.add(marker);
            this.constructionMarkers.push(marker);
        });

        console.log(`Displayed ${events.length} UDOT events on map`);
    }

    getEventIcon(event) {
        const eventType = (event.eventType || '').toLowerCase();

        if (eventType.includes('roadwork') || eventType.includes('construction')) {
            return { icon: 'fa-hard-hat', color: '#ff6b00' };
        } else if (eventType.includes('closure')) {
            return { icon: 'fa-road', color: '#dc3545' };
        } else if (eventType.includes('accident') || eventType.includes('incident')) {
            return { icon: 'fa-car-crash', color: '#ff0000' };
        } else {
            return { icon: 'fa-exclamation-triangle', color: '#ffa500' };
        }
    }

    createEventPopup(event) {
        const startDate = event.startDate ? new Date(event.startDate).toLocaleDateString() : 'N/A';
        const endDate = event.plannedEndDate ? new Date(event.plannedEndDate).toLocaleDateString() : 'Ongoing';

        return `
            <div class="azure-event-popup">
                <h3 style="margin: 0 0 10px 0; color: #ff6b00;">
                    <i class="fas fa-hard-hat"></i> ${event.name || 'Construction Event'}
                </h3>
                <p style="margin: 5px 0;"><strong>Type:</strong> ${event.eventType || 'Unknown'}</p>
                <p style="margin: 5px 0;"><strong>Location:</strong> ${event.roadwayName || 'US-189'}</p>
                <p style="margin: 5px 0;"><strong>Start:</strong> ${startDate}</p>
                <p style="margin: 5px 0;"><strong>End:</strong> ${endDate}</p>
                ${event.isFullClosure ? '<p style="color: red; font-weight: bold; margin: 5px 0;">⚠️ Full Closure</p>' : ''}
                <p style="margin: 10px 0 0 0; font-size: 0.9em;">${event.description || 'No additional details available.'}</p>
                ${event.severity ? `<p style="margin: 5px 0;"><strong>Severity:</strong> <span style="color: ${this.getSeverityColor(event.severity)};">${event.severity}</span></p>` : ''}
            </div>
        `;
    }

    getSeverityColor(severity) {
        const sev = (severity || '').toLowerCase();
        if (sev.includes('major') || sev.includes('high')) return '#dc3545';
        if (sev.includes('moderate') || sev.includes('medium')) return '#ffa500';
        return '#28a745';
    }

    async loadAzureTrafficIncidents() {
        try {
            // Azure Maps Traffic Incidents API
            // Get incidents in Provo Canyon bounding box
            const bbox = '-111.7,40.2,-111.3,40.6'; // west, south, east, north
            const url = `https://atlas.microsoft.com/traffic/incident/tile/png?api-version=1.0&style=s3&zoom=${this.mapZoom}&x=0&y=0&subscription-key=${this.azureKey}`;

            // Note: For detailed incident data, you'd use the Traffic Incident Details API
            // For now, the map's built-in traffic incidents layer will show them
            console.log('Azure traffic incidents displayed via traffic layer');
        } catch (error) {
            console.error('Error loading Azure traffic incidents:', error);
        }
    }

    startAutoRefresh() {
        // Auto-refresh disabled - Azure Maps handles traffic updates automatically
        console.log('Azure Maps traffic updates automatically');
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

// Countdown Timer for FCAB (Fixed Critical Alert Bar)
class ClosureCountdown {
    constructor() {
        this.schedules = {
            // Weeknight closures: Mon-Fri 10pm-6am
            weeknight: { start: 22, end: 6 },
            // Saturday: 11pm-6am
            saturday: { start: 23, end: 6 },
            // Sunday: 10pm-9am
            sunday: { start: 22, end: 9 }
        };
    }

    init() {
        this.updateCountdown();
        // Update every second
        setInterval(() => this.updateCountdown(), 1000);
    }

    updateCountdown() {
        const now = new Date();
        const day = now.getDay(); // 0=Sunday, 6=Saturday
        const hours = now.getHours();
        const minutes = now.getMinutes();
        const seconds = now.getSeconds();

        const schedule = this.getCurrentSchedule(day);
        const { nextEvent, timeUntil } = this.calculateNextEvent(now, day, hours, schedule);

        // Update UI
        const labelEl = document.getElementById('countdown-label');
        const timeEl = document.getElementById('countdown-time');

        if (labelEl && timeEl) {
            labelEl.textContent = nextEvent;
            timeEl.textContent = this.formatTime(timeUntil);
        }
    }

    getCurrentSchedule(day) {
        if (day === 6) return this.schedules.saturday; // Saturday
        if (day === 0) return this.schedules.sunday;   // Sunday
        return this.schedules.weeknight; // Mon-Fri
    }

    calculateNextEvent(now, day, hours, schedule) {
        const isInClosure = this.isCurrentlyInClosure(hours, schedule);

        if (isInClosure) {
            // Currently in closure - show time until it ends
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
            // Not in closure - show time until next closure
            const startTime = new Date(now);
            startTime.setHours(schedule.start, 0, 0, 0);
            if (schedule.start < hours || (schedule.start === hours && now.getMinutes() > 0)) {
                // Next closure is tomorrow
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
            // Closure spans midnight
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

// Initialize map and countdown when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    console.log('Initializing Provo Canyon Azure Maps...');
    const provoCanyonMap = new ProvoCanyonMap();
    provoCanyonMap.init();

    // Initialize countdown timer
    console.log('Initializing FCAB countdown timer...');
    const countdown = new ClosureCountdown();
    countdown.init();
});
