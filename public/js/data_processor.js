// Data processing functions for converting real observation data to map format
// Handles variable name mapping and unit conversions

// Variable name mappings from pandas export to display names
const VARIABLE_MAPPINGS = {
    'ozone_concentration': 'Ozone',
    'pm25_concentration': 'PM2.5', 
    'pm10_concentration': 'PM10',
    'air_temp': 'Temperature',
    'wind_speed': 'Wind Speed',
    'wind_direction': 'Wind Direction',
    'sea_level_pressure': 'Pressure',
    'snow_depth': 'Snow Depth',
    'nox_concentration': 'NOx',
    'no2_concentration': 'NO2',
    'relative_humidity': 'Humidity'
};

// Unit conversions where needed
const UNIT_CONVERSIONS = {
    'Celsius': (val) => Math.round((val * 9/5 + 32) * 10) / 10, // to Fahrenheit
    'Pascals': (val) => Math.round((val / 100) * 100) / 100,    // to hPa 
    'm/s': (val) => Math.round(val * 2.237 * 10) / 10,          // to mph
    'Millimeters': (val) => Math.round(val * 0.0394 * 100) / 100 // to inches
};

/**
 * Process latest observations JSON into map-ready format
 * @param {Array} obsData - Array from latest_obs.json
 * @returns {Object} - Formatted data for map display
 */
function processLatestObservations(obsData) {
    if (!Array.isArray(obsData)) {
        console.error('Expected array of observations');
        return generateEmptyData();
    }

    const result = {
        metadata: {
            timestamp: new Date().toISOString(),
            data_version: "2.0",
            basin_status: "operational"
        },
        stations: {},
        observations: {}
    };

    // Group data by station
    const stationData = {};
    obsData.forEach(obs => {
        const { stid, variable, value, units } = obs;
        
        if (!stid || value === null || value === undefined) return;
        
        if (!stationData[stid]) {
            stationData[stid] = {};
        }
        
        // Map variable name and convert units if needed
        const mappedVar = VARIABLE_MAPPINGS[variable] || variable;
        let processedValue = value;
        
        // Apply unit conversions
        if (mappedVar === 'Temperature' && units === 'Celsius') {
            processedValue = UNIT_CONVERSIONS['Celsius'](value);
        } else if (mappedVar === 'Pressure' && units === 'Pascals') {
            processedValue = UNIT_CONVERSIONS['Pascals'](value);
        } else if (mappedVar === 'Wind Speed' && units === 'm/s') {
            processedValue = UNIT_CONVERSIONS['m/s'](value);
        } else if (mappedVar === 'Snow Depth' && units === 'Millimeters') {
            processedValue = UNIT_CONVERSIONS['Millimeters'](value);
        }
        
        stationData[stid][mappedVar] = processedValue;
    });

    // Populate stations metadata
    Object.keys(stationData).forEach(stid => {
        const stationInfo = getStationInfo(stid);
        if (stationInfo) {
            result.stations[stationInfo.name] = {
                lat: stationInfo.lat,
                lng: stationInfo.lng,
                active: stationInfo.active,
                stid: stid
            };
        }
    });

    // Reorganize observations by variable
    const allVariables = new Set();
    Object.values(stationData).forEach(station => {
        Object.keys(station).forEach(variable => allVariables.add(variable));
    });

    allVariables.forEach(variable => {
        result.observations[variable] = {};
        Object.entries(stationData).forEach(([stid, data]) => {
            const stationInfo = getStationInfo(stid);
            if (stationInfo && data[variable] !== undefined) {
                result.observations[variable][stationInfo.name] = data[variable];
            }
        });
    });

    return result;
}

/**
 * Generate empty data structure for fallback
 */
function generateEmptyData() {
    return {
        metadata: {
            timestamp: new Date().toISOString(),
            data_version: "2.0",
            basin_status: "no_data"
        },
        stations: {},
        observations: {}
    };
}

/**
 * Fetch and process live observations
 * @returns {Promise<Object>} Processed observation data
 */
async function fetchLiveObservations() {
    try {
        const response = await fetch('/public/data/json/latest_obs.json');
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const rawData = await response.json();
        return processLatestObservations(rawData);
        
    } catch (error) {
        console.error('Error fetching live observations:', error);
        throw error;
    }
}

// Export functions for module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { 
        processLatestObservations, 
        fetchLiveObservations, 
        generateEmptyData,
        VARIABLE_MAPPINGS,
        UNIT_CONVERSIONS
    };
}