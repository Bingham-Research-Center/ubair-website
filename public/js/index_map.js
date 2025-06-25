import { stations } from './config.js';
import { getMarkerColor, createPopupContent } from './mapUtils.js';
import { fetchLiveObservations } from './api.js';

const map = L.map('map', {
    zoomControl: false,
    scrollWheelZoom: false,
    doubleClickZoom: false,
    dragging: false,
    touchZoom: false,
    boxZoom: false,
    keyboard: false
}).setView([40.3033, -109.7], 10); // Changed from -110.0 to -109.7, zoom from 9 to 10


L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 15,
    attribution: '© OpenStreetMap contributors'
}).addTo(map);

let kioskMode = false;
let kioskInterval;
let currentStationIndex = 0;
let markers = [];

const kioskContainer = document.createElement('div');
kioskContainer.className = 'kiosk-switch-container';
kioskContainer.innerHTML = `
    <label for="kiosk-switch" style="color: var(--usu-blue); font-weight: 500; margin-right: 0.5rem;">Auto-cycle stations:</label>
    <div class="kiosk-switch ${kioskMode ? 'active' : ''}" id="kiosk-switch" title="Automatically cycle through station popups for displays">
        <div class="switch-slider"></div>
    </div>
`;

// Add to page after map loads
document.addEventListener('DOMContentLoaded', () => {
    const mapContainer = document.getElementById('map');
    if (mapContainer) {
        mapContainer.style.height = '350px'; // More square
        mapContainer.style.maxWidth = '600px'; // Limit width
        mapContainer.style.margin = '20px auto';

        // Insert switch after map
        mapContainer.parentNode.insertBefore(kioskContainer, mapContainer.nextSibling);

        // Add event listener
        document.getElementById('kiosk-switch').addEventListener('click', toggleKiosk);
    }
});

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
    }, 5000);
}

function stopKioskMode() {
    clearInterval(kioskInterval);
    map.closePopup();
}

async function updateMiniMap() {
    try {
        const data = await fetchLiveObservations();

        // Clear existing markers
        markers.forEach(marker => map.removeLayer(marker));
        markers = [];

        for (const [stationName, coordinates] of Object.entries(stations)) {
            const measurements = {
                'Ozone': data['Ozone']?.[stationName] ?? null,
                'PM2.5': data['PM2.5']?.[stationName] ?? null,
                'NOx': data['NOx']?.[stationName] ?? null,
                'NO': data['NO']?.[stationName] ?? null,
                'Temperature': data['Temperature']?.[stationName] ?? null
            };

            // Create two-column popup content
            const popupContent = createTwoColumnPopup(stationName, measurements);

            const markerColor = getMarkerColor(measurements);
            const markerIcon = L.divIcon({
                className: 'custom-marker',
                html: `<div style="background-color: ${markerColor}; width: 15px; height: 15px; border-radius: 50%; border: 1px solid white;"></div>`,
                iconSize: [18, 18]
            });

            const marker = L.marker([coordinates.lat, coordinates.lng], { icon: markerIcon })
                .bindPopup(popupContent, {
                    maxWidth: 300,
                    className: 'two-column-popup'
                });
            marker.addTo(map);
            markers.push(marker);
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
        const item = `<div style="margin: 2px 0;"><strong>${pollutant}:</strong> ${value}${unit}</div>`;

        if (index % 2 === 0) {
            leftCol += item;
        } else {
            rightCol += item;
        }
    });

    return `
        <div style="min-width: 250px;">
            <h3 style="text-align: center; margin: 0 0 8px 0;">${stationName}</h3>
            <div style="display: flex; gap: 15px;">
                <div style="flex: 1;">${leftCol}</div>
                <div style="flex: 1;">${rightCol}</div>
            </div>
        </div>
    `;
}

updateMiniMap();
setInterval(updateMiniMap, 300000);