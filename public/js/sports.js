import { fetchLiveObservations } from './api.js';

function calculateHeatIndex() {
    return 0;
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

        document.querySelector('.condition-card:nth-child(1) .current-value').textContent = "N/A °F";
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
