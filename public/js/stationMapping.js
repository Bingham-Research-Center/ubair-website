/**
 * Centralized Station Mapping Module
 * Single source of truth for station name mapping and deduplication
 */

// Pretty names for all known station IDs
export const STATION_PRETTY_NAMES = {
    // Core Air Quality Monitoring
    'UBHSP': 'Horsepool',
    'UBCSP': 'Castle Peak',
    'UB7ST': 'Seven Sisters',

    // Population Centers
    'KVEL': 'Vernal',
    'K74V': 'Roosevelt',
    'COOPDSNU1': 'Duchesne',
    'KU69': 'Duchesne',
    'UINU1': 'Fort Duchesne',
    'COOPFTDU1': 'Fort Duchesne',

    // Basin Coverage - Myton variants
    'UTMYT': 'Myton',
    'UBMYT': 'Myton',
    'A1388': 'Myton',

    // Basin Coverage - Other
    'COOPDINU1': 'Dinosaur NM',
    'A3822': 'Dinosaur NM',
    'COOPALMU1': 'Altamont',

    // Additional Required Stations
    'UBRDW': 'Red Wash',
    'A1633': 'Red Wash',
    'RDN': 'Red Wash',
    'UBORY': 'Ouray',
    'A1622': 'Ouray',
    'CHPU1': 'Ouray',
    'UBDRF': 'Dry Fork',
    'UBWHR': 'Whiterocks',
    'A1386': 'Whiterocks',
    'QHW': 'Whiterocks',

    // Mountain Passes (Road Weather)
    'UTDAN': 'Daniels Summit',
    'UTICS': 'Indian Canyon',
    'UTSLD': 'Soldier Summit',

    // Legacy/Removed but may appear in data
    'UCC34': 'Bluebell',
    'K40U': 'Manila',
    'UTSTV': 'Starvation',
    'BUNUT': 'Roosevelt',
    'CEN': 'Vernal',
    'COOPNELU1': 'Neola'
};

// Canonical station IDs - for deduplication
// Maps duplicate station IDs to the preferred/canonical ID
export const STATION_CANONICAL = {
    // Myton variants -> prefer UBMYT
    'UTMYT': 'UBMYT',
    'A1388': 'UBMYT',
    // Vernal variants -> prefer KVEL
    'CEN': 'KVEL',
    // Roosevelt variants -> prefer K74V
    'BUNUT': 'K74V',
    // Ouray variants -> prefer UBORY
    'CHPU1': 'UBORY',
    'A1622': 'UBORY',
    // Whiterocks variants -> prefer UBWHR
    'QHW': 'UBWHR',
    'A1386': 'UBWHR',
    // Red Wash variants -> prefer UBRDW
    'RDN': 'UBRDW',
    'A1633': 'UBRDW',
    // Duchesne variants -> prefer COOPDSNU1
    'KU69': 'COOPDSNU1',
    // Dinosaur NM variants -> prefer COOPDINU1
    'A3822': 'COOPDINU1',
    // Fort Duchesne variants -> prefer UINU1
    'COOPFTDU1': 'UINU1'
};

// Stations to exclude from display (outside study area, problematic data)
export const EXCLUDED_STATIONS = [
    'CLN',      // Alta Collins - outside basin
];

/**
 * Map a station ID to a display name
 * @param {string} stid - Station ID from data
 * @param {string} metadataName - Name from metadata (fallback)
 * @returns {string|null} Display name, or null if station should be excluded
 */
export function mapStationName(stid, metadataName = null) {
    // Check exclusion list
    if (EXCLUDED_STATIONS.includes(stid)) {
        return null;
    }

    // Priority 1: Pretty hardcoded names
    if (STATION_PRETTY_NAMES[stid]) {
        return STATION_PRETTY_NAMES[stid];
    }

    // Priority 2: Clean up metadata names
    if (metadataName) {
        return cleanMetadataName(metadataName);
    }

    // Priority 3: Return station ID as-is
    return stid;
}

/**
 * Get the canonical station ID for deduplication
 * @param {string} stid - Station ID from data
 * @returns {string} Canonical station ID
 */
export function getCanonicalStationId(stid) {
    return STATION_CANONICAL[stid] || stid;
}

/**
 * Check if a station ID is a duplicate (non-canonical)
 * @param {string} stid - Station ID to check
 * @returns {boolean} True if this is a duplicate station ID
 */
export function isDuplicateStation(stid) {
    return stid in STATION_CANONICAL;
}

/**
 * Clean up raw metadata station names
 * @param {string} name - Raw station name from metadata
 * @returns {string} Cleaned display name
 */
export function cleanMetadataName(name) {
    if (!name) return name;

    return name
        .replace(/\s+COOPB?$/, '')           // Remove "COOP" suffix
        .replace(/\s+RADIO$/, '')             // Remove "RADIO" suffix
        .replace(/^ALTA\s*-\s*/, 'Alta ')     // Clean "ALTA - COLLINS" -> "Alta Collins"
        .replace(/\s*NM\s*-\s*/, ' ')         // Clean "DINOSAUR NM-QUARRY" -> "DINOSAUR QUARRY"
        .toLowerCase()
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

/**
 * Deduplicate observations by merging data from duplicate station IDs
 * Prefers data from canonical station ID when both have values
 * @param {Object} observationsByVariable - {variable: {stationName: value}}
 * @param {Object} metadata - Station metadata with station IDs
 * @returns {Object} Deduplicated observations
 */
export function deduplicateObservations(observationsByVariable, metadata) {
    const result = {};

    for (const [variable, stationValues] of Object.entries(observationsByVariable)) {
        if (variable.startsWith('_')) {
            // Preserve metadata fields like _timestamps, _units
            result[variable] = stationValues;
            continue;
        }

        result[variable] = {};

        for (const [stationName, value] of Object.entries(stationValues)) {
            // Find the station ID for this name
            const stid = findStationIdByName(stationName, metadata);
            const canonicalId = stid ? getCanonicalStationId(stid) : null;
            const canonicalName = canonicalId ? mapStationName(canonicalId) : stationName;

            // If we already have a value for the canonical station, prefer non-null
            if (result[variable][canonicalName] === undefined ||
                (result[variable][canonicalName] === null && value !== null)) {
                result[variable][canonicalName] = value;
            }
        }
    }

    return result;
}

/**
 * Find station ID by display name from metadata
 * @param {string} displayName - Display name to look up
 * @param {Object} metadata - Station metadata
 * @returns {string|null} Station ID or null
 */
function findStationIdByName(displayName, metadata) {
    // First check if it's directly in pretty names
    for (const [stid, name] of Object.entries(STATION_PRETTY_NAMES)) {
        if (name === displayName) {
            return stid;
        }
    }

    // Check metadata
    if (metadata) {
        for (const [stid, info] of Object.entries(metadata)) {
            if (mapStationName(stid, info.name) === displayName) {
                return stid;
            }
        }
    }

    return null;
}
