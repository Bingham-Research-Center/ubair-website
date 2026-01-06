import { thresholds } from './config.js';

// Determine marker color for regular air quality stations
export function getMarkerColor(measurements) {
    // Check if station has ANY data at all
    const hasAnyData = Object.values(measurements).some(value => value !== null && value !== undefined);

    // No data at all = gray marker (missing data)
    if (!hasAnyData) {
        return 'gray';
    }

    const ozoneValue = measurements['Ozone'];

    // Has data but no ozone data = gray (since color scheme is for ozone ppb)
    if (ozoneValue === null || ozoneValue === undefined) {
        return 'gray';
    }

    const ozoneThreshold = thresholds['Ozone'];

    // Red for dangerous levels (≥70 ppb)
    if (ozoneValue >= ozoneThreshold.danger) {
        return 'red';
    }
    // Orange for warning levels (≥50 ppb)
    else if (ozoneValue >= ozoneThreshold.warning) {
        return 'orange';
    }
    // Green for good levels (<50 ppb)
    else {
        return 'green';
    }
}

// Determine marker color for road weather stations (snow likelihood)
// roadWeatherData should contain live data from UDOT API with snowLikely property
export function getRoadWeatherColor(stationName, measurements, roadWeatherData = null) {
    // Check if station has ANY data at all
    const hasAnyData = Object.values(measurements).some(value => value !== null && value !== undefined);

    // No data at all = gray marker (missing data)
    if (!hasAnyData) {
        return 'gray';
    }

    // Get snow likelihood from live road weather data
    if (!roadWeatherData || !roadWeatherData[stationName]) {
        return '#B8D4E3'; // Default if not found
    }

    // Snow likely = blue, no snow = green
    return roadWeatherData[stationName].snowLikely ? '#4A90E2' : '#28A745';
}

// Check if station is a road weather station
// stationType should be passed from config or API metadata
export function isRoadWeatherStation(stationType) {
    return stationType === 'road';
}

// Define priority variables to display (air quality + essential meteorology)
// Note: units are now dynamically loaded from data, these orders just define display priority
const PRIORITY_VARIABLES = {
    // Air Quality (highest priority)
    'Ozone': { order: 1 },
    'PM2.5': { order: 2 },
    'PM10': { order: 3 },
    'NOx': { order: 4 },
    'NO': { order: 5 },
    'NO2': { order: 6 },

    // Essential Meteorology
    'Temperature': { order: 7 },
    'Wind Speed': { order: 8 },
    'Wind Direction': { order: 9 },
    'Snow Depth': { order: 10 }
};

function getCardinalDirection(degrees) {
    if (degrees === null || degrees === undefined || isNaN(degrees)) return 'N/A';
    const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    const index = Math.round(degrees / 22.5) % 16;
    return directions[index];
}

// Create popup content for a station with two-column layout
export function createPopupContent(stationName, measurements, units = {}, timestamp = null) {
    // Filter and sort measurements by priority
    const priorityMeasurements = Object.entries(measurements)
        .filter(([variable, value]) => {
            // Special handling for Snow Depth: treat 0 as valid data
            if (variable === 'Snow Depth') {
                return value !== null && value !== undefined && !isNaN(value) && PRIORITY_VARIABLES[variable];
            }
            // Standard handling for other variables
            return value !== null &&
                   value !== undefined &&
                   PRIORITY_VARIABLES[variable];
        })
        .sort(([varA], [varB]) =>
            PRIORITY_VARIABLES[varA].order - PRIORITY_VARIABLES[varB].order
        );

    // If no priority measurements, show a message
    if (priorityMeasurements.length === 0) {
        return `<div><h3>${stationName}</h3><div>No air quality data available</div></div>`;
    }

    let leftCol = '';
    let rightCol = '';

    // Display each priority measurement in two columns
    priorityMeasurements.forEach(([variable, value], index) => {
        const threshold = thresholds[variable];
        
        // Get unit dynamically from data, with empty string as fallback
        const unit = units[variable] || '';
        let displayValue = typeof value === 'number' ? value.toFixed(1) : value;

        // Convert wind direction to cardinal
        if (variable === 'Wind Direction') {
            displayValue = getCardinalDirection(value);
        }

        const item = `<div style="margin: 4px 0;"><strong>${variable}:</strong> ${displayValue}${unit ? ' ' + unit : ''}</div>`;

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


