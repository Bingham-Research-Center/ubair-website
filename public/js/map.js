import { stations } from './config.js';
import { getMarkerColor, createPopupContent } from './mapUtils.js';

// Initialize the map centered on Uintah Basin
const map = L.map('map').setView([40.3033, -110.0153], 9);

// Add OpenStreetMap tile layer
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap contributors'
}).addTo(map);

// Overlay toggle setup
const overlayContainer = document.querySelector('.overlay-container');
const studyAreaToggle = document.createElement('button');
studyAreaToggle.textContent = 'Toggle Study Area';
studyAreaToggle.className = 'study-area-toggle';
overlayContainer.insertBefore(studyAreaToggle, overlayContainer.firstChild);

let studyAreaVisible = true;
studyAreaToggle.addEventListener('click', () => {
    const images = overlayContainer.querySelectorAll('img');
    images.forEach(img => {
        img.style.display = studyAreaVisible ? 'none' : 'block';
    });
    studyAreaVisible = !studyAreaVisible;
    studyAreaToggle.textContent = studyAreaVisible ? 'Hide Study Area' : 'Show Study Area';
});

// Function to update the map with current conditions from live observations
async function updateMap() {
    const response = await fetch('/public/data/test_liveobs.json');
    const data = await response.json();

    // Clear existing markers
    map.eachLayer((layer) => {
        if (layer instanceof L.Marker) {
            map.removeLayer(layer);
        }
    });

    // Create markers for each station
    for (const [stationName, coordinates] of Object.entries(stations)) {
        const measurements = {
            'Ozone': data['Ozone']?.[stationName] ?? null,
            'PM2.5': data['PM2.5']?.[stationName] ?? null,
            'NOx': data['NOx']?.[stationName] ?? null,
            'NO': data['NO']?.[stationName] ?? null,
            'Temperature': data['Temperature']?.[stationName] ?? null
        };

        // Skip if no measurements
        if (Object.values(measurements).every(v => v === null)) continue;

        const markerColor = getMarkerColor(measurements);
        const markerIcon = L.divIcon({
            className: 'custom-marker',
            html: `<div style="
                background-color: ${markerColor};
                width: 20px;
                height: 20px;
                border-radius: 50%;
                border: 2px solid white;
                box-shadow: 0 0 5px rgba(0,0,0,0.5);"
            ></div>`,
            iconSize: [24, 24]
        });

        L.marker([coordinates.lat, coordinates.lng], { icon: markerIcon })
            .bindPopup(createPopupContent(stationName, measurements))
            .addTo(map);
    }
}

// Add custom CSS for the toggle button
const style = document.createElement('style');
style.textContent = `
    .study-area-toggle {
        margin-bottom: 10px;
        padding: 8px 16px;
        background-color: #007bff;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        width: 100%;
    }
    .study-area-toggle:hover {
        background-color: #0056b3;
    }
`;
document.head.appendChild(style);

// Update map initially and every 5 minutes
updateMap();
setInterval(updateMap, 300000);