import { stations } from './config.js';
import { getMarkerColor, getRoadCautionLevel, isRoadWeatherStation, createPopupContent} from './mapUtils.js';
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
const AUTO_CYCLE_POPUP_DELAY_MS = 220;
const AUTO_CYCLE_PAN_OFFSET_PX = { x: 70, y: 10 };
const AUTO_CYCLE_PAN_DURATION_S = 0.8;
const AUTO_CYCLE_MOVEEND_FALLBACK_MS = Math.round((AUTO_CYCLE_PAN_DURATION_S * 1000) + 160);
let kioskMoveEndHandler = null;

// Wait for DOM to load before setting up
document.addEventListener('DOMContentLoaded', () => {
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
        const stationName = marker.options.stationName;
        const measurements = marker.options.measurements;
        const dateTime = marker.options.dateTime;
        const isRoad = marker.options.isRoadStation || false;

        if (stationName && measurements) {
            const popupContent = createTwoColumnPopup(stationName, measurements, dateTime, isRoad);
            marker.bindPopup(popupContent, {
                maxWidth: 300,
                className: 'two-column-popup'
            });
        }
    });
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

        // Clear existing markers
        markers.forEach(marker => map.removeLayer(marker));
        markers = [];

        // Add markers for each station
        for (const [stationName, coordinates] of Object.entries(stations)) {
            const measurements = buildStationMeasurements(data, stationName);

            const stationTimestamp = data._timestamps?.[stationName] ?? null;
            // Check if this is a road weather station by type from config
            const isRoadStation = isRoadWeatherStation(coordinates.type);
            const popupContent = createTwoColumnPopup(stationName, measurements, stationTimestamp, isRoadStation);

            let markerColor;
            if (isRoadStation) {
                const caution = getRoadCautionLevel(measurements);
                markerColor = caution.color;
            } else {
                markerColor = getMarkerColor(measurements);
            }

            // Create different marker shapes for road weather stations
            let markerHtml;
            if (isRoadStation) {
                // Square/diamond shape for road weather stations
                markerHtml = `<div style="background-color: ${markerColor}; width: 20px; height: 20px; border: 2px solid white; box-shadow: 0 0 6px rgba(0,0,0,0.5); transform: rotate(45deg);"></div>`;
            } else {
                // Circle for regular air quality stations
                markerHtml = `<div style="background-color: ${markerColor}; width: 20px; height: 20px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 6px rgba(0,0,0,0.5);"></div>`;
            }

            const markerIcon = L.divIcon({
                className: 'custom-marker',
                html: markerHtml,
                iconSize: [24, 24]
            });

            const marker = L.marker([coordinates.lat, coordinates.lng], {
                icon: markerIcon,
                stationName: stationName,
                measurements: measurements,
                dateTime: stationTimestamp,
                isRoadStation: isRoadStation
            })
                .bindPopup(popupContent, {
                    maxWidth: 300,
                    className: 'two-column-popup'
                });

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

function formatMeasurement(pollutant, value) {
    if (value === null || value === undefined || isNaN(value)) {
        return { displayValue: 'N/A', unit: '' };
    }
    
    const numValue = parseFloat(value);
    
    switch (pollutant) {
        case 'Temperature':
            let tempValue = numValue;
            let tempUnit = '°C';
            
            // Convert to Fahrenheit if needed
            if (!useCelsius) {
                tempValue = (numValue * 9/5) + 32;
                tempUnit = '°F';
            }
            
            return { displayValue: Math.round(tempValue), unit: tempUnit };
        case 'Ozone':
            return { displayValue: Math.round(numValue), unit: ' ppb' };
        case 'Wind Speed':
            let windValue = numValue;
            let windUnit = ' m/s';
            if (!useCelsius) {
                windValue = numValue * 2.237;
                windUnit = ' mph';
            }
            const roundedWind = Math.round(windValue);
            if (roundedWind === 0) {
                return { displayValue: 'Calm', unit: '' };
            }
            return { displayValue: roundedWind, unit: windUnit };
        case 'Wind Direction':
            return { displayValue: getCardinalDirection(numValue), unit: '' };
        case 'Pressure':
            // Convert Pascals to hectopascals (hPa) by dividing by 100
            return { displayValue: Math.round(numValue / 100), unit: ' hPa' };
        case 'PM2.5':
        case 'PM10':
            return { displayValue: Math.round(numValue), unit: ' µg/m³' };
        case 'NOx':
        case 'NO':
        case 'NO2':
            return { displayValue: Math.round(numValue), unit: ' ppb' };
        case 'Snow Depth':
            return { displayValue: Math.round(numValue), unit: ' mm' };
        case 'Humidity':
            return { displayValue: Math.round(numValue), unit: '%' };
        default:
            return { displayValue: Math.round(numValue * 10) / 10, unit: '' };
    }
}


function getCardinalDirection(degrees) {
    if (degrees === null || degrees === undefined || isNaN(degrees)) return 'N/A';

    const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    const index = Math.round(degrees / 22.5) % 16;
    return directions[index];
}


function createTwoColumnPopup(stationName, measurements, timestamp = null, isRoadStation = false) {
    // Priority variables: Air quality + essential meteorology
    const priorityVars = ['Ozone', 'PM2.5', 'PM10', 'NOx', 'NO', 'NO2', 'Temperature', 'Wind Speed', 'Wind Direction', 'Snow Depth'];

    // Filter for priority variables only
    const validMeasurements = Object.entries(measurements)
        .filter(([variable, value]) =>
            value !== null &&
            !isNaN(value) &&
            priorityVars.includes(variable)
        )
        .sort((a, b) => priorityVars.indexOf(a[0]) - priorityVars.indexOf(b[0]));

    if (validMeasurements.length === 0) {
        return `<div><h3>${stationName}</h3><div>No air quality data available</div></div>`;
    }

    let leftCol = '';
    let rightCol = '';

    validMeasurements.forEach(([pollutant, value], index) => {
        const { displayValue, unit } = formatMeasurement(pollutant, value);
        const item = `<div style="margin: 4px 0;"><strong>${pollutant}:</strong> ${displayValue}${unit}</div>`;

        if (index % 2 === 0) {
            leftCol += item;
        } else {
            rightCol += item;
        }
    });

    // Format timestamp
    let timestampHtml = '';
    if (timestamp) {
        try {
            const date = new Date(timestamp);
            const formatOptions = {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                timeZoneName: 'short'
            };
            const formattedTime = date.toLocaleString('en-US', formatOptions);
            timestampHtml = `<div style="text-align: center; font-size: 0.85em; color: #666; margin-top: 8px; font-style: italic;">Data from: ${formattedTime}</div>`;
        } catch (e) {
            // If timestamp parsing fails, don't show it
            console.warn('Failed to parse timestamp:', timestamp);
        }
    }

    const roadLink = isRoadStation
        ? `<div style="text-align: center; margin-top: 8px;"><a href="/roads" style="color: var(--usu-blue); font-size: 0.85em; font-weight: 500;">View Road Weather &rarr;</a></div>`
        : '';

    return `
        <div style="min-width: 280px;">
            <h3 style="text-align: center; margin: 0 0 10px 0; color: var(--usu-blue);">${stationName}</h3>
            <div style="display: flex; gap: 20px;">
                <div style="flex: 1;">${leftCol}</div>
                <div style="flex: 1;">${rightCol}</div>
            </div>
            ${timestampHtml}
            ${roadLink}
        </div>
    `;
}
