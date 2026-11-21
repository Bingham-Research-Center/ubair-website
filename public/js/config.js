// The stations the two air-quality maps name or place by hand, keyed by Synoptic station ID.
//
// Until 21 Nov 2026 the maps joined stations by display name, so every station whose name came out
// as "Vernal" was merged into one: the Vernal popup printed a co-op temperature 14 hours old
// as current, and the Vernal airport marker on Live AQ showed the DEQ monitor's ozone. Now a
// marker shows one station's own readings and nothing else. Two stations share a marker only
// when they stand on the same spot (`companions`, under 300 m apart), and the popup then
// names the second one.
//
// A station not listed here keeps the name in the feed's metadata (cleanMetadataName).
//
//   home               drawn on the homepage map (Basin floor only: the passes live on /roads)
//   companions         stations on the same spot, shown inside this station's popup
//   road               a road weather sensor: its popup links to /roads
//   notReportingSince  last day Synoptic holds data for it (checked 21 Nov 2026). Such a
//                      station is drawn grey with that date until the feed carries it again;
//                      lat/lng place it, since the feed's metadata may not list it.
export const STATIONS = {
    // Ozone monitors: Utah DEQ (Q…) and the Ute Indian Tribe (A…).
    QV4: { name: 'Vernal', home: true },
    QRS: { name: 'Roosevelt', home: true },
    A1388: { name: 'Myton', home: true },
    A1622: { name: 'Ouray', home: true },
    A1633: { name: 'Red Wash', home: true },
    A1386: { name: 'Whiterocks', home: true },
    A3822: { name: 'Dinosaur NM', home: true, companions: ['COOPDINU1'] },
    // DEQ ozone, NO, NO2 and CO, active on Synoptic but not yet in the CHPC feed. It appears
    // on both maps by itself once the feed carries it.
    QFL: { name: 'Fruitland', home: true },

    // USU's UB-AIR monitors (Synoptic network 209) have had no data on Synoptic since 2025.
    UBHSP: { name: 'Horsepool', home: true, lat: 40.144, lng: -109.467, notReportingSince: '2025-09-03' },
    UBCSP: { name: 'Castle Peak', home: true, lat: 40.051, lng: -110.020, notReportingSince: '2025-11-05' },
    UB7ST: { name: 'Seven Sisters', home: true, lat: 39.981, lng: -109.345, notReportingSince: '2025-12-23' },

    // Weather on the Basin floor, in towns without a monitor.
    KU69: { name: 'Duchesne', home: true },
    UINU1: { name: 'Fort Duchesne', home: true, companions: ['COOPFTDU1'] },
    UCC34: { name: 'Bluebell', home: true },

    // Co-op observers report once a day; on the map they show snow depth (MAX_AGE_MINUTES).
    COOPALMU1: { name: 'Altamont', home: true },
    COOPNELU1: { name: 'Neola', home: true },
    COOPDINU1: { name: 'Dinosaur NM co-op' },
    COOPFTDU1: { name: 'Fort Duchesne co-op' },
    COOPVELU1: { name: 'Vernal co-op' },
    COOPDSNU1: { name: 'Duchesne co-op' },
    COOPROSU1: { name: 'Roosevelt co-op' },

    // Airports and road sensors that share a town's name with a monitor, so they say what they are.
    KVEL: { name: 'Vernal airport' },
    K74V: { name: 'Roosevelt airport' },
    K40U: { name: 'Manila' },
    UTMYT: { name: 'US-40 at Myton', road: true },
    UTSTV: { name: 'US-40 at Starvation', road: true },
    UTDAN: { name: 'Daniels Summit', road: true },
    UTICS: { name: 'Indian Canyon', road: true },
    UTSLD: { name: 'Soldier Summit', road: true }
};

/** The homepage map's stations, in the order the auto-cycle visits them. */
export const HOME_STATIONS = Object.keys(STATIONS).filter((stid) => STATIONS[stid].home);

/** Station IDs that are drawn inside another station's popup rather than as markers. */
export const COMPANION_OF = Object.fromEntries(
    Object.entries(STATIONS).flatMap(([stid, entry]) => (entry.companions ?? []).map((c) => [c, stid]))
);
