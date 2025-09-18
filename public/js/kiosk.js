import { stations, thresholds } from './config.js';
import { getMarkerColor, getRoadWeatherColor, isRoadWeatherStation, createPopupContent } from './mapUtils.js';
import { fetchLiveObservations } from './api.js';

// Kiosk mode configuration
const KIOSK_CONFIG = {
    STATION_CYCLE_INTERVAL: 30000, // 30 seconds
    DATA_REFRESH_INTERVAL: 600000, // 10 minutes
    MAP_UPDATE_INTERVAL: 60000, // 1 minute for map updates
    FORECAST_REFRESH_INTERVAL: 1800000, // 30 minutes
};

class KioskMode {
    constructor() {
        this.currentStationIndex = 0;
        this.stationOrder = [];
        this.markers = [];
        this.activePopup = null;
        this.intervals = {};
        this.lastDataUpdate = null;
        this.currentObservations = null;

        // Initialize markdown renderer
        this.md = markdownit({
            html: true,
            linkify: true,
            typographer: true
        });
    }

    async init() {
        await this.initMap();
        this.initTimestamp();
        this.loadInitialData();
        this.startIntervals();
        this.updateNextRefreshTime();
    }

    initMap() {
        // Initialize Leaflet map for kiosk mode
        this.map = L.map('kiosk-map', {
            zoomControl: false,
            scrollWheelZoom: false,
            doubleClickZoom: false,
            dragging: false,
            touchZoom: false,
            boxZoom: false,
            keyboard: false
        }).setView([40.45, -110.0], 8);

        // Add tile layer
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 15,
            attribution: '© OpenStreetMap contributors'
        }).addTo(this.map);

        // Handle window resize
        window.addEventListener('resize', () => {
            setTimeout(() => {
                this.map.invalidateSize();
                this.map.setView([40.45, -110.0], 8);
            }, 100);
        });
    }

    initTimestamp() {
        this.updateTimestamp();
        setInterval(() => this.updateTimestamp(), 1000);
    }

    updateTimestamp() {
        const now = new Date();
        const timeString = now.toLocaleString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });

        const timestampElement = document.getElementById('current-time');
        if (timestampElement) {
            timestampElement.textContent = timeString;
        }
    }

    async loadInitialData() {
        document.getElementById('map-status').textContent = 'Loading stations...';

        try {
            await this.loadStations();
            await this.loadCurrentConditions();
            await this.loadAirQualityForecast();
            await this.loadWeatherSummary();
            this.updateDailyStats();

            document.getElementById('map-status').textContent = 'Auto-cycling stations...';
        } catch (error) {
            console.error('Error loading initial data:', error);
            document.getElementById('map-status').textContent = 'Error loading data';
        }
    }

    async loadStations() {
        try {
            const result = await fetchLiveObservations();

            // Check if we got valid data
            if (!result || !result.observations) {
                console.error('No observation data available');
                return;
            }

            this.currentObservations = result;
            this.lastDataUpdate = new Date();

            // Clear existing markers
            this.markers.forEach(marker => this.map.removeLayer(marker));
            this.markers = [];

            const data = result.observations;

            // Create station order for cycling - check if any station has data
            this.stationOrder = Object.keys(stations).filter(stationName => {
                // Check if station has any measurement data
                return Object.keys(data).some(variable => data[variable] && data[variable][stationName] !== null);
            });

            // Shuffle station order for variety
            this.shuffleArray(this.stationOrder);

            // Add markers for all stations
            Object.keys(stations).forEach(stationName => {
                const station = stations[stationName];

                // Build measurements object for this station
                const measurements = {
                    'Ozone': data['Ozone']?.[stationName] ?? null,
                    'PM2.5': data['PM2.5']?.[stationName] ?? null,
                    'NOx': data['NOx']?.[stationName] ?? null,
                    'NO': data['NO']?.[stationName] ?? null,
                    'NO2': data['NO2']?.[stationName] ?? null,
                    'Temperature': data['Temperature']?.[stationName] ?? null,
                    'Wind Speed': data['Wind Speed']?.[stationName] ?? null,
                    'Wind Direction': data['Wind Direction']?.[stationName] ?? null
                };

                let marker;
                if (isRoadWeatherStation(stationName)) {
                    marker = this.createRoadWeatherMarker(stationName, station, measurements);
                } else {
                    marker = this.createAirQualityMarker(stationName, station, measurements);
                }

                if (marker) {
                    marker.addTo(this.map);
                    this.markers.push(marker);
                }
            });

            // Start station cycling if we have stations
            if (this.stationOrder.length > 0) {
                this.startStationCycling();
            }

        } catch (error) {
            console.error('Error loading stations:', error);
            throw error;
        }
    }

    createAirQualityMarker(stationName, station, obsData) {
        const color = getMarkerColor(obsData || {});

        const marker = L.circleMarker([station.lat, station.lng], {
            color: 'white',
            fillColor: color,
            fillOpacity: 0.8,
            weight: 2,
            radius: 12
        });

        if (obsData) {
            const popupContent = createPopupContent(stationName, obsData);
            marker.bindPopup(popupContent, {
                maxWidth: 350,
                className: 'kiosk-popup'
            });
        }

        marker.stationName = stationName;
        return marker;
    }

    createRoadWeatherMarker(stationName, station, obsData) {
        const color = getRoadWeatherColor(stationName, obsData || {});

        // Create diamond shape using divIcon
        const marker = L.marker([station.lat, station.lng], {
            icon: L.divIcon({
                className: 'road-weather-icon',
                html: `<div style="background-color: ${color}; width: 16px; height: 16px; transform: rotate(45deg); border: 2px solid white;"></div>`,
                iconSize: [20, 20],
                iconAnchor: [10, 10]
            })
        });

        if (obsData) {
            const popupContent = createPopupContent(stationName, obsData);
            marker.bindPopup(popupContent, {
                maxWidth: 350,
                className: 'kiosk-popup'
            });
        }

        marker.stationName = stationName;
        return marker;
    }

    startStationCycling() {
        // Clear any existing interval
        if (this.intervals.stationCycle) {
            clearInterval(this.intervals.stationCycle);
        }

        // Start cycling through stations
        this.intervals.stationCycle = setInterval(() => {
            this.cycleToNextStation();
        }, KIOSK_CONFIG.STATION_CYCLE_INTERVAL);

        // Show first station immediately
        this.cycleToNextStation();
    }

    cycleToNextStation() {
        if (this.stationOrder.length === 0) return;

        // Close current popup with fade effect
        if (this.activePopup) {
            this.map.closePopup(this.activePopup);
        }

        // Get next station
        const stationName = this.stationOrder[this.currentStationIndex];
        const marker = this.markers.find(m => m.stationName === stationName);

        if (marker && marker.getPopup()) {
            // Add highlighting effect to marker
            const originalRadius = marker.getRadius ? marker.getRadius() : 12;
            if (marker.setRadius) {
                marker.setRadius(originalRadius * 1.5);
                setTimeout(() => marker.setRadius(originalRadius), 1000);
            }

            // Open popup for current station
            marker.openPopup();
            this.activePopup = marker.getPopup();

            // Get station region
            const region = this.getStationRegion(stationName);

            // Update status with enhanced information
            document.getElementById('map-status').innerHTML = `
                <div class="station-cycling-info">
                    <div class="current-station">📍 <strong>${stationName}</strong></div>
                    <div class="station-meta">${region} • ${this.currentStationIndex + 1}/${this.stationOrder.length}</div>
                    <div class="cycle-progress">
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: ${((this.currentStationIndex + 1) / this.stationOrder.length) * 100}%"></div>
                        </div>
                    </div>
                </div>
            `;
        }

        // Move to next station
        this.currentStationIndex = (this.currentStationIndex + 1) % this.stationOrder.length;
    }

    getStationRegion(stationName) {
        const regionMap = {
            // Population Centers
            'Vernal': 'Population Center',
            'Roosevelt': 'Population Center',
            'Duchesne': 'Population Center',
            'Fort Duchesne': 'Population Center',

            // Core Basin
            'Horsepool': 'Core Basin',
            'Castle Peak': 'Core Basin',
            'Seven Sisters': 'Core Basin',
            'Bluebell': 'Core Basin',

            // Basin Perimeter
            'Myton': 'Western Basin',
            'Dinosaur NM': 'Northern Basin',
            'Altamont': 'Northwestern Basin',
            'Manila': 'Northern Mountain',
            'Starvation': 'Southwestern Basin',

            // Mountain Passes
            'Daniels Summit': 'Mountain Pass',
            'Indian Canyon': 'Mountain Pass',
            'Soldier Summit': 'Mountain Pass'
        };

        return regionMap[stationName] || 'Monitoring Station';
    }

    async loadCurrentConditions() {
        const conditionsContainer = document.getElementById('current-conditions');

        if (!this.currentObservations || !this.currentObservations.observations) {
            conditionsContainer.innerHTML = '<div class="condition-item"><div class="condition-label">No Data</div><div class="condition-value">--</div></div>';
            return;
        }

        const data = this.currentObservations.observations;

        // Calculate basin-wide averages and conditions
        let totalTemp = 0, tempCount = 0;
        let totalOzone = 0, ozoneCount = 0;
        let totalWind = 0, windCount = 0;
        let maxOzone = 0;
        let activeStationCount = 0;

        // Count stations with any data and calculate statistics
        Object.keys(stations).forEach(stationName => {
            let hasData = false;

            // Check temperature
            if (data['Temperature'] && data['Temperature'][stationName] !== null) {
                totalTemp += data['Temperature'][stationName];
                tempCount++;
                hasData = true;
            }

            // Check ozone
            if (data['Ozone'] && data['Ozone'][stationName] !== null) {
                const ozone = data['Ozone'][stationName];
                totalOzone += ozone;
                ozoneCount++;
                maxOzone = Math.max(maxOzone, ozone);
                hasData = true;
            }

            // Check wind speed
            if (data['Wind Speed'] && data['Wind Speed'][stationName] !== null) {
                totalWind += data['Wind Speed'][stationName];
                windCount++;
                hasData = true;
            }

            if (hasData) {
                activeStationCount++;
            }
        });

        const avgTemp = tempCount > 0 ? Math.round((totalTemp * 9/5) + 32) : null; // Convert C to F
        const avgOzone = ozoneCount > 0 ? Math.round(totalOzone / ozoneCount) : null;
        const avgWind = windCount > 0 ? Math.round(totalWind * 2.237) : null; // Convert m/s to mph

        // Generate health recommendation
        const healthMessage = this.getHealthRecommendation(maxOzone, avgTemp);

        // Get trend indicators (simulate for now)
        const tempTrend = this.getTrendIndicator('temperature', avgTemp);
        const ozoneTrend = this.getTrendIndicator('ozone', maxOzone);

        conditionsContainer.innerHTML = `
            <div class="condition-item">
                <div class="condition-label">Basin Avg Temperature</div>
                <div class="condition-value">
                    ${avgTemp !== null ? avgTemp + '°F' : '--'}
                    <span class="condition-trend ${tempTrend.class}">${tempTrend.icon}</span>
                </div>
            </div>
            <div class="condition-item">
                <div class="condition-label">Peak Ozone</div>
                <div class="condition-value">
                    ${maxOzone > 0 ? Math.round(maxOzone) + ' ppb' : '--'}
                    <span class="condition-trend ${ozoneTrend.class}">${ozoneTrend.icon}</span>
                </div>
            </div>
            <div class="condition-item">
                <div class="condition-label">Avg Wind Speed</div>
                <div class="condition-value">${avgWind !== null ? avgWind + ' mph' : '--'}</div>
            </div>
            <div class="condition-item ${maxOzone >= 70 ? 'condition-alert' : ''}">
                <div class="condition-label">Basin Status</div>
                <div class="condition-value health-status">${healthMessage}</div>
            </div>
        `;

        // Update timestamp
        document.getElementById('conditions-time').textContent =
            this.lastDataUpdate ? this.lastDataUpdate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '--:--';
    }

    getHealthRecommendation(maxOzone, avgTemp) {
        if (maxOzone >= 70) {
            return '⚠️ UNHEALTHY';
        } else if (maxOzone >= 50) {
            return '⚡ MODERATE';
        } else if (maxOzone > 0) {
            return '✅ GOOD';
        } else {
            return '📊 MONITORING';
        }
    }

    getTrendIndicator(type, value) {
        // Simulate trend data (in real implementation, compare with previous readings)
        const trends = ['up', 'down', 'stable'];
        const icons = { up: '↗️', down: '↘️', stable: '➡️' };
        const classes = { up: 'trend-up', down: 'trend-down', stable: 'trend-stable' };

        // Simple logic based on current values
        let trend = 'stable';
        if (type === 'ozone' && value > 50) trend = 'up';
        else if (type === 'ozone' && value < 30) trend = 'down';
        else if (type === 'temperature' && value > 80) trend = 'up';
        else if (type === 'temperature' && value < 40) trend = 'down';

        return {
            icon: icons[trend],
            class: classes[trend]
        };
    }

    async loadAirQualityForecast() {
        const forecastContainer = document.getElementById('air-quality-forecast');

        try {
            const response = await fetch('/public/data/outlooks/outlooks_list.json');
            if (!response.ok) throw new Error(`HTTP error: ${response.status}`);

            const outlooks = await response.json();
            if (outlooks.length === 0) {
                forecastContainer.innerHTML = '<div class="forecast-loading">No recent air quality outlook available.</div>';
                return;
            }

            const latestOutlook = outlooks[0];
            const outlookResponse = await fetch(`/public/data/outlooks/${latestOutlook.filename}`);
            if (!outlookResponse.ok) throw new Error(`Failed to load outlook: ${outlookResponse.status}`);

            const markdownContent = await outlookResponse.text();

            // Render full content for kiosk mode
            forecastContainer.innerHTML = this.md.render(markdownContent);

            // Update timestamp
            document.getElementById('forecast-time').textContent =
                new Date(latestOutlook.date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

        } catch (error) {
            console.error('Error loading air quality forecast:', error);
            forecastContainer.innerHTML = '<div class="forecast-loading">Unable to load air quality outlook.</div>';
        }
    }

    async loadWeatherSummary() {
        const weatherContainer = document.getElementById('weather-summary');

        // Get current conditions data for context
        const data = this.currentObservations?.observations;
        let avgTemp = null, avgWind = null;

        if (data) {
            let totalTemp = 0, tempCount = 0;
            let totalWind = 0, windCount = 0;

            Object.keys(stations).forEach(stationName => {
                if (data['Temperature'] && data['Temperature'][stationName] !== null) {
                    totalTemp += data['Temperature'][stationName];
                    tempCount++;
                }
                if (data['Wind Speed'] && data['Wind Speed'][stationName] !== null) {
                    totalWind += data['Wind Speed'][stationName];
                    windCount++;
                }
            });

            avgTemp = tempCount > 0 ? Math.round((totalTemp * 9/5) + 32) : null;
            avgWind = windCount > 0 ? Math.round(totalWind * 2.237) : null;
        }

        // Generate contextual weather summary
        const weatherSummary = this.generateWeatherContext(avgTemp, avgWind);

        weatherContainer.innerHTML = `
            <div class="weather-highlight">
                <strong>🌡️ Current Basin Conditions:</strong> ${weatherSummary.current}
            </div>
            <div class="weather-item">
                <strong>🌬️ Wind Impact:</strong> ${weatherSummary.windImpact}
            </div>
            <div class="weather-item">
                <strong>🏔️ Topographic Effect:</strong> ${weatherSummary.topography}
            </div>
            <div class="weather-item">
                <strong>⚡ Air Quality Impact:</strong> ${weatherSummary.aqImpact}
            </div>
            <div class="weather-outlook">
                <strong>📅 Outlook:</strong> ${weatherSummary.outlook}
            </div>
            <div class="weather-footer">
                <i class="fas fa-info-circle"></i> Weather impacts updated every 30 minutes
            </div>
        `;

        // Update timestamp
        document.getElementById('weather-time').textContent =
            new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    }

    generateWeatherContext(avgTemp, avgWind) {
        const season = this.getCurrentSeason();

        return {
            current: avgTemp ?
                `Basin average ${avgTemp}°F with ${avgWind || 'light'} mph winds` :
                'Monitoring stations across the Uintah Basin',

            windImpact: avgWind > 10 ?
                'Strong winds helping disperse pollutants' :
                avgWind > 5 ?
                'Moderate winds providing some mixing' :
                'Light winds may lead to pollutant accumulation',

            topography: season === 'winter' ?
                'Mountain barriers and cold air pooling typical for winter months' :
                'Basin topography creating localized circulation patterns',

            aqImpact: season === 'winter' ?
                'Winter inversions possible - monitor ozone levels during temperature inversions' :
                'Summer photochemical activity may increase afternoon ozone formation',

            outlook: season === 'winter' ?
                'Continued monitoring for winter air quality episodes' :
                'Tracking diurnal patterns and photochemical ozone formation'
        };
    }

    getCurrentSeason() {
        const month = new Date().getMonth();
        if (month >= 11 || month <= 2) return 'winter';
        if (month >= 3 && month <= 5) return 'spring';
        if (month >= 6 && month <= 8) return 'summer';
        return 'fall';
    }

    updateDailyStats() {
        if (!this.currentObservations || !this.currentObservations.observations) {
            return;
        }

        const data = this.currentObservations.observations;

        // Calculate statistics
        let maxOzone = 0;
        let totalTemp = 0, tempCount = 0;
        let maxWind = 0;
        let activeStationCount = 0;

        Object.keys(stations).forEach(stationName => {
            let hasData = false;

            // Check ozone
            if (data['Ozone'] && data['Ozone'][stationName] !== null) {
                maxOzone = Math.max(maxOzone, data['Ozone'][stationName]);
                hasData = true;
            }

            // Check temperature
            if (data['Temperature'] && data['Temperature'][stationName] !== null) {
                totalTemp += data['Temperature'][stationName];
                tempCount++;
                hasData = true;
            }

            // Check wind speed
            if (data['Wind Speed'] && data['Wind Speed'][stationName] !== null) {
                maxWind = Math.max(maxWind, data['Wind Speed'][stationName]);
                hasData = true;
            }

            if (hasData) {
                activeStationCount++;
            }
        });

        const avgTemp = tempCount > 0 ? Math.round((totalTemp * 9/5) + 32) : 0; // Convert C to F
        const maxWindMph = maxWind > 0 ? Math.round(maxWind * 2.237) : 0; // Convert m/s to mph

        document.getElementById('peak-ozone').textContent = maxOzone > 0 ? Math.round(maxOzone) + ' ppb' : '-- ppb';
        document.getElementById('avg-temp').textContent = avgTemp > 0 ? avgTemp + ' °F' : '-- °F';
        document.getElementById('wind-speed').textContent = maxWindMph > 0 ? maxWindMph + ' mph' : '-- mph';
        document.getElementById('active-stations').textContent = `${activeStationCount} / ${Object.keys(stations).length}`;
    }

    startIntervals() {
        // Station cycling is started in loadStations()

        // Data refresh interval
        this.intervals.dataRefresh = setInterval(async () => {
            await this.loadStations();
            await this.loadCurrentConditions();
            this.updateDailyStats();
            this.updateNextRefreshTime();
        }, KIOSK_CONFIG.DATA_REFRESH_INTERVAL);

        // Forecast refresh interval
        this.intervals.forecastRefresh = setInterval(async () => {
            await this.loadAirQualityForecast();
            await this.loadWeatherSummary();
        }, KIOSK_CONFIG.FORECAST_REFRESH_INTERVAL);

        // Next refresh time update
        this.intervals.refreshTimeUpdate = setInterval(() => {
            this.updateNextRefreshTime();
        }, 1000);
    }

    updateNextRefreshTime() {
        const nextRefresh = new Date(Date.now() + KIOSK_CONFIG.DATA_REFRESH_INTERVAL);
        document.getElementById('next-refresh').textContent =
            nextRefresh.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    }

    shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }

    destroy() {
        // Clean up intervals
        Object.values(this.intervals).forEach(interval => {
            if (interval) clearInterval(interval);
        });
        this.intervals = {};

        // Clean up map
        if (this.map) {
            this.map.remove();
        }
    }
}

// Initialize kiosk mode when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
    const kioskMode = new KioskMode();
    await kioskMode.init();

    // Store reference globally for debugging
    window.kioskMode = kioskMode;
});

// Handle page visibility changes to pause/resume cycling
document.addEventListener('visibilitychange', () => {
    if (window.kioskMode) {
        if (document.hidden) {
            // Page is hidden, could pause intervals to save resources
            console.log('Kiosk mode: Page hidden');
        } else {
            // Page is visible again
            console.log('Kiosk mode: Page visible');
            window.kioskMode.updateTimestamp();
        }
    }
});