import { fetchLiveObservations } from './api.js';

// Function to convert degrees to cardinal direction
function getCardinalDirection(degrees) {
    if (degrees === null || degrees === undefined || isNaN(degrees)) return 'N/A';

    const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    const index = Math.round(degrees / 22.5) % 16;
    return directions[index];
}

// Get current and felt temperatures from live data
async function getCurrentTemperature() {
    try {
        const { observations } = await fetchLiveObservations();

        const stations = Object.keys(observations.Temperature || {});
        if (stations.length === 0) return null;

        const station = stations[0];
        const temp = observations.Temperature?.[station];

        return temp !== undefined ? Math.round(temp) : null;
    } catch (error) {
        console.error('Error getting current temperature:', error);
        return null;
    }
}

// Calculate felt temperature (heat index or wind chill) based on live data
async function calculateTemperature() {
    try {
        const { observations } = await fetchLiveObservations();

        const stations = Object.keys(observations.Temperature || {});
        if (stations.length === 0) return "N/A";

        const station = stations[0];
        const temp = observations.Temperature?.[station];
        const humidity = observations.Humidity?.[station];
        const windSpeed = observations['Wind Speed']?.[station];

        if (temp === undefined || temp === null) return "N/A";

        let feltTemp;

        if (temp > 80 && humidity !== undefined){
            const T = temp;
            const RH = humidity;

            let HI = 0.5 * (T + 61.0 + ((T - 68.0) * 1.2) + (RH * 0.094));

            if (HI >= 80) {
                HI = -42.379 + 2.04901523 * T + 10.14333127 * RH - 0.22475541 * T * RH -
                     0.00683783 * T * T - 0.05481717 * RH * RH + 0.00122874 * T * T * RH +
                     0.00085282 * T * RH * RH - 0.00000199 * T * T * RH * RH;
            }

            feltTemp = Math.round(HI);
        } else if (temp < 50 && windSpeed !== undefined){
            const WC = 35.74 + 0.6215 * temp - 35.75 * Math.pow(windSpeed, 0.16) + 0.4275 * temp * Math.pow(windSpeed, 0.16);
            feltTemp = Math.round(WC);
        } else {
            feltTemp = Math.round(temp);
        }

        return feltTemp;
    } catch (error){
        console.error('Error calculating temperature:', error);
        return "N/A";
    }
}

// Get wind speed and direction
async function getWindData() {
    try {
        const { observations } = await fetchLiveObservations();

        const stations = Object.keys(observations['Wind Speed'] || {});
        if (stations.length === 0) return { speed: null, direction: 'N/A' };

        const station = stations[0];
        const windSpeed = observations['Wind Speed']?.[station];
        const windDirection = observations['Wind Direction']?.[station];

        const speed = windSpeed !== undefined ? Math.round(windSpeed) : null;
        const direction = windDirection !== undefined ? getCardinalDirection(windDirection) : 'N/A';

        return { speed, direction };
    } catch (error) {
        console.error('Error getting wind data:', error);
        return { speed: null, direction: 'N/A' };
    }
}

async function getWindDirection() {
    const { direction } = await getWindData();
    return direction;
}

function getWindInfluence() {
    return "N/A";
}


async function updateSportsDashboard() {
    try {
        // Get all required data
        const currentTemp = await getCurrentTemperature();
        const feltTemp = await calculateTemperature();
        const { speed: windSpeed, direction: windDir } = await getWindData();

        // Current Temperature
        const currentTempValue = currentTemp !== null ? currentTemp + " °F" : "--";
        document.querySelector('.condition-card:nth-child(1) .current-value').textContent = currentTempValue;
        // Felt Temperature
        const feltTempValue = feltTemp !== "N/A" ? feltTemp + " °F" : "--";
        document.querySelector('.condition-card:nth-child(2) .current-value').textContent = feltTempValue;
        // Wind Speed + Direction
        const windSpeedValue = windSpeed !== null ? windSpeed + " mph " : "-- ";
        document.querySelector('.condition-card:nth-child(3) .current-value').textContent = windSpeedValue + windDir;

        //Others
        document.querySelector('.condition-card:nth-child(4) .current-value').textContent = "--";
        document.querySelector('.condition-card:nth-child(5) .current-value').textContent = "--";
        document.querySelector('.condition-card:nth-child(6) .current-value').textContent = "--";
        document.querySelector('.condition-card:nth-child(7) .current-value').textContent = "--";
        document.querySelector('.condition-card:nth-child(8) .current-value').textContent = "--";
        document.querySelector('.condition-card:nth-child(9) .current-value').textContent = "--";

    } catch (error) {
        console.error('Error updating sports dashboard:', error);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    updateSportsDashboard();

    // Refresh every 10 minutes like other pages
    setInterval(updateSportsDashboard, 10 * 60 * 1000);
});
