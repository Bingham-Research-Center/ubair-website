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

// Study Area Toggle Button
const studyAreaToggle = document.createElement('button');
studyAreaToggle.textContent = 'Hide Study Area'; // Default to "Hide" as it is visible initially
studyAreaToggle.className = 'study-area-toggle';
overlayContainer.insertBefore(studyAreaToggle, overlayContainer.firstChild);

let studyAreaVisible = true; // Set visible by default
studyAreaToggle.addEventListener('click', () => {
    const images = overlayContainer.querySelectorAll('img');
    images.forEach(img => {
        img.style.display = studyAreaVisible ? 'none' : 'block';
    });
    studyAreaVisible = !studyAreaVisible;
    studyAreaToggle.textContent = studyAreaVisible ? 'Hide Study Area' : 'Show Study Area';
});

// Positioning graphics and adjusting overlay size
const studyAreaGraphic = document.querySelector('.overlay-container');
const usuLogo = document.querySelector('.usu-logo');

// Position the study area graphic in the bottom half of the view window
studyAreaGraphic.style.position = 'fixed';
studyAreaGraphic.style.bottom = '0'; // Anchor to the bottom of the view window
studyAreaGraphic.style.left = '10px'; // Adjust as needed for spacing from left
studyAreaGraphic.style.zIndex = '2';
studyAreaGraphic.style.height = '30vh'; // Limit height to bottom half of the page

// Position the USU logo 20% from the top
usuLogo.style.position = 'fixed';
usuLogo.style.top = '1%';
usuLogo.style.left = '10px'; // Adjust as needed for spacing from left
usuLogo.style.transform = 'translateY(0)'; // Remove centering
usuLogo.style.zIndex = '2';

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

    let popupContent;
    if (Object.values(measurements).every(v => v === null || isNaN(v))) {
        popupContent = `<div><h3>${stationName}</h3><div>Data missing.</div></div>`;
    } else {
        popupContent = createPopupContent(stationName, measurements);
    }

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
            .bindPopup(popupContent)
            .addTo(map);
    }
}

// Update map initially and every 5 minutes
updateMap();
setInterval(updateMap, 300000);