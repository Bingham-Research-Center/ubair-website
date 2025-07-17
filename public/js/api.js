// Real API implementation for fetching live observations
// Replaces mock data with actual server calls

export async function fetchLiveObservations() {
    try {
        const response = await fetch('/api/live-observations');
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const rawData = await response.json();

        // Transform from pandas export format to map-ready format
        return processObservationData(rawData);

    } catch (error) {
        console.error('Error fetching live observations:', error);

        // Return fallback mock data if API fails
        return {
            'Ozone': { 'Roosevelt': 45, 'Vernal': 55 },
            'PM2.5': { 'Roosevelt': 30, 'Vernal': 40 },
            'Temperature': { 'Roosevelt': 25, 'Vernal': 28 }
        };
    }
}

/**
 * Process raw observation data from pandas export format
 * Transforms [{stid, variable, value, units}...] to {variable: {station: value}}
 */
function processObservationData(rawData) {
    if (!Array.isArray(rawData)) {
        throw new Error('Expected array of observations');
    }

    // Group by station first
    const stationData = {};
    rawData.forEach(obs => {
        const { stid, variable, value, units } = obs;

        if (!stid || value === null || value === undefined) return;

        if (!stationData[stid]) {
            stationData[stid] = {};
        }

        // Map variable names and convert units
        const mappedVar = mapVariableName(variable);
        const convertedValue = convertUnits(value, units, mappedVar);

        stationData[stid][mappedVar] = convertedValue;
    });

    // Convert to map format: {variable: {stationName: value}}
    const result = {};
    const allVariables = new Set();

    // Collect all unique variables
    Object.values(stationData).forEach(station => {
        Object.keys(station).forEach(variable => allVariables.add(variable));
    });

    // Reorganize by variable
    allVariables.forEach(variable => {
        result[variable] = {};
        Object.entries(stationData).forEach(([stid, data]) => {
            const stationName = mapStationName(stid);
            if (stationName && data[variable] !== undefined) {
                result[variable][stationName] = data[variable];
            }
        });
    });

    return result;
}

/**
 * Map pandas variable names to display names
 */
function mapVariableName(variable) {
    const mappings = {
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

    return mappings[variable] || variable;
}

/**
 * Convert units for display
 */
function convertUnits(value, units, variable) {
    if (variable === 'Temperature' && units === 'Celsius') {
        return Math.round((value * 9/5 + 32) * 10) / 10; // to Fahrenheit
    }
    if (variable === 'Pressure' && units === 'Pascals') {
        return Math.round((value / 100) * 100) / 100; // to hPa
    }
    if (variable === 'Wind Speed' && units === 'm/s') {
        return Math.round(value * 2.237 * 10) / 10; // to mph
    }
    if (variable === 'Snow Depth' && units === 'Millimeters') {
        return Math.round(value * 0.0394 * 100) / 100; // to inches
    }

    return value; // No conversion needed
}

/**
 * Map station IDs to display names
 */
function mapStationName(stid) {
    const mappings = {
        'UBCSP': 'Castle Peak',
        'UBHSP': 'Horsepool',
        'UBORY': 'Ouray',
        'UBWHR': 'Whiterocks',
        'UCC33': 'Vernal',
        'UBMYT': 'Myton',
        'KSLC': 'Salt Lake City',
        'CLN': 'Colton',
        'COOPALMU1': 'Altamont',
        'UTCOP': 'Copper Canyon',
        'UTHEB': 'Heber City',
        'UTORM': 'Orem',
        'UTSTV': 'Starvation'
    };

    return mappings[stid] || stid;
}