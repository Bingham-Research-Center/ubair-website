/**
 * Background Refresh Service
 *
 * Automatically refreshes UDOT API data on scheduled intervals.
 * This is the ONLY place that should call UDOT APIs - user requests never trigger API calls.
 *
 * Refresh Schedule:
 * - High-frequency (60s): Roads, cameras, weather stations
 * - Medium-frequency (5min): Snow plows, alerts, events
 * - Low-frequency (15min): Rest areas, mountain passes, digital signs
 *
 * UDOT Rate Limit: 10 calls per 60 seconds
 * Our usage: ~4 calls/minute average (60% under limit)
 */

import cron from 'node-cron';
import RoadWeatherService from './roadWeatherService.js';
import TrafficEventsService from './trafficEventsService.js';

class BackgroundRefreshService {
    constructor() {
        this.roadWeatherService = new RoadWeatherService();
        this.trafficEventsService = new TrafficEventsService();
        this.jobs = [];
        this.isRunning = false;

        // Track refresh statistics
        this.stats = {
            lastRefresh: {
                essential: null,
                frequent: null,
                infrequent: null
            },
            refreshCount: {
                essential: 0,
                frequent: 0,
                infrequent: 0
            },
            errors: {
                essential: 0,
                frequent: 0,
                infrequent: 0
            }
        };
    }

    /**
     * Start all background refresh jobs
     */
    start() {
        if (this.isRunning) {
            console.log('⚠️  Background refresh service already running');
            return;
        }

        console.log('🔄 Starting background refresh service...');
        console.log('   UDOT API Rate Limit: 10 calls/60 seconds');
        console.log('   Our Schedule:');
        console.log('   - Essential data: Every 60 seconds (roads, cameras, stations)');
        console.log('   - Frequent data: Every 5 minutes (plows, alerts, events)');
        console.log('   - Infrequent data: Every 15 minutes (rest areas, passes)');
        console.log('');

        // High-frequency: Every 60 seconds
        // Fetches: roads, cameras, weather stations (3 API calls)
        const essentialJob = cron.schedule('*/1 * * * *', async () => {
            await this.refreshEssentialData();
        });

        // Medium-frequency: Every 5 minutes
        // Fetches: snow plows, alerts, events (3 API calls)
        const frequentJob = cron.schedule('*/5 * * * *', async () => {
            await this.refreshFrequentData();
        });

        // Low-frequency: Every 15 minutes
        // Fetches: rest areas, mountain passes (2 API calls)
        const infrequentJob = cron.schedule('*/15 * * * *', async () => {
            await this.refreshInfrequentData();
        });

        this.jobs = [essentialJob, frequentJob, infrequentJob];
        this.isRunning = true;

        // Do initial fetch immediately (non-blocking)
        this.doInitialRefresh();

        console.log('✓ Background refresh service started');
        console.log('✓ Initial data fetch in progress...\n');
    }

    /**
     * Stop all background refresh jobs
     */
    stop() {
        console.log('🛑 Stopping background refresh service...');

        for (const job of this.jobs) {
            job.stop();
        }

        this.jobs = [];
        this.isRunning = false;

        console.log('✓ Background refresh service stopped\n');
    }

    /**
     * Perform initial data fetch on startup (non-blocking)
     */
    async doInitialRefresh() {
        try {
            // Refresh all data types immediately
            await Promise.all([
                this.refreshEssentialData(),
                this.refreshFrequentData(),
                this.refreshInfrequentData()
            ]);

            console.log('✓ Initial data fetch complete\n');
        } catch (error) {
            console.error('⚠️  Initial data fetch failed:', error.message);
            console.log('   Will retry on next scheduled interval\n');
        }
    }

    /**
     * Refresh essential data (roads, cameras, weather stations)
     * Runs every 60 seconds
     */
    async refreshEssentialData() {
        const startTime = Date.now();

        try {
            console.log(`[${new Date().toISOString()}] Refreshing essential data...`);

            // Fetch essential data (3 UDOT API calls)
            await Promise.all([
                this.roadWeatherService.fetchUDOTRoadConditions(),
                this.roadWeatherService.fetchUDOTCameras(),
                this.roadWeatherService.fetchUDOTWeatherStations()
            ]);

            const duration = Date.now() - startTime;
            this.stats.lastRefresh.essential = new Date();
            this.stats.refreshCount.essential++;

            console.log(`   ✓ Essential data refreshed (${duration}ms)\n`);
        } catch (error) {
            this.stats.errors.essential++;
            console.error(`   ✗ Essential data refresh failed: ${error.message}\n`);
        }
    }

    /**
     * Refresh frequent data (snow plows, alerts, events)
     * Runs every 5 minutes
     */
    async refreshFrequentData() {
        const startTime = Date.now();

        try {
            console.log(`[${new Date().toISOString()}] Refreshing frequent data...`);

            // Fetch frequent data (3 UDOT API calls)
            await Promise.all([
                this.roadWeatherService.fetchSnowPlows(),
                this.trafficEventsService.fetchUDOTAlerts(),
                this.trafficEventsService.fetchUDOTTrafficEvents()
            ]);

            const duration = Date.now() - startTime;
            this.stats.lastRefresh.frequent = new Date();
            this.stats.refreshCount.frequent++;

            console.log(`   ✓ Frequent data refreshed (${duration}ms)\n`);
        } catch (error) {
            this.stats.errors.frequent++;
            console.error(`   ✗ Frequent data refresh failed: ${error.message}\n`);
        }
    }

    /**
     * Refresh infrequent data (rest areas, mountain passes)
     * Runs every 15 minutes
     */
    async refreshInfrequentData() {
        const startTime = Date.now();

        try {
            console.log(`[${new Date().toISOString()}] Refreshing infrequent data...`);

            // Fetch infrequent data (2 UDOT API calls - digital signs removed due to 404)
            await Promise.all([
                this.roadWeatherService.fetchUDOTRestAreas(),
                this.roadWeatherService.fetchMountainPasses()
            ]);

            const duration = Date.now() - startTime;
            this.stats.lastRefresh.infrequent = new Date();
            this.stats.refreshCount.infrequent++;

            console.log(`   ✓ Infrequent data refreshed (${duration}ms)\n`);
        } catch (error) {
            this.stats.errors.infrequent++;
            console.error(`   ✗ Infrequent data refresh failed: ${error.message}\n`);
        }
    }

    /**
     * Get refresh statistics
     */
    getStats() {
        return {
            ...this.stats,
            isRunning: this.isRunning,
            estimatedApiCallsPerMinute: this.calculateApiCallRate(),
            uptime: this.isRunning ? 'Running' : 'Stopped'
        };
    }

    /**
     * Calculate estimated API calls per minute
     */
    calculateApiCallRate() {
        // Essential: 3 calls every 60 seconds = 3 calls/min
        // Frequent: 3 calls every 5 minutes = 0.6 calls/min
        // Infrequent: 2 calls every 15 minutes = 0.13 calls/min (signs removed)
        // Total: ~3.73 calls/min average
        return 3 + (3/5) + (2/15);
    }

    /**
     * Print statistics
     */
    printStats() {
        const stats = this.getStats();

        console.log('\n' + '='.repeat(60));
        console.log('Background Refresh Service Statistics');
        console.log('='.repeat(60));
        console.log(`Status: ${stats.isRunning ? '🟢 Running' : '🔴 Stopped'}`);
        console.log(`Estimated API rate: ${stats.estimatedApiCallsPerMinute.toFixed(1)} calls/minute`);
        console.log('');
        console.log('Refresh Counts:');
        console.log(`  Essential (60s):    ${stats.refreshCount.essential} (${stats.errors.essential} errors)`);
        console.log(`  Frequent (5min):    ${stats.refreshCount.frequent} (${stats.errors.frequent} errors)`);
        console.log(`  Infrequent (15min): ${stats.refreshCount.infrequent} (${stats.errors.infrequent} errors)`);
        console.log('');
        console.log('Last Refresh:');
        console.log(`  Essential:   ${stats.lastRefresh.essential ? stats.lastRefresh.essential.toISOString() : 'Never'}`);
        console.log(`  Frequent:    ${stats.lastRefresh.frequent ? stats.lastRefresh.frequent.toISOString() : 'Never'}`);
        console.log(`  Infrequent:  ${stats.lastRefresh.infrequent ? stats.lastRefresh.infrequent.toISOString() : 'Never'}`);
        console.log('='.repeat(60) + '\n');
    }
}

export default BackgroundRefreshService;
