document.addEventListener('DOMContentLoaded', function() {
    // Initialize map
    initializeWeatherMap();

    // Initialize controls
    initializeControls();

    // Initialize tooltips
    initializeTooltips();

    // Initialize kiosk mode
    initializeKioskMode();

    // Fake data
    generateSyntheticWeatherData();

});

let weatherMap;
let kioskInterval;
let isKioskMode = false;

function initializeWeatherMap() {
    weatherMap = L.map('weather-map').setView([40.3033, -110.0153], 9);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap contributors'
    }).addTo(weatherMap);

    // Add Basin boundary or other base layers here
}

function initializeControls() {
    const variableSelect = document.getElementById('weather-variable');
    const timeSelect = document.getElementById('forecast-time');
    const toggles = document.querySelectorAll('input[type="checkbox"]');

    variableSelect.addEventListener('change', updateWeatherDisplay);
    timeSelect.addEventListener('change', updateWeatherDisplay);

    toggles.forEach(toggle => {
        toggle.addEventListener('change', updateMapLayers);
    });
}

function generateSyntheticWeatherData() {
    const map = document.getElementById('weather-map');
    if (!map) return;

    // Add synthetic contour overlay
    const syntheticData = {
        temperature: generateTemperatureContours(),
        precipitation: generatePrecipitationData(),
        wind: generateWindData()
    };

    displaySyntheticData(syntheticData);
}

function generatePrecipitationData() {
    // Generate synthetic precipitation data with realistic patterns
    const precipitationData = [];
    const currentTime = new Date();

    // Create precipitation zones with varying intensities
    const zones = [
        { center: [40.35, -109.8], radius: 0.15, intensity: 0.8, type: 'rain' },
        { center: [40.25, -109.5], radius: 0.1, intensity: 1.2, type: 'snow' },
        { center: [40.4, -110.0], radius: 0.08, intensity: 0.3, type: 'drizzle' }
    ];

    // Generate grid of precipitation values
    for (let lat = 40.1; lat <= 40.5; lat += 0.02) {
        for (let lng = -110.2; lng <= -109.3; lng += 0.02) {
            let precipitation = 0;
            let precipType = 'none';

            // Check each zone for precipitation
            zones.forEach(zone => {
                const distance = Math.sqrt(
                    Math.pow(lat - zone.center[0], 2) +
                    Math.pow(lng - zone.center[1], 2)
                );

                if (distance <= zone.radius) {
                    // Create falloff effect from center
                    const falloff = Math.max(0, 1 - (distance / zone.radius));
                    const zoneIntensity = zone.intensity * falloff;

                    // Add some random variation
                    const variation = 0.8 + (Math.random() * 0.4); // 0.8 to 1.2
                    precipitation = Math.max(precipitation, zoneIntensity * variation);
                    precipType = zone.type;
                }
            });

            // Add background light precipitation chance
            if (precipitation === 0 && Math.random() < 0.1) {
                precipitation = Math.random() * 0.1;
                precipType = 'light';
            }

            if (precipitation > 0.05) { // Only include significant precipitation
                precipitationData.push({
                    lat,
                    lng,
                    value: Math.round(precipitation * 100) / 100, // Round to 2 decimal places
                    type: precipType,
                    rate: precipitation, // mm/hr
                    timestamp: currentTime.toISOString()
                });
            }
        }
    }

    return precipitationData;
}

function generateWindData() {
    // Generate synthetic wind data with realistic flow patterns
    const windData = [];
    const currentTime = new Date();

    // Define wind flow characteristics for the basin
    const baseWindDirection = 240; // SW flow (common pattern)
    const baseWindSpeed = 8; // Base wind speed in m/s

    // Terrain effects - mountains create flow variations
    const terrainFeatures = [
        { center: [40.15, -109.4], effect: 'channel', strength: 1.5 }, // Canyon channeling
        { center: [40.45, -110.1], effect: 'barrier', strength: 0.6 }, // Mountain blocking
        { center: [40.3, -109.7], effect: 'convergence', strength: 1.2 } // Valley convergence
    ];

    // Generate wind vectors across the basin
    for (let lat = 40.1; lat <= 40.5; lat += 0.03) {
        for (let lng = -110.2; lng <= -109.3; lng += 0.03) {
            let windSpeed = baseWindSpeed;
            let windDirection = baseWindDirection;

            // Apply terrain effects
            terrainFeatures.forEach(feature => {
                const distance = Math.sqrt(
                    Math.pow(lat - feature.center[0], 2) +
                    Math.pow(lng - feature.center[1], 2)
                );

                if (distance < 0.2) { // Within influence zone
                    const influence = Math.max(0, 1 - (distance / 0.2));

                    switch (feature.effect) {
                        case 'channel':
                            // Channel flow along valley
                            windSpeed *= (1 + influence * 0.5);
                            windDirection += influence * 20 * Math.sin((lng + 109.8) * 20);
                            break;
                        case 'barrier':
                            // Mountain blocking reduces wind
                            windSpeed *= (1 - influence * 0.4);
                            windDirection += influence * 30;
                            break;
                        case 'convergence':
                            // Valley convergence creates variable winds
                            windSpeed *= feature.strength * influence;
                            windDirection += influence * Math.sin((lat - 40.3) * 15) * 40;
                            break;
                    }
                }
            });

            // Add some random turbulence
            const turbulence = 0.8 + (Math.random() * 0.4); // 0.8 to 1.2 multiplier
            windSpeed *= turbulence;
            windDirection += (Math.random() - 0.5) * 30; // ±15 degree variation

            // Add elevation effects (higher = windier)
            const elevationFactor = 1 + ((lat - 40.1) * 0.3); // Simple elevation proxy
            windSpeed *= elevationFactor;

            // Ensure realistic bounds
            windSpeed = Math.max(0.5, Math.min(25, windSpeed)); // 0.5 to 25 m/s
            windDirection = ((windDirection % 360) + 360) % 360; // 0-360 degrees

            // Calculate U and V components
            const windU = windSpeed * Math.sin(windDirection * Math.PI / 180);
            const windV = windSpeed * Math.cos(windDirection * Math.PI / 180);

            windData.push({
                lat,
                lng,
                speed: Math.round(windSpeed * 10) / 10, // Round to 1 decimal
                direction: Math.round(windDirection),
                u_component: Math.round(windU * 10) / 10,
                v_component: Math.round(windV * 10) / 10,
                gust: Math.round((windSpeed * (1.2 + Math.random() * 0.3)) * 10) / 10,
                timestamp: currentTime.toISOString()
            });
        }
    }

    return windData;
}

function displaySyntheticData(syntheticData) {
    const currentVariable = document.getElementById('weather-variable').value;
    const weatherMap = L.map('weather-map', {
        zoomControl: true
    }).setView([40.3033, -110.0153], 9);

    // Add base map
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 15,
        attribution: '© OpenStreetMap contributors'
    }).addTo(weatherMap);

    // Display data based on selected variable
    switch (currentVariable) {
        case 'temperature':
            displayTemperatureContours(weatherMap, syntheticData.temperature);
            break;
        case 'precipitation':
            displayPrecipitationOverlay(weatherMap, syntheticData.precipitation);
            break;
        case 'wind':
            displayWindVectors(weatherMap, syntheticData.wind);
            break;
    }
}

function displayTemperatureContours(map, tempData) {
    // Create color scale for temperature
    const getColor = (temp) => {
        return temp > 30 ? '#800026' :
            temp > 25 ? '#BD0026' :
                temp > 20 ? '#E31A1C' :
                    temp > 15 ? '#FC4E2A' :
                        temp > 10 ? '#FD8D3C' :
                            temp > 5  ? '#FEB24C' :
                                temp > 0  ? '#FED976' :
                                    '#FFEDA0';
    };

    // Add temperature points
    tempData.forEach(point => {
        L.circleMarker([point.lat, point.lng], {
            radius: 3,
            fillColor: getColor(point.value),
            color: '#000',
            weight: 1,
            opacity: 0.8,
            fillOpacity: 0.6
        }).bindPopup(`Temperature: ${point.value.toFixed(1)}°C`).addTo(map);
    });
}

function displayPrecipitationOverlay(map, precipData) {
    const getColor = (rate) => {
        return rate > 2.0 ? '#FF0000' :  // Heavy
            rate > 1.0 ? '#FF6600' :  // Moderate
                rate > 0.5 ? '#FFAA00' :  // Light
                    rate > 0.1 ? '#AAFF00' :  // Very light
                        '#00FF00';    // Trace
    };

    precipData.forEach(point => {
        L.circleMarker([point.lat, point.lng], {
            radius: Math.max(2, point.rate * 3),
            fillColor: getColor(point.rate),
            color: '#000',
            weight: 1,
            opacity: 0.7,
            fillOpacity: 0.5
        }).bindPopup(`${point.type}: ${point.rate.toFixed(1)} mm/hr`).addTo(map);
    });
}

function generateTemperatureContours() {
    // Generate synthetic temperature data
    const points = [];
    for (let lat = 40.1; lat <= 40.5; lat += 0.05) {
        for (let lng = -110.2; lng <= -109.3; lng += 0.05) {
            const temp = 25 + Math.sin((lat - 40.3) * 10) * 5 + Math.cos((lng + 109.8) * 8) * 3;
            points.push({ lat, lng, value: temp });
        }
    }
    return points;
}

function displayWindVectors(map, windData) {
    // Sample every nth point to avoid clutter
    const sampledData = windData.filter((_, index) => index % 4 === 0);

    sampledData.forEach(point => {
        // Create wind barb/arrow
        const arrowLength = point.speed * 2; // Scale factor
        const angleRad = (point.direction - 90) * Math.PI / 180; // Convert to math coordinates

        const startLat = point.lat;
        const startLng = point.lng;
        const endLat = startLat + (arrowLength * 0.001) * Math.cos(angleRad);
        const endLng = startLng + (arrowLength * 0.001) * Math.sin(angleRad);

        // Color by wind speed
        const getWindColor = (speed) => {
            return speed > 15 ? '#FF0000' :  // Strong
                speed > 10 ? '#FF6600' :  // Moderate
                    speed > 5  ? '#FFAA00' :  // Light
                        '#00AA00';    // Calm
        };

        L.polyline([[startLat, startLng], [endLat, endLng]], {
            color: getWindColor(point.speed),
            weight: 2,
            opacity: 0.8
        }).bindPopup(`Wind: ${point.speed} m/s from ${point.direction}°`).addTo(map);

        // Add arrow head
        L.circleMarker([endLat, endLng], {
            radius: 2,
            fillColor: getWindColor(point.speed),
            color: getWindColor(point.speed),
            weight: 1,
            opacity: 0.8,
            fillOpacity: 0.8
        }).addTo(map);
    });
}

function updateWeatherDisplay() {
    const variable = document.getElementById('weather-variable').value;
    const time = document.getElementById('forecast-time').value;

    document.getElementById('current-variable').textContent =
        variable.charAt(0).toUpperCase() + variable.slice(1);
    document.getElementById('current-time').textContent =
        time === 'current' ? 'Current Conditions' : `Forecast: +${time}`;

    // Update map layers based on selection
    updateMapLayers();
}

function updateMapLayers() {
    // Placeholder for updating map layers based on toggles
    console.log('Updating map layers');
}


function initializeKioskMode() {
    const kioskButton = document.getElementById('kiosk-toggle');
    const kioskStatus = document.getElementById('kiosk-status');
    const kioskTimer = document.getElementById('kiosk-timer');
    const timerCountdown = document.getElementById('timer-countdown');

    kioskButton.addEventListener('click', function() {
        if (isKioskMode) {
            stopKioskMode();
        } else {
            startKioskMode();
        }
    });

    function startKioskMode() {
        isKioskMode = true;
        kioskButton.innerHTML = '<i class="fas fa-stop"></i> Stop Kiosk Mode';
        kioskButton.classList.add('active');
        document.querySelector('.status-text').textContent = 'Kiosk Mode';
        kioskTimer.style.display = 'flex';
        document.body.classList.add('kiosk-mode');

        let countdown = 5;
        timerCountdown.textContent = countdown;

        kioskInterval = setInterval(() => {
            countdown--;
            timerCountdown.textContent = countdown;

            if (countdown <= 0) {
                cycleToNextView();
                countdown = 5;
            }
        }, 1000);
    }


    function stopKioskMode() {
        isKioskMode = false;
        kioskButton.innerHTML = '<i class="fas fa-play"></i> Start Kiosk Mode';
        kioskButton.classList.remove('active');
        document.querySelector('.status-text').textContent = 'Manual Mode';
        kioskTimer.style.display = 'none';
        document.body.classList.remove('kiosk-mode');

        if (kioskInterval) {
            clearInterval(kioskInterval);
        }
    }

    function cycleToNextView() {
        // Cycle through different weather variables and times
        const variables = ['temperature', 'precipitation', 'wind', 'pressure', 'humidity', 'snow'];
        const times = ['current', '6h', '12h', '24h', '48h', '72h'];

        const variableSelect = document.getElementById('weather-variable');
        const timeSelect = document.getElementById('forecast-time');

        const currentVarIndex = variables.indexOf(variableSelect.value);
        const currentTimeIndex = times.indexOf(timeSelect.value);

        let nextVarIndex = (currentVarIndex + 1) % variables.length;
        let nextTimeIndex = currentTimeIndex;

        if (nextVarIndex === 0) {
            nextTimeIndex = (currentTimeIndex + 1) % times.length;
        }

        variableSelect.value = variables[nextVarIndex];
        timeSelect.value = times[nextTimeIndex];

        updateWeatherDisplay();
    }
}

function initializeTooltips() {
    // Same tooltip functionality as in air quality page
    const tooltipTriggers = document.querySelectorAll('[data-tooltip]');
    const tooltip = document.getElementById('tooltip');

    tooltipTriggers.forEach(trigger => {
        trigger.addEventListener('mouseenter', (e) => {
            const text = e.target.getAttribute('data-tooltip');
            tooltip.textContent = text;
            tooltip.classList.add('show');

            const rect = e.target.getBoundingClientRect();
            tooltip.style.left = rect.left + 'px';
            tooltip.style.top = (rect.top - tooltip.offsetHeight - 10) + 'px';
        });

        trigger.addEventListener('mouseleave', () => {
            tooltip.classList.remove('show');
        });
    });
}