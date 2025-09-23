import { stations, thresholds } from './config.js';
import { getMarkerColor, getRoadWeatherColor, createPopupContent } from './mapUtils.js';
import { fetchLiveObservations } from './api.js';

// Kiosk mode configuration
const KIOSK_CONFIG = {
    STATION_CYCLE_INTERVAL: 30000, // 30 seconds
    DATA_REFRESH_INTERVAL: 600000, // 10 minutes
    MAP_UPDATE_INTERVAL: 60000, // 1 minute for map updates
    FORECAST_REFRESH_INTERVAL: 1800000, // 30 minutes
    SLIDE_AUTO_ADVANCE_INTERVAL: 20000, // 20 seconds per slide
};

class KioskMode {
    constructor() {
        // Carousel state
        this.currentSlide = 0;
        this.totalSlides = 4;
        this.isAutoPlaying = true;
        this.carouselInterval = null;

        // Maps
        this.airQualityMap = null;
        this.roadWeatherMap = null;
        this.airQualityMarkers = [];
        this.roadWeatherMarkers = [];

        // Data and caching
        this.currentData = null;
        this.lastDataUpdate = null;
        this.csvDataCache = null;
        this.intervals = {};

        // Station cycling for air quality
        this.currentStationIndex = 0;
        this.stationOrder = [];
        this.airQualityKioskInterval = null;

        // Historical analysis
        this.historicalData = {};
        this.availableParameters = new Set();

        // Initialize markdown renderer
        this.md = markdownit({
            html: true,
            linkify: true,
            typographer: true
        });
    }

    async init() {
        console.log('Initializing Kiosk Mode...');

        try {
            await this.initMaps();
            this.initTimestamp();
            this.initCarousel();
            this.initHistoricalControls();

            // Load initial data
            await this.loadInitialData();

            // Start intervals
            this.startIntervals();

            console.log('Kiosk Mode initialized successfully');
        } catch (error) {
            console.error('Error initializing Kiosk Mode:', error);
        }
    }

    initTimestamp() {
        this.updateTimestamp();
        setInterval(() => this.updateTimestamp(), 1000);
    }

    updateTimestamp() {
        const now = new Date();
        const timeString = now.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });

        const timestampElement = document.getElementById('current-time');
        if (timestampElement) {
            timestampElement.textContent = timeString;
        }
    }

    initCarousel() {
        console.log('Initializing carousel...');

        // Add event listeners for carousel controls
        const prevBtn = document.getElementById('carousel-prev');
        const nextBtn = document.getElementById('carousel-next');
        const playPauseBtn = document.getElementById('carousel-play-pause');
        const fullscreenBtn = document.getElementById('fullscreen-toggle');

        if (prevBtn) {
            prevBtn.addEventListener('click', () => this.previousSlide());
        }
        if (nextBtn) {
            nextBtn.addEventListener('click', () => this.nextSlide());
        }
        if (playPauseBtn) {
            playPauseBtn.addEventListener('click', () => this.toggleAutoPlay());
        }
        if (fullscreenBtn) {
            fullscreenBtn.addEventListener('click', () => this.toggleFullscreen());
        }

        // Add event listeners for indicator dots
        const indicators = document.querySelectorAll('.indicator');
        indicators.forEach((indicator, index) => {
            indicator.addEventListener('click', () => this.goToSlide(index));
        });

        // Add fullscreen change event listeners
        document.addEventListener('fullscreenchange', () => this.handleFullscreenChange());
        document.addEventListener('webkitfullscreenchange', () => this.handleFullscreenChange());
        document.addEventListener('mozfullscreenchange', () => this.handleFullscreenChange());
        document.addEventListener('MSFullscreenChange', () => this.handleFullscreenChange());

        // Add keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleKeydown(e));

        // Start auto-play
        this.startAutoPlay();

        // Initialize slides visibility
        this.updateSlideVisibility();

        // Add window resize listener for responsive behavior
        window.addEventListener('resize', () => {
            setTimeout(() => {
                if (this.airQualityMap) this.airQualityMap.invalidateSize();
                if (this.roadWeatherMapInstance && this.roadWeatherMapInstance.map) {
                    this.roadWeatherMapInstance.map.invalidateSize();
                }
            }, 100);
        });
    }

    async initMaps() {
        console.log('Initializing maps...');

        // Initialize Air Quality map
        this.airQualityMap = L.map('air-quality-map', {
            zoomControl: false,
            scrollWheelZoom: false,
            doubleClickZoom: false,
            dragging: false,
            touchZoom: false,
            boxZoom: false,
            keyboard: false
        }).setView([40.45, -110.0], 8);

        // Add tile layer to air quality map
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '© OpenStreetMap contributors'
        }).addTo(this.airQualityMap);

        // Initialize Road Weather map using the same logic as /roads page
        this.roadWeatherMapInstance = null;

        console.log('Maps initialized successfully');
    }

    nextSlide() {
        this.currentSlide = (this.currentSlide + 1) % this.totalSlides;
        this.updateCarousel();
    }

    previousSlide() {
        this.currentSlide = (this.currentSlide - 1 + this.totalSlides) % this.totalSlides;
        this.updateCarousel();
    }

    goToSlide(slideIndex) {
        this.currentSlide = slideIndex;
        this.updateCarousel();
    }

    updateCarousel() {
        // Update slide position
        const container = document.getElementById('carousel-container');
        if (container) {
            const translateX = -this.currentSlide * 20; // 20% per slide (5 slides total)
            container.style.transform = `translateX(${translateX}%)`;
        }

        // Update indicators
        this.updateIndicators();

        // Update slide visibility and handle slide-specific actions
        this.updateSlideVisibility();

        // Handle map resize and data loading based on current slide
        setTimeout(() => {
            this.handleSlideChange();
        }, 600); // Wait for transition to complete

        console.log(`Switched to slide ${this.currentSlide}`);
    }

    async handleSlideChange() {
        switch (this.currentSlide) {
            case 0: // Air Quality Map
                if (this.airQualityMap) {
                    this.airQualityMap.invalidateSize();
                    if (this.airQualityMarkers.length > 0) {
                        this.startAirQualityStationCycling();
                    }
                }
                break;
            case 1: // Road Weather Map
                if (!this.roadWeatherMapInstance) {
                    console.log('Initializing RoadWeatherMap using roads.js logic...');
                    this.roadWeatherMapInstance = new RoadWeatherMap('road-weather-map', {
                        center: [40.15, -110.0], // Adjusted to include Vernal in view
                        zoom: 9, // Zoomed out to show more area including Vernal
                        refreshInterval: 900000 // 15 minutes
                    });
                    this.roadWeatherMapInstance.init();
                } else if (this.roadWeatherMapInstance.map) {
                    this.roadWeatherMapInstance.map.invalidateSize();
                }
                break;
            case 2: // KPIs Dashboard
                this.updateKPITimestamp();
                break;
            case 3: // Historical Analysis
                await this.updateHistoricalChart();
                break;
        }
    }

    updateIndicators() {
        const indicators = document.querySelectorAll('.indicator');
        indicators.forEach((indicator, index) => {
            if (index === this.currentSlide) {
                indicator.classList.add('active');
            } else {
                indicator.classList.remove('active');
            }
        });
    }

    updateSlideVisibility() {
        const slides = document.querySelectorAll('.carousel-slide');
        slides.forEach((slide, index) => {
            if (index === this.currentSlide) {
                slide.classList.add('active');
            } else {
                slide.classList.remove('active');
            }
        });
    }

    toggleAutoPlay() {
        if (this.isAutoPlaying) {
            this.stopAutoPlay();
        } else {
            this.startAutoPlay();
        }
    }

    startAutoPlay() {
        this.isAutoPlaying = true;
        this.carouselInterval = setInterval(() => {
            this.nextSlide();
        }, KIOSK_CONFIG.SLIDE_AUTO_ADVANCE_INTERVAL);

        const playPauseBtn = document.getElementById('carousel-play-pause');
        if (playPauseBtn) {
            playPauseBtn.innerHTML = '<i class="fas fa-pause" aria-hidden="true"></i>';
            playPauseBtn.title = 'Pause auto-cycling';
        }
    }

    stopAutoPlay() {
        this.isAutoPlaying = false;
        if (this.carouselInterval) {
            clearInterval(this.carouselInterval);
            this.carouselInterval = null;
        }

        const playPauseBtn = document.getElementById('carousel-play-pause');
        if (playPauseBtn) {
            playPauseBtn.innerHTML = '<i class="fas fa-play" aria-hidden="true"></i>';
            playPauseBtn.title = 'Resume auto-cycling';
        }
    }

    toggleFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen();
        } else {
            document.exitFullscreen();
        }
    }

    handleFullscreenChange() {
        const isFullscreen = !!document.fullscreenElement;

        // Update map sizes when entering/exiting fullscreen
        setTimeout(() => {
            if (this.airQualityMap) this.airQualityMap.invalidateSize();
            if (this.roadWeatherMapInstance && this.roadWeatherMapInstance.map) {
                this.roadWeatherMapInstance.map.invalidateSize();
            }
        }, 100);

        console.log('Fullscreen state changed:', isFullscreen);
    }

    handleKeydown(e) {
        switch (e.key) {
            case 'ArrowLeft':
                this.previousSlide();
                break;
            case 'ArrowRight':
                this.nextSlide();
                break;
            case ' ':
                e.preventDefault();
                this.toggleAutoPlay();
                break;
            case 'F11':
                e.preventDefault();
                this.toggleFullscreen();
                break;
            case 'Escape':
                if (document.fullscreenElement) {
                    document.exitFullscreen();
                }
                break;
        }
    }

    async loadInitialData() {
        console.log('Loading initial data...');

        try {
            // Load air quality data
            await this.loadAirQualityData();

            // Load KPI data
            await this.loadKPIData();

            // Load historical CSV data
            await this.loadHistoricalData();

            console.log('Initial data loaded successfully');
        } catch (error) {
            console.error('Error loading initial data:', error);
        }
    }

    async loadAirQualityData() {
        try {
            console.log('Loading air quality data...');

            // Use the API endpoint to get observations data
            const response = await fetch('/api/live-observations');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const apiData = await response.json();
            const observations = apiData.data;

            // Clear existing markers
            this.airQualityMarkers.forEach(marker => this.airQualityMap.removeLayer(marker));
            this.airQualityMarkers = [];
            this.stationOrder = [];

            // Process observations into station data
            const stationData = {};
            observations.forEach(obs => {
                const { stid, variable, value } = obs;

                if (!stationData[stid]) {
                    stationData[stid] = {};
                }

                // Map variable names to the format expected by mapUtils
                const mappedVar = this.mapVariableName(variable);
                stationData[stid][mappedVar] = value;
            });

            // Create markers for each station that has coordinates in config
            Object.entries(stationData).forEach(([stid, data]) => {
                const station = stations[stid];
                if (!station || !station.coordinates) return;

                // Pass the entire measurements object to getMarkerColor
                const markerColor = getMarkerColor(data);

                const marker = L.circleMarker([station.coordinates.lat, station.coordinates.lng], {
                    radius: 12,
                    fillColor: markerColor,
                    color: '#ffffff',
                    weight: 2,
                    opacity: 1,
                    fillOpacity: 0.8
                }).addTo(this.airQualityMap);

                // Add popup with station name and measurements
                const popupContent = createPopupContent(station.name, data);
                marker.bindPopup(popupContent);

                this.airQualityMarkers.push(marker);
                this.stationOrder.push(stid);
            });

            // Update status
            document.getElementById('air-quality-status').textContent =
                `${this.airQualityMarkers.length} stations • Auto-cycling every 30s`;

            console.log(`Loaded ${this.airQualityMarkers.length} air quality stations`);

        } catch (error) {
            console.error('Error loading air quality data:', error);
            document.getElementById('air-quality-status').textContent = 'Error loading data';
        }
    }

    mapVariableName(variable) {
        // Map raw variable names to display names
        const mappings = {
            'air_temp': 'Temperature',
            'ozone_concentration': 'Ozone',
            'PM_25_concentration': 'PM2.5',
            'pm25_concentration': 'PM2.5',
            'particulate_concentration': 'PM2.5',
            'relative_humidity': 'Humidity',
            'wind_speed': 'Wind Speed',
            'wind_direction': 'Wind Direction',
            'dew_point_temperature': 'Dew Point',
            'snow_depth': 'Snow Depth',
            'soil_temp': 'Soil Temperature',
            'sea_level_pressure': 'Pressure',
            'NOx_concentration': 'NOx',
            'black_carbon_concentration': 'NOx',
            'ppb': 'NO',
            'NO_concentration': 'NO2'
        };

        return mappings[variable] || variable;
    }

    startAirQualityStationCycling() {
        if (this.airQualityKioskInterval) {
            clearInterval(this.airQualityKioskInterval);
        }

        if (this.airQualityMarkers.length === 0) return;

        this.currentStationIndex = 0;

        // Open first station popup
        if (this.airQualityMarkers[0]) {
            this.airQualityMarkers[0].openPopup();
        }

        this.airQualityKioskInterval = setInterval(() => {
            // Close current popup
            this.airQualityMap.closePopup();

            // Move to next station
            this.currentStationIndex = (this.currentStationIndex + 1) % this.airQualityMarkers.length;

            // Open next popup
            if (this.airQualityMarkers[this.currentStationIndex]) {
                this.airQualityMarkers[this.currentStationIndex].openPopup();
            }
        }, KIOSK_CONFIG.STATION_CYCLE_INTERVAL);
    }

    stopAirQualityStationCycling() {
        if (this.airQualityKioskInterval) {
            clearInterval(this.airQualityKioskInterval);
            this.airQualityKioskInterval = null;
        }
        this.airQualityMap.closePopup();
    }

    // Road weather functionality now handled by RoadWeatherMap class from roads.js

    async loadKPIData() {
        try {
            console.log('Loading KPI data...');

            const response = await fetch('/api/live-observations');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const apiData = await response.json();
            const observations = apiData.data;

            // Process data for KPIs - use mapped variable names
            const stationData = {};
            observations.forEach(obs => {
                const { stid, variable, value } = obs;

                if (!stationData[stid]) {
                    stationData[stid] = {};
                }

                // Map variable names to display names for consistency
                const mappedVar = this.mapVariableName(variable);
                stationData[stid][mappedVar] = value;
            });

            this.currentData = stationData;
            this.lastDataUpdate = new Date();

            // Update KPI displays
            this.updateKPIMetrics();
            this.updateDailySummary();

            console.log('KPI data loaded and updated');

        } catch (error) {
            console.error('Error loading KPI data:', error);
        }
    }

    updateKPIMetrics() {
        if (!this.currentData) return;

        const temps = [];
        const winds = [];
        const aqis = [];
        let complianceCount = 0;
        let totalStations = 0;

        // Calculate basin-wide averages
        Object.values(this.currentData).forEach(stationData => {
            // Temperature (using mapped variable name) - filter for realistic basin temperatures
            if (stationData['Temperature'] && stationData['Temperature'] > -20 && stationData['Temperature'] < 35) {
                temps.push(stationData['Temperature']);
            }

            // Wind speed (using mapped variable name)
            if (stationData['Wind Speed'] && stationData['Wind Speed'] >= 0 && stationData['Wind Speed'] < 50) {
                winds.push(stationData['Wind Speed'] * 2.237); // Convert m/s to mph
            }

            // AQI calculation (using mapped variable names)
            const ozone = stationData['Ozone'];
            const pm25 = stationData['PM2.5'];

            if (ozone !== undefined || pm25 !== undefined) {
                const aqi = this.calculateAQI(ozone, pm25);
                aqis.push(aqi);
                totalStations++;

                if (aqi <= 100) complianceCount++;
            }
        });

        // Update temperature metric
        if (temps.length > 0) {
            const avgTemp = temps.reduce((a, b) => a + b) / temps.length;
            const avgTempF = (avgTemp * 9/5) + 32;
            document.getElementById('basin-avg-temp').textContent = `${avgTempF.toFixed(0)}°F`;
        }

        // Update wind metric
        if (winds.length > 0) {
            const avgWind = winds.reduce((a, b) => a + b) / winds.length;
            document.getElementById('avg-wind-speed').textContent = `${avgWind.toFixed(1)} mph`;
        }

        // Update AQI metric
        if (aqis.length > 0) {
            const maxAqi = Math.max(...aqis);
            document.getElementById('peak-basin-aqi').textContent = maxAqi.toString();
            document.getElementById('aqi-status').textContent = this.getAQICategory(maxAqi);
        }

        // Update compliance metric
        if (totalStations > 0) {
            const compliancePercent = (complianceCount / totalStations) * 100;
            document.getElementById('epa-compliance').textContent = `${compliancePercent.toFixed(0)}%`;
            document.getElementById('compliance-status').textContent =
                compliancePercent >= 90 ? 'Operational' : 'Monitor';
        }
    }

    updateDailySummary() {
        if (!this.currentData) return;

        let maxOzone = 0;
        let totalTemp = 0, tempCount = 0;
        let maxWind = 0;
        let activeStations = 0;

        Object.values(this.currentData).forEach(stationData => {
            let hasData = false;

            // Ozone (using mapped variable name)
            if (stationData['Ozone'] && stationData['Ozone'] > maxOzone) {
                maxOzone = stationData['Ozone'];
                hasData = true;
            }

            // Temperature (using mapped variable name) - filter for realistic basin temperatures
            if (stationData['Temperature'] && stationData['Temperature'] > -20 && stationData['Temperature'] < 35) {
                totalTemp += (stationData['Temperature'] * 9/5) + 32; // Convert to Fahrenheit
                tempCount++;
                hasData = true;
            }

            // Wind (using mapped variable name)
            if (stationData['Wind Speed'] && stationData['Wind Speed'] >= 0 && stationData['Wind Speed'] < 50) {
                const windMph = stationData['Wind Speed'] * 2.237;
                if (windMph > maxWind) {
                    maxWind = windMph;
                }
                hasData = true;
            }

            if (hasData) activeStations++;
        });

        // Update summary values
        document.getElementById('summary-peak-ozone').textContent =
            maxOzone > 0 ? `${Math.round(maxOzone)} ppb` : '-- ppb';

        document.getElementById('summary-avg-temp').textContent =
            tempCount > 0 ? `${Math.round(totalTemp / tempCount)}°F` : '--°F';

        document.getElementById('summary-wind-speed').textContent =
            maxWind > 0 ? `${Math.round(maxWind)} mph` : '-- mph';

        document.getElementById('summary-active-stations').textContent =
            `${activeStations} / ${Object.keys(this.currentData).length}`;
    }

    calculateAQI(ozone, pm25) {
        // Simplified AQI calculation
        let maxAQI = 0;

        if (ozone !== undefined && ozone !== null) {
            // Ozone AQI breakpoints (8-hour average, ppb)
            // Convert ppm breakpoints to ppb (multiply by 1000)
            if (ozone <= 54) maxAQI = Math.max(maxAQI, (ozone / 54) * 50);
            else if (ozone <= 70) maxAQI = Math.max(maxAQI, 51 + ((ozone - 54) / (70 - 54)) * 49);
            else if (ozone <= 85) maxAQI = Math.max(maxAQI, 101 + ((ozone - 70) / (85 - 70)) * 49);
            else if (ozone <= 105) maxAQI = Math.max(maxAQI, 151 + ((ozone - 85) / (105 - 85)) * 49);
            else maxAQI = Math.max(maxAQI, 201);
        }

        if (pm25 !== undefined && pm25 !== null) {
            // PM2.5 AQI breakpoints (µg/m³)
            if (pm25 <= 12.0) maxAQI = Math.max(maxAQI, (pm25 / 12.0) * 50);
            else if (pm25 <= 35.4) maxAQI = Math.max(maxAQI, 51 + ((pm25 - 12.0) / (35.4 - 12.0)) * 49);
            else if (pm25 <= 55.4) maxAQI = Math.max(maxAQI, 101 + ((pm25 - 35.4) / (55.4 - 35.4)) * 49);
            else if (pm25 <= 150.4) maxAQI = Math.max(maxAQI, 151 + ((pm25 - 55.4) / (150.4 - 55.4)) * 49);
            else maxAQI = Math.max(maxAQI, 201);
        }

        return Math.round(maxAQI);
    }

    getAQICategory(aqi) {
        if (aqi <= 50) return 'Good';
        if (aqi <= 100) return 'Moderate';
        if (aqi <= 150) return 'Unhealthy for Sensitive';
        if (aqi <= 200) return 'Unhealthy';
        if (aqi <= 300) return 'Very Unhealthy';
        return 'Hazardous';
    }

    updateKPITimestamp() {
        const timestampElement = document.getElementById('kpi-timestamp');
        if (timestampElement && this.lastDataUpdate) {
            let timeText = this.lastDataUpdate.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit'
            });

            // Add warning for old data (July 31st data)
            timeText += ' ⚠️ July 31 data - not current';
            timestampElement.textContent = timeText;
            timestampElement.style.color = '#f59e0b';
        }
    }

    async loadHistoricalData() {
        try {
            console.log('Loading historical CSV data...');

            if (this.csvDataCache) {
                console.log('Using cached CSV data');
                return;
            }

            const response = await fetch('/data/csv/Hors_Roos_Casp_alldata_clean_long.csv');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const csvText = await response.text();
            this.csvDataCache = csvText;

            // Parse CSV data
            this.parseHistoricalData(csvText);

            console.log('Historical data loaded and parsed');

        } catch (error) {
            console.error('Error loading historical data:', error);
        }
    }

    parseHistoricalData(csvText) {
        const lines = csvText.trim().split('\n');
        const headers = lines[0].split(',');

        this.historicalData = {};

        // Parse each line
        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',');
            if (values.length !== headers.length) continue;

            const dateTime = values[0];
            const variable = values[1];
            const value = parseFloat(values[2]);

            if (isNaN(value)) continue;

            if (!this.historicalData[variable]) {
                this.historicalData[variable] = [];
            }

            this.historicalData[variable].push({
                dateTime: new Date(dateTime),
                value: value
            });

            // Extract parameter name for available parameters set
            const parameterName = variable.split('_')[1] || variable;
            this.availableParameters.add(parameterName);
        }

        console.log(`Parsed ${Object.keys(this.historicalData).length} variables from historical data`);
        console.log('Available parameters:', Array.from(this.availableParameters));

        // Populate dropdowns with available data
        this.populateDataDrivenDropdowns();
    }

    populateDataDrivenDropdowns() {
        if (!this.historicalData) return;

        // Extract available stations and parameters from actual data
        const availableStations = new Set();
        const availableParameters = new Set();
        const availableYears = new Set();

        Object.keys(this.historicalData).forEach(variable => {
            const parts = variable.split('_');
            if (parts.length >= 2) {
                const station = parts[0];
                const parameter = parts.slice(1).join('_');
                availableStations.add(station);
                availableParameters.add(parameter);
            }
        });

        // Extract years from data
        Object.values(this.historicalData).forEach(dataArray => {
            dataArray.forEach(point => {
                availableYears.add(point.dateTime.getFullYear());
            });
        });

        console.log('Available stations from data:', Array.from(availableStations));
        console.log('Available parameters from data:', Array.from(availableParameters));
        console.log('Available years from data:', Array.from(availableYears).sort());

        // Update year dropdown with actual available years
        const yearSelect = document.getElementById('year-select');
        if (yearSelect) {
            // Keep existing "all" option and add years
            const currentValue = yearSelect.value;
            const yearsToAdd = Array.from(availableYears).sort().reverse(); // Most recent first

            // Add missing years
            yearsToAdd.forEach(year => {
                if (!Array.from(yearSelect.options).some(opt => opt.value === year.toString())) {
                    const option = document.createElement('option');
                    option.value = year.toString();
                    option.textContent = year.toString();
                    yearSelect.appendChild(option);
                }
            });

            // Restore selection
            yearSelect.value = currentValue;
        }
    }

    initHistoricalControls() {
        const stationSelect = document.getElementById('station-select');
        const parameterSelect = document.getElementById('parameter-select');
        const yearSelect = document.getElementById('year-select');
        const plotTypeSelect = document.getElementById('plot-type-select');

        if (stationSelect) {
            stationSelect.addEventListener('change', () => this.updateHistoricalChart());
        }
        if (parameterSelect) {
            parameterSelect.addEventListener('change', () => this.updateHistoricalChart());
        }
        if (yearSelect) {
            yearSelect.addEventListener('change', () => this.updateHistoricalChart());
        }
        if (plotTypeSelect) {
            plotTypeSelect.addEventListener('change', () => this.updateHistoricalChart());
        }
    }

    async updateHistoricalChart() {
        if (!this.csvDataCache) {
            await this.loadHistoricalData();
        }

        const station = document.getElementById('station-select')?.value || 'horsepool';
        const parameter = document.getElementById('parameter-select')?.value || 'ozone';
        const year = document.getElementById('year-select')?.value || '2023';
        const plotType = document.getElementById('plot-type-select')?.value || 'timeseries';

        try {
            console.log(`Updating historical chart: ${station}, ${parameter}, ${year}, ${plotType}`);

            // Generate chart data
            const chartData = this.generateHistoricalChartData(station, parameter, year, plotType);
            const layout = this.getHistoricalChartLayout(parameter, plotType);

            // Update chart with enhanced configuration
            const config = {
                responsive: true,
                displayModeBar: true,
                displaylogo: false,
                modeBarButtonsToRemove: ['pan2d', 'lasso2d', 'select2d', 'autoScale2d'],
                modeBarButtonsToAdd: [
                    {
                        name: 'Toggle Spikes',
                        icon: Plotly.Icons.spikeline,
                        click: function(gd) {
                            Plotly.relayout(gd, {
                                'xaxis.showspikes': !gd.layout.xaxis.showspikes,
                                'yaxis.showspikes': !gd.layout.yaxis.showspikes
                            });
                        }
                    }
                ],
                scrollZoom: true,
                doubleClick: 'reset+autosize',
                showTips: false,
                toImageButtonOptions: {
                    format: 'png',
                    filename: `${parameter}_${station}_${year}_${plotType}`,
                    height: 800,
                    width: 1200,
                    scale: 2
                }
            };

            Plotly.react('historical-chart', chartData, layout, config);

            // Update statistics
            this.updateHistoricalStats(station, parameter, year);

            // Update insights
            this.updateHistoricalInsights(parameter, plotType);

        } catch (error) {
            console.error('Error updating historical chart:', error);
        }
    }

    generateHistoricalChartData(station, parameter, year, plotType) {
        if (!this.historicalData) {
            return [{
                x: [],
                y: [],
                type: 'scatter',
                mode: 'lines',
                name: 'No Data Available'
            }];
        }

        // Map station and parameter to data variable names
        const stationMap = {
            'horsepool': 'Hors',
            'roosevelt': 'Roos',
            'castlepeak': 'CastlePeak',
            'sevensis': 'SevenSis'
        };

        const parameterMap = {
            'ozone': 'ozone',
            'temperature': 'temperature',
            'humidity': 'humidity',
            'windspeed': ['windspeed', 'windspd'],
            'winddir': ['winddir', 'wind_dir'],
            'no': 'NO',
            'no2': 'NO2',
            'nox': 'NOx',
            'noy': 'Noy',
            'noz': 'Noz',
            'pressure': 'pressure',
            'snowdepth': 'snowdepth',
            'total_uv': 'total_UV',
            'ch4': 'CH4',
            'nmhc': 'NMHC',
            'sw_albedo': 'SW_Albedo',
            'sw_incoming': 'SW_incoming',
            'sw_outgoing': 'SW_outgoing',
            'uva_incoming': 'UVA_incoming',
            'uva_outgoing': 'UVA_outgoing',
            'uvb_incoming': 'UVB_incoming',
            'uvb_outgoing': 'UVB_outgoing',
            'uva_albedo': 'UVA_albedo',
            'uvb_albedo': 'UVB_albedo',
            'uvaplusuvb_albedo': 'UVAplusUVB_albedo'
        };

        // Handle "all" stations case
        const stationsToProcess = station === 'all' ?
            Object.keys(stationMap) : [station];

        const allTraces = [];
        const stationColors = {
            'horsepool': '#FF6B6B',
            'roosevelt': '#4ECDC4',
            'castlepeak': '#45B7D1',
            'sevensis': '#96CEB4'
        };

        stationsToProcess.forEach((currentStation, index) => {
            const stationPrefix = stationMap[currentStation];
            if (!stationPrefix) return;

            const paramNames = Array.isArray(parameterMap[parameter]) ?
                parameterMap[parameter] : [parameterMap[parameter] || parameter];

            // Find matching data variable for this station
            let dataVariable = null;
            for (const param of paramNames) {
                const varName = `${stationPrefix}_${param}`;
                if (this.historicalData[varName]) {
                    dataVariable = varName;
                    break;
                }
            }

            if (!dataVariable || !this.historicalData[dataVariable]) {
                console.log(`No data found for ${parameter} at ${currentStation}`);
                return;
            }

            const rawData = this.historicalData[dataVariable];

            // Filter for winter seasons (Nov-Dec of year X + Jan-May of year X+1)
            let filteredData = rawData;

            if (year !== 'all') {
                // For a specific year, include:
                // - Nov-Dec of that year
                // - Jan-May of the following year
                const targetYear = parseInt(year);
                filteredData = rawData.filter(d => {
                    const dataYear = d.dateTime.getFullYear();
                    const dataMonth = d.dateTime.getMonth();

                    // Nov-Dec of target year
                    if (dataYear === targetYear && (dataMonth === 10 || dataMonth === 11)) {
                        return true;
                    }
                    // Jan-May of following year
                    if (dataYear === targetYear + 1 && (dataMonth >= 0 && dataMonth <= 4)) {
                        return true;
                    }
                    return false;
                });
            } else {
                // For 'all' years, group data into proper winter seasons
                filteredData = this.groupIntoWinterSeasons(rawData);
            }

            // Filter valid data
            const validData = filteredData.filter(d => d.value !== null && d.value !== undefined && !isNaN(d.value));

            if (validData.length === 0) {
                console.log(`No valid winter season data for ${parameter} at ${currentStation}`);
                return;
            }

            console.log(`Winter season data for ${currentStation}: ${validData.length} points covering ${year === 'all' ? 'all seasons' : `${year}-${parseInt(year)+1} season`}`);

            if (plotType === 'seasonal') {
                // For seasonal, we'll handle differently in a separate method
                const seasonalTraces = this.generateMultiStationSeasonal(validData, parameter, currentStation, stationColors[currentStation]);
                allTraces.push(...seasonalTraces);
            } else if (plotType === 'distribution') {
                const distTraces = this.generateMultiStationDistribution(validData, parameter, currentStation, stationColors[currentStation]);
                allTraces.push(...distTraces);
            } else if (plotType === 'heatmap') {
                // Heatmap typically shows one station at a time, use first station if 'all'
                if (station === 'all' && index === 0) {
                    return this.generateHeatmapData(validData, parameter);
                } else if (station !== 'all') {
                    return this.generateHeatmapData(validData, parameter);
                }
            } else {
                // Time series - Create trace for this station
                const yValues = validData.map(d => this.convertToDisplayUnits(d.value, parameter));

                const trace = {
                    x: validData.map(d => d.dateTime),
                    y: yValues,
                    type: 'scattergl',
                    mode: 'lines',
                    name: `${this.getStationDisplayName(currentStation)}`,
                    line: {
                        color: stationColors[currentStation],
                        width: 2,
                        shape: 'linear'
                    },
                    fill: station === 'all' ? 'none' : 'tonexty',
                    fillcolor: station === 'all' ? 'none' : `rgba(${this.hexToRgb(stationColors[currentStation])}, 0.1)`,
                    connectgaps: false,
                    hovertemplate: `<b>%{fullData.name}</b><br>` +
                                  `Value: %{y:.2f} ${this.getParameterUnit(parameter)}<br>` +
                                  `Date: %{x}<br>` +
                                  `Count: ${validData.length} points<br>` +
                                  `<extra></extra>`
                };

                allTraces.push(trace);

                // Add trend line for single station view
                if (station !== 'all' && validData.length > 10) {
                    const trendTrace = this.generateTrendLine(validData, parameter, stationColors[currentStation]);
                    if (trendTrace) {
                        allTraces.push(trendTrace);
                    }
                }
                console.log(`Generated trace for ${currentStation}: ${validData.length} points`);
            }
        });

        return allTraces.length > 0 ? allTraces : [{
            x: [],
            y: [],
            type: 'scatter',
            mode: 'lines',
            name: 'No Data Available'
        }];
    }

    generateMultiStationSeasonal(data, parameter, stationName, color) {
        const monthlyData = {};
        data.forEach(d => {
            const month = d.dateTime.getMonth();
            if (!monthlyData[month]) monthlyData[month] = [];
            monthlyData[month].push(this.convertToDisplayUnits(d.value, parameter));
        });

        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const avgValues = [];
        const monthLabels = [];

        // Only show winter months (indices in winterMonths array)
        const winterMonths = [10, 11, 0, 1, 2, 3, 4];
        winterMonths.forEach(monthIndex => {
            if (monthlyData[monthIndex] && monthlyData[monthIndex].length > 0) {
                const values = monthlyData[monthIndex].filter(v => !isNaN(v));
                if (values.length > 0) {
                    avgValues.push(values.reduce((a, b) => a + b) / values.length);
                    monthLabels.push(months[monthIndex]);
                }
            }
        });

        return [{
            x: monthLabels,
            y: avgValues,
            type: 'scatter',
            mode: 'lines+markers',
            name: this.getStationDisplayName(stationName),
            line: { color: color, width: 2 },
            marker: { color: color, size: 8 }
        }];
    }

    generateMultiStationDistribution(data, parameter, stationName, color) {
        const values = data.map(d => this.convertToDisplayUnits(d.value, parameter)).filter(v => !isNaN(v));

        return [{
            x: values,
            type: 'histogram',
            name: this.getStationDisplayName(stationName),
            marker: { color: color, opacity: 0.7 },
            nbinsx: 30
        }];
    }

    getHistoricalChartLayout(parameter, plotType) {
        const parameterDisplayName = this.getParameterDisplayName(parameter);
        const unit = this.getParameterUnit(parameter);

        let titleText, xAxisTitle, yAxisTitle;

        switch (plotType) {
            case 'seasonal':
                titleText = `${parameterDisplayName} Winter Season Patterns (Nov→May)`;
                xAxisTitle = 'Month';
                yAxisTitle = `${parameterDisplayName} (${unit})`;
                break;
            case 'distribution':
                titleText = `${parameterDisplayName} Winter Season Distribution (Nov→May)`;
                xAxisTitle = `${parameterDisplayName} (${unit})`;
                yAxisTitle = 'Frequency';
                break;
            case 'heatmap':
                titleText = `${parameterDisplayName} Winter Season Daily Patterns (Nov→May)`;
                xAxisTitle = 'Hour of Day';
                yAxisTitle = 'Day of Year';
                break;
            default:
                titleText = `${parameterDisplayName} Winter Season Time Series (Nov→May)`;
                xAxisTitle = 'Date';
                yAxisTitle = `${parameterDisplayName} (${unit})`;
        }

        return {
            title: {
                text: titleText,
                font: { color: 'white', size: 18, family: 'Arial, sans-serif' },
                x: 0.5
            },
            plot_bgcolor: 'rgba(0,0,0,0)',
            paper_bgcolor: 'rgba(0,0,0,0)',
            font: { color: 'white', family: 'Arial, sans-serif' },
            margin: { t: 70, r: 40, b: 70, l: 80 },
            showlegend: true, // Always show legend for multi-station support
            legend: {
                font: { color: 'white', size: 12 },
                bgcolor: 'rgba(0,0,0,0.8)',
                bordercolor: 'rgba(255,255,255,0.4)',
                borderwidth: 1,
                x: 1.02,
                xanchor: 'left',
                y: 1,
                yanchor: 'top',
                orientation: 'v'
            },
            hovermode: 'x unified', // Show unified hover for multi-station comparison
            hoverlabel: {
                bgcolor: 'rgba(0,0,0,0.9)',
                bordercolor: 'white',
                font: { color: 'white', size: 12 }
            },
            transition: {
                duration: 300,
                easing: 'cubic-in-out'
            },
            // Add crossfilter and selection features
            dragmode: 'zoom',
            selectdirection: 'diagonal',
            // Enhanced axis features
            xaxis: {
                ...this.getEnhancedAxisConfig('x', plotType),
                title: { text: xAxisTitle, font: { color: 'white', size: 14 } },
                color: 'white',
                gridcolor: 'rgba(255,255,255,0.2)',
                tickfont: { color: 'white', size: 12 },
                showgrid: true,
                zeroline: false,
                automargin: true,
                showspikes: true,
                spikecolor: 'rgba(255,255,255,0.6)',
                spikethickness: 1,
                spikedash: 'dot'
            },
            yaxis: {
                ...this.getEnhancedAxisConfig('y', plotType),
                title: { text: yAxisTitle, font: { color: 'white', size: 14 } },
                color: 'white',
                gridcolor: 'rgba(255,255,255,0.2)',
                tickfont: { color: 'white', size: 12 },
                showgrid: true,
                zeroline: false,
                automargin: true,
                showspikes: true,
                spikecolor: 'rgba(255,255,255,0.6)',
                spikethickness: 1,
                spikedash: 'dot'
            }
        };
    }

    getEnhancedAxisConfig(axis, plotType) {
        const baseConfig = {
            type: 'linear',
            autorange: true,
            fixedrange: false
        };

        if (axis === 'x') {
            switch (plotType) {
                case 'timeseries':
                case 'heatmap':
                    return {
                        ...baseConfig,
                        type: 'date',
                        tickformat: '%Y-%m-%d',
                        tickangle: -45,
                        rangeslider: {
                            visible: true,
                            bgcolor: 'rgba(255,255,255,0.1)',
                            bordercolor: 'rgba(255,255,255,0.3)',
                            borderwidth: 1
                        },
                        rangeselector: {
                            buttons: [
                                { count: 30, label: '30d', step: 'day', stepmode: 'backward' },
                                { count: 3, label: '3m', step: 'month', stepmode: 'backward' },
                                { count: 6, label: '6m', step: 'month', stepmode: 'backward' },
                                { count: 1, label: '1y', step: 'year', stepmode: 'backward' },
                                { step: 'all' }
                            ],
                            bgcolor: 'rgba(255,255,255,0.1)',
                            bordercolor: 'rgba(255,255,255,0.3)',
                            font: { color: 'white' }
                        }
                    };
                default:
                    return baseConfig;
            }
        }

        return baseConfig;
    }

    groupIntoWinterSeasons(data) {
        // Group data into proper winter seasons
        // Each winter season: Nov-Dec of year X + Jan-May of year X+1
        const winterSeasonData = [];

        // Get all unique years in the data
        const years = [...new Set(data.map(d => d.dateTime.getFullYear()))].sort();

        years.forEach(year => {
            // For each year, collect Nov-Dec data + Jan-May of next year
            const winterData = data.filter(d => {
                const dataYear = d.dateTime.getFullYear();
                const dataMonth = d.dateTime.getMonth();

                // Nov-Dec of current year
                if (dataYear === year && (dataMonth === 10 || dataMonth === 11)) {
                    return true;
                }
                // Jan-May of following year
                if (dataYear === year + 1 && (dataMonth >= 0 && dataMonth <= 4)) {
                    return true;
                }
                return false;
            });

            winterSeasonData.push(...winterData);
        });

        return winterSeasonData;
    }

    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ?
            `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` :
            '255, 255, 255';
    }

    generateTrendLine(data, parameter, color) {
        if (data.length < 10) return null;

        // Linear regression calculation
        const xValues = data.map((d, i) => i);
        const yValues = data.map(d => this.convertToDisplayUnits(d.value, parameter));

        const n = xValues.length;
        const sumX = xValues.reduce((a, b) => a + b, 0);
        const sumY = yValues.reduce((a, b) => a + b, 0);
        const sumXY = xValues.reduce((acc, x, i) => acc + x * yValues[i], 0);
        const sumXX = xValues.reduce((acc, x) => acc + x * x, 0);

        const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
        const intercept = (sumY - slope * sumX) / n;

        const trendY = xValues.map(x => slope * x + intercept);

        return {
            x: data.map(d => d.dateTime),
            y: trendY,
            type: 'scatter',
            mode: 'lines',
            name: 'Trend',
            line: {
                color: color,
                width: 1,
                dash: 'dash'
            },
            opacity: 0.7,
            hovertemplate: `<b>Trend Line</b><br>` +
                          `Value: %{y:.2f}<br>` +
                          `Slope: ${slope.toFixed(4)}<br>` +
                          `<extra></extra>`
        };
    }

    updateHistoricalStats(station, parameter, year) {
        // Update statistics display with sample data
        if (!this.historicalData) {
            document.getElementById('data-quality').textContent = 'N/A';
            document.getElementById('peak-value').textContent = 'N/A';
            document.getElementById('avg-value').textContent = 'N/A';
            document.getElementById('trend-value').textContent = 'N/A';
            return;
        }

        // Get the data variable
        const stationMap = {
            'horsepool': 'Hors',
            'roosevelt': 'Roos',
            'castlepeak': 'CastlePeak',
            'sevensis': 'SevenSis'
        };

        const parameterMap = {
            'ozone': 'ozone',
            'temperature': 'temperature',
            'humidity': 'humidity',
            'windspeed': ['windspeed', 'windspd'],
            'no2': 'NO2',
            'nox': 'NOx',
            'pressure': 'pressure'
        };

        const stationPrefix = stationMap[station] || 'Hors';
        const paramNames = Array.isArray(parameterMap[parameter]) ?
            parameterMap[parameter] : [parameterMap[parameter] || parameter];

        let dataVariable = null;
        for (const param of paramNames) {
            const varName = `${stationPrefix}_${param}`;
            if (this.historicalData[varName]) {
                dataVariable = varName;
                break;
            }
        }

        if (!dataVariable || !this.historicalData[dataVariable]) {
            document.getElementById('data-quality').textContent = 'No Data';
            document.getElementById('peak-value').textContent = 'N/A';
            document.getElementById('avg-value').textContent = 'N/A';
            document.getElementById('trend-value').textContent = 'N/A';
            return;
        }

        const rawData = this.historicalData[dataVariable];

        // Filter by year if specified
        let filteredData = rawData;
        if (year !== 'all') {
            filteredData = rawData.filter(d => d.dateTime.getFullYear().toString() === year);
        }

        if (filteredData.length === 0) {
            document.getElementById('data-quality').textContent = 'No Data';
            document.getElementById('peak-value').textContent = 'N/A';
            document.getElementById('avg-value').textContent = 'N/A';
            document.getElementById('trend-value').textContent = 'N/A';
            return;
        }

        // Calculate statistics
        const values = filteredData.map(d => d.value).filter(v => !isNaN(v));
        const validCount = values.length;
        const totalCount = filteredData.length;
        const dataQuality = (validCount / totalCount * 100).toFixed(0);

        const maxValue = Math.max(...values);
        const avgValue = values.reduce((a, b) => a + b, 0) / values.length;

        // Simple trend calculation (slope of linear regression)
        const trend = this.calculateTrend(filteredData);
        const trendText = trend > 0.1 ? 'Increasing' : trend < -0.1 ? 'Decreasing' : 'Stable';

        // Convert to display units
        const unit = this.getParameterUnit(parameter);
        const maxDisplay = this.convertToDisplayUnits(maxValue, parameter);
        const avgDisplay = this.convertToDisplayUnits(avgValue, parameter);

        document.getElementById('data-quality').textContent = `${dataQuality}%`;
        document.getElementById('peak-value').textContent = `${maxDisplay.toFixed(1)} ${unit}`;
        document.getElementById('avg-value').textContent = `${avgDisplay.toFixed(1)} ${unit}`;
        document.getElementById('trend-value').textContent = trendText;
    }

    updateHistoricalInsights(parameter, plotType) {
        const insights = {
            ozone: 'Winter inversion patterns show elevated ozone concentrations during stable atmospheric conditions.',
            temperature: 'Temperature variations follow typical seasonal patterns with cold winter inversions.',
            wind_speed: 'Wind patterns show strong correlation with pollutant dispersion effectiveness.'
        };

        document.getElementById('primary-insight').textContent =
            insights[parameter] || 'Analyzing environmental patterns and trends...';

        document.getElementById('correlation-insight').textContent =
            `${plotType} analysis reveals significant seasonal and diurnal variations in ${parameter} levels.`;
    }

    async loadWeatherForecast() {
        try {
            // Load current weather summary
            await this.loadCurrentWeather();

            // Load air quality forecast
            await this.loadAirQualityForecast();

        } catch (error) {
            console.error('Error loading weather forecast:', error);
        }
    }

    async loadCurrentWeather() {
        const weatherElement = document.getElementById('current-weather');

        if (!this.currentData) {
            weatherElement.innerHTML = '<div class="weather-loading">No current weather data available</div>';
            return;
        }

        // Calculate current conditions from available data
        const temps = [];
        const winds = [];
        let stationCount = 0;

        Object.values(this.currentData).forEach(stationData => {
            if (stationData.air_temp && stationData.air_temp > -30 && stationData.air_temp < 60) {
                temps.push((stationData.air_temp * 9/5) + 32); // Convert to Fahrenheit
            }
            if (stationData.wind_speed && stationData.wind_speed >= 0 && stationData.wind_speed < 50) {
                winds.push(stationData.wind_speed * 2.237); // Convert to mph
            }
            stationCount++;
        });

        const avgTemp = temps.length > 0 ? Math.round(temps.reduce((a, b) => a + b) / temps.length) : null;
        const avgWind = winds.length > 0 ? Math.round(winds.reduce((a, b) => a + b) / winds.length) : null;

        weatherElement.innerHTML = `
            <div class="current-conditions">
                <div class="condition-item">
                    <strong>Basin Average Temperature:</strong> ${avgTemp ? avgTemp + '°F' : 'N/A'}
                </div>
                <div class="condition-item">
                    <strong>Average Wind Speed:</strong> ${avgWind ? avgWind + ' mph' : 'N/A'}
                </div>
                <div class="condition-item">
                    <strong>Active Monitoring Stations:</strong> ${stationCount}
                </div>
                <div class="condition-item">
                    <strong>Last Updated:</strong> ${this.lastDataUpdate ? this.lastDataUpdate.toLocaleString() : 'Unknown'}
                </div>
            </div>
        `;
    }

    async loadAirQualityForecast() {
        const forecastElement = document.getElementById('air-quality-forecast');

        try {
            // Try to load the latest outlook file
            const response = await fetch('/public/data/outlooks/outlooks_list.json');
            if (!response.ok) throw new Error('Failed to load outlooks list');

            const outlooks = await response.json();
            if (outlooks.length === 0) {
                forecastElement.innerHTML = '<div class="forecast-loading">No recent air quality forecast available</div>';
                return;
            }

            const latestOutlook = outlooks[0];
            const outlookResponse = await fetch(`/public/data/outlooks/${latestOutlook.filename}`);
            if (!outlookResponse.ok) throw new Error('Failed to load outlook file');

            const markdownContent = await outlookResponse.text();

            // Render markdown content
            forecastElement.innerHTML = this.md.render(markdownContent);

        } catch (error) {
            console.error('Error loading air quality forecast:', error);
            forecastElement.innerHTML = '<div class="forecast-loading">Unable to load air quality forecast</div>';
        }
    }

    updateForecastTimestamp() {
        const timestampElement = document.getElementById('forecast-timestamp');
        if (timestampElement) {
            timestampElement.textContent = new Date().toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit'
            });
        }
    }

    startIntervals() {
        // Data refresh interval
        this.intervals.dataRefresh = setInterval(async () => {
            await this.loadInitialData();
        }, KIOSK_CONFIG.DATA_REFRESH_INTERVAL);

    }

    stopIntervals() {
        Object.values(this.intervals).forEach(interval => {
            if (interval) clearInterval(interval);
        });
        this.intervals = {};

        this.stopAirQualityStationCycling();
        this.stopAutoPlay();
    }

    destroy() {
        this.stopIntervals();

        // Clean up maps
        if (this.airQualityMap) {
            this.airQualityMap.remove();
            this.airQualityMap = null;
        }
        if (this.roadWeatherMapInstance) {
            this.roadWeatherMapInstance.destroy();
            this.roadWeatherMapInstance = null;
        }

        console.log('Kiosk Mode destroyed');
    }

    // Helper functions for improved historical data analysis
    convertToDisplayUnits(value, parameter) {
        const conversions = {
            'temperature': (value * 9/5) + 32,  // Celsius to Fahrenheit
            'windspeed': value * 2.237,         // m/s to mph
            'pressure': value / 3386.39,        // Pa to inHg
            'snowdepth': value / 25.4,          // mm to inches
        };
        return conversions[parameter] ? conversions[parameter] : value;
    }

    getParameterUnit(parameter) {
        const units = {
            'ozone': 'ppb',
            'temperature': '°F',
            'humidity': '%',
            'windspeed': 'mph',
            'winddir': '°',
            'no': 'ppb',
            'no2': 'ppb',
            'nox': 'ppb',
            'noy': 'ppb',
            'noz': 'ppb',
            'pressure': 'inHg',
            'snowdepth': 'in',
            'total_uv': 'W/m²',
            'ch4': 'ppm',
            'nmhc': 'ppm',
            'sw_albedo': '',
            'sw_incoming': 'W/m²',
            'sw_outgoing': 'W/m²',
            'uva_incoming': 'W/m²',
            'uva_outgoing': 'W/m²',
            'uvb_incoming': 'W/m²',
            'uvb_outgoing': 'W/m²',
            'uva_albedo': '',
            'uvb_albedo': '',
            'uvaplusuvb_albedo': ''
        };
        return units[parameter] || '';
    }

    getParameterDisplayName(parameter) {
        const names = {
            'ozone': 'Ozone',
            'temperature': 'Temperature',
            'humidity': 'Humidity',
            'windspeed': 'Wind Speed',
            'winddir': 'Wind Direction',
            'no': 'Nitric Oxide (NO)',
            'no2': 'Nitrogen Dioxide (NO₂)',
            'nox': 'Nitrogen Oxides (NOx)',
            'noy': 'Total Reactive Nitrogen (NOy)',
            'noz': 'NOz',
            'pressure': 'Atmospheric Pressure',
            'snowdepth': 'Snow Depth',
            'total_uv': 'Total UV Radiation',
            'ch4': 'Methane (CH₄)',
            'nmhc': 'Non-Methane Hydrocarbons',
            'sw_albedo': 'Shortwave Albedo',
            'sw_incoming': 'Incoming Shortwave Radiation',
            'sw_outgoing': 'Outgoing Shortwave Radiation',
            'uva_incoming': 'Incoming UVA Radiation',
            'uva_outgoing': 'Outgoing UVA Radiation',
            'uvb_incoming': 'Incoming UVB Radiation',
            'uvb_outgoing': 'Outgoing UVB Radiation',
            'uva_albedo': 'UVA Albedo',
            'uvb_albedo': 'UVB Albedo',
            'uvaplusuvb_albedo': 'UVA+UVB Albedo'
        };
        return names[parameter] || parameter;
    }

    getStationDisplayName(station) {
        const names = {
            'horsepool': 'Horsepool', 'roosevelt': 'Roosevelt',
            'castlepeak': 'Castle Peak', 'sevensis': 'Seven Sisters'
        };
        return names[station] || station;
    }

    getParameterColor(parameter) {
        const colors = {
            'ozone': '#FF6B6B',
            'temperature': '#4ECDC4',
            'humidity': '#45B7D1',
            'windspeed': '#96CEB4',
            'winddir': '#A29BFE',
            'no': '#E17055',
            'no2': '#FECA57',
            'nox': '#FF9FF3',
            'noy': '#FD79A8',
            'noz': '#E84393',
            'pressure': '#54A0FF',
            'snowdepth': '#74B9FF',
            'total_uv': '#FDCB6E',
            'ch4': '#6C5CE7',
            'nmhc': '#A29BFE',
            'sw_albedo': '#FFD93D',
            'sw_incoming': '#FF7675',
            'sw_outgoing': '#FD79A8',
            'uva_incoming': '#FDCB6E',
            'uva_outgoing': '#E17055',
            'uvb_incoming': '#F39C12',
            'uvb_outgoing': '#E74C3C',
            'uva_albedo': '#F1C40F',
            'uvb_albedo': '#E67E22',
            'uvaplusuvb_albedo': '#D35400'
        };
        return colors[parameter] || '#FFFFFF';
    }

    calculateTrend(data) {
        if (data.length < 2) return 0;
        const values = data.map(d => d.value).filter(v => !isNaN(v));
        if (values.length < 2) return 0;
        const n = values.length;
        const sumX = (n - 1) * n / 2;
        const sumY = values.reduce((a, b) => a + b, 0);
        const sumXY = values.reduce((sum, y, x) => sum + x * y, 0);
        const sumXX = (n - 1) * n * (2 * n - 1) / 6;
        return (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    }

    generateSeasonalComparison(data, parameter) {
        const monthlyData = {};
        data.forEach(d => {
            const month = d.dateTime.getMonth();
            if (!monthlyData[month]) monthlyData[month] = [];
            monthlyData[month].push(d.value);
        });
        
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const avgValues = [], maxValues = [], minValues = [];
        
        for (let i = 0; i < 12; i++) {
            if (monthlyData[i] && monthlyData[i].length > 0) {
                const values = monthlyData[i].filter(v => !isNaN(v));
                avgValues.push(values.reduce((a, b) => a + b) / values.length);
                maxValues.push(Math.max(...values));
                minValues.push(Math.min(...values));
            } else {
                avgValues.push(null); maxValues.push(null); minValues.push(null);
            }
        }
        
        return [{
            x: months, y: avgValues.map(v => v ? this.convertToDisplayUnits(v, parameter) : null),
            type: 'scatter', mode: 'lines+markers', name: 'Average',
            line: { color: this.getParameterColor(parameter), width: 3 }
        }, {
            x: months, y: maxValues.map(v => v ? this.convertToDisplayUnits(v, parameter) : null),
            type: 'scatter', mode: 'lines', name: 'Maximum',
            line: { color: this.getParameterColor(parameter), width: 1, dash: 'dash' }
        }, {
            x: months, y: minValues.map(v => v ? this.convertToDisplayUnits(v, parameter) : null),
            type: 'scatter', mode: 'lines', name: 'Minimum',
            line: { color: this.getParameterColor(parameter), width: 1, dash: 'dot' }
        }];
    }

    generateDistributionChart(data, parameter) {
        const values = data.map(d => this.convertToDisplayUnits(d.value, parameter)).filter(v => !isNaN(v));
        return [{ x: values, type: 'histogram', nbinsx: 30,
            marker: { color: this.getParameterColor(parameter), opacity: 0.7 },
            name: this.getParameterDisplayName(parameter) }];
    }

    generateHeatmapData(data, parameter) {
        const heatmapData = Array(24).fill().map(() => Array(366).fill(0));
        const counts = Array(24).fill().map(() => Array(366).fill(0));
        
        data.forEach(d => {
            const hour = d.dateTime.getHours();
            const dayOfYear = Math.floor((d.dateTime - new Date(d.dateTime.getFullYear(), 0, 0)) / (1000 * 60 * 60 * 24));
            if (hour >= 0 && hour < 24 && dayOfYear >= 1 && dayOfYear <= 366) {
                heatmapData[hour][dayOfYear - 1] += this.convertToDisplayUnits(d.value, parameter);
                counts[hour][dayOfYear - 1]++;
            }
        });
        
        for (let h = 0; h < 24; h++) {
            for (let d = 0; d < 366; d++) {
                if (counts[h][d] > 0) heatmapData[h][d] /= counts[h][d];
                else heatmapData[h][d] = null;
            }
        }
        
        return [{ z: heatmapData, type: 'heatmap', colorscale: 'Viridis', showscale: true, hoverongaps: false }];
    }
}

// Initialize kiosk mode when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded, initializing kiosk mode...');

    window.kioskMode = new KioskMode();
    window.kioskMode.init().catch(error => {
        console.error('Failed to initialize kiosk mode:', error);
    });
});

// Clean up on page unload
window.addEventListener('beforeunload', function() {
    if (window.kioskMode) {
        window.kioskMode.destroy();
    }
});