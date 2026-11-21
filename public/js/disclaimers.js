// The site's disclaimers and copyright line, held once (issue 290). loadFooter.js renders them
// into the footer on every page; there is no second copy in the sidebar or the views.
//
// Each caveat is one or two short sentences: what the page's products are, and where the
// official source is. Keep them terse and true; check a claim against the page before
// changing it. The year is computed, so nothing here needs editing on 1 January.

export const COPYRIGHT_HOLDER = 'Bingham Research Center, Utah State University';

export const DEFAULT_CAVEAT = 'Experimental research products, not official forecasts.';

export const PAGE_CAVEATS = {
    '/': 'Experimental research products, not official forecasts. Live data are preliminary.',
    '/live_aq': 'Live data are preliminary and not yet quality-controlled. Some come from partners '
        + 'including Utah DEQ and the Ute Indian Tribe.',
    '/forecast_outlooks': 'Experimental outlook, not an official forecast. Official air quality '
        + 'forecasts: Utah Division of Air Quality.',
    '/forecast_air_quality': 'Clyfar is an experimental research model, not an official forecast. '
        + 'Official air quality forecasts: Utah Division of Air Quality.',
    '/forecast_weather': 'Experimental model guidance. Official forecasts and warnings: National '
        + 'Weather Service.',
    '/roads': 'UDOT data may be delayed and road forecasts are experimental. Check official sources '
        + 'before you travel.',
    '/aviation': 'For planning only, not a weather briefing. Get an official briefing '
        + '(1-800-WX-BRIEF) before flight.',
    '/sports': 'Experimental. Drift figures are model estimates that assume a steady crosswind and '
        + 'no spin.',
    '/fire': 'Experimental; not for fire-suppression decisions. Satellite hotspots can lag and '
        + 'include false positives. Official guidance: NWS and Utah Fire Info.',
    '/about': '',
};

export function copyrightLine(year = new Date().getFullYear()) {
    return `© ${year} ${COPYRIGHT_HOLDER}.`;
}

// The footer text for a path: the page's caveat, then the copyright line.
export function footerText(pathname, year) {
    const key = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
    const caveat = key in PAGE_CAVEATS ? PAGE_CAVEATS[key] : DEFAULT_CAVEAT;
    return [caveat, copyrightLine(year)].filter(Boolean).join(' ');
}
