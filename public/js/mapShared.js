const PRETTY_STATION_NAMES = {
    // Core Air Quality Monitoring
    UBHSP: 'Horsepool',
    UBCSP: 'Castle Peak',
    UB7ST: 'Seven Sisters',

    // Population Centers
    KVEL: 'Vernal',
    K74V: 'Roosevelt',
    COOPDSNU1: 'Duchesne',
    KU69: 'Duchesne',
    UINU1: 'Fort Duchesne',

    // Basin Coverage
    UTMYT: 'Myton',
    UBMYT: 'Myton',
    COOPDINU1: 'Dinosaur NM',
    COOPALMU1: 'Altamont',
    UCC34: 'Bluebell',
    K40U: 'Manila',
    UTSTV: 'Starvation',

    // Additional Required Stations
    UBRDW: 'Red Wash',
    UBORY: 'Ouray',
    UBDRF: 'Dry Fork',
    UBWHR: 'Whiterocks',

    // Mountain Passes
    UTDAN: 'Daniels Summit',
    UTICS: 'Indian Canyon',
    UTSLD: 'Soldier Summit',

    // Legacy aliases intentionally not remapped:
    // BUNUT, CHPU1, CEN, QHW, RDN
    // These can map to non-basin sites and create mislabeled markers.
};

export function cleanMetadataName(name) {
    if (!name) return name;

    return name
        .replace(/\s+COOPB?$/, '')
        .replace(/\s+RADIO$/, '')
        .replace(/^ALTA\s*-\s*/, 'Alta ')
        .replace(/\s*NM\s*-\s*/, ' ')
        .toLowerCase()
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

export function mapStationName(stid, metadataName = null) {
    if (!PRETTY_STATION_NAMES[stid] && metadataName) {
        return cleanMetadataName(metadataName);
    }

    return PRETTY_STATION_NAMES[stid] || metadataName || stid;
}

export function buildStationMeasurements(observations = {}, stationName) {
    const measurements = {};

    Object.entries(observations).forEach(([variable, stationValues]) => {
        if (variable === '_timestamps' || variable === '_units') {
            return;
        }

        measurements[variable] = stationValues?.[stationName] ?? null;
    });

    return measurements;
}
