/**
 * Condition Cards Module
 * Updates weather condition cards on the roads page
 * Displays road temperature, visibility, precipitation, and wind
 * Includes fallback to Open-Meteo API when primary data unavailable
 * Extracted from roads.js as part of refactoring
 */

/**
 * Update condition cards with location-specific data
 * Used when a specific location/station is selected
 * @param {Object} locationData - Weather data for specific location
 */
function updateConditionCardsWithLocation(locationData) {
    // Location section has been removed - no need to update selected location text

    // Update road surface temperature
    const roadTempCard = document.querySelector('.condition-card-compact.road-temp .value');
    if (roadTempCard) {
        const temp = locationData.roadTemp || locationData.airTemp || locationData.temperature || '--';
        roadTempCard.textContent = temp !== '--' ? unitsSystem.formatTemperature(temp) : `--${unitsSystem.getTempUnit()}`;
    }

    // Update visibility
    const visCard = document.querySelector('.condition-card-compact.visibility .value');
    if (visCard) {
        const vis = locationData.visibility;
        const visUnit = locationData.visibilityUnit;
        if (vis && vis > 0) {
            const maxVis = unitsSystem.isMetric ? 16 : 10; // 16 km ≈ 10 mi
            let limitValue = vis;
            let formattedVis = unitsSystem.formatVisibility(vis);

            if (visUnit === 'm') {
                const km = vis / 1000;
                limitValue = unitsSystem.isMetric ? km : km / 1.60934;
                formattedVis = unitsSystem.formatVisibilityFromMeters(vis);
            } else if (visUnit === 'km') {
                const km = vis;
                limitValue = unitsSystem.isMetric ? km : km / 1.60934;
                formattedVis = unitsSystem.formatVisibilityFromKm(vis);
            } else if (unitsSystem.isMetric) {
                limitValue = vis * 1.60934;
            }

            visCard.textContent = limitValue > maxVis ? `${maxVis}+ ${unitsSystem.getVisibilityUnit()}` : formattedVis;
        } else {
            visCard.textContent = `-- ${unitsSystem.getVisibilityUnit()}`;
        }
    }

    // Update precipitation
    const precipCard = document.querySelector('.condition-card-compact.precipitation .value');
    if (precipCard) {
        const precip = locationData.precipitation || locationData.snowLevel || locationData.condition;
        if (precip) {
            if (typeof precip === 'string') {
                precipCard.textContent = precip === 'none' ? 'None' : precip;
            } else {
                precipCard.textContent = precip > 0 ? `${precip} in/hr` : 'None';
            }
        } else {
            precipCard.textContent = '--';
        }
    }

    // Update wind
    const windCard = document.querySelector('.condition-card-compact.wind .value');
    if (windCard) {
        const wind = locationData.windSpeed || locationData.windGust;
        if (wind && wind > 0) {
            windCard.textContent = unitsSystem.formatWindSpeed(wind);
        } else {
            windCard.textContent = `-- ${unitsSystem.getWindUnit()}`;
        }
    }
}

/**
 * Update condition cards with averaged data from all stations
 * Fetches data from API and calculates region-wide averages
 */
async function updateConditionCards() {
    try {
        const response = await fetch('/api/road-weather/stations');
        if (!response.ok) {
            // Use fallback data
            updateCardsWithFallback();
            return;
        }

        const stations = await response.json();
        if (!stations || stations.length === 0) {
            updateCardsWithFallback();
            return;
        }

        // Calculate averages
        const temps = stations.map(s => parseFloat(s.roadTemp) || parseFloat(s.airTemp)).filter(t => !isNaN(t));
        const avgTemp = temps.length > 0 ? Math.round(temps.reduce((a, b) => a + b, 0) / temps.length) : '--';

        const visibilities = stations.map(s => parseFloat(s.visibility)).filter(v => !isNaN(v));
        const avgVis = visibilities.length > 0 ? Math.round(visibilities.reduce((a, b) => a + b, 0) / visibilities.length * 10) / 10 : '--';

        const windSpeeds = stations.map(s => parseFloat(s.windSpeed)).filter(w => !isNaN(w));
        const avgWind = windSpeeds.length > 0 ? Math.round(windSpeeds.reduce((a, b) => a + b, 0) / windSpeeds.length) : '--';

        // Update cards with units system
        const roadTempCard = document.querySelector('.condition-card-compact.road-temp .value');
        if (roadTempCard) roadTempCard.textContent = avgTemp !== '--' ? unitsSystem.formatTemperature(avgTemp) : `--${unitsSystem.getTempUnit()}`;

        const visibilityCard = document.querySelector('.condition-card-compact.visibility .value');
        if (visibilityCard) visibilityCard.textContent = avgVis !== '--' ? unitsSystem.formatVisibility(avgVis) : `-- ${unitsSystem.getVisibilityUnit()}`;

        const windCard = document.querySelector('.condition-card-compact.wind .value');
        if (windCard) {
            windCard.textContent = avgWind !== '--' ? unitsSystem.formatWindSpeed(avgWind) : `-- ${unitsSystem.getWindUnit()}`;
        }
    } catch (error) {
        console.error('Error updating condition cards:', error);
        updateCardsWithFallback();
    }
}

/**
 * Update cards with fallback data from Open-Meteo API
 * Used when primary UDOT data is unavailable
 * Centers on Vernal, UT coordinates
 */
async function updateCardsWithFallback() {
    // Try Open-Meteo as fallback
    try {
        const response = await fetch('/api/road-weather/openmeteo/40.3033/-109.7');
        if (response.ok) {
            const data = await response.json();
            if (data && data.current) {
                const tempC = data.current.temperature;
                const windKmh = data.current.windSpeed;

                const roadTempCard = document.querySelector('.condition-card-compact.road-temp .value');
                if (roadTempCard) roadTempCard.textContent = unitsSystem.formatTemperatureFromCelsius(tempC);

                const windCard = document.querySelector('.condition-card-compact.wind .value');
                if (windCard) windCard.textContent = unitsSystem.formatWindSpeedFromKmh(windKmh);
            }
        }
    } catch (error) {
        console.error('Fallback also failed:', error);
    }
}
