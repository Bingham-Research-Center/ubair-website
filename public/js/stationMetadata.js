// Station metadata lookup - coordinates, elevations, and display names
// Based on existing stationNames mapping plus added coordinates/elevation
const STATION_METADATA = {
    // Uinta Basin core air quality stations
    "UBCSP": {
        name: "Castle Peak",
        lat: 40.1433,
        lng: -109.4674,
        elevation: 1950,
        active: true,
        type: "air_quality"
    },
    "UBHSP": {
        name: "Horsepool", 
        lat: 40.143,
        lng: -109.467,
        elevation: 1524,
        active: true,
        type: "air_quality"
    },
    "UBORY": {
        name: "Ouray",
        lat: 40.05485,
        lng: -109.68737,
        elevation: 1372,
        active: true,
        type: "air_quality"
    },
    "UBWHR": {
        name: "Whiterocks",
        lat: 40.48380,
        lng: -109.90620,
        elevation: 1676,
        active: true,
        type: "air_quality"
    },
    "UCC33": {
        name: "Vernal",
        lat: 40.46472,
        lng: -109.56083,
        elevation: 1611,
        active: true,
        type: "air_quality"
    },
    "UBMYT": {
        name: "Myton",
        lat: 40.21690,
        lng: -110.18230,
        elevation: 1524,
        active: true,
        type: "air_quality"
    },
    
    // Weather stations
    "KSLC": {
        name: "Salt Lake City Airport",
        lat: 40.7831,
        lng: -111.9778,
        elevation: 1288,
        active: true,
        type: "weather"
    },
    "CLN": {
        name: "Colton",
        lat: 39.8567,
        lng: -111.0344,
        elevation: 2286,
        active: true,
        type: "weather"
    },
    "COOPALMU1": {
        name: "Altamont",
        lat: 40.3586,
        lng: -110.2896,
        elevation: 2073,
        active: true,
        type: "cooperative"
    },
    "UTCOP": {
        name: "Copper Canyon",
        lat: 40.234,
        lng: -109.912,
        elevation: 2134,
        active: true,
        type: "weather"
    },
    "UTHEB": {
        name: "Heber City",
        lat: 40.5064,
        lng: -111.4138,
        elevation: 1707,
        active: true,
        type: "weather"
    },
    "UTORM": {
        name: "Orem",
        lat: 40.2969,
        lng: -111.6946,
        elevation: 1434,
        active: true,
        type: "weather"
    },
    "UTSTV": {
        name: "Starvation Reservoir",
        lat: 40.3361,
        lng: -110.9275,
        elevation: 1798,
        active: true,
        type: "weather"
    }
};

// Helper functions
function getStationInfo(stid) {
    return STATION_METADATA[stid] || null;
}

function getActiveStations() {
    return Object.entries(STATION_METADATA)
        .filter(([_, info]) => info.active)
        .reduce((acc, [stid, info]) => {
            acc[stid] = info;
            return acc;
        }, {});
}

function getStationsByType(type) {
    return Object.entries(STATION_METADATA)
        .filter(([_, info]) => info.type === type)
        .reduce((acc, [stid, info]) => {
            acc[stid] = info;
            return acc;
        }, {});
}

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { STATION_METADATA, getStationInfo, getActiveStations, getStationsByType };
}