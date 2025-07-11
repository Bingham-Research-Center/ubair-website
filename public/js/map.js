import { stations } from './config.js';
import { getMarkerColor, createPopupContent } from './mapUtils.js';
import { fetchLiveObservations } from './api.js';

// Initialize the map centered on Uintah Basin
const map = L.map('map').setView([40.3033, -109.7], 9);

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

    // Auto-refresh every 5 minutes
    setInterval(updateMap, 300000);
});

function setupStudyAreaToggle() {
    const overlayContainer = document.querySelector('.overlay-container');
    const studyAreaImage = document.getElementById('image-overlay');

    if (!overlayContainer || !studyAreaImage) return;

    // Start hidden by default
    overlayContainer.style.display = 'none';
    let studyAreaVisible = false;

    // Create toggle button
    const studyAreaToggle = document.createElement('button');
    studyAreaToggle.textContent = 'Show Study Area';
    studyAreaToggle.className = 'study-area-toggle';

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
    if (usuLogoContainer) {
        // Ensure proper positioning for live AQ page
        usuLogoContainer.style.position = 'fixed';
        usuLogoContainer.style.bottom = '20px';
        usuLogoContainer.style.left = 'calc(250px + 20px)';
        usuLogoContainer.style.zIndex = '1000';

        const usuLogoImage = usuLogoContainer.querySelector('img');
        if (usuLogoImage) {
            usuLogoImage.style.height = '60px';
            usuLogoImage.style.width = 'auto';
            usuLogoImage.style.opacity = '0.8';
        }
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
            console.log('Using synthetic data for live AQ demo');
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
                    width: 24px;
                    height: 24px;
                    border-radius: 50%;
                    border: 3px solid white;
                    box-shadow: 0 0 8px rgba(0,0,0,0.6);"
                ></div>`,
                iconSize: [30, 30]
            });

            const marker = L.marker([coordinates.lat, coordinates.lng], { icon: markerIcon })
                .bindPopup(popupContent, {
                    maxWidth: 300,
                    className: 'station-popup'
                });

            marker.addTo(map);
            markers.push(marker);
        }

        // Fit map to show all stations on first load
        if (markers.length > 0) {
            const group = new L.featureGroup(markers);
            map.fitBounds(group.getBounds(), {
                padding: [30, 30],
                maxZoom: 11
            });
        }

    } catch (error) {
        console.error('Error updating map:', error);
    }
}

// Export for use in other modules if needed
window.mapInstance = map;