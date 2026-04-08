import { fetchLiveObservations } from './api.js';

async function calculateTemperature() {
    try {
        // Fetch data directly inside the function
        const { observations, metadata } = await fetchLiveObservations();

        // Get data from a representative station
        const stations = Object.keys(observations.Temperature || {});
        if (stations.length === 0) return "N/A";

        const station = stations[0];
        const temp = observations.Temperature?.[station];
        const humidity = observations.Humidity?.[station];
        const windSpeed = observations['Wind Speed']?.[station];

        // Calculate felt temperature (heat index or wind chill)
        let feltTemp = temp;

        if (temp !== undefined) {
            if (temp > 80 && humidity !== undefined) {
                // Calculate heat index using NOAA formula
                const T = temp;
                const RH = humidity;

                let HI = 0.5 * (T + 61.0 + ((T - 68.0) * 1.2) + (RH * 0.094));

                if (HI >= 80) {
                    HI = -42.379 + 2.04901523 * T + 10.14333127 * RH - 0.22475541 * T * RH -
                         0.00683783 * T * T - 0.05481717 * RH * RH + 0.00122874 * T * T * RH +
                         0.00085282 * T * RH * RH - 0.00000199 * T * T * RH * RH;
                }

                feltTemp = Math.round(HI);
            } else if (temp < 50 && windSpeed !== undefined) {
                // Calculate wind chill using NOAA formula
                const WC = 35.74 + 0.6215 * temp - 35.75 * Math.pow(windSpeed, 0.16) + 0.4275 * temp * Math.pow(windSpeed, 0.16);
                feltTemp = Math.round(WC);
            } else {
                // Return actual temperature if conditions don't warrant adjustment
                feltTemp = Math.round(temp);
            }
        }

        return feltTemp;
    } catch (error) {
        console.error('Error calculating temperature:', error);
        return "N/A";
    }
}

function calculateWindChill() {
    return 0;
}

function getWindDirection() {
    return 0;
}

function getWindInfluence() {
    return "N/A";
}


async function updateSportsDashboard() {
    try {
        const { observations, metadata } = await fetchLiveObservations();

        // Get data from a representative station (e.g., first available)
        const stations = Object.keys(observations.Temperature || {});
        if (stations.length === 0) return;

        const station = stations[0]; // Use first station

        const feltTemp = await calculateTemperature();
        document.querySelector('.condition-card:nth-child(1) .current-value').textContent = (typeof feltTemp === 'number' ? feltTemp.toString() + " °F" : feltTemp);
        document.querySelector('.condition-card:nth-child(2) .current-value').textContent = "N/A °F";
        document.querySelector('.condition-card:nth-child(3) .current-value').textContent = "N/A";
        document.querySelector('.condition-card:nth-child(4) .current-value').textContent = "N/A °F";
        document.querySelector('.condition-card:nth-child(5) .current-value').textContent = "N/A";
        document.querySelector('.condition-card:nth-child(6) .current-value').textContent = "N/A";
        document.querySelector('.condition-card:nth-child(7) .current-value').textContent = "N/A";
        document.querySelector('.condition-card:nth-child(8) .current-value').textContent = "N/A";
        document.querySelector('.condition-card:nth-child(9) .current-value').textContent = "N/A";

    } catch (error) {
        console.error('Error updating sports dashboard:', error);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    updateSportsDashboard();

    // Refresh every 10 minutes like other pages
    setInterval(updateSportsDashboard, 10 * 60 * 1000);
});
