// Real API implementation for fetching live obs

async function getLatestFilename(prefix) {
  const res = await fetch(`/api/filelist.json`);
  if (!res.ok) throw new Error(`Unable to list files: ${res.status}`);
  const files = await res.json(); // e.g. ['map_obs_20250731_0228Z', ...]
  const regex = new RegExp(`^${prefix}(\\d{8}_\\d{4}Z)$`);
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

    const observations = processObservationData(rawData);
    const metadata     = processObservationData(rawMeta);

    return { observations, metadata };
  } catch (err) {
    console.error('Error fetching latest observations:', err);
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
        const { stid, variable, value, date_time, units } = obs;

        if (!stid || value === null || value === undefined) return;

        if (!stationData[stid]) {
            stationData[stid] = {};
        }

        const mappedVar = mapVariableName(variable);
        // const convertedValue = convertUnits(value, units, mappedVar);
        // stationData[stid][mappedVar] = convertedValue;
        stationData[stid][mappedVar] = value;
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

function mapVariableName(variable) {
    const mappings = {
        // 'ozone_concentration': 'Ozone',
        // 'pm25_concentration': 'PM2.5',
        // 'relative_humidity': 'Humidity'
        // TODO: get from lookup file
    };

    return mappings[variable] || variable;
}


/**
 * Map station IDs to display names
 */
function mapStationName(stid) {
    const mappings = {
        // 'UTORM': 'Orem',
        // 'UTSTV': 'Starvation'
        // TODO: get from metadata file
    };

    return mappings[stid] || stid;
}