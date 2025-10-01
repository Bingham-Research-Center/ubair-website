export const stations = {
    // Core Uinta Basin Stations - Air Quality Focus
    'Horsepool': { lat: 40.144, lng: -109.467 },       // UBHSP - Key ozone monitoring
    'Castle Peak': { lat: 40.051, lng: -110.020 },     // UBCSP - Basin center
    'Seven Sisters': { lat: 39.981, lng: -109.345 },   // UB7ST - Southern basin
    
    // Population Centers
    'Vernal': { lat: 40.44, lng: -109.51 },           // KVEL - Vernal Airport
    'Roosevelt': { lat: 40.28, lng: -110.05 },        // K74V - Roosevelt
    'Duchesne': { lat: 40.17, lng: -110.40 },         // COOPDSNU1 - Duchesne
    'Fort Duchesne': { lat: 40.28, lng: -109.86 },    // UINU1 - Fort Duchesne
    
    // Basin Perimeter & Geographic Coverage
    'Myton': { lat: 40.20, lng: -110.07 },            // UTMYT - Western basin
    'Dinosaur NM': { lat: 40.44, lng: -109.31 },      // COOPDINU1 - Northern basin
    'Altamont': { lat: 40.37, lng: -110.30 },         // COOPALMU1 - NW basin
    'Bluebell': { lat: 40.37, lng: -110.21 },         // UCC34 - Central-west basin
    'Windy Point': { lat: 40.52, lng: -109.55 },      // PLACEHOLDER - Near Steinaker
    'Manila': { lat: 40.98, lng: -109.68 },           // K40U - Dutch John area
    'Starvation': { lat: 40.17, lng: -110.49 },       // UTSTV - SW basin
    
    // Mountain Passes - Road Weather Stations (UDOT data source)
    'Daniels Summit': { lat: 40.30, lng: -111.26, type: 'road' },   // UTDAN - Key western pass (8000 ft)
    'Indian Canyon': { lat: 39.89, lng: -110.75, type: 'road' },    // UTICS - Southern pass (9050 ft)
    'Soldier Summit': { lat: 39.93, lng: -111.08, type: 'road' },   // UTSLD - SW pass (7487 ft)
};

// These are the stations that can be plotted. Eventually, need to expand this stations lookup list
// - Dinosaur National Monument (A3822)
// - Red Wash (A1633)
// - Rangely (?)
// - Seven Sisters (UB7ST)
// - Horsepool (UBHSP)
// - Ouray (A1622 - Tribe)
// - Vernal (QV4)
// - Dry Fork
// - Whiterocks (A1386)
// - Roosevelt (QRS, UBRVT) <-- co-located but which to use?
// - Myton (A1388)
// - Castle Peak (UBCSP)


export const thresholds = {
    'Ozone': { warning: 50, danger: 70 },
    'PM2.5': { warning: 35, danger: 55 },
    'NOx': { warning: 100, danger: 150 },
    'NO': { warning: 100, danger: 150 },
    'Temperature': { warning: 30, danger: 35 }
};