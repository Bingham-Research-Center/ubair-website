/**
 * Camera Analysis Scheduler
 * 
 * Staggered camera snow detection analysis to avoid UDOT API rate limits.
 * 
 * Rate Limit: UDOT allows 10 calls/60 seconds (600 calls/hour)
 * Our usage: ~1 camera * 3 views every 30s = ~360 calls/hour (60% of limit)
 * 
 * Features:
 * - Dynamic cache TTL sized to full rotation (no premature expiry)
 * - Spatial queue ordering (farthest-point) for uniform early coverage
 * - Random jitter (0-5s) per cycle to smooth request pattern
 * - Staggered analysis (1 camera every 30 seconds)
 * - Keep all 3 views per camera (multi-view consensus)
 * - User requests served from cache (instant, no API calls)
 */

import NodeCache from 'node-cache';
import SnowDetectionService from './snowDetectionService.js';

class CameraAnalysisScheduler {
    constructor() {
        this.snowDetectionService = new SnowDetectionService();
        
        // Queue of cameras to analyze (spatially sorted on first load)
        this.cameraQueue = [];
        this.weatherStations = [];
        this.queueSorted = false;
        
        // Analysis state
        this.isRunning = false;
        this.analysisTimeout = null;
        this.currentBatch = 0;
        
        // Configuration
        this.config = {
            batchSize: 1,
            intervalSeconds: 30,
            jitterSeconds: 5,       // random 0-5s added per cycle
            cachePaddingFactor: 1.2, // TTL = rotation time * 1.2
            maxRetries: 3
        };
        
        // Cache TTL computed dynamically from camera count
        this.cacheTTLSeconds = 600; // default until cameras arrive
        this.cache = new NodeCache({ stdTTL: this.cacheTTLSeconds, checkperiod: 120 });
        
        // Statistics
        this.stats = {
            totalAnalyses: 0,
            failedAnalyses: 0,
            cacheHits: 0,
            cacheMisses: 0,
            lastAnalysisTime: null,
            averageAnalysisTime: 0
        };
    }
    
    /**
     * Start the camera analysis scheduler
     */
    start() {
        if (this.isRunning) {
            console.log('⚠️  Camera analysis scheduler already running');
            return;
        }
        
        console.log('🎥 Starting camera analysis scheduler...');
        console.log(`   Batch: ${this.config.batchSize} camera(s) every ~${this.config.intervalSeconds}s (+0-${this.config.jitterSeconds}s jitter)`);
        console.log('   Cache TTL: dynamic (sized to full rotation)\n');
        
        this.isRunning = true;
        this.scheduleNextCycle();
        
        console.log('✓ Camera analysis scheduler started\n');
    }
    
    /**
     * Stop the camera analysis scheduler
     */
    stop() {
        if (!this.isRunning) {
            console.log('⚠️  Camera analysis scheduler not running');
            return;
        }
        
        console.log('🛑 Stopping camera analysis scheduler...');
        
        if (this.analysisTimeout) {
            clearTimeout(this.analysisTimeout);
            this.analysisTimeout = null;
        }
        
        this.isRunning = false;
        console.log('✓ Camera analysis scheduler stopped\n');
    }
    
    /**
     * Schedule the next analysis cycle with random jitter
     */
    scheduleNextCycle() {
        if (!this.isRunning) return;
        const jitter = Math.random() * this.config.jitterSeconds * 1000;
        const delay = this.config.intervalSeconds * 1000 + jitter;
        this.analysisTimeout = setTimeout(() => {
            this.runAnalysisCycle().then(() => this.scheduleNextCycle());
        }, delay);
    }
    
    /**
     * Update camera list and weather stations
     * Called by background refresh service when new data arrives
     */
    updateCameraList(cameras, weatherStations = []) {
        this.weatherStations = weatherStations;

        // Spatial sort only on first load (farthest-point ordering)
        if (!this.queueSorted && cameras.length > 0) {
            this.cameraQueue = this.spatialSort(cameras);
            this.queueSorted = true;
            this.updateCacheTTL(cameras.length);
            console.log(`   Camera queue: ${cameras.length} cameras (spatially sorted, TTL ${this.cacheTTLSeconds}s)`);
        } else {
            // Preserve spatial order; only add genuinely new cameras
            const existingIds = new Set(this.cameraQueue.map(c => c.id));
            const newCams = cameras.filter(c => !existingIds.has(c.id));
            if (newCams.length > 0) {
                this.cameraQueue.push(...newCams);
                this.updateCacheTTL(this.cameraQueue.length);
            }
        }
    }
    
    /**
     * Set cache TTL to cover a full rotation with padding
     */
    updateCacheTTL(cameraCount) {
        const rotationSeconds = cameraCount * this.config.intervalSeconds / this.config.batchSize;
        this.cacheTTLSeconds = Math.ceil(rotationSeconds * this.config.cachePaddingFactor);
        this.cache.options.stdTTL = this.cacheTTLSeconds;
    }
    
    /**
     * Greedy farthest-point spatial sort for uniform early coverage.
     * O(n^2) — trivial for ~150 cameras.
     */
    spatialSort(cameras) {
        const hasCoordsArr = cameras.filter(c => c.lat != null && c.lng != null);
        const noCoords = cameras.filter(c => c.lat == null || c.lng == null);
        if (hasCoordsArr.length === 0) return cameras;

        const sorted = [];
        const remaining = [...hasCoordsArr];

        // Start with first camera
        sorted.push(remaining.shift());

        while (remaining.length > 0) {
            let bestIdx = 0;
            let bestDist = -1;
            for (let i = 0; i < remaining.length; i++) {
                // Min distance to any already-selected camera
                let minDist = Infinity;
                for (const s of sorted) {
                    const dlat = remaining[i].lat - s.lat;
                    const dlng = remaining[i].lng - s.lng;
                    const d = dlat * dlat + dlng * dlng;
                    if (d < minDist) minDist = d;
                }
                if (minDist > bestDist) {
                    bestDist = minDist;
                    bestIdx = i;
                }
            }
            sorted.push(remaining.splice(bestIdx, 1)[0]);
        }

        // Cameras without coords go at the end
        return sorted.concat(noCoords);
    }
    
    /**
     * Run a single analysis cycle (analyze next batch of cameras)
     */
    async runAnalysisCycle() {
        if (this.cameraQueue.length === 0) {
            // No cameras to analyze yet
            return;
        }
        
        const startTime = Date.now();
        
        try {
            // Get next batch of cameras (circular queue)
            const batchSize = Math.min(this.config.batchSize, this.cameraQueue.length);
            const startIndex = (this.currentBatch * this.config.batchSize) % this.cameraQueue.length;
            const endIndex = startIndex + batchSize;
            
            // Handle wrap-around
            let camerasToAnalyze;
            if (endIndex <= this.cameraQueue.length) {
                camerasToAnalyze = this.cameraQueue.slice(startIndex, endIndex);
            } else {
                // Wrap around to beginning of queue
                const firstPart = this.cameraQueue.slice(startIndex);
                const secondPart = this.cameraQueue.slice(0, endIndex - this.cameraQueue.length);
                camerasToAnalyze = [...firstPart, ...secondPart];
            }
            
            console.log(`[${new Date().toISOString()}] Analyzing cameras ${startIndex + 1}-${startIndex + camerasToAnalyze.length} of ${this.cameraQueue.length}...`);
            
            // Analyze this batch
            const results = await this.snowDetectionService.analyzeCamerasBatch(
                camerasToAnalyze,
                this.weatherStations
            );
            
            // Update cache with results
            results.forEach(result => {
                const cacheKey = `camera_${result.cameraId}`;
                this.cache.set(cacheKey, result);
            });
            
            const duration = Date.now() - startTime;
            this.stats.totalAnalyses += camerasToAnalyze.length;
            this.stats.lastAnalysisTime = new Date();
            this.stats.averageAnalysisTime = 
                (this.stats.averageAnalysisTime * (this.stats.totalAnalyses - camerasToAnalyze.length) + duration) / 
                this.stats.totalAnalyses;
            
            console.log(`   ✓ Analyzed ${camerasToAnalyze.length} cameras (${duration}ms)\n`);
            
            // Move to next batch
            this.currentBatch++;
            
            // If we've completed a full rotation, update batch-level cache
            if (this.currentBatch * this.config.batchSize >= this.cameraQueue.length) {
                this.currentBatch = 0;
                this.updateBatchCache();
            }
            
        } catch (error) {
            this.stats.failedAnalyses++;
            console.error(`   ✗ Camera analysis cycle failed: ${error.message}\n`);
        }
    }
    
    /**
     * Update batch-level cache with all current camera results
     */
    updateBatchCache() {
        const allResults = [];
        
        this.cameraQueue.forEach(camera => {
            const cacheKey = `camera_${camera.id}`;
            const result = this.cache.get(cacheKey);
            if (result) {
                allResults.push(result);
            }
        });
        
        // Store complete batch result
        this.cache.set('all_camera_detections', allResults, this.cacheTTLSeconds);
        
        console.log(`   ✓ Updated batch cache: ${allResults.length} cameras`);
    }
    
    /**
     * Get cached camera analysis results
     * Called by roadWeatherService when user requests data
     */
    getCachedResults() {
        // Try to get complete batch first (most efficient)
        const batchResults = this.cache.get('all_camera_detections');
        if (batchResults) {
            this.stats.cacheHits++;
            return batchResults;
        }
        
        // Fall back to individual camera results
        const results = [];
        this.cameraQueue.forEach(camera => {
            const cacheKey = `camera_${camera.id}`;
            const result = this.cache.get(cacheKey);
            if (result) {
                results.push(result);
            }
        });
        
        if (results.length > 0) {
            this.stats.cacheHits++;
            return results;
        }
        
        // No cached results available
        this.stats.cacheMisses++;
        return [];
    }
    
    /**
     * Get scheduler statistics
     */
    getStats() {
        const cacheStats = this.cache.getStats();
        
        return {
            isRunning: this.isRunning,
            cameraQueue: this.cameraQueue.length,
            currentBatch: this.currentBatch,
            totalAnalyses: this.stats.totalAnalyses,
            failedAnalyses: this.stats.failedAnalyses,
            cacheHits: this.stats.cacheHits,
            cacheMisses: this.stats.cacheMisses,
            cacheHitRate: this.stats.cacheHits + this.stats.cacheMisses > 0 
                ? ((this.stats.cacheHits / (this.stats.cacheHits + this.stats.cacheMisses)) * 100).toFixed(1) + '%'
                : 'N/A',
            lastAnalysisTime: this.stats.lastAnalysisTime,
            averageAnalysisTime: Math.round(this.stats.averageAnalysisTime) + 'ms',
            cachedCameras: cacheStats.keys - 1, // Subtract 1 for batch cache key
            estimatedApiCallsPerHour: this.calculateApiCallRate(),
            config: this.config
        };
    }
    
    /**
     * Calculate estimated API calls per hour
     */
    calculateApiCallRate() {
        if (this.cameraQueue.length === 0) return 0;
        
        // Each camera has ~3 views, each view is 1 API call
        const callsPerCamera = 3;
        const camerasPerCycle = this.config.batchSize;
        const cyclesPerHour = (3600 / this.config.intervalSeconds);
        
        // Total calls = cameras per cycle * views per camera * cycles per hour
        return camerasPerCycle * callsPerCamera * cyclesPerHour;
    }
    
    /**
     * Print statistics
     */
    printStats() {
        const stats = this.getStats();
        
        console.log('\n' + '='.repeat(60));
        console.log('Camera Analysis Scheduler Statistics');
        console.log('='.repeat(60));
        console.log(`Status: ${stats.isRunning ? '🟢 Running' : '🔴 Stopped'}`);
        console.log(`Camera Queue: ${stats.cameraQueue} cameras`);
        console.log(`Current Batch: ${stats.currentBatch + 1}`);
        console.log('');
        console.log('Analysis Stats:');
        console.log(`  Total Analyses: ${stats.totalAnalyses}`);
        console.log(`  Failed Analyses: ${stats.failedAnalyses}`);
        console.log(`  Average Time: ${stats.averageAnalysisTime}`);
        console.log(`  Last Analysis: ${stats.lastAnalysisTime ? stats.lastAnalysisTime.toISOString() : 'Never'}`);
        console.log('');
        console.log('Cache Performance:');
        console.log(`  Cache Hits: ${stats.cacheHits}`);
        console.log(`  Cache Misses: ${stats.cacheMisses}`);
        console.log(`  Hit Rate: ${stats.cacheHitRate}`);
        console.log(`  Cached Cameras: ${stats.cachedCameras}`);
        console.log('');
        console.log('Rate Limit:');
        console.log(`  Estimated API Calls/Hour: ${stats.estimatedApiCallsPerHour}`);
        console.log(`  UDOT Rate Limit: 600 calls/hour (10 calls/minute)`);
        console.log(`  Usage: ${((stats.estimatedApiCallsPerHour / 600) * 100).toFixed(1)}% of limit`);
        console.log('');
        console.log('Configuration:');
        console.log(`  Batch Size: ${stats.config.batchSize} cameras`);
        console.log(`  Interval: ${stats.config.intervalSeconds} seconds`);
        console.log(`  Max Retries: ${stats.config.maxRetries}`);
        console.log('='.repeat(60) + '\n');
    }
}

export default CameraAnalysisScheduler;
