import { thresholds } from './config.js';

// Determine marker color based on OZONE levels only
export function getMarkerColor(measurements) {
    const ozoneValue = measurements['Ozone'];
    
    // No ozone data = gray marker
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

