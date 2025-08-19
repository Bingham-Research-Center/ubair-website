import { stations } from './config.js';
import { getMarkerColor, createPopupContent } from './mapUtils.js';
import { fetchLiveObservations } from './api.js';

// Initialize map with proper center and zoom for dashboard view
const map = L.map('map', {
    zoomControl: false,
    scrollWheelZoom: false,
    doubleClickZoom: false,
    dragging: false,
    touchZoom: false,
    boxZoom: false,
    keyboard: false
}).setView([40.3033, -109.7], 8); // Slightly more zoomed out

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 15,
    attribution: '© OpenStreetMap contributors'
}).addTo(map);

let kioskMode = false;
let kioskInterval;
let currentStationIndex = 0;
let markers = [];

// Wait for DOM to load before setting up
document.addEventListener('DOMContentLoaded', () => {
    setupKioskControl();
    updateMiniMap();

    // Auto-refresh every 5 minutes
    setInterval(updateMiniMap, 300000);
});

function setupKioskControl() {
    // The kiosk control is now part of the HTML structure
    const kioskSwitch = document.getElementById('kiosk-switch');
    if (kioskSwitch) {
        kioskSwitch.addEventListener('click', toggleKiosk);
    }
}

function toggleKiosk() {
    kioskMode = !kioskMode;
    const switchEl = document.getElementById('kiosk-switch');

    if (kioskMode) {
        startKioskMode();
        switchEl.classList.add('active');
    } else {
        stopKioskMode();
        switchEl.classList.remove('active');
    }
}

function startKioskMode() {
    if (markers.length === 0) return;

    currentStationIndex = 0;
    kioskInterval = setInterval(() => {
        map.closePopup();
        if (markers[currentStationIndex]) {
            markers[currentStationIndex].openPopup();
        }
        currentStationIndex = (currentStationIndex + 1) % markers.length;
    }, 4000); // 4 second intervals
}

function stopKioskMode() {
    clearInterval(kioskInterval);
    map.closePopup();
}

async function updateMiniMap() {
    try {
        // Fetch live observations data
        const data = await fetchLiveObservations();

        // Clear existing markers
        markers.forEach(marker => map.removeLayer(marker));
        markers = [];

        // Add markers for each station
        for (const [stationName, coordinates] of Object.entries(stations)) {
            const measurements = {
                'Ozone': data['Ozone']?.[stationName] ?? null,
                'PM2.5': data['PM2.5']?.[stationName] ?? null,
                'NOx': data['NOx']?.[stationName] ?? null,
                'NO': data['NO']?.[stationName] ?? null,
                'Temperature': data['Temperature']?.[stationName] ?? null
            };

            const popupContent = createTwoColumnPopup(stationName, measurements);
            const markerColor = getMarkerColor(measurements);

            const markerIcon = L.divIcon({
                className: 'custom-marker',
                html: `<div style="background-color: ${markerColor}; width: 20px; height: 20px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 6px rgba(0,0,0,0.5);"></div>`,
                iconSize: [24, 24]
            });

            const marker = L.marker([coordinates.lat, coordinates.lng], { icon: markerIcon })
                .bindPopup(popupContent, {
                    maxWidth: 300,
                    className: 'two-column-popup'
                });

            marker.addTo(map);
            markers.push(marker);
        }

        // Fit map to show all stations with extra padding for dashboard view
        if (markers.length > 0) {
            const group = new L.featureGroup(markers);
            map.fitBounds(group.getBounds(), {
                padding: [30, 30], // More padding for better view
                maxZoom: 9
            });
        }

    } catch (error) {
        console.error('Error loading observation data:', error);
    }
}


function createTwoColumnPopup(stationName, measurements) {
    const validMeasurements = Object.entries(measurements).filter(([_, value]) => value !== null && !isNaN(value));

    if (validMeasurements.length === 0) {
        return `<div><h3>${stationName}</h3><div>Data missing.</div></div>`;
    }

    let leftCol = '';
    let rightCol = '';

    validMeasurements.forEach(([pollutant, value], index) => {
        const unit = pollutant === 'Temperature' ? '°C' : ' ppb';
        const item = `<div style="margin: 4px 0;"><strong>${pollutant}:</strong> ${value}${unit}</div>`;

        if (index % 2 === 0) {
            leftCol += item;
        } else {
            rightCol += item;
        }
    });

    return `
        <div style="min-width: 280px;">
            <h3 style="text-align: center; margin: 0 0 10px 0; color: var(--usu-blue);">${stationName}</h3>
            <div style="display: flex; gap: 20px;">
                <div style="flex: 1;">${leftCol}</div>
                <div style="flex: 1;">${rightCol}</div>
            </div>
        </div>
    `;
}