/**
 * Shared Cache Warming Utility
 *
 * Provides a centralized function to warm up all critical caches by
 * pre-fetching data from UDOT APIs. Used by both the main server on
 * startup and the optional cron job for periodic refreshes.
 */

import RoadWeatherService from '../roadWeatherService.js';
import TrafficEventsService from '../trafficEventsService.js';

/**
 * Warms all critical caches by fetching data from UDOT APIs
 * @param {Object} options - Configuration options
 * @param {boolean} options.verbose - Whether to log detailed messages (default: true)
 * @param {boolean} options.exitOnFailure - Whether to exit process if all requests fail (default: false)
 * @returns {Promise<Object>} Result object with success/failure counts
 */
export async function warmAllCaches(options = {}) {
    const { verbose = true, exitOnFailure = false } = options;

    const roadWeatherService = new RoadWeatherService();
    const trafficEventsService = new TrafficEventsService();

    const startTime = Date.now();

    if (verbose) {
        console.log('🔥 Warming caches...');
    }

    try {
        // Warm up the most critical caches in parallel
        const results = await Promise.allSettled([
            roadWeatherService.fetchUDOTRoadConditions()
                .then(() => {
                    if (verbose) console.log('  ✓ Road conditions cache warmed');
                })
                .catch(err => {
                    if (verbose) console.warn('  ⚠ Road conditions cache warming failed:', err.message);
                    throw err;
                }),

            roadWeatherService.fetchUDOTCameras()
                .then(() => {
                    if (verbose) console.log('  ✓ Cameras cache warmed');
                })
                .catch(err => {
                    if (verbose) console.warn('  ⚠ Cameras cache warming failed:', err.message);
                    throw err;
                }),

            roadWeatherService.fetchUDOTWeatherStations()
                .then(() => {
                    if (verbose) console.log('  ✓ Weather stations cache warmed');
                })
                .catch(err => {
                    if (verbose) console.warn('  ⚠ Weather stations cache warming failed:', err.message);
                    throw err;
                }),

            trafficEventsService.fetchUDOTTrafficEvents()
                .then(() => {
                    if (verbose) console.log('  ✓ Traffic events cache warmed');
                })
                .catch(err => {
                    if (verbose) console.warn('  ⚠ Traffic events cache warming failed:', err.message);
                    throw err;
                }),

            trafficEventsService.fetchUDOTAlerts()
                .then(() => {
                    if (verbose) console.log('  ✓ Traffic alerts cache warmed');
                })
                .catch(err => {
                    if (verbose) console.warn('  ⚠ Traffic alerts cache warming failed:', err.message);
                    throw err;
                })
        ]);

        // Count successes and failures
        const succeeded = results.filter(r => r.status === 'fulfilled').length;
        const failed = results.filter(r => r.status === 'rejected').length;

        const duration = Date.now() - startTime;

        if (verbose) {
            console.log(`✅ Cache warming completed in ${duration}ms (${succeeded} succeeded, ${failed} failed)`);
        }

        // Exit with error if all requests failed and exitOnFailure is true
        if (succeeded === 0 && exitOnFailure) {
            console.error('❌ All cache warming requests failed!');
            process.exit(1);
        }

        return {
            succeeded,
            failed,
            duration,
            total: results.length
        };

    } catch (error) {
        console.error('❌ Cache warming encountered an error:', error);

        if (exitOnFailure) {
            process.exit(1);
        }

        throw error;
    }
}
