// Real API implementation for fetching live obs

async function getLatestFilename(prefix) {
  const res = await fetch(`/api/filelist.json`);
  if (!res.ok) throw new Error(`Unable to list files: ${res.status}`);
  const files = await res.json(); // e.g. ['map_obs_20250731_0228Z.json', ...]
  const regex = new RegExp(`^${prefix}(\\d{8}_\\d{4}Z)\\.json$`);
  const latest = files
    .map(name => {
      const m = name.match(regex);
      return m ? { name, ts: m[1] } : null;
    })
    .filter(Boolean)
    .sort((a, b) => (a.ts < b.ts ? 1 : -1))[0];
  if (!latest) throw new Error(`No files found for prefix \`${prefix}\``);
  return latest.name;
}

export async function fetchLiveObservations() {
  try {
    const dataFile = await getLatestFilename('map_obs_');
    const metaFile = await getLatestFilename('map_obs_meta_');

    const [dataRes, metaRes] = await Promise.all([
      fetch(`/api/static/${dataFile}`),
      fetch(`/api/static/${metaFile}`)
    ]);
    if (!dataRes.ok || !metaRes.ok) {
      throw new Error(`Fetch failed: data ${dataRes.status}, meta ${metaRes.status}`);
    }

    const rawData = await dataRes.json();
    const rawMeta = await metaRes.json();

    const metadata = processMetadata(rawMeta);
    const observations = processObservationData(rawData, metadata);

    return { observations, metadata };
  } catch (err) {
    console.error('Error fetching latest observations:', err);
  }
}

/**
 * Process metadata into a lookup table
 * Transforms [{stid, name, elevation, latitude, longitude}...] to {stid: {name, elevation, lat, lng}}
 */
function processMetadata(rawMeta) {
    if (!Array.isArray(rawMeta)) {
        console.warn('Expected array for metadata, got:', typeof rawMeta);
        return {};
    }
    
    const metadata = {};
    rawMeta.forEach(station => {
        if (station.stid) {
            metadata[station.stid] = {
                name: station.name,
                elevation: station.elevation,
                lat: station.latitude,
                lng: station.longitude
            };
        }
    });
    
    return metadata;
}

/**
 * Process raw observation data from pandas export format
 * Transforms [{stid, variable, value, units}...] to {variable: {station: value}}
 */
function processObservationData(rawData, metadata = {}) {
    if (!Array.isArray(rawData)) {
        throw new Error('Expected array of observations');
    }

    // Group by station first
    const stationData = {};
    const stationTimestamps = {}; // Store timestamps for each station
    
    rawData.forEach(obs => {
        const { stid, variable, value, date_time, units } = obs;

        if (!stid || value === null || value === undefined) return;

        if (!stationData[stid]) {
            stationData[stid] = {};
        }
        
        // Store the timestamp for this station (will be the same for all variables from same observation)
        if (date_time) {
            stationTimestamps[stid] = date_time;
        }

        const mappedVar = mapVariableName(variable);
        // const convertedValue = convertUnits(value, units, mappedVar);
        // stationData[stid][mappedVar] = convertedValue;
        stationData[stid][mappedVar] = value;
    });

    // Convert to map format: {variable: {stationName: value}}
    const result = {};
    const timestamps = {}; // Store timestamps by station name
    const allVariables = new Set();

    // Collect all unique variables
    Object.values(stationData).forEach(station => {
        Object.keys(station).forEach(variable => allVariables.add(variable));
    });

    // Reorganize by variable and create timestamp mapping
    allVariables.forEach(variable => {
        result[variable] = {};
        Object.entries(stationData).forEach(([stid, data]) => {
            const metadataName = metadata[stid]?.name;
            const stationName = mapStationName(stid, metadataName);
            if (stationName && data[variable] !== undefined) {
                result[variable][stationName] = data[variable];
                // Store timestamp for this station
                if (stationTimestamps[stid]) {
                    timestamps[stationName] = stationTimestamps[stid];
                }
            }
        });
    });

    // Add timestamps to the result
    result._timestamps = timestamps;
    
    return result;
}

function mapVariableName(variable) {
    // Load mappings from reference/variable-mapping.txt
    const mappings = {
        'air_temp': 'Temperature',
        'ozone_concentration': 'Ozone',
        'PM_25_concentration': 'PM2.5',
        'pm25_concentration': 'PM2.5',
        'particulate_concentration': 'PM2.5',
        'relative_humidity': 'Humidity',
        'wind_speed': 'Wind Speed',
        'wind_direction': 'Wind Direction',
        'dew_point_temperature': 'Dew Point',
        'snow_depth': 'Snow Depth',
        'soil_temp': 'Soil Temperature',
        'sea_level_pressure': 'Pressure',
        'NOx_concentration': 'NOx',
        'black_carbon_concentration': 'NOx',
        'ppb': 'NO',  // From your mapping file
        'NO_concentration': 'NO2'
    };

    return mappings[variable] || variable;
}


/**
 * Map station IDs to display names
 */
function mapStationName(stid, metadataName = null) {
    // Priority 1: Pretty hardcoded names for key Uintah Basin stations
    const prettyNames = {
        // Core Air Quality Monitoring
        'UBHSP': 'Horsepool',
        'UBCSP': 'Castle Peak',
        'UB7ST': 'Seven Sisters',
        
        // Population Centers
        'KVEL': 'Vernal',
        'K74V': 'Roosevelt',
        'COOPDSNU1': 'Duchesne',  // NEEDS DATA EXPORT
        'KU69': 'Duchesne',       // Alternative Duchesne station
        'UINU1': 'Fort Duchesne',
        
        // Basin Perimeter & Geographic Coverage
        'UTMYT': 'Myton',
        'COOPDINU1': 'Dinosaur NM',  // NEEDS DATA EXPORT
        'COOPALMU1': 'Altamont',     // NEEDS DATA EXPORT
        'UCC34': 'Bluebell',
        'K40U': 'Manila',            // Dutch John area
        'UTSTV': 'Starvation',
        
        // Mountain Passes
        'UTDAN': 'Daniels Summit',
        'UTICS': 'Indian Canyon',
        'UTSLD': 'Soldier Summit',
        
        // Legacy/Alternative names (keep for compatibility)
        'BUNUT': 'Roosevelt',
        'CHPU1': 'Ouray',
        'CEN': 'Vernal',
        'QHW': 'Whiterocks',
        'RDN': 'Red Wash'
    };
    
    // Priority 2: Clean up metadata names if no pretty name exists
    if (!prettyNames[stid] && metadataName) {
        return cleanMetadataName(metadataName);
    }
    
    // Priority 3: Fallback to pretty name, metadata name, or station ID
    return prettyNames[stid] || metadataName || stid;
}

function cleanMetadataName(name) {
    if (!name) return name;
    
    // Clean up common ugly patterns in weather station names
    return name
        .replace(/\s+COOPB?$/, '') // Remove "COOP" suffix
        .replace(/\s+RADIO$/, '') // Remove "RADIO" suffix  
        .replace(/^ALTA\s*-\s*/, 'Alta ') // Clean "ALTA - COLLINS" -> "Alta Collins"
        .replace(/\s*NM\s*-\s*/, ' ') // Clean "DINOSAUR NM-QUARRY" -> "DINOSAUR QUARRY"
        .toLowerCase()
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}