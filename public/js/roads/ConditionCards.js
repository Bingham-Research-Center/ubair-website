/**
 * Condition Cards Module
 * Driving conditions summary bar for the roads page
 * Shows road surface reports, visibility, precipitation, and wind separately
 * Includes fallback to Open-Meteo API when primary data unavailable
 */

const CONDITION_PRIORITY = { red: 3, yellow: 2, green: 1 };
const UNAVAILABLE_VALUE = 'Not reported';
let selectedConditionsLocation = null;

function updateConditionsSource(text) {
    const source = document.getElementById('conditions-source');
    if (source) source.textContent = text;
}

/** Overall station status can describe wind or visibility, not pavement. */
function getSurfaceReport(data) {
    const missing = /^(unknown|none|n\/?a|not reported|no data)$/i;
    const wind = /\b(wind|winds|windy|gusts?|mph)\b|km\/?h|m\/s/i;
    let text = [data.surfaceStatus, data.roadCondition]
        .find(value => typeof value === 'string' && value.trim() && !missing.test(value.trim()) && !wind.test(value));

    if (!text) {
        text = { none: 'No snow detected', light: 'Light snow', moderate: 'Moderate snow', heavy: 'Heavy snow' }[data.snowLevel];
    }
    if (!text) return { text: UNAVAILABLE_VALUE, level: null };

    text = ({ clear_temp: 'No snow detected', snow_light: 'Light snow', snow_moderate: 'Moderate snow', snow_heavy: 'Heavy snow' })[text] || text.trim();
    text = text.charAt(0).toUpperCase() + text.slice(1);
    const surfaceTemp = parseFloat(data.surfaceTemp ?? data.roadTemp);
    let level = null;
    if (/ice|icy|frost|closed|heavy snow/i.test(text)) level = 'red';
    else if (/^no snow detected$|dry|clear/i.test(text)) level = 'green';
    else if (/snow|slush|wet|damp/i.test(text)) {
        level = /snow|wet/i.test(text) && Number.isFinite(surfaceTemp) && surfaceTemp <= 32 ? 'red' : 'yellow';
    }
    return { text, level };
}

function updateConditionsFreshness(timestamp, label = 'Station data updated') {
    const freshnessElement = document.getElementById('conditions-updated');
    if (!freshnessElement) return;
    const compact = freshnessElement.dataset?.format === 'compact';

    const updatedAt = timestamp ? new Date(timestamp) : null;
    if (!updatedAt || Number.isNaN(updatedAt.getTime())) {
        freshnessElement.textContent = compact ? 'Updated: unavailable' : 'Data update time unavailable';
        freshnessElement.removeAttribute('title');
        freshnessElement.removeAttribute('datetime');
        return;
    }

    const formattedTime = new Intl.DateTimeFormat([], {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'short'
    }).format(updatedAt);

    freshnessElement.textContent = `${compact ? 'Updated' : label} ${formattedTime}`;
    freshnessElement.title = compact ? `${label} ${updatedAt.toLocaleString()}` : updatedAt.toLocaleString();
    if (compact) freshnessElement.dateTime = updatedAt.toISOString();
}

function getLatestStationUpdate(stations) {
    const timestamps = stations
        .map(station => Date.parse(station.lastUpdated))
        .filter(timestamp => Number.isFinite(timestamp));

    return timestamps.length > 0 ? Math.max(...timestamps) : null;
}

/**
 * Update condition cards with location-specific data when a station is clicked
 */
function updateConditionCardsWithLocation(locationData, { refresh = false } = {}) {
    // A slower camera/road request must not overwrite a newer selection.
    if (refresh && selectedConditionsLocation !== locationData) return;
    selectedConditionsLocation = locationData;
    updateConditionsSource(`${locationData.sourceType || 'Location'} · ${locationData.name || 'Unknown location'}`);
    updateConditionsFreshness(locationData.lastUpdated, `${locationData.sourceType || 'Location'} data updated`);
    for (const type of ['road-conditions', 'visibility', 'precipitation', 'wind']) {
        document.querySelector(`.condition-card-compact.${type} .value`)?.removeAttribute('title');
    }

    // Road surface is an explicit field, never the overall weather status.
    const condCard = document.querySelector('.condition-card-compact.road-conditions');
    const condValue = condCard?.querySelector('.value');
    if (condCard && condValue) {
        const surface = getSurfaceReport(locationData);
        condValue.textContent = surface.text;
        condCard.classList.remove('level-green', 'level-yellow', 'level-red');
        if (surface.level) condCard.classList.add(`level-${surface.level}`);
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
            visCard.textContent = UNAVAILABLE_VALUE;
        }
    }

    // Precipitation
    const precipCard = document.querySelector('.condition-card-compact.precipitation .value');
    if (precipCard) {
        const precip = locationData.precipitation;
        if (precip !== null && precip !== undefined && precip !== '') {
            if (typeof precip === 'string') {
                precipCard.textContent = precip === 'none' ? 'Dry' : precip;
            } else {
                precipCard.textContent = precip > 0 ? unitsSystem.formatPrecipitationRateFromMm(precip) : 'None';
            }
        } else {
            precipCard.textContent = UNAVAILABLE_VALUE;
        }
    }

    // Wind
    const windCard = document.querySelector('.condition-card-compact.wind .value');
    if (windCard) {
        const wind = locationData.windSpeed ?? locationData.windGust;
        if (wind !== null && wind !== undefined && wind !== '' && !isNaN(wind) && wind >= 0) {
            windCard.textContent = locationData.windSpeedUnit === 'km/h'
                ? unitsSystem.formatWindSpeedFromKmh(wind)
                : unitsSystem.formatWindSpeed(wind);
        } else {
            windCard.textContent = UNAVAILABLE_VALUE;
        }
    }
}

/**
 * Update condition cards with summary data from all stations
 */
async function updateConditionCards({ resetSelection = false } = {}) {
    if (resetSelection) selectedConditionsLocation = null;
    if (selectedConditionsLocation) {
        updateConditionCardsWithLocation(selectedConditionsLocation);
        return;
    }
    try {
        const data = await roadWeatherDataCache.getData();
        if (selectedConditionsLocation) return;
        const stations = data.stations;
        if (!Array.isArray(stations) || stations.length === 0) {
            await updateCardsWithFallback();
            return;
        }

        updateConditionsSource(`Basin summary · ${stations.length} ${stations.length === 1 ? 'station' : 'stations'}`);
        updateConditionsFreshness(getLatestStationUpdate(stations));
        const cameraSnowDetected = (data.cameraDetections || []).some(
            d => d.snowDetected === true && d.confidence >= 0.5
        );

        // --- Road Surface: worst reported surface, independent of wind ---
        const condCard = document.querySelector('.condition-card-compact.road-conditions');
        const condValue = condCard?.querySelector('.value');
        if (condCard && condValue) {
            let worstLevel = null;
            let worstStatus = UNAVAILABLE_VALUE;
            for (const s of stations) {
                const surface = getSurfaceReport(s);
                if (surface.text === UNAVAILABLE_VALUE) continue;
                if (worstStatus === UNAVAILABLE_VALUE || (CONDITION_PRIORITY[surface.level] || 0) > (CONDITION_PRIORITY[worstLevel] || 0)) {
                    worstLevel = surface.level;
                    worstStatus = surface.text;
                }
            }
            // Escalate to at least yellow if cameras detect snow
            if (cameraSnowDetected && (CONDITION_PRIORITY[worstLevel] || 0) < CONDITION_PRIORITY.yellow) {
                worstLevel = 'yellow';
                worstStatus = 'Snow detected by camera';
            }
            condValue.textContent = worstStatus;
            condCard.classList.remove('level-green', 'level-yellow', 'level-red');
            if (worstLevel) condCard.classList.add(`level-${worstLevel}`);
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
                visCard.textContent = UNAVAILABLE_VALUE;
            }
        }

        // --- Precipitation: aggregate type across stations ---
        const precipCard = document.querySelector('.condition-card-compact.precipitation .value');
        if (precipCard) {
            let hasSnow = cameraSnowDetected;
            let hasRain = false;
            let hasWet = false;
            let hasDryReport = false;

            for (const s of stations) {
                const surface = (s.surfaceStatus || '').toLowerCase();
                const precip = (s.precipitation || '').toLowerCase();
                if (surface.includes('dry') || precip === 'none' || precip === 'no precipitation') hasDryReport = true;

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
            } else if (hasDryReport) {
                precipCard.textContent = 'Dry';
            } else {
                precipCard.textContent = UNAVAILABLE_VALUE;
            }
        }

        // --- Wind: max gust with station name ---
        const windCard = document.querySelector('.condition-card-compact.wind .value');
        if (windCard) {
            let maxWind = 0;
            let maxWindStation = '';
            let hasWindReport = false;
            for (const s of stations) {
                const gust = parseFloat(s.windSpeedGust);
                const avg = parseFloat(s.windSpeedAvg);
                const reportedWinds = [gust, avg].filter(wind => !isNaN(wind) && wind >= 0);
                if (reportedWinds.length === 0) continue;

                hasWindReport = true;
                const wind = Math.max(...reportedWinds);
                if (wind >= maxWind) {
                    maxWind = wind;
                    maxWindStation = s.name || 'Unknown station';
                }
            }

            if (hasWindReport) {
                const short = maxWindStation.replace(/^UDOT\s*/i, '').split(/\s+/).slice(0, 2).join(' ');
                windCard.textContent = `${unitsSystem.formatWindSpeed(maxWind)}`;
                windCard.title = `Max gust at ${short}`;
            } else {
                windCard.textContent = UNAVAILABLE_VALUE;
                windCard.removeAttribute('title');
            }
        }
    } catch (error) {
        if (selectedConditionsLocation) return;
        console.error('Error updating condition cards:', error);
        await updateCardsWithFallback();
    }
}

/**
 * Update cards with fallback data from Open-Meteo API
 */
async function updateCardsWithFallback() {
    if (selectedConditionsLocation) return;
    updateConditionsSource('Basin summary · weather data unavailable');
    // Backup weather only supplies wind; remove values from an older station snapshot.
    for (const type of ['road-conditions', 'visibility', 'precipitation', 'wind']) {
        const card = document.querySelector(`.condition-card-compact.${type}`);
        const value = card?.querySelector('.value');
        if (value) {
            value.textContent = UNAVAILABLE_VALUE;
            value.removeAttribute('title');
        }
        card?.classList.remove('level-green', 'level-yellow', 'level-red');
    }
    updateConditionsFreshness(null);

    try {
        const response = await fetch('/api/road-weather/openmeteo/40.3033/-109.7');
        if (response.ok) {
            const data = await response.json();
            if (selectedConditionsLocation) return;
            const windKmh = data?.current?.windSpeed;
            if (Number.isFinite(windKmh) && windKmh >= 0) {
                const windCard = document.querySelector('.condition-card-compact.wind .value');
                if (windCard) windCard.textContent = unitsSystem.formatWindSpeedFromKmh(windKmh);
                updateConditionsSource('Basin summary · backup forecast');
                const freshnessElement = document.getElementById('conditions-updated');
                if (freshnessElement) {
                    if (freshnessElement.dataset?.format === 'compact') {
                        freshnessElement.textContent = 'Updated: unavailable';
                        freshnessElement.title = 'Backup wind data; update time unavailable';
                    } else {
                        freshnessElement.textContent = 'Backup wind data; update time unavailable';
                    }
                }
            }
        }
    } catch (error) {
        console.error('Fallback also failed:', error);
    }
}
