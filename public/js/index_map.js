import { createStationIcon, createStationPopup, legendMarkup } from './mapUtils.js';
import { fetchLiveObservations } from './api.js';
import { describeStation, homeStationIds, markerLayer } from './mapShared.js';

// The Basin floor, used until the stations are drawn and whenever there are none to frame.
const BASIN_VIEW = { center: [40.25, -109.9], zoom: 9 };

// Initialize map with proper center and zoom for dashboard view
const map = L.map('map', {
    zoomControl: false,
    scrollWheelZoom: false,
    doubleClickZoom: false,
    dragging: false,
    touchZoom: false,
    boxZoom: false,
    keyboard: false
}).setView(BASIN_VIEW.center, BASIN_VIEW.zoom);

// Re-fit on resize: the map cannot be dragged or zoomed, so it must always frame the stations.
window.addEventListener('resize', function() {
    setTimeout(() => {
        map.invalidateSize();
        frameStations();
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

    // A shuffled order, kept until the page is left. It opens on the first station that
    // reports ozone, so the first popup shows what the map is for.
    if (kioskOrder.length !== markers.length) {
        const firstIndex = Math.max(0, markers.findIndex(m => !['weather', 'nodata'].includes(m.options.station.status)));
        let otherIndices = [...Array(markers.length).keys()].filter(i => i !== firstIndex);

        const seed = Date.now() % 1000000;
        let rng = seed;
        for (let i = otherIndices.length - 1; i > 0; i--) {
            rng = (rng * 9301 + 49297) % 233280; // Simple LCG
            const j = Math.floor((rng / 233280) * (i + 1));
            [otherIndices[i], otherIndices[j]] = [otherIndices[j], otherIndices[i]];
        }

        kioskOrder = [firstIndex, ...otherIndices];
    }

    currentStationIndex = 0;

    // Start immediately with the first station
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
        if (marker.options.station) {
            marker.bindPopup(popupFor(marker.options.station), POPUP_OPTIONS);
        }
    });
}

function popupFor(station) {
    return createStationPopup(station.name, station.measurements, {
        units: lastUnits,
        observedAt: station.observedAt,
        shownAt: station.shownAt,
        lastReportAt: station.lastReportAt,
        notReportingSince: station.notReportingSince,
        companions: station.companions,
        imperial: !useCelsius
    });
}

// The same legend as Live AQ, from the bands the markers use (mapUtils.js).
function renderLegend() {
    const legend = document.getElementById('aq-legend');
    if (legend) legend.innerHTML = legendMarkup();
}

function frameStations() {
    if (markers.length === 0) {
        map.setView(BASIN_VIEW.center, BASIN_VIEW.zoom);
        return;
    }
    const bounds = L.latLngBounds(markers.map(m => m.getLatLng()));
    map.fitBounds(bounds, { padding: [24, 24], maxZoom: 10 });
}

async function updateMiniMap() {
    try {
        const { observations, metadata } = await fetchLiveObservations();
        lastUnits = observations._units || {};
        const now = new Date();

        markers.forEach(marker => map.removeLayer(marker));
        markers = [];

        // The Basin floor stations (config.js), each with its own readings; a monitor known to
        // have stopped reporting is drawn grey with the date.
        for (const stid of homeStationIds(observations, metadata)) {
            const station = describeStation(stid, { observations, metadata, now });
            if (!station) continue;

            const marker = L.marker([station.lat, station.lng], {
                icon: createStationIcon(station.status),
                zIndexOffset: markerLayer(station.status),
                title: station.name,
                station
            }).bindPopup(popupFor(station), POPUP_OPTIONS);

            marker.addTo(map);
            markers.push(marker);
        }
        frameStations();
    } catch (error) {
        console.error('Error loading observation data:', error);
    }
}
