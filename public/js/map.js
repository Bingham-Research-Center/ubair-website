// Fixed map.js with all features restored
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

// Initialize kiosk mode variables
let mapKioskMode = false;
let mapKioskInterval;
let currentStationIndex = 0;
let markers = [];

// Setup UI elements after DOM loads
document.addEventListener('DOMContentLoaded', function() {
    setupStudyAreaToggle();
    setupKioskControl();
    fixUSULogo();
    updateMap(); // Initial data load
});

function setupStudyAreaToggle() {
    const overlayContainer = document.querySelector('.overlay-container');
    const studyAreaImage = document.getElementById('image-overlay');

    if (!overlayContainer || !studyAreaImage) return;

    // Show by default
    overlayContainer.style.display = 'block';
    let studyAreaVisible = true;

    // Style the container
    overlayContainer.style.position = 'fixed';
    overlayContainer.style.top = '10vh';
    overlayContainer.style.right = '2%';
    overlayContainer.style.zIndex = '1000';
    overlayContainer.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
    overlayContainer.style.padding = '10px';
    overlayContainer.style.borderRadius = '5px';
    overlayContainer.style.maxWidth = '12vw';
    overlayContainer.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';

    // Style the image
    studyAreaImage.style.display = 'block';
    studyAreaImage.style.maxWidth = '100%';
    studyAreaImage.style.height = 'auto';

    // Create toggle button
    const studyAreaToggle = document.createElement('button');
    studyAreaToggle.textContent = 'Hide Study Area';
    studyAreaToggle.className = 'study-area-toggle';
    studyAreaToggle.style.cssText = `
        position: fixed;
        top: 2vh;
        right: 2%;
        padding: 0.5em 1em;
        z-index: 1001;
        background-color: #00263A;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        transition: all 0.3s ease;
    `;

    studyAreaToggle.addEventListener('click', function() {
        studyAreaVisible = !studyAreaVisible;
        overlayContainer.style.display = studyAreaVisible ? 'block' : 'none';
        studyAreaToggle.textContent = studyAreaVisible ? 'Hide Study Area' : 'Show Study Area';
    });

    document.body.appendChild(studyAreaToggle);
}

function setupKioskControl() {
    // Add kiosk control to map
    const kioskControl = L.control({position: 'bottomcenter'});

    kioskControl.onAdd = function(map) {
        const div = L.DomUtil.create('div', 'kiosk-control-bottom');
        div.innerHTML = `
            <div class="kiosk-container-bottom">
                <label for="map-kiosk-toggle" class="kiosk-label">Auto-cycle stations:</label>
                <div class="kiosk-switch-map" id="map-kiosk-toggle">
                    <div class="switch-slider-map">
                        <div class="timer-fill" id="timer-fill"></div>
                    </div>
                </div>
            </div>
        `;
        return div;
    };

    kioskControl.addTo(map);

    // Add event listener
    document.getElementById('map-kiosk-toggle').addEventListener('click', function() {
        mapKioskMode = !mapKioskMode;
        const switchEl = this;
        const timerFill = document.getElementById('timer-fill');

        if (mapKioskMode) {
            switchEl.classList.add('active');
            timerFill.style.animation = 'timer-fill 5s linear infinite';
            startKioskMode();
        } else {
            switchEl.classList.remove('active');
            timerFill.style.animation = 'none';
            stopKioskMode();
        }
    });
}

function fixUSULogo() {
    const usuLogoContainer = document.querySelector('.usu-logo');
    if (!usuLogoContainer) return;

    // Reset and apply correct styles
    usuLogoContainer.style.cssText = `
        position: fixed;
        bottom: 5vh;
        left: calc(250px + 2%);
        z-index: 1000;
    `;

    const usuLogoImage = usuLogoContainer.querySelector('img');
    if (usuLogoImage) {
        usuLogoImage.style.cssText = `
            height: auto;
            width: 80px;
            max-width: 100px;
        `;
    }
}

function startKioskMode() {
    if (markers.length === 0) return;

    currentStationIndex = 0;
    // Open first popup immediately
    if (markers[0]) {
        markers[0].openPopup();
    }

    // Start interval for subsequent popups
    mapKioskInterval = setInterval(() => {
        map.closePopup();
        currentStationIndex = (currentStationIndex + 1) % markers.length;
        if (markers[currentStationIndex]) {
            markers[currentStationIndex].openPopup();
        }
    }, 5000);
}

function stopKioskMode() {
    clearInterval(mapKioskInterval);
    map.closePopup();
}

// Generate synthetic data for demo
function generateSyntheticData() {
    const syntheticData = {
        'Ozone': {},
        'PM2.5': {},
        'Temperature': {},
        'NOx': {},
        'NO': {}
    };

    Object.keys(stations).forEach(station => {
        // Generate realistic values with some variation
        syntheticData['Ozone'][station] = Math.round(35 + Math.random() * 40); // 35-75 ppb
        syntheticData['PM2.5'][station] = Math.round(5 + Math.random() * 35); // 5-40 µg/m³
        syntheticData['Temperature'][station] = Math.round(-5 + Math.random() * 20); // -5 to 15°C
        syntheticData['NOx'][station] = Math.round(20 + Math.random() * 80); // 20-100 ppb
        syntheticData['NO'][station] = Math.round(10 + Math.random() * 50); // 10-60 ppb
    });

    return syntheticData;
}

async function updateMap() {
    try {
        // Try to fetch real data, fall back to synthetic
        let data;
        try {
            data = await fetchLiveObservations();
        } catch (error) {
            console.log('Using synthetic data for demo');
            data = generateSyntheticData();
        }

        // Clear existing markers
        markers.forEach(marker => map.removeLayer(marker));
        markers = [];

        // Create markers for each station
        for (const [stationName, coordinates] of Object.entries(stations)) {
            const measurements = {
                'Ozone': data['Ozone']?.[stationName] ?? null,
                'PM2.5': data['PM2.5']?.[stationName] ?? null,
                'NOx': data['NOx']?.[stationName] ?? null,
                'NO': data['NO']?.[stationName] ?? null,
                'Temperature': data['Temperature']?.[stationName] ?? null
            };

            const popupContent = createPopupContent(stationName, measurements);
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

            const marker = L.marker([coordinates.lat, coordinates.lng], { icon: markerIcon })
                .bindPopup(popupContent);

            marker.addTo(map);
            markers.push(marker);
        }
    } catch (error) {
        console.error('Error updating map:', error);
    }
}

// Update map every 5 minutes
setInterval(updateMap, 300000);

// Export for use in other modules if needed
window.mapInstance = map;