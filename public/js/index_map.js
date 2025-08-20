import { stations } from './config.js';
import { getMarkerColor, createPopupContent } from './mapUtils.js';
import { fetchLiveObservations } from './api.js';

// Initialize map with proper center and zoom for dashboard view
const map = L.map('map', {
    zoomControl: false,
    scrollWheelZoom: false,
    doubleClickZoom: false,
    dragging: false,
    touchZoom: false,
    boxZoom: false,
    keyboard: false
}).setView([40.3033, -109.7], 9); // Better zoom level to show all stations

// Add window resize handler to re-fit map
window.addEventListener('resize', function() {
    setTimeout(() => {
        map.invalidateSize();
        // Re-center on Uintah Basin after resize
        map.setView([40.3033, -109.7], 9);
    }, 100);
});

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 15,
    attribution: '© OpenStreetMap contributors'
}).addTo(map);

let kioskMode = false;
let kioskInterval;
let currentStationIndex = 0;
let markers = [];
let useCelsius = false; // Default to Fahrenheit

// Wait for DOM to load before setting up
document.addEventListener('DOMContentLoaded', () => {
    setupKioskControl();
    updateMiniMap();

    // Auto-refresh every 5 minutes
    setInterval(updateMiniMap, 300000);
});

function setupKioskControl() {
    // The kiosk control is now part of the HTML structure
    const kioskSwitch = document.getElementById('kiosk-switch');
    if (kioskSwitch) {
        kioskSwitch.addEventListener('click', toggleKiosk);
    }
    
    // Setup temperature toggle
    const tempToggle = document.getElementById('temp-toggle');
    if (tempToggle) {
        tempToggle.addEventListener('click', toggleTemperature);
    }
}

function toggleKiosk() {
    kioskMode = !kioskMode;
    const switchEl = document.getElementById('kiosk-switch');

    if (kioskMode) {
        startKioskMode();
        switchEl.classList.add('active');
    } else {
        stopKioskMode();
        switchEl.classList.remove('active');
    }
}

function startKioskMode() {
    if (markers.length === 0) return;

    currentStationIndex = 0;
    kioskInterval = setInterval(() => {
        map.closePopup();
        if (markers[currentStationIndex]) {
            markers[currentStationIndex].openPopup();
        }
        currentStationIndex = (currentStationIndex + 1) % markers.length;
    }, 4000); // 4 second intervals
}

function stopKioskMode() {
    clearInterval(kioskInterval);
    map.closePopup();
}

function toggleTemperature() {
    useCelsius = !useCelsius;
    const toggleEl = document.getElementById('temp-toggle');
    const labelEl = document.getElementById('temp-label');
    
    if (useCelsius) {
        toggleEl.classList.add('celsius');
        labelEl.textContent = '°C';
    } else {
        toggleEl.classList.remove('celsius');
        labelEl.textContent = '°F';
    }
    
    // Close any open popups
    map.closePopup();
    
    // Update all marker popups
    markers.forEach(marker => {
        const stationName = marker.options.stationName;
        const measurements = marker.options.measurements;
        const dateTime = marker.options.dateTime;
        
        if (stationName && measurements) {
            const popupContent = createTwoColumnPopup(stationName, measurements, dateTime);
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
            const measurements = {
                'Ozone': data['Ozone']?.[stationName] ?? null,
                'PM2.5': data['PM2.5']?.[stationName] ?? null,
                'NOx': data['NOx']?.[stationName] ?? null,
                'NO': data['NO']?.[stationName] ?? null,
                'NO2': data['NO2']?.[stationName] ?? null,
                'Temperature': data['Temperature']?.[stationName] ?? null,
                'Wind Speed': data['Wind Speed']?.[stationName] ?? null,
                'Wind Direction': data['Wind Direction']?.[stationName] ?? null,
                'Pressure': data['Pressure']?.[stationName] ?? null,
                'Humidity': data['Humidity']?.[stationName] ?? null
            };

            const stationTimestamp = data._timestamps?.[stationName] ?? null;
            const popupContent = createTwoColumnPopup(stationName, measurements, stationTimestamp);
            const markerColor = getMarkerColor(measurements);

            const markerIcon = L.divIcon({
                className: 'custom-marker',
                html: `<div style="background-color: ${markerColor}; width: 20px; height: 20px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 6px rgba(0,0,0,0.5);"></div>`,
                iconSize: [24, 24]
            });

            const marker = L.marker([coordinates.lat, coordinates.lng], { 
                icon: markerIcon,
                stationName: stationName,
                measurements: measurements,
                dateTime: stationTimestamp
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
            map.setView([40.3033, -109.7], 9); // Better zoom level to show all stations
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
            const roundedWind = Math.round(numValue);
            if (roundedWind === 0) {
                return { displayValue: 'Calm', unit: '' };
            }
            return { displayValue: roundedWind, unit: ' m/s' };
        case 'Wind Direction':
            return { displayValue: getCardinalDirection(numValue), unit: '' };
        case 'Pressure':
            // Convert Pascals to hectopascals (hPa) by dividing by 100
            return { displayValue: Math.round(numValue / 100), unit: ' hPa' };
        case 'PM2.5':
        case 'PM10':
        case 'NOx':
        case 'NO':
        case 'NO2':
            return { displayValue: Math.round(numValue), unit: ' ppb' };
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

function createTwoColumnPopup(stationName, measurements, timestamp = null) {
    const validMeasurements = Object.entries(measurements).filter(([_, value]) => value !== null && !isNaN(value));

    if (validMeasurements.length === 0) {
        return `<div><h3>${stationName}</h3><div>Data missing.</div></div>`;
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

    return `
        <div style="min-width: 280px;">
            <h3 style="text-align: center; margin: 0 0 10px 0; color: var(--usu-blue);">${stationName}</h3>
            <div style="display: flex; gap: 20px;">
                <div style="flex: 1;">${leftCol}</div>
                <div style="flex: 1;">${rightCol}</div>
            </div>
            ${timestampHtml}
        </div>
    `;
}