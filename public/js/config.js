export const stations = {
    // Core Uinta Basin Air Quality Stations (14 must-have sites)

    // Primary AQ Monitoring
    'Horsepool': { lat: 40.144, lng: -109.467 },       // UBHSP - Key ozone monitoring
    'Castle Peak': { lat: 40.051, lng: -110.020 },     // UBCSP - Basin center
    'Seven Sisters': { lat: 39.981, lng: -109.345 },   // UB7ST - Southern basin

    // Population Centers
    'Vernal': { lat: 40.44, lng: -109.51 },           // KVEL - Vernal Airport
    'Roosevelt': { lat: 40.28, lng: -110.05 },        // K74V - Roosevelt
    'Duchesne': { lat: 40.17, lng: -110.40 },         // COOPDSNU1 - Duchesne
    'Fort Duchesne': { lat: 40.28, lng: -109.86 },    // UINU1 - Fort Duchesne
    'Myton': { lat: 40.22, lng: -110.18 },            // UBMYT - Western basin

    // Basin Coverage
    'Dinosaur NM': { lat: 40.44, lng: -109.31 },      // A3822 - Northern basin
    'Altamont': { lat: 40.37, lng: -110.30 },         // COOPALMU1 - NW basin

    // Additional Required Stations (from legacy ubair.usu.edu)
    'Red Wash': { lat: 40.20, lng: -109.35 },         // UBRDW/A1633 - Eastern basin
    'Ouray': { lat: 40.05, lng: -109.69 },            // UBORY/A1622 - Tribal station
    'Dry Fork': { lat: 40.55, lng: -109.60 },         // UBDRF - Northern coverage
    'Whiterocks': { lat: 40.48, lng: -109.91 },       // UBWHR/A1386 - NE basin

    // Mountain Passes - Road Weather Stations (UDOT data source)
    'Daniels Summit': { lat: 40.30, lng: -111.26, type: 'road' },   // UTDAN - Key western pass (8000 ft)
    'Indian Canyon': { lat: 39.89, lng: -110.75, type: 'road' },    // UTICS - Southern pass (9050 ft)
    'Soldier Summit': { lat: 39.93, lng: -111.08, type: 'road' },   // UTSLD - SW pass (7487 ft)
};

// Station expansion TODO:
// - Rangely (?) - Skip if problematic, may be offline
// - Co-located stations need resolution: Roosevelt (QRS vs UBRVT), etc.
// - Consider AirNow vs UBAIR network merging for display


export const thresholds = {
    'Ozone': { warning: 50, danger: 70 },
    'PM2.5': { warning: 35, danger: 55 },
    'NOx': { warning: 100, danger: 150 },
    'NO': { warning: 100, danger: 150 },
    'Temperature': { warning: 30, danger: 35 }
};