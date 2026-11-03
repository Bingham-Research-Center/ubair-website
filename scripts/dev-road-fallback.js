// Explicit local failure harness. The normal server entry point never imports this file.
if (process.env.NODE_ENV === 'production') {
    throw new Error('The road fallback harness is for local development only');
}

process.env.NODE_ENV = 'development';
process.env.PREVIEW_MODE = 'true';
process.env.REPORT_EMAIL_ENABLED = 'false';
process.env.PORT ||= '3100';

const { default: RoadWeatherService } = await import('../server/roadWeatherService.js');
const fetchRoadConditions = RoadWeatherService.prototype.fetchUDOTRoadConditions;
const mode = process.env.ROAD_FALLBACK_TEST_MODE || 'failed';
let loadedRoads = false;
RoadWeatherService.prototype.fetchUDOTRoadConditions = async function () {
    if (mode === 'empty') return [];
    if (mode === 'after-first' && !loadedRoads) {
        const roads = await fetchRoadConditions.call(this);
        loadedRoads = roads.length > 0;
        return roads;
    }
    throw new Error('Local test: UDOT road conditions fetch failed');
};

console.log(`Road fallback test server mode: ${mode}`);
await import('../server/server.js');
