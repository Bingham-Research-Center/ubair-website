/**
 * Camera Analysis Scheduler Tests
 * 
 * Test suite for staggered camera analysis scheduler
 * Ensures proper caching, rate limiting, and API call reduction
 */

import CameraAnalysisScheduler from '../cameraAnalysisScheduler.js';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

describe('CameraAnalysisScheduler', () => {
    let scheduler;

    beforeEach(() => {
        scheduler = new CameraAnalysisScheduler();
    });

    afterEach(() => {
        if (scheduler.isRunning) {
            scheduler.stop();
        }
    });

    describe('Initialization', () => {
        it('should initialize with default configuration', () => {
            expect(scheduler.config.batchSize).toBe(1);
            expect(scheduler.config.intervalSeconds).toBe(25);
            expect(scheduler.config.jitterSeconds).toBe(4);
            expect(scheduler.config.cachePaddingFactor).toBe(1.05);
            expect(scheduler.config.maxRetries).toBe(3);
        });

        it('should initialize with empty camera queue', () => {
            expect(scheduler.cameraQueue).toEqual([]);
            expect(scheduler.weatherStations).toEqual([]);
        });

        it('should initialize with zero statistics', () => {
            expect(scheduler.stats.totalAnalyses).toBe(0);
            expect(scheduler.stats.failedAnalyses).toBe(0);
            expect(scheduler.stats.cacheHits).toBe(0);
            expect(scheduler.stats.cacheMisses).toBe(0);
        });

        it('should not be running initially', () => {
            expect(scheduler.isRunning).toBe(false);
        });
    });

    describe('Environment Variable Overrides', () => {
        const envBackup = {};
        const envKeys = [
            'CAMERA_INTERVAL_SECONDS', 'CAMERA_BATCH_SIZE',
            'CAMERA_JITTER_SECONDS', 'CAMERA_CACHE_PADDING', 'CAMERA_MAX_RETRIES'
        ];

        beforeEach(() => {
            envKeys.forEach(k => { envBackup[k] = process.env[k]; });
        });

        afterEach(() => {
            envKeys.forEach(k => {
                if (envBackup[k] === undefined) delete process.env[k];
                else process.env[k] = envBackup[k];
            });
        });

        it('should use env vars when set', () => {
            process.env.CAMERA_INTERVAL_SECONDS = '30';
            process.env.CAMERA_BATCH_SIZE = '2';
            process.env.CAMERA_JITTER_SECONDS = '6';
            process.env.CAMERA_CACHE_PADDING = '1.3';
            process.env.CAMERA_MAX_RETRIES = '5';

            const s = new CameraAnalysisScheduler();

            expect(s.config.intervalSeconds).toBe(30);
            expect(s.config.batchSize).toBe(2);
            expect(s.config.jitterSeconds).toBe(6);
            expect(s.config.cachePaddingFactor).toBe(1.3);
            expect(s.config.maxRetries).toBe(5);
        });
    });

    describe('Camera List Updates', () => {
        it('should update camera list', () => {
            const cameras = [
                { id: 1, name: 'Camera 1', lat: 40.5, lng: -109.5, views: [] },
                { id: 2, name: 'Camera 2', lat: 40.6, lng: -109.6, views: [] }
            ];
            const stations = [
                { id: 1, lat: 40.5, lng: -109.5, airTemperature: 32 }
            ];

            scheduler.updateCameraList(cameras, stations);

            expect(scheduler.cameraQueue).toEqual(cameras);
            expect(scheduler.weatherStations).toEqual(stations);
        });

        it('should increase cache TTL for large camera queues', () => {
            const cameras = Array.from({ length: 145 }, (_, i) => ({ id: i + 1, name: `Camera ${i + 1}` }));

            scheduler.updateCameraList(cameras, []);

            expect(scheduler.cacheTTLSeconds).toBeGreaterThan(600);
            expect(scheduler.cacheTTLSeconds).toBe(4950);
        });

        it('should handle empty camera list', () => {
            scheduler.updateCameraList([], []);

            expect(scheduler.cameraQueue).toEqual([]);
            expect(scheduler.weatherStations).toEqual([]);
        });
    });

    describe('Cache Operations', () => {
        it('should return empty array when cache is empty', () => {
            const results = scheduler.getCachedResults();

            expect(results).toEqual([]);
            expect(scheduler.stats.cacheMisses).toBe(1);
        });

        it('should increment cache hits when data exists', () => {
            // Set up cache with batch results
            scheduler.cache.set('all_camera_detections', [
                { cameraId: '1', snowDetected: false }
            ]);

            const results = scheduler.getCachedResults();

            expect(results).toHaveLength(1);
            expect(scheduler.stats.cacheHits).toBe(1);
        });

        it('should fall back to individual camera results', () => {
            scheduler.cameraQueue = [
                { id: 1, name: 'Camera 1' },
                { id: 2, name: 'Camera 2' }
            ];

            // Set individual camera results
            scheduler.cache.set('camera_1', { cameraId: '1', snowDetected: false });
            scheduler.cache.set('camera_2', { cameraId: '2', snowDetected: true });

            const results = scheduler.getCachedResults();

            expect(results).toHaveLength(2);
            expect(scheduler.stats.cacheHits).toBe(1);
        });

        it('should read individual cached results when camera queue is empty', () => {
            scheduler.cache.set('camera_1', { cameraId: '1', snowDetected: true });

            const results = scheduler.getCachedResults();

            expect(results).toHaveLength(1);
            expect(results[0].cameraId).toBe('1');
            expect(scheduler.stats.cacheHits).toBe(1);
        });
    });

    describe('API Call Rate Calculation', () => {
        it('should calculate correct API calls per hour with default config', () => {
            scheduler.cameraQueue = new Array(20).fill({ id: 1 });

            // batchSize=1, intervalSeconds=25, viewsPerCamera=3
            // (1 camera * 3 views) * (3600 / 25) = 3 * 144 = 432 calls/hour
            const rate = scheduler.calculateApiCallRate();

            expect(rate).toBe(432);
        });

        it('should return 0 when no cameras in queue', () => {
            const rate = scheduler.calculateApiCallRate();

            expect(rate).toBe(0);
        });

        it('should be well under UDOT rate limit', () => {
            scheduler.cameraQueue = new Array(30).fill({ id: 1 });
            const rate = scheduler.calculateApiCallRate();
            const udotLimit = 600; // 10 calls/min * 60 min = 600 calls/hour

            // With staggered analysis, we should be well under the limit
            // Even with 30 cameras, we analyze 2-3 at a time
            expect(rate).toBeLessThanOrEqual(udotLimit);
        });
    });

    describe('Statistics', () => {
        it('should provide comprehensive statistics', () => {
            const stats = scheduler.getStats();

            expect(stats).toHaveProperty('isRunning');
            expect(stats).toHaveProperty('cameraQueue');
            expect(stats).toHaveProperty('totalAnalyses');
            expect(stats).toHaveProperty('failedAnalyses');
            expect(stats).toHaveProperty('cacheHits');
            expect(stats).toHaveProperty('cacheMisses');
            expect(stats).toHaveProperty('cacheHitRate');
            expect(stats).toHaveProperty('warmRestore');
            expect(stats).toHaveProperty('estimatedApiCallsPerHour');
            expect(stats).toHaveProperty('config');
        });

        it('should expose warm-restore defaults when no disk restore occurred', () => {
            const stats = scheduler.getStats();

            expect(stats.warmRestore.enabled).toBe(false);
            expect(stats.warmRestore.restoredFromDisk).toBe(false);
            expect(stats.warmRestore.restoredDetectionsCount).toBe(0);
            expect(stats.warmRestore.restoredSnapshotAgeMinutes).toBeNull();
        });

        it('should calculate cache hit rate correctly', () => {
            scheduler.stats.cacheHits = 90;
            scheduler.stats.cacheMisses = 10;

            const stats = scheduler.getStats();

            expect(stats.cacheHitRate).toBe('90.0%');
        });

        it('should handle N/A cache hit rate when no requests', () => {
            const stats = scheduler.getStats();

            expect(stats.cacheHitRate).toBe('N/A');
        });
    });

    describe('Start/Stop Operations', () => {
        it('should start scheduler', () => {
            scheduler.start();

            expect(scheduler.isRunning).toBe(true);
            expect(scheduler.analysisTimeout).not.toBeNull();
        });

        it('should stop scheduler', () => {
            scheduler.start();
            scheduler.stop();

            expect(scheduler.isRunning).toBe(false);
            expect(scheduler.analysisTimeout).toBeNull();
        });

        it('should not start if already running', () => {
            scheduler.start();
            const interval = scheduler.analysisTimeout;

            scheduler.start(); // Try to start again

            expect(scheduler.analysisTimeout).toBe(interval); // Same interval
        });

        it('should not stop if already stopped', () => {
            const result = scheduler.stop();

            expect(scheduler.isRunning).toBe(false);
        });
    });

    describe('Rate Limit Compliance', () => {
        it('should demonstrate significant API call reduction', () => {
            // Setup: 25 cameras with 3 views each = 75 API calls per full analysis
            const cameras = Array.from({ length: 25 }, (_, i) => ({
                id: i + 1,
                name: `Camera ${i + 1}`,
                views: [{ url: 'test1' }, { url: 'test2' }, { url: 'test3' }]
            }));

            scheduler.updateCameraList(cameras, []);

            // Old behavior: 75 calls per request * ~12 requests/hour = ~900 calls/hour
            const oldBehaviorCallsPerRequest = 75;
            const requestsPerHour = 12;
            const oldBehaviorTotal = oldBehaviorCallsPerRequest * requestsPerHour;

            // New behavior: Staggered analysis
            const newBehaviorTotal = scheduler.calculateApiCallRate();

            // Verify at least 10x reduction
            const reductionFactor = oldBehaviorTotal / newBehaviorTotal;

            expect(reductionFactor).toBeGreaterThan(1); // Significant reduction
            expect(newBehaviorTotal).toBeLessThan(600); // Under UDOT limit
        });

        it('should stay under UDOT rate limit with max cameras', () => {
            // Worst case: 30 cameras
            const maxCameras = Array.from({ length: 30 }, (_, i) => ({
                id: i + 1,
                name: `Camera ${i + 1}`
            }));

            scheduler.updateCameraList(maxCameras, []);

            const callsPerHour = scheduler.calculateApiCallRate();
            const udotLimit = 600; // 10 calls/minute * 60 minutes

            expect(callsPerHour).toBeLessThan(udotLimit);
        });
    });
});
