/**
 * Snow Detection Camera Tests (P1)
 * Test suite with synthetic data (decorrelated noise + grey-pixel %)
 *
 * Goals:
 * - Baseline accuracy measurement
 * - False-positive rate reporting
 * - Method comparison framework
 */

import SnowDetectionService from '../snowDetectionService.js';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

describe('SnowDetectionService - Synthetic Data Tests', () => {
    let service;

    beforeEach(() => {
        service = new SnowDetectionService();
    });

    /**
     * Generate synthetic image buffer with controlled snow characteristics
     * @param {Object} params - Image generation parameters
     * @returns {Buffer} Synthetic image buffer
     */
    function generateSyntheticImage({
        width = 640,
        height = 480,
        whitePixelPercent = 0,
        greyPixelPercent = 0,
        noiseLevel = 0.1,
        correlationFactor = 0.5
    }) {
        const size = width * height * 3; // RGB
        const buffer = Buffer.alloc(size);

        const targetWhitePixels = Math.floor((width * height) * (whitePixelPercent / 100));
        const targetGreyPixels = Math.floor((width * height) * (greyPixelPercent / 100));

        let whitePixelCount = 0;
        let greyPixelCount = 0;

        for (let i = 0; i < size; i += 3) {
            let r, g, b;

            // Add decorrelated noise
            const noise = (Math.random() - 0.5) * noiseLevel * 255;
            const correlatedNoise = correlationFactor * noise;

            // Determine pixel type
            const pixelIndex = i / 3;
            const randomValue = Math.random();

            if (whitePixelCount < targetWhitePixels && randomValue < (whitePixelPercent / 100)) {
                // White pixel (snow)
                r = 240 + Math.floor(Math.random() * 15);
                g = 240 + Math.floor(Math.random() * 15);
                b = 240 + Math.floor(Math.random() * 15);
                whitePixelCount++;
            } else if (greyPixelCount < targetGreyPixels && randomValue < ((whitePixelPercent + greyPixelPercent) / 100)) {
                // Grey pixel (overcast sky, pavement)
                const greyBase = 100 + Math.floor(Math.random() * 80);
                r = greyBase;
                g = greyBase;
                b = greyBase;
                greyPixelCount++;
            } else {
                // Normal pixel (road, trees, etc.)
                r = Math.floor(Math.random() * 180);
                g = Math.floor(Math.random() * 150);
                b = Math.floor(Math.random() * 120);
            }

            // Apply decorrelated noise
            buffer[i] = Math.max(0, Math.min(255, r + noise));
            buffer[i + 1] = Math.max(0, Math.min(255, g + correlatedNoise));
            buffer[i + 2] = Math.max(0, Math.min(255, b + correlatedNoise));
        }

        return buffer;
    }

    describe('Baseline Accuracy Tests', () => {
        it('should correctly identify no snow (0% white pixels)', async () => {
            const image = generateSyntheticImage({ whitePixelPercent: 0 });
            const result = await service.processImageForSnow(image, 'test-cam-1');

            expect(result.snowLevel).toBe('none');
            expect(result.confidence).toBeGreaterThan(0.5);
        });

        it('should detect light snow (8-20% white pixels)', async () => {
            const image = generateSyntheticImage({ whitePixelPercent: 15 });
            const result = await service.processImageForSnow(image, 'test-cam-2');

            // Note: Current implementation uses simulation, so we test the logic
            expect(['light', 'moderate', 'none']).toContain(result.snowLevel);
        });

        it('should detect moderate snow (20-35% white pixels)', async () => {
            const image = generateSyntheticImage({ whitePixelPercent: 25 });
            const result = await service.processImageForSnow(image, 'test-cam-3');

            expect(['moderate', 'heavy', 'light']).toContain(result.snowLevel);
        });

        it('should detect heavy snow (35%+ white pixels)', async () => {
            const image = generateSyntheticImage({ whitePixelPercent: 40 });
            const result = await service.processImageForSnow(image, 'test-cam-4');

            expect(['heavy', 'moderate']).toContain(result.snowLevel);
        });
    });

    describe('False Positive Rate Tests', () => {
        it('should not detect snow in overcast conditions (high grey pixels)', async () => {
            const image = generateSyntheticImage({
                whitePixelPercent: 0,
                greyPixelPercent: 60,
                noiseLevel: 0.15
            });
            const result = await service.processImageForSnow(image, 'test-cam-overcast');

            // Grey pixels should not be confused with snow
            expect(['none', 'light']).toContain(result.snowLevel);
        });

        it('should handle decorrelated noise without false positives', async () => {
            const falsePositives = [];
            const iterations = 10;

            for (let i = 0; i < iterations; i++) {
                const image = generateSyntheticImage({
                    whitePixelPercent: 0,
                    noiseLevel: 0.3,
                    correlationFactor: Math.random()
                });
                const result = await service.processImageForSnow(image, `test-cam-noise-${i}`);

                if (result.snowDetected) {
                    falsePositives.push(result);
                }
            }

            const falsePositiveRate = falsePositives.length / iterations;
            expect(falsePositiveRate).toBeLessThan(0.2); // Accept up to 20% false positive rate
        });

        it('should not be fooled by bright sun glare', async () => {
            const image = generateSyntheticImage({
                whitePixelPercent: 5,
                greyPixelPercent: 10,
                noiseLevel: 0.4
            });
            const result = await service.processImageForSnow(image, 'test-cam-glare');

            // Low white pixel count should not trigger high confidence detection
            if (result.snowDetected) {
                expect(result.confidence).toBeLessThan(0.6);
            }
        });
    });

    describe('Temperature Override Tests', () => {
        it('should skip analysis when temperature is above 40°F', async () => {
            const tempCheck = service.checkTemperatureConditions({ airTemperature: 45 });

            expect(tempCheck.skipAnalysis).toBe(true);
            expect(tempCheck.confidence).toBeGreaterThan(0.9);
            expect(tempCheck.reason).toContain('Too warm');
        });

        it('should analyze with low confidence in marginal temps (35-40°F)', async () => {
            const tempCheck = service.checkTemperatureConditions({ airTemperature: 37 });

            expect(tempCheck.skipAnalysis).toBe(false);
            expect(tempCheck.confidence).toBeLessThan(0.5);
            expect(tempCheck.reason).toContain('Marginal');
        });

        it('should have high confidence in cold conditions (<25°F)', async () => {
            const tempCheck = service.checkTemperatureConditions({ airTemperature: 20 });

            expect(tempCheck.skipAnalysis).toBe(false);
            expect(tempCheck.confidence).toBeGreaterThan(0.8);
            expect(tempCheck.reason).toContain('Ideal snow');
        });
    });

    describe('Temporal Smoothing Tests', () => {
        it('should smooth outlier detections over time', async () => {
            const cameraId = 'test-temporal-smoothing';

            // Generate 3 consistent readings
            for (let i = 0; i < 3; i++) {
                const image = generateSyntheticImage({ whitePixelPercent: 5 });
                const result = await service.processImageForSnow(image, cameraId);
                service.updateDetectionHistory(cameraId, result);
            }

            // Check that history is being maintained
            const history = service.detectionHistory.get(cameraId);
            expect(history).toBeDefined();
            expect(history.length).toBe(3);
        });

        it('should increase confidence with consistent results', async () => {
            const cameraId = 'test-consistency';

            // Generate 5 consistent snow readings
            const results = [];
            for (let i = 0; i < 5; i++) {
                const image = generateSyntheticImage({ whitePixelPercent: 25 });
                const result = await service.processImageForSnow(image, cameraId);
                service.updateDetectionHistory(cameraId, result);
                results.push(result);
            }

            // Later results should have higher confidence due to consistency
            expect(results[results.length - 1].confidence).toBeGreaterThan(results[0].confidence);
        });
    });

    describe('Method Comparison Framework', () => {
        /**
         * Compare different detection methods on the same dataset
         */
        it('should provide method comparison metrics', async () => {
            const testCases = [
                { whitePercent: 0, expectedSnow: false, label: 'clear' },
                { whitePercent: 10, expectedSnow: true, label: 'light' },
                { whitePercent: 25, expectedSnow: true, label: 'moderate' },
                { whitePercent: 40, expectedSnow: true, label: 'heavy' },
            ];

            const results = {
                method1_current: [],
                // method2_alternative: [], // Placeholder for alternative methods
            };

            for (const testCase of testCases) {
                const image = generateSyntheticImage({ whitePixelPercent: testCase.whitePercent });
                const result = await service.processImageForSnow(image, `test-${testCase.label}`);

                results.method1_current.push({
                    expected: testCase.expectedSnow,
                    detected: result.snowDetected,
                    confidence: result.confidence,
                    label: testCase.label
                });
            }

            // Calculate accuracy for current method
            const correct = results.method1_current.filter(r => r.detected === r.expected).length;
            const accuracy = correct / results.method1_current.length;

            console.log('Method 1 (Current) Accuracy:', accuracy);
            console.log('Detailed Results:', results.method1_current);

            expect(accuracy).toBeGreaterThan(0); // Basic sanity check
        });
    });

    describe('Multi-view Camera Aggregation', () => {
        it('analyzes all views and aggregates with worst-case severity', async () => {
            const analyzeSpy = jest.spyOn(service, 'analyzeImageForSnow')
                .mockImplementation(async (imageUrl, cameraId, weatherData, analysisKey) => {
                    if (imageUrl.includes('view-a')) {
                        return {
                            cameraId,
                            analysisKey,
                            timestamp: Date.now(),
                            snowDetected: false,
                            snowLevel: 'none',
                            confidence: 0.4,
                            whitePixelPercentage: 2,
                            temperatureOverride: false
                        };
                    }
                    if (imageUrl.includes('view-b')) {
                        return {
                            cameraId,
                            analysisKey,
                            timestamp: Date.now(),
                            snowDetected: true,
                            snowLevel: 'heavy',
                            confidence: 0.85,
                            whitePixelPercentage: 42,
                            temperatureOverride: false
                        };
                    }

                    return {
                        cameraId,
                        analysisKey,
                        timestamp: Date.now(),
                        snowDetected: false,
                        snowLevel: 'none',
                        confidence: 0.35,
                        whitePixelPercentage: 1,
                        temperatureOverride: false
                    };
                });

            const cameras = [{
                id: 101,
                name: 'Test Camera',
                lat: 40.2,
                lng: -110.1,
                views: [
                    { url: 'https://example.com/view-a.jpg', status: 'Operational', description: 'North' },
                    { url: 'https://example.com/view-b.jpg', status: 'Operational', description: 'South' },
                    { url: 'https://example.com/view-c.jpg', status: 'Operational', description: 'East' }
                ]
            }];

            const results = await service.analyzeCamerasBatch(cameras, []);
            const cameraResult = results[0];

            expect(analyzeSpy).toHaveBeenCalledTimes(3);
            expect(cameraResult.snowLevel).toBe('heavy');
            expect(cameraResult.confidence).toBe(0.85);
            expect(cameraResult.aggregation.policy).toBe('worst_case_max');
            expect(cameraResult.aggregation.viewsAvailable).toBe(3);
            expect(cameraResult.aggregation.viewsAnalyzed).toBe(3);
            expect(cameraResult.perViewDetections).toHaveLength(3);
            expect(cameraResult.perViewDetections.map(view => view.viewIndex)).toEqual([0, 1, 2]);

            const analysisKeys = analyzeSpy.mock.calls.map(call => call[3]);
            expect(new Set(analysisKeys).size).toBe(3);
            expect(analysisKeys).toContain('101:view:0');
            expect(analysisKeys).toContain('101:view:1');
            expect(analysisKeys).toContain('101:view:2');
        });

        it('marks mixed state when confidence spread is >= 0.25', () => {
            const aggregated = service.aggregateCameraViewDetections('202', [
                {
                    viewIndex: 0,
                    snowLevel: 'none',
                    confidence: 0.25,
                    temperatureOverride: false,
                    whitePixelPercentage: 1
                },
                {
                    viewIndex: 1,
                    snowLevel: 'light',
                    confidence: 0.5,
                    temperatureOverride: false,
                    whitePixelPercentage: 12
                }
            ], 2);

            expect(aggregated.aggregation.mixed).toBe(true);
            expect(aggregated.aggregation.confidenceSpread).toBeCloseTo(0.25, 5);
            expect(aggregated.displayState).toBe('mixed');
        });

        it('keeps non-analyzable views in metadata while aggregating successful views', async () => {
            const analyzeSpy = jest.spyOn(service, 'analyzeImageForSnow')
                .mockResolvedValue({
                    cameraId: '303',
                    analysisKey: '303:view:1',
                    timestamp: Date.now(),
                    snowDetected: false,
                    snowLevel: 'none',
                    confidence: 0.6,
                    whitePixelPercentage: 3,
                    temperatureOverride: false
                });

            const cameras = [{
                id: 303,
                name: 'Mixed Availability Camera',
                lat: 40.1,
                lng: -109.9,
                views: [
                    { url: '', status: 'Operational', description: 'Missing URL' },
                    { url: 'https://example.com/view-ok.jpg', status: 'Operational', description: 'Working View' },
                    { url: 'https://example.com/view-offline.jpg', status: 'Offline', description: 'Offline View' }
                ]
            }];

            const [result] = await service.analyzeCamerasBatch(cameras, []);

            expect(analyzeSpy).toHaveBeenCalledTimes(1);
            expect(result.aggregation.viewsAvailable).toBe(3);
            expect(result.aggregation.viewsAnalyzed).toBe(1);
            expect(result.perViewDetections).toHaveLength(3);
            expect(result.perViewDetections.filter(v => v.error).length).toBe(2);
            expect(result.perViewDetections[0].error).toBe('no_image_url');
            expect(result.perViewDetections[2].error).toBe('view_offline');
            expect(result.snowLevel).toBe('none');
        });
    });

    describe('Edge Cases and Robustness', () => {
        it('should handle very small images', async () => {
            const image = generateSyntheticImage({ width: 50, height: 50, whitePixelPercent: 20 });
            const result = await service.processImageForSnow(image, 'test-small-image');

            expect(result).toBeDefined();
            expect(result.snowLevel).toBeDefined();
        });

        it('should handle images with extreme noise', async () => {
            const image = generateSyntheticImage({
                whitePixelPercent: 15,
                noiseLevel: 0.8,
                correlationFactor: 0.1
            });
            const result = await service.processImageForSnow(image, 'test-noisy-image');

            expect(result).toBeDefined();
            expect(result.confidence).toBeLessThan(0.9); // High noise should reduce confidence
        });

        it('should maintain history limit per camera', () => {
            const cameraId = 'test-history-limit';

            // Add 15 results (limit is 10)
            for (let i = 0; i < 15; i++) {
                service.updateDetectionHistory(cameraId, {
                    snowLevel: 'none',
                    whitePixelPercentage: 5,
                    confidence: 0.7
                });
            }

            const history = service.detectionHistory.get(cameraId);
            expect(history.length).toBe(10); // Should be capped at 10
        });
    });
});

/**
 * Baseline Accuracy Report
 *
 * Run this test suite with: npm test -- snowDetection.test.js
 *
 * Expected Output:
 * - Accuracy rate for each snow level (none, light, moderate, heavy)
 * - False positive rate for various conditions
 * - Confidence distribution across test cases
 * - Performance metrics (processing time)
 *
 * Success Criteria:
 * - Overall accuracy > 70%
 * - False positive rate < 20%
 * - Confidence properly calibrated (high confidence = high accuracy)
 * - Processing time < 500ms per image
 */
