// Weather Forecast Map Implementation - Real Data Only

document.addEventListener('DOMContentLoaded', function() {
    setupWeatherMap();
    setupWeatherControls();
    
    // Initialize kiosk mode
    initializeKioskMode();
    
    // Load real weather data
    loadWeatherData();
});

let weatherMap;

function setupWeatherMap() {
    const mapElement = document.getElementById('weather-map');
    if (!mapElement) return;
    
    weatherMap = L.map('weather-map', {
        zoomControl: true
    }).setView([40.3033, -110.0153], 9);
    
    // Add base map
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 15,
        attribution: '© OpenStreetMap contributors'
    }).addTo(weatherMap);
}

function setupWeatherControls() {
    const toggles = document.querySelectorAll('.layer-toggle input');
    toggles.forEach(toggle => {
        toggle.addEventListener('change', updateMapLayers);
    });
}

function loadWeatherData() {
    // TODO: Load weather forecast data from JSON files or API
    console.log('Weather forecast data loading not implemented yet');
    // This will eventually fetch from /api/static/weather_forecast_YYYYMMDD_HHMMZ.json
}

function updateMapLayers() {
    console.log('Updating map layers');
    // TODO: Update weather layers based on loaded data
}

// Kiosk mode functionality
let kioskMode = false;
let kioskInterval;

function initializeKioskMode() {
    const kioskToggle = document.getElementById('kiosk-mode-toggle');
    if (!kioskToggle) return;
    
    kioskToggle.addEventListener('change', function() {
        if (this.checked) {
            startKioskMode();
        } else {
            stopKioskMode();
        }
    });
}

function startKioskMode() {
    kioskMode = true;
    // TODO: Implement kiosk mode cycling through weather layers
}

function stopKioskMode() {
    kioskMode = false;
    if (kioskInterval) {
        clearInterval(kioskInterval);
    }
}