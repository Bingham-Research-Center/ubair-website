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
const PRIORITY_VARIABLES = {
    // Air Quality (highest priority)
    'Ozone': { unit: 'ppb', order: 1 },
    'PM2.5': { unit: 'µg/m³', order: 2 },
    'PM10': { unit: 'µg/m³', order: 3 },
    'NOx': { unit: 'ppb', order: 4 },
    'NO': { unit: 'ppb', order: 5 },
    'NO2': { unit: 'ppb', order: 6 },

    // Essential Meteorology
    'Temperature': { unit: '°C', order: 7 },
    'Wind Speed': { unit: 'm/s', order: 8 },
    'Wind Direction': { unit: '', order: 9 }
};

function getCardinalDirection(degrees) {
    if (degrees === null || degrees === undefined || isNaN(degrees)) return 'N/A';
    const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    const index = Math.round(degrees / 22.5) % 16;
    return directions[index];
}

// Create popup content for a station
export function createPopupContent(stationName, measurements) {
    let content = `<h3>${stationName}</h3>`;

    // Filter and sort measurements by priority
    const priorityMeasurements = Object.entries(measurements)
        .filter(([variable, value]) =>
            value !== null &&
            value !== undefined &&
            PRIORITY_VARIABLES[variable]
        )
        .sort(([varA], [varB]) =>
            PRIORITY_VARIABLES[varA].order - PRIORITY_VARIABLES[varB].order
        );

    // If no priority measurements, show a message
    if (priorityMeasurements.length === 0) {
        content += `<div class="measurement">No air quality data available</div>`;
        return content;
    }

    // Display each priority measurement
    for (const [variable, value] of priorityMeasurements) {
        const threshold = thresholds[variable];
        let className = 'measurement';

        if (threshold) {
            if (value >= threshold.danger) {
                className += ' danger';
            } else if (value >= threshold.warning) {
                className += ' warning';
            }
        }

        const unit = PRIORITY_VARIABLES[variable].unit;
        let displayValue = typeof value === 'number' ? value.toFixed(1) : value;

        // Convert wind direction to cardinal
        if (variable === 'Wind Direction') {
            displayValue = getCardinalDirection(value);
        }

        content += `<div class="${className}">
            ${variable}: ${displayValue}${unit ? ' ' + unit : ''}
        </div>`;
    }

    return content;
}


