export const stations = {
    'Roosevelt': { lat: 40.29430, lng: -110.009 },
    'Vernal': { lat: 40.46472, lng: -109.56083 },
    'Horsepool': { lat: 40.1433, lng: -109.4674 },
    'Ouray': { lat: 40.05485, lng: -109.68737 },
    'Myton': { lat: 40.21690, lng: -110.18230 },
    'Whiterocks': { lat: 40.48380, lng: -109.90620 },
    'Dinosaur NM': { lat: 40.4372, lng: -109.3047},
    'Red Wash': { lat: 40.20443, lng: -109.35321},
};

// These are the stations that can be plotted. Eventually, need to expand this stations lookup list
// - Dinosaur National Monument (A3822)
// - Red Wash (A1633)
// - Rangely
// - Seven Sisters
// - Horsepool
// - Ouray (A1622 - Tribe)
// - Vernal (QV4)
// - Dry Fork
// - Whiterocks (A1386)
// - Roosevelt (QRS)
// - Myton (A1388)
// - Castle Peak

// TODO - make ozone the main thing to determine colour of marker?
export const thresholds = {
    'Ozone': { warning: 50, danger: 70 },
    'PM2.5': { warning: 35, danger: 55 },
    'NOx': { warning: 100, danger: 150 },
    'NO': { warning: 100, danger: 150 },
    'Temperature': { warning: 30, danger: 35 }
};