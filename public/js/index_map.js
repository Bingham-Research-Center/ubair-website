import { stations } from './config.js';
import { getMarkerColor, createPopupContent } from './mapUtils.js';

// Initialize a smaller map centered on Uintah Basin
const map = L.map('map',{
    zoomControl: false,
    scrollWheelZoom: false,
    doubleClickZoom: false
}).setView([40.3033, -110.0153], 9);

// Add OpenStreetMap tile layer
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 15,
    attribution: '© OpenStreetMap contributors'
}).addTo(map);

// Function to update the map with key conditions from live observations
async function updateMiniMap() {
    try {
        const response = await fetch('/public/data/test_liveobs.json');
        const data = await response.json();

        // Clear existing markers
        map.eachLayer((layer) => {
            if (layer instanceof L.Marker) {
                map.removeLayer(layer);
            }
        });

        // Create simplified markers for each station
        for (const [stationName, coordinates] of Object.entries(stations)) {
            const measurements = {
                'Ozone': data['Ozone']?.[stationName] ?? null,
                'PM2.5': data['PM2.5']?.[stationName] ?? null,
                'Temperature': data['Temperature']?.[stationName] ?? null
            };

            // Skip if no key measurements are available
            if (Object.values(measurements).every(v => v === null)) continue;

            const markerColor = getMarkerColor(measurements);
            const markerIcon = L.divIcon({
                className: 'custom-marker',
                html: `<div style="
                    background-color: ${markerColor};
                    width: 15px;
                    height: 15px;
                    border-radius: 50%;
                    border: 1px solid white;"
                ></div>`,
                iconSize: [18, 18]
            });

            L.marker([coordinates.lat, coordinates.lng], { icon: markerIcon })
                .bindPopup(createPopupContent(stationName, measurements))
                .addTo(map);
        }
    } catch (error) {
        console.error('Error loading observation data:', error);
    }
}

// Initial map update and refresh every 5 minutes
updateMiniMap();
setInterval(updateMiniMap, 300000);