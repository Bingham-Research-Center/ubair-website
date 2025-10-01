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

    // Has data but no ozone data = pale pastel blue (default)
    if (ozoneValue === null || ozoneValue === undefined) {
        return '#B8D4E3';  // Pale pastel blue
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

// Create popup content for a station
export function createPopupContent(stationName, measurements) {
    let content = `<h3>${stationName}</h3>`;

    for (const [pollutant, value] of Object.entries(measurements)) {
        if (value === null) continue;

        const threshold = thresholds[pollutant];
        let className = 'measurement';

        if (threshold) {
            if (value >= threshold.danger) {
                className += ' danger';
            } else if (value >= threshold.warning) {
                className += ' warning';
            }
        }

        const unit = pollutant === 'Temperature' ? '°C' : ' ppb';
        content += `<div class="${className}">
            ${pollutant}: ${value}${unit}
        </div>`;
    }

    return content;
}


