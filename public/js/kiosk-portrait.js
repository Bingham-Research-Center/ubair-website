/**
 * Portrait Kiosk Dashboard
 * Minimal JS for 9:16 kiosk display
 */

// Station coordinates (subset of main config)
const STATIONS = {
    'Horsepool': { lat: 40.144, lng: -109.467, name: 'Horsepool' },
    'Castle Peak': { lat: 40.051, lng: -110.020, name: 'Castle Peak' },
    'Seven Sisters': { lat: 39.981, lng: -109.345, name: 'Seven Sisters' },
    'Vernal': { lat: 40.44, lng: -109.51, name: 'Vernal' },
    'Roosevelt': { lat: 40.28, lng: -110.05, name: 'Roosevelt' },
    'Duchesne': { lat: 40.17, lng: -110.40, name: 'Duchesne' },
    'Fort Duchesne': { lat: 40.28, lng: -109.86, name: 'Fort Duchesne' },
    'Myton': { lat: 40.22, lng: -110.18, name: 'Myton' },
    'Dinosaur NM': { lat: 40.44, lng: -109.31, name: 'Dinosaur NM' },
    'Red Wash': { lat: 40.20, lng: -109.35, name: 'Red Wash' },
    'Ouray': { lat: 40.05, lng: -109.69, name: 'Ouray' },
};

// AQI thresholds and colors
const AQI_LEVELS = [
    { max: 50, label: 'Good', color: '#00e676', class: 'good' },
    { max: 100, label: 'Moderate', color: '#ffeb3b', class: 'moderate' },
    { max: 150, label: 'Unhealthy for Sensitive Groups', color: '#ff9800', class: 'sensitive' },
    { max: 200, label: 'Unhealthy', color: '#f44336', class: 'unhealthy' },
    { max: 300, label: 'Very Unhealthy', color: '#9c27b0', class: 'very-unhealthy' },
    { max: Infinity, label: 'Hazardous', color: '#880e4f', class: 'hazardous' }
];

// State
let map = null;
let markers = [];
let refreshInterval = null;

// Initialize on load
document.addEventListener('DOMContentLoaded', init);

async function init() {
    initMap();
    await loadData();
    startAutoRefresh();
}

function initMap() {
    map = L.map('aqi-map', {
        center: [40.2, -109.8],
        zoom: 9,
        zoomControl: false,
        attributionControl: false
    });

    // Dark tile layer
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19
    }).addTo(map);

    // Add zoom control to bottom right
    L.control.zoom({ position: 'bottomright' }).addTo(map);
}

async function loadData() {
    try {
        const response = await fetch('/api/live-observations');
        if (!response.ok) throw new Error('Failed to fetch');

        const apiData = await response.json();
        processData(apiData.data || []);
        updateTimestamp();
    } catch (err) {
        console.error('Data load error:', err);
    }
}

function processData(observations) {
    // Group by station
    const stationData = {};
    observations.forEach(obs => {
        const { stid, variable, value } = obs;
        if (!stationData[stid]) stationData[stid] = {};
        stationData[stid][variable.toLowerCase()] = value;
    });

    // Clear old markers
    markers.forEach(m => map.removeLayer(m));
    markers = [];

    // Aggregates
    let peakAqi = 0;
    let temps = [];
    let winds = [];
    let humidities = [];
    let activeCount = 0;

    // Process each station
    Object.entries(stationData).forEach(([stid, data]) => {
        const station = findStation(stid);
        if (!station) return;

        activeCount++;

        // Calculate AQI from ozone (ppb to AQI approximation)
        const ozone = data.ozone || data.o3 || 0;
        const aqi = ozoneToAqi(ozone);
        if (aqi > peakAqi) peakAqi = aqi;

        // Collect metrics
        if (data.temperature || data.temp) temps.push(data.temperature || data.temp);
        if (data.wind_speed || data.windspeed) winds.push(data.wind_speed || data.windspeed);
        if (data.humidity || data.relative_humidity) humidities.push(data.humidity || data.relative_humidity);

        // Create marker
        const level = getAqiLevel(aqi);
        const marker = L.circleMarker([station.lat, station.lng], {
            radius: 10,
            fillColor: level.color,
            color: '#fff',
            weight: 2,
            fillOpacity: 0.85
        }).addTo(map);

        marker.bindPopup(`<b>${station.name}</b><br>AQI: ${Math.round(aqi)}<br>O₃: ${ozone.toFixed(1)} ppb`);
        markers.push(marker);
    });

    // Update UI
    updateAqiCard(peakAqi);
    updateMetrics(temps, winds, humidities, activeCount);
}

function findStation(stid) {
    // Try direct match first
    if (STATIONS[stid]) return STATIONS[stid];

    // Try partial match
    const normalized = stid.toLowerCase();
    for (const [name, coords] of Object.entries(STATIONS)) {
        if (normalized.includes(name.toLowerCase().split(' ')[0])) {
            return { ...coords, name };
        }
    }
    return null;
}

function ozoneToAqi(ppb) {
    // Simplified 8-hour ozone AQI calculation
    if (ppb <= 54) return (ppb / 54) * 50;
    if (ppb <= 70) return 50 + ((ppb - 54) / 16) * 50;
    if (ppb <= 85) return 100 + ((ppb - 70) / 15) * 50;
    if (ppb <= 105) return 150 + ((ppb - 85) / 20) * 50;
    if (ppb <= 200) return 200 + ((ppb - 105) / 95) * 100;
    return 300 + ((ppb - 200) / 100) * 100;
}

function getAqiLevel(aqi) {
    return AQI_LEVELS.find(level => aqi <= level.max) || AQI_LEVELS[AQI_LEVELS.length - 1];
}

function updateAqiCard(aqi) {
    const level = getAqiLevel(aqi);
    const card = document.getElementById('card-aqi');
    const valueEl = document.getElementById('aqi-value');
    const statusEl = document.getElementById('aqi-status');

    // Update values
    valueEl.textContent = Math.round(aqi);
    statusEl.textContent = level.label;

    // Update card class for styling
    card.className = 'metric-card metric-aqi status-' + level.class;
}

function updateMetrics(temps, winds, humidities, activeCount) {
    // Temperature
    if (temps.length) {
        const avgTemp = temps.reduce((a, b) => a + b, 0) / temps.length;
        document.getElementById('temp-value').textContent = `${Math.round(avgTemp)}°F`;
        document.getElementById('temp-range').textContent = `H: ${Math.round(Math.max(...temps))}° / L: ${Math.round(Math.min(...temps))}°`;
    }

    // Wind
    if (winds.length) {
        const avgWind = winds.reduce((a, b) => a + b, 0) / winds.length;
        document.getElementById('wind-value').textContent = `${Math.round(avgWind)} mph`;
        document.getElementById('wind-dir').textContent = `Gusts to ${Math.round(Math.max(...winds))} mph`;
    }

    // Humidity
    if (humidities.length) {
        const avgHumidity = humidities.reduce((a, b) => a + b, 0) / humidities.length;
        document.getElementById('humidity-value').textContent = `${Math.round(avgHumidity)}%`;
    }

    // Stations
    document.getElementById('stations-value').textContent = activeCount;
}

function updateTimestamp() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    });
    document.getElementById('last-update').textContent = timeStr;

    // Stop spin animation briefly to indicate refresh
    const icon = document.getElementById('refresh-icon');
    icon.classList.remove('spin');
    setTimeout(() => icon.classList.add('spin'), 100);
}

function startAutoRefresh() {
    // Refresh every 10 minutes
    refreshInterval = setInterval(loadData, 10 * 60 * 1000);
}
