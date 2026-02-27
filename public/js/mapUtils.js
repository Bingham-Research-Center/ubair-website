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

    // Has data but no ozone data = blue (active weather-only station)
    if (ozoneValue === null || ozoneValue === undefined) {
        return '#4A90D2';
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

// Determine marker color for road weather stations based on conditions
export function getRoadCautionLevel(measurements) {
    // Check if station has ANY data at all
    const hasAnyData = Object.values(measurements).some(value => value !== null && value !== undefined);

    if (!hasAnyData) {
        return { color: 'gray', level: 'no-data' };
    }

    const temp = measurements['Temperature'];
    const wind = measurements['Wind Speed'];
    const snow = measurements['Snow Depth'];

    // Need at least temperature to assess conditions
    if (temp === null || temp === undefined) {
        return { color: 'gray', level: 'no-data' };
    }

    // Red/Hazardous: freezing AND (high wind OR significant snow)
    if (temp < 0 && ((wind != null && wind > 15) || (snow != null && snow > 50))) {
        return { color: '#DC3545', level: 'hazardous' };
    }

    // Yellow/Caution: near freezing OR moderate wind OR any snow
    if (temp <= 2 || (wind != null && wind >= 10) || (snow != null && snow > 0)) {
        return { color: '#FFC107', level: 'caution' };
    }

    // Green/All Clear
    return { color: '#28A745', level: 'clear' };
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

// Create popup content for a station
export function createPopupContent(stationName, measurements, units = {}, useCelsius = true) {
    let content = `<h3>${stationName}</h3>`;

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

        // Get unit dynamically from data, with empty string as fallback
        let unit = units[variable] || '';
        let displayValue = typeof value === 'number' ? value.toFixed(1) : value;

        // Convert wind direction to cardinal
        if (variable === 'Wind Direction') {
            displayValue = getCardinalDirection(value);
        }

        // Convert temperature to Fahrenheit if needed
        if (variable === 'Temperature' && !useCelsius && typeof value === 'number') {
            displayValue = ((value * 9/5) + 32).toFixed(1);
            unit = '°F';
        } else if (variable === 'Temperature') {
            unit = unit || '°C';
        }

        // Convert wind speed to mph if in Fahrenheit mode
        if (variable === 'Wind Speed' && !useCelsius && typeof value === 'number') {
            displayValue = (value * 2.237).toFixed(1);
            unit = 'mph';
        }

        content += `<div class="${className}">
            ${variable}: ${displayValue}${unit ? ' ' + unit : ''}
        </div>`;
    }

    return content;
}


