import { stations } from './config.js';
import {
    createStationIcon, createStationPopup, getMarkerStatus, getRoadCautionLevel,
    isRoadWeatherStation, legendEntries, LEGEND_NOTE
} from './mapUtils.js';
import { fetchLiveObservations } from './api.js';
import { buildStationMeasurements } from './mapShared.js';

// Initialize map with proper center and zoom for dashboard view
const map = L.map('map', {
    zoomControl: false,
    scrollWheelZoom: false,
    doubleClickZoom: false,
    dragging: false,
    touchZoom: false,
    boxZoom: false,
    keyboard: false
}).setView([40.45, -110.0], 8); // Adjusted to show all stations including Manila

// Add window resize handler to re-fit map
window.addEventListener('resize', function() {
    setTimeout(() => {
        map.invalidateSize();
        // Re-center on Uintah Basin after resize
        map.setView([40.45, -110.0], 8);
    }, 100);
});

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 15,
    attribution: '© OpenStreetMap contributors'
}).addTo(map);

let kioskMode = false;
let kioskInterval;
let kioskPopupTimeout = null;
let currentStationIndex = 0;
let kioskOrder = []; // Random order for cycling
let markers = [];
let useCelsius = false; // Default to Fahrenheit
let lastUnits = {}; // The feed's unit names, kept for rebuilding popups on a unit toggle
const POPUP_OPTIONS = { maxWidth: 300, className: 'station-popup' };
const AUTO_CYCLE_POPUP_DELAY_MS = 220;
const AUTO_CYCLE_PAN_OFFSET_PX = { x: 70, y: 10 };
const AUTO_CYCLE_PAN_DURATION_S = 0.8;
const AUTO_CYCLE_MOVEEND_FALLBACK_MS = Math.round((AUTO_CYCLE_PAN_DURATION_S * 1000) + 160);
let kioskMoveEndHandler = null;

// Wait for DOM to load before setting up
document.addEventListener('DOMContentLoaded', () => {
    renderLegend();
    setupKioskControl();
    updateMiniMap();

    // Auto-refresh every 5 minutes
    setInterval(updateMiniMap, 300000);
});

function setupKioskControl() {
    // Setup for timer-fill
    const kioskSwitch = document.getElementById('kiosk-switch');
    let timerFill = document.getElementById('timer-fill');
    timerFill = document.createElement('span');
    timerFill.id = 'timer-fill';
    timerFill.className = 'timer-fill';
    kioskSwitch.addEventListener('click', toggleKiosk);
    
    // Setup temperature toggle
    const tempToggle = document.getElementById('temp-toggle');
    if (tempToggle) {
        tempToggle.addEventListener('click', toggleTemperature);
    }
}

function toggleKiosk() {
    kioskMode = !kioskMode;
    const switchEl = document.getElementById('kiosk-switch');
    const timerFill = document.getElementById('timer-fill');

    if (kioskMode) {
        startKioskMode();
        switchEl.classList.add('active');
        if (timerFill) {
            timerFill.classList.add('running');
        }
    } else {
        stopKioskMode();
        switchEl.classList.remove('active');
        if (timerFill) {
            timerFill.classList.remove('running');
        }
    }
}

function clearKioskPopupTimeout() {
    if (kioskPopupTimeout) {
        clearTimeout(kioskPopupTimeout);
        kioskPopupTimeout = null;
    }
}

function getAutoCyclePanTarget(markerLatLng) {
    const markerPoint = map.latLngToContainerPoint(markerLatLng);
    const targetCenterPoint = L.point(
        markerPoint.x - AUTO_CYCLE_PAN_OFFSET_PX.x,
        markerPoint.y - AUTO_CYCLE_PAN_OFFSET_PX.y
    );
    return map.containerPointToLatLng(targetCenterPoint);
}

function focusMarkerForAutocycle(marker) {
    if (!kioskMode || !marker || !map.hasLayer(marker)) {
        return;
    }

    clearKioskPopupTimeout();
    if (kioskMoveEndHandler) {
        map.off('moveend', kioskMoveEndHandler);
        kioskMoveEndHandler = null;
    }

    const openPopupIfValid = () => {
        if (kioskMoveEndHandler) {
            map.off('moveend', kioskMoveEndHandler);
            kioskMoveEndHandler = null;
        }
        clearKioskPopupTimeout();
        if (!kioskMode || !marker || !map.hasLayer(marker)) return;
        marker.openPopup();
    };

    kioskMoveEndHandler = openPopupIfValid;
    map.on('moveend', kioskMoveEndHandler);
    kioskPopupTimeout = setTimeout(openPopupIfValid, AUTO_CYCLE_MOVEEND_FALLBACK_MS);

    const targetCenter = getAutoCyclePanTarget(marker.getLatLng());
    map.panTo(targetCenter, { animate: true, duration: AUTO_CYCLE_PAN_DURATION_S });
}

function startKioskMode() {
    if (markers.length === 0) return;
    clearInterval(kioskInterval);
    clearKioskPopupTimeout();

    // Generate random order for cycling (preserved until page leave)
    // Always start with Castle Peak
    if (kioskOrder.length !== markers.length) {
        // Find Castle Peak index
        const castlePeakIndex = markers.findIndex(m => m.options.stationName === 'Castle Peak');

        // Create array of all indices except Castle Peak
        let otherIndices = [...Array(markers.length).keys()].filter(i => i !== castlePeakIndex);

        // Shuffle the other indices
        const seed = Date.now() % 1000000;
        let rng = seed;
        for (let i = otherIndices.length - 1; i > 0; i--) {
            rng = (rng * 9301 + 49297) % 233280; // Simple LCG
            const j = Math.floor((rng / 233280) * (i + 1));
            [otherIndices[i], otherIndices[j]] = [otherIndices[j], otherIndices[i]];
        }

        // Put Castle Peak first, then shuffled others
        kioskOrder = castlePeakIndex >= 0 ? [castlePeakIndex, ...otherIndices] : otherIndices;
    }

    currentStationIndex = 0;

    // Start immediately with Castle Peak
    map.closePopup();
    focusMarkerForAutocycle(markers[kioskOrder[currentStationIndex]]);
    currentStationIndex = (currentStationIndex + 1) % kioskOrder.length;

    // Then continue with interval
    kioskInterval = setInterval(() => {
        map.closePopup();
        if (kioskOrder.length === 0) {
            return;
        }
        focusMarkerForAutocycle(markers[kioskOrder[currentStationIndex]]);
        currentStationIndex = (currentStationIndex + 1) % kioskOrder.length;
    }, 4000); // 4 second intervals
}

function stopKioskMode() {
    clearInterval(kioskInterval);
    kioskInterval = null;
    clearKioskPopupTimeout();
    map.closePopup();
}

function toggleTemperature() {
    useCelsius = !useCelsius;
    const toggleEl = document.getElementById('temp-toggle');

    if (useCelsius) {
        toggleEl.classList.remove('active');  // Off = Celsius
    } else {
        toggleEl.classList.add('active');     // On = Fahrenheit
    }

    // Close any open popups
    map.closePopup();

    // Update all marker popups
    markers.forEach(marker => {
        const { stationName, measurements, dateTime, isRoadStation } = marker.options;
        if (stationName && measurements) {
            marker.bindPopup(popupFor(stationName, measurements, dateTime, isRoadStation), POPUP_OPTIONS);
        }
    });
}

function popupFor(stationName, measurements, observedAt, isRoadStation) {
    return createStationPopup(stationName, measurements, {
        units: lastUnits, observedAt, imperial: !useCelsius, isRoadStation
    });
}

// The ozone rows of the legend come from the same bands the markers use (mapUtils.js).
function renderLegend() {
    const rows = document.getElementById('aq-legend-rows');
    if (!rows) return;
    rows.innerHTML = legendEntries().map(({ status, label }) => `
        <div class="legend-row">
            <span class="legend-color aq-status" data-status="${status}"></span>
            <span>${label}</span>
        </div>`).join('') + `<p class="legend-note">${LEGEND_NOTE}</p>`;
}

async function updateMiniMap() {
    try {
        // Fetch live observations data
        const result = await fetchLiveObservations();
        
        // Check if we got valid data
        if (!result || !result.observations) {
            console.error('No observation data available');
            return;
        }
        
        const data = result.observations;
        lastUnits = data._units || {};

        // Clear existing markers
        markers.forEach(marker => map.removeLayer(marker));
        markers = [];

        // Add markers for each station
        for (const [stationName, coordinates] of Object.entries(stations)) {
            const measurements = buildStationMeasurements(data, stationName);
            const stationTimestamp = data._timestamps?.[stationName] ?? null;
            const isRoadStation = isRoadWeatherStation(coordinates.type);
            const status = isRoadStation ? getRoadCautionLevel(measurements) : getMarkerStatus(measurements);

            const marker = L.marker([coordinates.lat, coordinates.lng], {
                icon: createStationIcon(status, { road: isRoadStation }),
                stationName: stationName,
                measurements: measurements,
                dateTime: stationTimestamp,
                isRoadStation: isRoadStation
            })
                .bindPopup(popupFor(stationName, measurements, stationTimestamp, isRoadStation), POPUP_OPTIONS);

            marker.addTo(map);
            markers.push(marker);
        }

        // Set map to balanced Uintah Basin view
        if (markers.length > 0) {
            map.setView([40.45, -110.0], 8); // Adjusted to show all stations including Manila
        }

    } catch (error) {
        console.error('Error loading observation data:', error);
    }
}
