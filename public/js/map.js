import { getMarkerColor, createPopupContent } from './mapUtils.js';
import { fetchLiveObservations } from './api.js';
import { stations as configStations } from './config.js';

// Replicate mapStationName to ensure we use the same mapping as api.js
function mapStationName(stid, metadataName) {
    const prettyNames = {
        'UBHSP': 'Horsepool', 'UBCSP': 'Castle Peak', 'UB7ST': 'Seven Sisters',
        'KVEL': 'Vernal', 'K74V': 'Roosevelt', 'COOPDSNU1': 'Duchesne',
        'KU69': 'Duchesne', 'UINU1': 'Fort Duchesne', 'UTMYT': 'Myton',
        'COOPDINU1': 'Dinosaur NM', 'COOPALMU1': 'Altamont', 'UCC34': 'Bluebell',
        'K40U': 'Manila', 'UTSTV': 'Starvation', 'UTDAN': 'Daniels Summit',
        'UBRDW': 'Red Wash', 'UBORY': 'Ouray', 'UBDRF': 'Dry Fork', 'UBWHR': 'Whiterocks',
        'UTICS': 'Indian Canyon', 'UTSLD': 'Soldier Summit'
    };

    if (!prettyNames[stid] && metadataName) {
        // Clean metadata name
        return metadataName
            .replace(/\s+COOPB?$/, '')
            .replace(/\s+RADIO$/, '')
            .replace(/^ALTA\s*-\s*/, 'Alta ')
            .replace(/\s*NM\s*-\s*/, ' ')
            .toLowerCase()
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    }

    return prettyNames[stid] || metadataName || stid;
}

// Initialize the map centered on Uintah Basin
const map = L.map('map').setView([40.3033, -109.7], 9.5);

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
let useCelsius = false; // Default to Fahrenheit (matches homepage default)
let lastUnits = {}; // Cache units for popup rebuilds

// Setup UI elements after DOM loads
document.addEventListener('DOMContentLoaded', function() {
    // DOM loaded, setting up live_aq map...

    setupStudyAreaToggle();
    setupKioskControl();
    setupUnitToggle();
    fixUSULogo();
    updateMap(); // Initial data load

    // Auto-refresh every x minutes
    setInterval(updateMap, 10 * 60 * 1000);
});

function setupStudyAreaToggle() {
    const overlayContainer = document.querySelector('.overlay-container');
    const studyAreaImage = document.getElementById('image-overlay');

    if (!overlayContainer || !studyAreaImage) {
        // Study area elements not found, skipping setup
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
    // Setting up kiosk control...

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
            // Kiosk control added to map successfully

            // Add event listener after control is added to DOM
            setTimeout(() => {
                const kioskToggle = document.getElementById('map-kiosk-toggle');
                if (kioskToggle) {
                    kioskToggle.addEventListener('click', function() {
                        // Kiosk toggle clicked, toggling mode
                        mapKioskMode = !mapKioskMode;
                        const switchEl = this;
                        const timerFill = document.getElementById('timer-fill');

                        if (mapKioskMode) {
                            // Starting kiosk mode...
                            switchEl.classList.add('active');
                            if (timerFill) {
                                timerFill.style.animation = 'timer-fill 5s linear infinite';
                            }
                            startKioskMode();
                        } else {
                            // Stopping kiosk mode...
                            switchEl.classList.remove('active');
                            if (timerFill) {
                                timerFill.style.animation = 'none';
                            }
                            stopKioskMode();
                        }
                    });
                    // Kiosk control event listener attached
                } else {
                    console.error('Kiosk toggle element not found after timeout');
                }
            }, 200);
        } catch (error) {
            console.error('Error adding kiosk control to map:', error);
        }
    }, 500);
}

function setupUnitToggle() {
    const toggle = document.getElementById('unit-toggle');
    if (toggle) {
        toggle.addEventListener('click', function() {
            useCelsius = !useCelsius;
            if (useCelsius) {
                this.classList.remove('active');
            } else {
                this.classList.add('active');
            }

            // Rebuild all popups with new units
            map.closePopup();
            markers.forEach(marker => {
                const opts = marker.options;
                if (opts.stationName && opts.measurements) {
                    const popupContent = createPopupContent(
                        opts.stationName, opts.measurements, lastUnits, useCelsius
                    );
                    marker.bindPopup(popupContent);
                }
            });
        });
    }
}

function fixUSULogo() {
    const usuLogoContainer = document.querySelector('.usu-logo');
    if (usuLogoContainer) {
        // Ensure proper positioning for live AQ page
        usuLogoContainer.style.position = 'fixed';
        usuLogoContainer.style.bottom = '120px';
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
        // No markers available for kiosk mode
        return;
    }

    // Starting kiosk mode with available markers
    currentStationIndex = 0;

    // Open first popup immediately
    if (markers[0]) {
        markers[0].openPopup();
        // Opened popup for first station
    }

    // Start interval for subsequent popups
    mapKioskInterval = setInterval(() => {
        map.closePopup();
        currentStationIndex = (currentStationIndex + 1) % markers.length;
        if (markers[currentStationIndex]) {
            markers[currentStationIndex].openPopup();
            // Cycling to next station popup
        }
    }, 5000);
}

function stopKioskMode() {
    // Stopping kiosk mode...
    if (mapKioskInterval) {
        clearInterval(mapKioskInterval);
        mapKioskInterval = null;
    }
    map.closePopup();
}

async function updateMap() {
  try {
    // Updating map with station data...

    // Destructure observations and metadata from the API
    const { observations, metadata } = await fetchLiveObservations();
    console.log('DEBUG: observations keys:', Object.keys(observations || {}));
    console.log('DEBUG: metadata keys:', Object.keys(metadata || {}));
    console.log('DEBUG: Temperature station names:', Object.keys(observations.Temperature || {}));

    // Processing observations and metadata for map update

    // Extract units from observations data
    const units = observations._units || {};
    lastUnits = units;
    console.log('DEBUG: units:', units);

    // Clear existing markers
    markers.forEach(m => map.removeLayer(m));
    markers = [];

    // Build stationCoords from the metadata object
    const stationCoords = {};
    Object.entries(metadata).forEach(([stid, info]) => {
      stationCoords[stid] = { lat: info.lat, lng: info.lng };
    });
    console.log('DEBUG: stationCoords keys:', Object.keys(stationCoords));

    let validStations = 0;
    for (const stid of Object.keys(stationCoords)) {
      const stationInfo = stationCoords[stid];
      const measurements = {};

      // Use the same mapping function as api.js to get the station name
      const metadataName = metadata[stid]?.name;
      const stationName = mapStationName(stid, metadataName);

      // Map each variable's values by station name
      for (const [variable, stationValues] of Object.entries(observations)) {
        if (variable === '_timestamps' || variable === '_units') continue;
        measurements[variable] = stationValues[stationName] ?? null;
      }

      // Check if this is a road station (from config.js)
      const configStation = configStations[stationName];
      const isRoadStation = configStation?.type === 'road';
      const hasAQData = measurements['Ozone'] != null || measurements['PM2.5'] != null;

      // Skip road stations without AQ data
      if (isRoadStation && !hasAQData) {
        continue;
      }

      const marker = createStationMarker(stationName, stationInfo, measurements, units);
      if (marker) {
        markers.push(marker);
        validStations++;
      }
    }

    // Map updated successfully with station data
  } catch (error) {
    console.error('Failed to update map:', error);
  }
}

// Helper function to create station markers (if not already defined)
function createStationMarker(stationName, stationInfo, measurements, units = {}) {
    try {
        const hasOzone = measurements && measurements['Ozone'] != null;
        const color = getMarkerColor(measurements);
        let marker;

        // Circle marker for all stations — color indicates status
        marker = L.circleMarker([stationInfo.lat, stationInfo.lng], {
            color: '#fff',
            weight: 2,
            fillColor: color,
            fillOpacity: 0.8,
            radius: hasOzone ? 12 : 9,
            stationName: stationName,
            measurements: measurements
        });

        // Create popup content with dynamic units and current unit preference
        const popupContent = createPopupContent(stationName, measurements, units, useCelsius);
        marker.bindPopup(popupContent);

        // Add to map
        marker.addTo(map);

        return marker;

    } catch (error) {
        console.error(`Error creating marker for ${stationName}:`, error);
        return null;
    }
}

// window.mapInstance = map;
