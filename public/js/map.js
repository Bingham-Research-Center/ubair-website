import { createStationIcon, createStationPopup } from './mapUtils.js';
import { fetchLiveObservations } from './api.js';
import { HOME_STATIONS } from './config.js';
import { describeStation, liveAqStationIds, markerLayer } from './mapShared.js';

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
let mapKioskPopupTimeout = null;
let mapKioskMoveEndHandler = null;
let currentStationIndex = 0;
let markers = [];
let cycleMarkers = [];
let useCelsius = false; // Default to Fahrenheit (matches homepage default)
let lastUnits = {}; // Cache units for popup rebuilds
const AUTO_CYCLE_PAN_OFFSET_PX = { x: 130, y: 20 };
const AUTO_CYCLE_PAN_DURATION_S = 0.8;
const AUTO_CYCLE_MOVEEND_FALLBACK_MS = Math.round((AUTO_CYCLE_PAN_DURATION_S * 1000) + 160);

// Setup UI elements after DOM loads
document.addEventListener('DOMContentLoaded', function() {
    // DOM loaded, setting up live_aq map...

    setupStudyAreaToggle();
    setupKioskControl();
    setupUnitToggle();
    fixUSULogo();
    updateMap(); // Initial data load

    // Keep in sync with homepage map refresh cadence
    setInterval(updateMap, 5 * 60 * 1000);
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
    const kioskToggle = document.getElementById('map-kiosk-toggle');
    if (!kioskToggle) {
        console.error('Kiosk toggle element not found');
        return;
    }

    kioskToggle.addEventListener('click', function() {
        mapKioskMode = !mapKioskMode;
        const timerFill = document.getElementById('timer-fill');

        if (mapKioskMode) {
            this.classList.add('active');
            this.setAttribute('aria-checked', 'true');
            if (timerFill) {
                timerFill.classList.add('running');
            }
            startKioskMode();
        } else {
            this.classList.remove('active');
            this.setAttribute('aria-checked', 'false');
            if (timerFill) {
                timerFill.classList.remove('running');
            }
            stopKioskMode();
        }
    });
}

function setupUnitToggle() {
    const toggle = document.getElementById('unit-toggle');
    if (toggle) {
        toggle.addEventListener('click', function() {
            useCelsius = !useCelsius;
            if (useCelsius) {
                this.classList.remove('active');
                this.setAttribute('aria-checked', 'true');
            } else {
                this.classList.add('active');
                this.setAttribute('aria-checked', 'false');
            }

            // Rebuild all popups with new units
            map.closePopup();
            markers.forEach(marker => {
                if (marker.options.station) {
                    marker.bindPopup(popupFor(marker.options.station), getPopupOptions());
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
        usuLogoContainer.style.left = 'calc(var(--sidebar-width) + 1.25rem)';
        usuLogoContainer.style.zIndex = '1000';

        const usuLogoImage = usuLogoContainer.querySelector('img');
        if (usuLogoImage) {
            usuLogoImage.style.height = '60px';
            usuLogoImage.style.width = 'auto';
            usuLogoImage.style.opacity = '0.8';
        }
    }
}

function clearMapKioskPopupTimeout() {
    if (mapKioskPopupTimeout) {
        clearTimeout(mapKioskPopupTimeout);
        mapKioskPopupTimeout = null;
    }
    if (mapKioskMoveEndHandler) {
        map.off('moveend', mapKioskMoveEndHandler);
        mapKioskMoveEndHandler = null;
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
    if (!mapKioskMode || !marker || !map.hasLayer(marker)) {
        return;
    }

    clearMapKioskPopupTimeout();

    const targetCenter = getAutoCyclePanTarget(marker.getLatLng());
    const openPopupIfValid = () => {
        clearMapKioskPopupTimeout();
        if (!mapKioskMode || !marker || !map.hasLayer(marker)) {
            return;
        }
        marker.openPopup();
    };

    mapKioskMoveEndHandler = () => {
        openPopupIfValid();
    };
    map.on('moveend', mapKioskMoveEndHandler);

    mapKioskPopupTimeout = setTimeout(openPopupIfValid, AUTO_CYCLE_MOVEEND_FALLBACK_MS);
    map.panTo(targetCenter, { animate: true, duration: AUTO_CYCLE_PAN_DURATION_S });
}

function getVisibleElementRect(element, mapRect) {
    if (!element) return null;
    const rect = element.getBoundingClientRect();

    const intersectsMap =
        rect.width > 0 &&
        rect.height > 0 &&
        rect.right > mapRect.left &&
        rect.left < mapRect.right &&
        rect.bottom > mapRect.top &&
        rect.top < mapRect.bottom;

    if (!intersectsMap) {
        return null;
    }
    return rect;
}

function applyLeftInset(insets, element, mapRect, margin = 12) {
    const rect = getVisibleElementRect(element, mapRect);
    if (!rect) return;
    insets.left = Math.max(insets.left, rect.right - mapRect.left + margin);
}

function applyRightInset(insets, element, mapRect, margin = 12) {
    const rect = getVisibleElementRect(element, mapRect);
    if (!rect) return;
    insets.right = Math.max(insets.right, mapRect.right - rect.left + margin);
}

function applyTopInset(insets, element, mapRect, margin = 12) {
    const rect = getVisibleElementRect(element, mapRect);
    if (!rect) return;
    insets.top = Math.max(insets.top, rect.bottom - mapRect.top + margin);
}

function applyBottomInset(insets, element, mapRect, margin = 12) {
    const rect = getVisibleElementRect(element, mapRect);
    if (!rect) return;
    insets.bottom = Math.max(insets.bottom, mapRect.bottom - rect.top + margin);
}

function getPopupPanPadding() {
    const mapRect = map.getContainer().getBoundingClientRect();
    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    const insets = isMobile
        ? { top: 82, right: 24, bottom: 124, left: 24 }
        : { top: 92, right: 28, bottom: 100, left: 150 };

    const selectors = [
        '.leaflet-control-zoom',
        '.map-controls-stack',
        '.study-area-toggle',
        '.overlay-container',
        '#live-aq-legend-panel',
        '.main-footer',
        '.usu-logo'
    ];

    const elements = selectors.reduce((acc, selector) => {
        acc[selector] = document.querySelector(selector);
        return acc;
    }, {});

    // Each overlay pushes popups away on the side it sits. On a phone the corner controls
    // together span nearly the whole width, and clearing them sideways left no room at all:
    // popups opened half off-screen. There they only push popups down (or up).
    const side = (apply, element) => { if (!isMobile) apply(insets, element, mapRect); };

    side(applyLeftInset, elements['.leaflet-control-zoom']);
    applyTopInset(insets, elements['.leaflet-control-zoom'], mapRect);

    side(applyLeftInset, elements['.map-controls-stack']);
    applyTopInset(insets, elements['.map-controls-stack'], mapRect);

    side(applyRightInset, elements['.study-area-toggle']);
    applyTopInset(insets, elements['.study-area-toggle'], mapRect);

    side(applyRightInset, elements['.overlay-container']);
    applyTopInset(insets, elements['.overlay-container'], mapRect);

    side(applyRightInset, elements['#live-aq-legend-panel']);
    applyBottomInset(insets, elements['#live-aq-legend-panel'], mapRect);

    applyBottomInset(insets, elements['.main-footer'], mapRect);

    side(applyLeftInset, elements['.usu-logo']);
    applyBottomInset(insets, elements['.usu-logo'], mapRect);

    return {
        topLeft: L.point(Math.round(insets.left), Math.round(insets.top)),
        bottomRight: L.point(Math.round(insets.right), Math.round(insets.bottom))
    };
}

let _cachedPopupOptions = null;
let _popupOptionsCacheKey = null;

function getPopupOptions() {
    const key = `${window.innerWidth}x${window.innerHeight}`;
    if (_cachedPopupOptions && _popupOptionsCacheKey === key) {
        return _cachedPopupOptions;
    }
    const panPadding = getPopupPanPadding();
    _cachedPopupOptions = {
        autoPan: true,
        keepInView: true,
        maxWidth: 340,
        minWidth: 220,
        className: 'station-popup',
        autoPanPaddingTopLeft: panPadding.topLeft,
        autoPanPaddingBottomRight: panPadding.bottomRight
    };
    _popupOptionsCacheKey = key;
    return _cachedPopupOptions;
}

function startKioskMode() {
    if (cycleMarkers.length === 0) {
        // No markers available for kiosk mode
        return;
    }

    if (mapKioskInterval) {
        clearInterval(mapKioskInterval);
        mapKioskInterval = null;
    }
    clearMapKioskPopupTimeout();

    // Starting kiosk mode with available markers
    currentStationIndex = 0;

    // Open first popup immediately
    map.closePopup();
    focusMarkerForAutocycle(cycleMarkers[currentStationIndex]);

    // Start interval for subsequent popups
    mapKioskInterval = setInterval(() => {
        map.closePopup();
        if (cycleMarkers.length === 0) {
            return;
        }
        currentStationIndex = (currentStationIndex + 1) % cycleMarkers.length;
        focusMarkerForAutocycle(cycleMarkers[currentStationIndex]);
    }, 5000);
}

function stopKioskMode() {
    // Stopping kiosk mode...
    if (mapKioskInterval) {
        clearInterval(mapKioskInterval);
        mapKioskInterval = null;
    }
    clearMapKioskPopupTimeout();
    map.closePopup();
}

async function updateMap() {
  try {
    const { observations, metadata } = await fetchLiveObservations();
    lastUnits = observations._units || {};
    const now = new Date();

    // Clear existing markers
    markers.forEach(m => map.removeLayer(m));
    markers = [];
    cycleMarkers = [];

    // One marker per station ID: every station in the feed, plus the monitors known to have
    // stopped reporting (drawn grey with the date). Stations on the same spot share a marker.
    const byId = new Map();
    for (const stid of liveAqStationIds(metadata)) {
      const station = describeStation(stid, { observations, metadata, now });
      if (!station) continue;
      const marker = createStationMarker(station);
      if (!marker) continue;
      markers.push(marker);
      byId.set(stid, marker);
    }

    // Auto-cycle visits the homepage's Basin stations, in the same order.
    cycleMarkers = HOME_STATIONS.map(stid => byId.get(stid)).filter(Boolean);
  } catch (error) {
    console.error('Failed to update map:', error);
  }
}

function popupFor(station) {
    return createStationPopup(station.name, station.measurements, {
        units: lastUnits,
        observedAt: station.observedAt,
        shownAt: station.shownAt,
        lastReportAt: station.lastReportAt,
        notReportingSince: station.notReportingSince,
        companions: station.companions,
        isRoadStation: station.road,
        imperial: !useCelsius
    });
}

// Same marker and popup as the homepage map (mapUtils.js).
function createStationMarker(station) {
    try {
        const marker = L.marker([station.lat, station.lng], {
            icon: createStationIcon(station.status),
            zIndexOffset: markerLayer(station.status),
            title: station.name,
            station
        });
        marker.bindPopup(popupFor(station), getPopupOptions());
        marker.addTo(map);
        return marker;
    } catch (error) {
        console.error(`Error creating marker for ${station.name}:`, error);
        return null;
    }
}
