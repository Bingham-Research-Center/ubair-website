import { thresholds } from './config.js';

// Determine marker color based on measurements
export function getMarkerColor(measurements) {
    let maxSeverity = 0;

    for (const [pollutant, value] of Object.entries(measurements)) {
        if (value === null) continue;

        const threshold = thresholds[pollutant];
        if (!threshold) continue;

        if (value >= threshold.danger) {
            return 'red';
        } else if (value >= threshold.warning && maxSeverity < 1) {
            maxSeverity = 1;
        }
    }

    return maxSeverity === 1 ? 'orange' : 'green';
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

