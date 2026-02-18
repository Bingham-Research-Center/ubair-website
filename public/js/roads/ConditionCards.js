/**
 * Condition Cards Module
 * Driving conditions summary bar for the roads page
 * Shows worst-case road condition, visibility range, precip type, and max wind
 * Includes fallback to Open-Meteo API when primary data unavailable
 */

const CONDITION_PRIORITY = { red: 3, yellow: 2, green: 1 };
const CONDITION_LABELS = { red: 'Dangerous', yellow: 'Caution', green: 'Clear' };

/**
 * Update condition cards with location-specific data when a station is clicked
 */
function updateConditionCardsWithLocation(locationData) {
    // Road conditions card — show this station's condition
    const condCard = document.querySelector('.condition-card-compact.road-conditions');
    const condValue = condCard?.querySelector('.value');
    if (condCard && condValue) {
        const condition = locationData.condition || '--';
        condValue.textContent = condition;
        condCard.classList.remove('level-green', 'level-yellow', 'level-red');
    }

    // Visibility
    const visCard = document.querySelector('.condition-card-compact.visibility .value');
    if (visCard) {
        const vis = locationData.visibility;
        const visUnit = locationData.visibilityUnit;
        if (vis !== null && vis !== undefined && vis >= 0) {
            const maxVis = unitsSystem.isMetric ? 16 : 10;
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

    // Precipitation
    const precipCard = document.querySelector('.condition-card-compact.precipitation .value');
    if (precipCard) {
        const precip = locationData.precipitation || locationData.snowLevel || locationData.condition;
        if (precip) {
            if (typeof precip === 'string') {
                precipCard.textContent = precip === 'none' ? 'Dry' : precip;
            } else {
                precipCard.textContent = precip > 0 ? `${precip} in/hr` : 'Dry';
            }
        } else {
            precipCard.textContent = '--';
        }
    }

    // Wind
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
 * Update condition cards with summary data from all stations
 */
async function updateConditionCards() {
    try {
        const response = await fetch('/api/road-weather/stations');
        if (!response.ok) {
            updateCardsWithFallback();
            return;
        }

        const stations = await response.json();
        if (!stations || stations.length === 0) {
            updateCardsWithFallback();
            return;
        }

        // --- Road Conditions: worst-case across all stations ---
        const condCard = document.querySelector('.condition-card-compact.road-conditions');
        const condValue = condCard?.querySelector('.value');
        if (condCard && condValue) {
            let worstLevel = 'green';
            let worstStatus = 'Clear';
            for (const s of stations) {
                if (!s.condition) continue;
                const level = s.condition.condition;
                if ((CONDITION_PRIORITY[level] || 0) > (CONDITION_PRIORITY[worstLevel] || 0)) {
                    worstLevel = level;
                    worstStatus = s.condition.status;
                }
            }
            condValue.textContent = worstStatus;
            condCard.classList.remove('level-green', 'level-yellow', 'level-red');
            condCard.classList.add(`level-${worstLevel}`);
        }

        // --- Visibility: min–max range with station names ---
        const visCard = document.querySelector('.condition-card-compact.visibility .value');
        if (visCard) {
            const visData = stations
                .filter(s => {
                    const v = parseFloat(s.visibility);
                    return !isNaN(v) && v >= 0;
                })
                .map(s => ({ val: parseFloat(s.visibility), name: s.name }));

            if (visData.length > 0) {
                visData.sort((a, b) => a.val - b.val);
                const minVis = visData[0];
                const maxVis = visData[visData.length - 1];
                const fmtMin = unitsSystem.formatVisibility(minVis.val);
                const fmtMax = unitsSystem.formatVisibility(maxVis.val);

                if (minVis.val === maxVis.val) {
                    visCard.textContent = fmtMin;
                } else {
                    visCard.textContent = `${fmtMin} – ${fmtMax}`;
                }
            } else {
                visCard.textContent = `-- ${unitsSystem.getVisibilityUnit()}`;
            }
        }

        // --- Precipitation: aggregate type across stations ---
        const precipCard = document.querySelector('.condition-card-compact.precipitation .value');
        if (precipCard) {
            let hasSnow = false;
            let hasRain = false;
            let hasWet = false;

            for (const s of stations) {
                const surface = (s.surfaceStatus || '').toLowerCase();
                const precip = (s.precipitation || '').toLowerCase();

                if (surface.includes('snow') || precip.includes('snow')) hasSnow = true;
                if (surface.includes('rain') || precip.includes('rain')) hasRain = true;
                if (surface.includes('wet') || precip.includes('light') || precip.includes('moderate')) hasWet = true;
            }

            if (hasSnow && hasRain) {
                precipCard.textContent = 'Rain/Snow';
            } else if (hasSnow) {
                precipCard.textContent = 'Snow';
            } else if (hasRain) {
                precipCard.textContent = 'Rain';
            } else if (hasWet) {
                precipCard.textContent = 'Wet';
            } else {
                precipCard.textContent = 'Dry';
            }
        }

        // --- Wind: max gust with station name ---
        const windCard = document.querySelector('.condition-card-compact.wind .value');
        if (windCard) {
            let maxWind = 0;
            let maxWindStation = '';
            for (const s of stations) {
                const gust = parseFloat(s.windSpeedGust);
                const avg = parseFloat(s.windSpeedAvg);
                const wind = !isNaN(gust) && gust > 0 ? gust : avg;
                if (!isNaN(wind) && wind > maxWind) {
                    maxWind = wind;
                    maxWindStation = s.name;
                }
            }

            if (maxWind > 0) {
                const short = maxWindStation.replace(/^UDOT\s*/i, '').split(/\s+/).slice(0, 2).join(' ');
                windCard.textContent = `${unitsSystem.formatWindSpeed(maxWind)}`;
                windCard.title = `Max gust at ${short}`;
            } else {
                windCard.textContent = `-- ${unitsSystem.getWindUnit()}`;
            }
        }
    } catch (error) {
        console.error('Error updating condition cards:', error);
        updateCardsWithFallback();
    }
}

/**
 * Update cards with fallback data from Open-Meteo API
 */
async function updateCardsWithFallback() {
    try {
        const response = await fetch('/api/road-weather/openmeteo/40.3033/-109.7');
        if (response.ok) {
            const data = await response.json();
            if (data && data.current) {
                const windKmh = data.current.windSpeed;

                const windCard = document.querySelector('.condition-card-compact.wind .value');
                if (windCard) windCard.textContent = unitsSystem.formatWindSpeedFromKmh(windKmh);
            }
        }
    } catch (error) {
        console.error('Fallback also failed:', error);
    }
}
