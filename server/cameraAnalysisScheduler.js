/**
 * Camera Analysis Scheduler
 * 
 * Staggered camera snow detection analysis to avoid UDOT API rate limits.
 * 
 * Problem: Analyzing all 20-30 cameras on every request = 60-90 API calls
 * Solution: Analyze 1 camera every 30 seconds in background, keep restart-safe cached results
 * 
 * Rate Limit: UDOT allows 10 calls/60 seconds (600 calls/hour)
 * Our usage: ~1 camera * 3 views every 30s = ~3 calls/30s = ~360 calls/hour (60% of limit)
 * 
 * Features:
 * - Dynamic cache TTL based on full camera rotation time
 * - Staggered analysis (1 camera every 30 seconds)
 * - Keep all 3 views per camera (multi-view consensus)
 * - Persist/restore detections across restarts
 * - User requests served from cache (instant, no API calls)
 */

import NodeCache from 'node-cache';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import SnowDetectionService from './snowDetectionService.js';

const DEFAULT_CACHE_TTL_SECONDS = 600;
const PERSISTED_CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const CACHE_DIR = path.join(process.cwd(), '.cache');
const PERSISTED_CACHE_FILE = path.join(CACHE_DIR, 'camera_detections.json');

class CameraAnalysisScheduler {
    constructor(options = {}) {
        this.snowDetectionService = new SnowDetectionService();
        this.enablePersistence = options.enablePersistence ?? process.env.NODE_ENV !== 'test';
        
        // Cache for complete camera analysis results (10 minute TTL)
        this.cache = new NodeCache({ stdTTL: DEFAULT_CACHE_TTL_SECONDS, checkperiod: 60 });
        this.cacheTTLSeconds = DEFAULT_CACHE_TTL_SECONDS;
        
        // Queue of cameras to analyze
        this.cameraQueue = [];
        this.weatherStations = [];
        
        // Analysis state
        this.isRunning = false;
        this.analysisInterval = null;
        this.currentBatch = 0;
        
        // Configuration
        this.config = {
            batchSize: 1,           // Analyze 1 camera per cycle (conservative for rate limits)
            intervalSeconds: 30,    // Run every 30 seconds
            maxRetries: 3,          // Retry failed analyses
            baseCacheTTLSeconds: DEFAULT_CACHE_TTL_SECONDS,
            rotationBufferSeconds: 600
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

        // Warm-restore state for startup diagnostics
        this.warmRestore = {
            enabled: this.enablePersistence,
            restoredFromDisk: false,
            restoredDetectionsCount: 0,
            restoredSnapshotSavedAt: null,
            restoredSnapshotAgeMinutes: null,
            restoredAt: null,
            skippedStaleSnapshot: false,
            restoreError: null
        };

        if (this.enablePersistence) {
            this.restorePersistedDetections();
        }
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
        console.log(`   Analyzing ${this.config.batchSize} camera(s) every ${this.config.intervalSeconds}s`);
        console.log(`   Results cached for up to ${Math.ceil(this.cacheTTLSeconds / 60)} minutes`);
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

        if (this.enablePersistence) {
            this.persistCachedResults().catch((error) => {
                console.warn(`   ⚠️ Failed to persist camera detections on stop: ${error.message}`);
            });
        }
        
        console.log('✓ Camera analysis scheduler stopped\n');
    }
    
    /**
     * Update camera list and weather stations
     * Called by background refresh service when new data arrives
     */
    updateCameraList(cameras, weatherStations = []) {
        const previousCameraCount = this.cameraQueue.length;
        const previousTTL = this.cacheTTLSeconds;

        this.cameraQueue = cameras;
        this.weatherStations = weatherStations;
        this.cacheTTLSeconds = this.calculateCacheTTLSeconds(cameras.length);
        
        console.log(`   Updated camera queue: ${cameras.length} cameras`);

        if (previousCameraCount !== cameras.length || previousTTL !== this.cacheTTLSeconds) {
            console.log(`   Camera detection TTL: ${Math.ceil(this.cacheTTLSeconds / 60)} minutes`);
        }
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
                this.cache.set(cacheKey, result, this.cacheTTLSeconds);
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

            if (this.enablePersistence) {
                this.persistCachedResults().catch((error) => {
                    console.warn(`   ⚠️ Failed to persist camera detections: ${error.message}`);
                });
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
        
        // Store complete batch result with dynamic cache TTL
        this.cache.set('all_camera_detections', allResults, this.cacheTTLSeconds);
        
        console.log(`   ✓ Updated batch cache: ${allResults.length} cameras`);
    }
    
    /**
     * Get cached camera analysis results
     * Called by roadWeatherService when user requests data
     */
    getCachedResults() {
        const results = this.getCachedResultsSnapshot();

        if (results.length > 0) {
            this.stats.cacheHits++;
            return results;
        }
        
        // No cached results available
        this.stats.cacheMisses++;
        return [];
    }

    /**
     * Read cached detections without mutating cache hit/miss statistics.
     */
    getCachedResultsSnapshot() {
        const batchResults = this.filterDetectionsForActiveCameras(this.cache.get('all_camera_detections'));
        const individualResults = this.getIndividualCachedResults();

        if (batchResults.length === 0) {
            return individualResults;
        }

        if (individualResults.length === 0) {
            return batchResults;
        }

        const mergedResults = new Map(batchResults.map((result) => [result.cameraId, result]));
        individualResults.forEach((result) => {
            mergedResults.set(result.cameraId, result);
        });

        if (this.cameraQueue.length > 0) {
            return this.cameraQueue
                .map((camera) => mergedResults.get(camera.id.toString()))
                .filter(Boolean);
        }

        return Array.from(mergedResults.values());
    }

    /**
     * Calculate cache TTL based on full camera rotation time.
     * Ensures detections do not expire before the scheduler cycles back.
     */
    calculateCacheTTLSeconds(cameraCount = this.cameraQueue.length) {
        if (cameraCount <= 0) {
            return this.config.baseCacheTTLSeconds;
        }

        const cyclesPerRotation = Math.ceil(cameraCount / this.config.batchSize);
        const fullRotationSeconds = cyclesPerRotation * this.config.intervalSeconds;

        return Math.max(
            this.config.baseCacheTTLSeconds,
            fullRotationSeconds + this.config.rotationBufferSeconds
        );
    }

    /**
     * Normalize detection shape and ensure consistent camera ID formatting.
     */
    normalizeDetection(detection) {
        if (!detection || detection.cameraId === undefined || detection.cameraId === null) {
            return null;
        }

        return {
            ...detection,
            cameraId: detection.cameraId.toString()
        };
    }

    /**
     * Filter detections to active cameras when camera list is available.
     */
    filterDetectionsForActiveCameras(detections) {
        if (!Array.isArray(detections) || detections.length === 0) {
            return [];
        }

        const normalizedDetections = detections
            .map((detection) => this.normalizeDetection(detection))
            .filter(Boolean);

        if (this.cameraQueue.length === 0) {
            return normalizedDetections;
        }

        const activeCameraIds = new Set(this.cameraQueue.map((camera) => camera.id.toString()));
        return normalizedDetections.filter((detection) => activeCameraIds.has(detection.cameraId));
    }

    /**
     * Collect individual camera detections from cache.
     */
    getIndividualCachedResults() {
        const results = [];
        const seen = new Set();

        const cameraIds = this.cameraQueue.length > 0
            ? this.cameraQueue.map((camera) => camera.id.toString())
            : this.cache.keys()
                .filter((key) => key.startsWith('camera_'))
                .map((key) => key.replace('camera_', ''));

        cameraIds.forEach((cameraId) => {
            if (seen.has(cameraId)) {
                return;
            }

            const result = this.normalizeDetection(this.cache.get(`camera_${cameraId}`));
            if (result) {
                seen.add(cameraId);
                results.push(result);
            }
        });

        return results;
    }

    /**
     * Restore persisted detections from disk to avoid gray icons after restart.
     */
    restorePersistedDetections() {
        try {
            if (!fsSync.existsSync(PERSISTED_CACHE_FILE)) {
                return;
            }

            const fileContent = fsSync.readFileSync(PERSISTED_CACHE_FILE, 'utf8');
            const payload = JSON.parse(fileContent);

            if (!payload || !Array.isArray(payload.detections) || payload.detections.length === 0) {
                return;
            }

            const savedAt = Number(payload.savedAt);
            if (savedAt && (Date.now() - savedAt) > PERSISTED_CACHE_MAX_AGE_MS) {
                this.warmRestore.skippedStaleSnapshot = true;
                this.warmRestore.restoredSnapshotSavedAt = new Date(savedAt).toISOString();
                this.warmRestore.restoredSnapshotAgeMinutes = Math.round((Date.now() - savedAt) / (1000 * 60));
                console.log('   Cached camera detections on disk are stale; skipping restore');
                return;
            }

            const restoredDetections = payload.detections
                .map((detection) => this.normalizeDetection(detection))
                .filter(Boolean);

            if (restoredDetections.length === 0) {
                return;
            }

            const persistedTTL = Number(payload.ttlSeconds);
            const restoredTTL = Math.max(
                this.config.baseCacheTTLSeconds,
                Number.isFinite(persistedTTL) ? persistedTTL : this.config.baseCacheTTLSeconds
            );

            this.cacheTTLSeconds = restoredTTL;

            restoredDetections.forEach((result) => {
                this.cache.set(`camera_${result.cameraId}`, result, restoredTTL);
            });
            this.cache.set('all_camera_detections', restoredDetections, restoredTTL);

            const ageMinutes = savedAt
                ? Math.round((Date.now() - savedAt) / (1000 * 60))
                : 'unknown';

            this.warmRestore.restoredFromDisk = true;
            this.warmRestore.restoredDetectionsCount = restoredDetections.length;
            this.warmRestore.restoredSnapshotSavedAt = savedAt ? new Date(savedAt).toISOString() : null;
            this.warmRestore.restoredSnapshotAgeMinutes = Number.isFinite(ageMinutes) ? ageMinutes : null;
            this.warmRestore.restoredAt = new Date().toISOString();
            this.warmRestore.restoreError = null;

            console.log(`   ✓ Restored ${restoredDetections.length} camera detections from disk cache (age: ${ageMinutes} min)`);
        } catch (error) {
            this.warmRestore.restoreError = error.message;
            console.warn(`   ⚠️ Failed to restore camera detections from disk: ${error.message}`);
        }
    }

    /**
     * Persist cached detections to disk for restart-safe warm state.
     */
    async persistCachedResults() {
        const detections = this.getCachedResultsSnapshot();
        if (detections.length === 0) {
            return;
        }

        try {
            await fs.mkdir(CACHE_DIR, { recursive: true });
            const payload = {
                savedAt: Date.now(),
                ttlSeconds: this.cacheTTLSeconds,
                detections
            };

            await fs.writeFile(PERSISTED_CACHE_FILE, JSON.stringify(payload), 'utf8');
        } catch (error) {
            console.warn(`   ⚠️ Failed to save camera detections to disk: ${error.message}`);
        }
    }
    
    /**
     * Get scheduler statistics
     */
    getStats() {
        const cacheStats = this.cache.getStats();
        const hasBatchCache = Boolean(this.cache.get('all_camera_detections'));
        
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
            cachedCameras: Math.max(0, cacheStats.keys - (hasBatchCache ? 1 : 0)),
            cacheTTLMinutes: Math.ceil(this.cacheTTLSeconds / 60),
            warmRestore: { ...this.warmRestore },
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
        console.log(`  Cache TTL: ${stats.cacheTTLMinutes} minutes`);
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
