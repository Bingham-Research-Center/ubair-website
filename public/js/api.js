// Real API implementation for fetching live obs and time series data

/**
 * Fetch time series data from Synoptic API via server proxy
 * @param {string[]} stations - Array of station IDs (e.g., ['UBHSP', 'KVEL'])
 * @param {string[]} variables - Array of variable names (e.g., ['air_temp', 'ozone_concentration'])
 * @param {Date|string} startDate - Start date/time
 * @param {Date|string} endDate - End date/time
 * @returns {Promise<object>} Time series data
 */
export async function fetchTimeSeriesData(stations, variables, startDate, endDate) {
  try {
    // Ensure dates are Date objects
    const start = startDate instanceof Date ? startDate : new Date(startDate);
    const end = endDate instanceof Date ? endDate : new Date(endDate);

    // Validate date range
    const daysDiff = (end - start) / (1000 * 60 * 60 * 24);
    if (daysDiff > 7) {
      throw new Error('Date range cannot exceed 7 days');
    }
    if (daysDiff < 0) {
      throw new Error('Start date must be before end date');
    }

    // Build query parameters
    const params = new URLSearchParams({
      stations: stations.join(','),
      variables: variables.join(','),
      start: start.toISOString(),
      end: end.toISOString()
    });

    const response = await fetch(`/api/synoptic/timeseries?${params}`);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Unknown error fetching time series data');
    }

    return result;
  } catch (err) {
    console.error('Error fetching time series data:', err);
    throw err;
  }
}

/**
 * Fetch list of available stations from Synoptic API
 * @returns {Promise<object[]>} Array of station metadata
 */
export async function fetchAvailableStations() {
  try {
    const response = await fetch('/api/synoptic/stations');

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Failed to fetch stations');
    }

    return result.stations;
  } catch (err) {
    console.error('Error fetching available stations:', err);
    throw err;
  }
}

/**
 * The newest file named `<prefix><YYYYMMDD_HHMMZ>.json` in a dataType.
 *
 * The server is asked for the one name (GET /api/latest, website 1.7.9). Until then every map
 * and current-conditions panel downloaded the whole directory listing and sorted it here: on
 * .com that was 99,000 names, 255 KB gzipped, twice per map load.
 */
export async function getLatestFilename(prefix, dataType) {
  const query = `prefix=${encodeURIComponent(prefix)}`;
  const asked = await fetch(`/api/latest/${dataType}?${query}`, { cache: 'no-store' }).catch(() => null);
  if (asked?.ok) {
    const { filename } = await asked.json();
    if (!filename) throw new Error(`No files found for prefix \`${prefix}\` in ${dataType}`);
    return filename;
  }

  // The route is not there between a deploy's `git pull` (this file changes at once) and its
  // restart (routes load then), so the list is still the fallback. `?prefix=` trims it on a
  // server that knows the parameter and is ignored by one that does not.
  const res = await fetch(`/api/filelist/${dataType}?${query}`);
  if (!res.ok) throw new Error(`Unable to list files: ${res.status}`);
  const files = await res.json();
  const regex = new RegExp(`^${prefix}(\\d{8}_\\d{4}Z)\\.json$`);
  const latest = files
    .map(name => {
      const m = name.match(regex);
      return m ? { name, ts: m[1] } : null;
    })
    .filter(Boolean)
    .sort((a, b) => (a.ts < b.ts ? 1 : -1))[0];
  if (!latest) throw new Error(`No files found for prefix \`${prefix}\` in ${dataType}`);
  return latest.name;
}

export async function fetchLiveObservations() {
  try {
    const dataFile = await getLatestFilename('map_obs_', 'observations');
    const metaFile = await getLatestFilename('map_obs_meta_', 'metadata');

    const [dataRes, metaRes] = await Promise.all([
      fetch(`/api/static/observations/${dataFile}`),
      fetch(`/api/static/metadata/${metaFile}`)
    ]);
    if (!dataRes.ok || !metaRes.ok) {
      throw new Error(`Fetch failed: data ${dataRes.status}, meta ${metaRes.status}`);
    }

    const rawData = await dataRes.json();
    const rawMeta = await metaRes.json();

    const metadata = processMetadata(rawMeta);
    const observations = processObservationData(rawData);

    return { observations, metadata };
  } catch (err) {
    console.error('Error fetching latest observations:', err);
    throw err;
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
 * Process raw observation data from pandas export format.
 * Transforms [{stid, variable, value, date_time, units}...] to {variable: {stid: value}}, keyed by
 * Synoptic station ID. Stations are never merged by name: until 21 Nov 2026 every station called
 * "Vernal" was folded into one, and a co-op reading 14 h old was shown as current.
 *
 * Alongside the values: _times[stid][variable] (when each reading was taken), _timestamps[stid]
 * (the station's newest reading) and _units[variable] (the feed's unit name; values stay raw SI).
 * Where a station sends one variable twice, the newer reading wins.
 */
export function processObservationData(rawData) {
    if (!Array.isArray(rawData)) {
        throw new Error('Expected array of observations');
    }

    const result = { _timestamps: {}, _times: {}, _units: {} };

    rawData.forEach((obs) => {
        const { stid, variable, value, date_time, units } = obs;
        if (!stid || value === null || value === undefined) return;

        const name = mapVariableName(variable);
        const times = (result._times[stid] ??= {});
        const previous = times[name];
        if (previous !== undefined && (!date_time || date_time <= previous)) return;

        (result[name] ??= {})[stid] = value;
        times[name] = date_time ?? null;
        if (units && !result._units[name]) result._units[name] = units;
        if (date_time && !(result._timestamps[stid] >= date_time)) result._timestamps[stid] = date_time;
    });

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
        // These used to read black carbon as NOx and NO as NO2. Neither is in the feed yet,
        // but the map popups list every pollutant a station reports, so the names must be right.
        'NO_concentration': 'NO',
        'NO2_concentration': 'NO2',
        'black_carbon_concentration': 'Black Carbon'
    };

    return mappings[variable] || variable;
}

