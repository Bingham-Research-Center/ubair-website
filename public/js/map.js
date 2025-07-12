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
    console.log('DOM loaded, setting up live_aq map...');
    // console.log('Available stations:', Object.keys(stations));

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

    if (!overlayContainer || !studyAreaImage) {
        console.log('Study area elements not found');
        return;
    }

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
    console.log('Setting up kiosk control...');

    // Wait for map to be fully initialized
    setTimeout(() => {
        // Create kiosk control using bottomright position (Leaflet standard)
        const kioskControl = L.control({position: 'bottomright'});

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

            // Prevent map interactions on the control
            L.DomEvent.disableClickPropagation(div);
            L.DomEvent.disableScrollPropagation(div);

            return div;
        };

        try {
            kioskControl.addTo(map);
            console.log('Kiosk control added to map successfully');

            // Add event listener after control is added to DOM
            setTimeout(() => {
                const kioskToggle = document.getElementById('map-kiosk-toggle');
                if (kioskToggle) {
                    kioskToggle.addEventListener('click', function() {
                        console.log('Kiosk toggle clicked, current mode:', mapKioskMode);
                        mapKioskMode = !mapKioskMode;
                        const switchEl = this;
                        const timerFill = document.getElementById('timer-fill');

                        if (mapKioskMode) {
                            console.log('Starting kiosk mode...');
                            switchEl.classList.add('active');
                            if (timerFill) {
                                timerFill.style.animation = 'timer-fill 5s linear infinite';
                            }
                            startKioskMode();
                        } else {
                            console.log('Stopping kiosk mode...');
                            switchEl.classList.remove('active');
                            if (timerFill) {
                                timerFill.style.animation = 'none';
                            }
                            stopKioskMode();
                        }
                    });
                    console.log('Kiosk control event listener attached');
                } else {
                    console.error('Kiosk toggle element not found after timeout');
                }
            }, 200);
        } catch (error) {
            console.error('Error adding kiosk control to map:', error);
        }
    }, 500);
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
    if (markers.length === 0) {
        console.log('No markers available for kiosk mode');
        return;
    }

    console.log(`Starting kiosk mode with ${markers.length} markers`);
    currentStationIndex = 0;

    // Open first popup immediately
    if (markers[0]) {
        markers[0].openPopup();
        console.log('Opened popup for first station');
    }

    // Start interval for subsequent popups
    mapKioskInterval = setInterval(() => {
        map.closePopup();
        currentStationIndex = (currentStationIndex + 1) % markers.length;
        if (markers[currentStationIndex]) {
            markers[currentStationIndex].openPopup();
            console.log(`Opened popup for station ${currentStationIndex}`);
        }
    }, 5000);
}

function stopKioskMode() {
    console.log('Stopping kiosk mode...');
    if (mapKioskInterval) {
        clearInterval(mapKioskInterval);
        mapKioskInterval = null;
    }
    map.closePopup();
}

// Generate synthetic data for demo - improved to match station structure
function generateSyntheticData() {
    console.log('Generating synthetic data...');

    return {
        metadata: {
            timestamp: new Date().toISOString(),
            data_version: "1.2",
            basin_status: "operational"
        },
        stations: {
            'Roosevelt': { lat: 40.29430, lng: -110.009, active: true },
            'Vernal': { lat: 40.46472, lng: -109.56083, active: true },
            'Horsepool': { lat: 40.1433, lng: -109.4674, active: true },
            'Ouray': { lat: 40.05485, lng: -109.68737, active: true },
            'Myton': { lat: 40.21690, lng: -110.18230, active: false }, // Example offline station
            'Whiterocks': { lat: 40.48380, lng: -109.90620, active: true }
        },
        observations: {
            'Ozone': {
                'Roosevelt': Math.round(35 + Math.random() * 40),
                'Vernal': Math.round(35 + Math.random() * 40),
                'Horsepool': Math.round(35 + Math.random() * 40),
                'Ouray': null, // Example missing sensor
                'Whiterocks': Math.round(35 + Math.random() * 40)
            },
            'PM2.5': {
                'Roosevelt': Math.round(5 + Math.random() * 35 * 10) / 10,
                'Vernal': Math.round(5 + Math.random() * 35 * 10) / 10,
                'Horsepool': null,
                'Ouray': Math.round(5 + Math.random() * 35 * 10) / 10,
                'Whiterocks': Math.round(5 + Math.random() * 35 * 10) / 10
            },
            'Temperature': {
                'Roosevelt': Math.round((-5 + Math.random() * 20) * 10) / 10,
                'Vernal': Math.round((-5 + Math.random() * 20) * 10) / 10,
                'Horsepool': Math.round((-5 + Math.random() * 20) * 10) / 10,
                'Ouray': Math.round((-5 + Math.random() * 20) * 10) / 10,
                'Whiterocks': null
            },
            'NOx': {
                'Roosevelt': Math.round(20 + Math.random() * 80),
                'Vernal': Math.round(20 + Math.random() * 80),
                'Horsepool': Math.round(20 + Math.random() * 80),
                'Ouray': Math.round(20 + Math.random() * 80),
                'Whiterocks': Math.round(20 + Math.random() * 80)
            }
        }
    };
}

async function updateMap() {
    try {
        console.log('Updating map with station data...');

        // Fetch data using the new structure
        let data;
        try {
            data = await fetchLiveObservations();
            console.log('Using real data');
        } catch (error) {
            console.log('Using synthetic data for live AQ demo');
            data = generateSyntheticData();
        }

        // Clear existing markers
        markers.forEach(marker => map.removeLayer(marker));
        markers = [];

        // Create markers from the new structure
        let validStations = 0;
        for (const [stationName, stationInfo] of Object.entries(data.stations)) {
            // Skip if station is inactive or has invalid coordinates
            if (!stationInfo.active || !stationInfo.lat || !stationInfo.lng) {
                console.warn(`Skipping inactive/invalid station: ${stationName}`);
                continue;
            }

            // Extract measurements for this station from all variables
            const measurements = {};
            for (const [variable, stationValues] of Object.entries(data.observations)) {
                measurements[variable] = stationValues[stationName] ?? null;
            }

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

            const marker = L.marker([stationInfo.lat, stationInfo.lng], { icon: markerIcon })
                .bindPopup(popupContent, {
                    maxWidth: 300,
                    className: 'station-popup'
                });

            marker.addTo(map);
            markers.push(marker);
            validStations++;

            console.log(`Added marker for ${stationName} at [${stationInfo.lat}, ${stationInfo.lng}]`);
        }

        console.log(`Added ${validStations} station markers to map`);

        // Fit map bounds
        if (markers.length > 0) {
            const group = new L.featureGroup(markers);
            const bounds = group.getBounds();

            if (bounds.isValid()) {
                map.fitBounds(bounds, {
                    padding: [50, 50],
                    maxZoom: 11
                });
                console.log('Map bounds set successfully');
            } else {
                console.warn('Invalid bounds, using default view');
                map.setView([40.3033, -109.7], 9);
            }
        } else {
            console.warn('No markers created, using default view');
            map.setView([40.3033, -109.7], 9);
        }

    } catch (error) {
        console.error('Error updating map:', error);
        map.setView([40.3033, -109.7], 9);
    }
}

// Export for debugging
window.mapInstance = map;
// window.debugMap = {
//     stations,
//     markers: () => markers,
//     kioskMode: () => mapKioskMode,
//     updateMap,
//     startKiosk: startKioskMode,
//     stopKiosk: stopKioskMode
// };