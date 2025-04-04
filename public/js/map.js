// Modified portion of map.js to fix image display issues
import { stations } from './config.js';
import { getMarkerColor, createPopupContent } from './mapUtils.js';
import { fetchLiveObservations } from './api.js';

// Initialize the map centered on Uintah Basin
const map = L.map('map').setView([40.3033, -110.0153], 9);

// Add OpenStreetMap tile layer
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap contributors'
}).addTo(map);

// Add this to your map.js file for USU logo positioning and study area sizing
document.addEventListener('DOMContentLoaded', function() {
    // Get references to the overlay container and image
    const overlayContainer = document.querySelector('.overlay-container');
    const studyAreaImage = document.getElementById('image-overlay');

    if (!overlayContainer || !studyAreaImage) {
        console.error('Study area elements not found');
        return;
    }

    // Position the overlay container correctly
    overlayContainer.style.position = 'fixed';
    overlayContainer.style.top = '10vh' // 10% of viewport height
    overlayContainer.style.right = '2%';
    overlayContainer.style.left = 'auto'; // Override any left positioning
    overlayContainer.style.zIndex = '1000';
    overlayContainer.style.backgroundColor = 'rgba(255, 255, 255, 0.7)';
    overlayContainer.style.padding = '10px';
    overlayContainer.style.borderRadius = '5px';
    overlayContainer.style.width = 'auto'; // Make container width fit the content
    overlayContainer.style.maxWidth = '12vw'; // Limit maximum width

    // Make the study area image smaller
    studyAreaImage.style.display = 'block';
    studyAreaImage.style.maxWidth = '8vw';
    studyAreaImage.style.minWidth = '80px'; // Stops it becoming too small on, e.g., mobile
    studyAreaImage.style.height = 'auto';

    // Create and position the toggle button separate from the container
    const studyAreaToggle = document.createElement('button');
    studyAreaToggle.textContent = 'Hide Study Area';
    studyAreaToggle.className = 'study-area-toggle';

    // Style the toggle button
    studyAreaToggle.style.position = 'fixed';
    studyAreaToggle.style.top = '2vh';
    studyAreaToggle.style.right = '2%';
    studyAreaToggle.style.padding = '0.5em 1em'; // Relative to font size instead of 8px 12px
    studyAreaToggle.style.zIndex = '1001'; // Above the container
    studyAreaToggle.style.backgroundColor = '#00263A'; // USU blue
    studyAreaToggle.style.color = 'white';
    studyAreaToggle.style.border = 'none';
    studyAreaToggle.style.borderRadius = '4px';
    studyAreaToggle.style.cursor = 'pointer';

    // Add the button to the body
    document.body.appendChild(studyAreaToggle);

    // Setup toggle functionality
    let studyAreaVisible = true;
    studyAreaToggle.addEventListener('click', () => {
        overlayContainer.style.display = studyAreaVisible ? 'none' : 'block';
        studyAreaVisible = !studyAreaVisible;
        studyAreaToggle.textContent = studyAreaVisible ? 'Hide Study Area' : 'Show Study Area';
    });

    const usuLogoContainer = document.querySelector('.usu-logo');
    if (usuLogoContainer) {
        // Remove any existing styles
        usuLogoContainer.removeAttribute('style');

        // Apply new positioning styles
        usuLogoContainer.style.position = 'fixed';
        usuLogoContainer.style.bottom = '5vh';
        usuLogoContainer.style.left = 'calc(250px + 2%)'; // Keep relative to sidebar width
        usuLogoContainer.style.top = 'auto'; // Clear top positioning
        usuLogoContainer.style.right = 'auto'; // Clear right positioning
        usuLogoContainer.style.zIndex = '1000';

        // Fix the logo image as well
        const usuLogoImage = usuLogoContainer.querySelector('img');
        if (usuLogoImage) {
            usuLogoImage.style.transform = 'none'; // Remove any transform
            usuLogoImage.style.height = 'auto';
            usuLogoImage.style.minWidth = '60px';
            usuLogoImage.style.maxWidth = '100px';
        }
    } else {
        console.error('USU logo container not found');
    }
});

// Function to update the map with current conditions from live observations
async function updateMap() {
    try {
        const data = await fetchLiveObservations();

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
    } catch (error) {
        console.error('Error updating map:', error);
    }
}

// Update map initially and every 5 minutes
updateMap();
setInterval(updateMap, 300000);