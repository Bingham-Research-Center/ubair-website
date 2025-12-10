/**
 * Camera Analysis Scheduler
 * 
 * Staggered camera snow detection analysis to avoid UDOT API rate limits.
 * 
 * Problem: Analyzing all 20-30 cameras on every request = 60-90 API calls
 * Solution: Analyze 1-2 cameras every 30 seconds in background, cache results for 10 minutes
 * 
 * Rate Limit: UDOT allows 10 calls/60 seconds (600 calls/hour)
 * Our usage: ~1-2 cameras * 3 views every 30s = ~3-6 calls/30s = ~360 calls/hour (well under limit)
 * 
 * Features:
 * - Batch-level caching (10 minute TTL)
 * - Staggered analysis (1-2 cameras every 30 seconds)
 * - Keep all 3 views per camera (multi-view consensus)
 * - User requests served from cache (instant, no API calls)
 */

import NodeCache from 'node-cache';
import SnowDetectionService from './snowDetectionService.js';

class CameraAnalysisScheduler {
    constructor() {
        this.snowDetectionService = new SnowDetectionService();
        
        // Cache for complete camera analysis results (10 minute TTL)
        this.cache = new NodeCache({ stdTTL: 600, checkperiod: 60 });
        
        // Queue of cameras to analyze
        this.cameraQueue = [];
        this.weatherStations = [];
        
        // Analysis state
        this.isRunning = false;
        this.analysisInterval = null;
        this.currentBatch = 0;
        
        // Configuration
        this.config = {
            batchSize: 1,           // Analyze 1-2 cameras per cycle (conservative for rate limits)
            intervalSeconds: 30,    // Run every 30 seconds
            maxRetries: 3           // Retry failed analyses
        };
        
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
        console.log(`   Analyzing ${this.config.batchSize}-${this.config.batchSize + 1} cameras every ${this.config.intervalSeconds}s`);
        console.log('   Results cached for 10 minutes');
        console.log('   All 3 camera views analyzed for multi-view consensus\n');
        
        this.isRunning = true;
        
        // Run analysis immediately, then every 30 seconds
        this.runAnalysisCycle();
        
        this.analysisInterval = setInterval(() => {
            this.runAnalysisCycle();
        }, this.config.intervalSeconds * 1000);
        
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
        
        if (this.analysisInterval) {
            clearInterval(this.analysisInterval);
            this.analysisInterval = null;
        }
        
        this.isRunning = false;
        
        console.log('✓ Camera analysis scheduler stopped\n');
    }
    
    /**
     * Update camera list and weather stations
     * Called by background refresh service when new data arrives
     */
    updateCameraList(cameras, weatherStations = []) {
        this.cameraQueue = cameras;
        this.weatherStations = weatherStations;
        
        console.log(`   Updated camera queue: ${cameras.length} cameras`);
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
        
        // Store complete batch result with 10 minute cache
        this.cache.set('all_camera_detections', allResults, 600);
        
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
