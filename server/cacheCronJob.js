#!/usr/bin/env node

/**
 * Standalone Cache Refresh Cron Job
 *
 * This script can be run independently (e.g., via cron) to pre-populate
 * the disk cache with fresh data from UDOT APIs. The main server will then
 * load this cached data on startup or when memory cache expires.
 *
 * Usage:
 *   node server/cacheCronJob.js
 *
 * Cron example (run every 5 minutes):
 *   Star-slash-5 * * * * cd /path/to/ubair-website && node server/cacheCronJob.js >> /var/log/cache-cron.log 2>&1
 *   (Replace "Star-slash-5" with the actual cron syntax)
 *
 * Environment variables required:
 *   - UDOT_API_KEY: Your UDOT API key
 */

import 'dotenv/config';
import { warmAllCaches } from './utils/cacheWarming.js';

// Run the cache refresh
console.log(`[${new Date().toISOString()}] 🔄 Starting cache refresh...`);

warmAllCaches({ verbose: true, exitOnFailure: true })
    .then((result) => {
        console.log(`[${new Date().toISOString()}] Cache refresh job finished successfully`);
        process.exit(0);
    })
    .catch(err => {
        console.error('Cache refresh job encountered a fatal error:', err);
        process.exit(1);
    });
