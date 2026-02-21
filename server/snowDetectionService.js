import fetch from 'node-fetch';
import NodeCache from 'node-cache';
import jpegjs from 'jpeg-js';
import pngjs from 'pngjs';
import gifuct from 'gifuct-js';
import {
    getConfidenceLevel,
    calculateCompositeConfidence,
    adjustConfidenceForQuality,
    validateConfidence
} from './confidenceThresholds.js';

// Cache for 5 minutes to avoid excessive processing
const cache = new NodeCache({ stdTTL: 300, checkperiod: 60 });
const { PNG } = pngjs;
const { parseGIF, decompressFrames } = gifuct;
const MAX_GIF_FRAMES = 8;

class SnowDetectionService {
    constructor() {
        this.processingCache = new Map();
        this.detectionHistory = new Map();
        
        // Detection thresholds
        this.thresholds = {
            lightSnow: 8,      // 8% white pixels
            moderateSnow: 20,   // 20% white pixels
            heavySnow: 35       // 35% white pixels
        };
        
        // Temperature thresholds for snow possibility
        this.temperatureThresholds = {
            noSnowTemp: 40,        // Above 40°F (4.4°C) - no snow possible
            lowSnowTemp: 35,       // 35-40°F - snow unlikely but possible
            snowTemp: 32,          // Below 32°F (0°C) - snow likely
            heavySnowTemp: 25      // Below 25°F - heavy snow conditions likely
        };
        
        // Color analysis parameters
        this.colorParams = {
            brightnessThreshold: 200,    // Min brightness for white pixels
            saturationThreshold: 30,     // Max saturation for white pixels
            rgbBalanceThreshold: 0.8,    // RGB balance ratio
            contrastThreshold: 50        // Min contrast to avoid overexposure
        };
    }

    /**
     * Analyze camera image for snow conditions with temperature override
     * @param {string} imageUrl - URL of the camera image
     * @param {string} cameraId - Camera identifier
     * @param {Object} weatherData - Optional weather station data for temperature
     * @param {string|null} analysisKey - Optional key for per-view cache/history isolation
     * @returns {Promise<Object>} Snow detection result
     */
    async analyzeImageForSnow(imageUrl, cameraId, weatherData = null, analysisKey = null) {
        const historyKey = analysisKey || cameraId;
        const cacheKey = `snow_detection_${historyKey}`;
        const cached = cache.get(cacheKey);
        if (cached) return cached;

        try {
            // Check temperature first - if too warm, skip image analysis
            const temperatureCheck = this.checkTemperatureConditions(weatherData);
            if (temperatureCheck.skipAnalysis) {
                const result = {
                    cameraId,
                    analysisKey: historyKey,
                    timestamp: Date.now(),
                    snowDetected: false,
                    snowLevel: 'none',
                    whitePixelPercentage: 0,
                    confidence: temperatureCheck.confidence,
                    temperatureOverride: true,
                    reason: temperatureCheck.reason,
                    temperature: temperatureCheck.temperature,
                    contentType: null,
                    isAnimated: false,
                    frameAggregation: null,
                    processingTime: 1 // Minimal processing time for temperature override
                };
                cache.set(cacheKey, result);
                return result;
            }

            // Fetch the image
            const response = await fetch(imageUrl, {
                timeout: 10000,
                headers: {
                    'User-Agent': 'BasinWX-SnowDetection/1.0'
                }
            });

            if (!response.ok) {
                throw new Error(`Failed to fetch image: ${response.status}`);
            }

            const imageBuffer = await response.buffer();
            const responseContentType = response.headers.get('content-type');
            
            // Analyze the image for snow
            const analysisResult = await this.processImageForSnow(
                imageBuffer,
                historyKey,
                temperatureCheck,
                responseContentType
            );
            analysisResult.cameraId = cameraId;
            analysisResult.analysisKey = historyKey;
            
            // Store in history for temporal analysis
            this.updateDetectionHistory(historyKey, analysisResult);
            
            // Apply temporal smoothing
            const smoothedResult = this.applyTemporalSmoothing(historyKey, analysisResult);
            smoothedResult.cameraId = cameraId;
            smoothedResult.analysisKey = historyKey;
            
            cache.set(cacheKey, smoothedResult);
            return smoothedResult;

        } catch (error) {
            console.error(`Snow detection error for camera ${cameraId}:`, error.message);
            return {
                ...this.getDefaultResult(cameraId, 'error'),
                analysisKey: historyKey
            };
        }
    }

    /**
     * Check temperature conditions to determine if snow analysis is needed
     * @param {Object} weatherData - Weather station data
     * @returns {Object} Temperature check result
     */
    checkTemperatureConditions(weatherData) {
        let temperature = null;
        let skipAnalysis = false;
        let reason = '';
        let confidence = 0.5;

        // Try to get temperature from weather data
        if (weatherData && weatherData.airTemperature) {
            temperature = parseFloat(weatherData.airTemperature);
        }

        // If no weather data, estimate based on time of year
        if (temperature === null) {
            const month = new Date().getMonth() + 1;
            const hour = new Date().getHours();
            
            // Rough seasonal temperature estimation for Uintah Basin
            if (month >= 6 && month <= 8) { // Summer months
                temperature = hour < 6 || hour > 20 ? 65 : 85; // Cooler at night/early morning
            } else if (month >= 4 && month <= 5) { // Spring
                temperature = hour < 6 || hour > 20 ? 45 : 65;
            } else if (month >= 9 && month <= 10) { // Fall
                temperature = hour < 6 || hour > 20 ? 40 : 60;
            } else { // Winter months
                temperature = hour < 6 || hour > 20 ? 20 : 35;
            }
            reason += 'Estimated temperature. ';
        }

        // Temperature-based decisions
        if (temperature > this.temperatureThresholds.noSnowTemp) {
            skipAnalysis = true;
            confidence = 0.95;
            reason += `Too warm for snow (${Math.round(temperature)}°F)`;
        } else if (temperature > this.temperatureThresholds.lowSnowTemp) {
            skipAnalysis = false; // Still analyze but adjust confidence
            confidence = 0.3; // Low confidence for snow in marginal temps
            reason += `Marginal snow conditions (${Math.round(temperature)}°F)`;
        } else if (temperature < this.temperatureThresholds.heavySnowTemp) {
            skipAnalysis = false;
            confidence = 0.9; // High baseline confidence for very cold conditions
            reason += `Ideal snow conditions (${Math.round(temperature)}°F)`;
        } else {
            skipAnalysis = false;
            confidence = 0.7; // Good confidence for typical snow temps
            reason += `Snow possible (${Math.round(temperature)}°F)`;
        }

        return {
            temperature: Math.round(temperature),
            skipAnalysis,
            confidence,
            reason,
            temperatureFactor: this.getTemperatureFactor(temperature)
        };
    }

    /**
     * Get temperature adjustment factor for detection sensitivity
     * @param {number} temperature - Air temperature in Fahrenheit
     * @returns {number} Multiplier for detection thresholds
     */
    getTemperatureFactor(temperature) {
        if (temperature > this.temperatureThresholds.noSnowTemp) {
            return 0; // No snow possible
        } else if (temperature > this.temperatureThresholds.lowSnowTemp) {
            return 0.3; // Very low sensitivity
        } else if (temperature < this.temperatureThresholds.heavySnowTemp) {
            return 1.5; // High sensitivity
        } else {
            return 1.0; // Normal sensitivity
        }
    }

    /**
     * Process image buffer to detect snow conditions
     * @param {Buffer} imageBuffer - Image data
     * @param {string} cameraId - Camera identifier
     * @param {Object} temperatureCheck - Temperature analysis result
     * @param {string|null} responseContentType - HTTP content type header from camera response
     * @returns {Promise<Object>} Analysis result
     */
    async processImageForSnow(imageBuffer, cameraId, temperatureCheck = null, responseContentType = null) {
        const imageSize = imageBuffer.length;
        const timestamp = Date.now();

        let whitePixelPercentage = 0;
        let snowLevel = 'none';
        let confidence = 0;
        let contentType = this.detectImageMime(imageBuffer, responseContentType);
        let isAnimated = false;
        let frameAggregation = null;

        if (contentType === 'image/gif') {
            const gifData = this.decodeGifFramesForSampling(imageBuffer, MAX_GIF_FRAMES);
            const frameResults = gifData.frames.map((frame) => {
                const frameCameraId = `${cameraId}:frame:${frame.frameIndex}`;
                return this.analyzeFrameForSnow(frame, frameCameraId, temperatureCheck);
            });
            const aggregatedFrames = this.aggregateFrameDetections(frameResults);
            whitePixelPercentage = aggregatedFrames.whitePixelPercentage;
            snowLevel = aggregatedFrames.snowLevel;
            confidence = aggregatedFrames.confidence;
            isAnimated = gifData.totalFrames > 1;
            frameAggregation = {
                framesAvailable: gifData.totalFrames,
                framesSampled: frameResults.length,
                policy: 'worst_case_max',
                confidenceSpread: aggregatedFrames.confidenceSpread
            };
        } else if (contentType === 'image/png' || contentType === 'image/jpeg') {
            const decodedImage = this.decodeStillImageToRgba(imageBuffer, contentType);
            whitePixelPercentage = this.analyzeRgbaPixelData(decodedImage.data);
            whitePixelPercentage = this.applyTemperatureFactor(whitePixelPercentage, temperatureCheck);
            snowLevel = this.determineSnowLevel(whitePixelPercentage);
            confidence = this.calculateConfidence(
                whitePixelPercentage,
                snowLevel,
                cameraId,
                temperatureCheck
            );
        } else {
            contentType = 'image/raw-rgb';
            whitePixelPercentage = this.simulateWhitePixelAnalysis(imageBuffer, cameraId);
            whitePixelPercentage = this.applyTemperatureFactor(whitePixelPercentage, temperatureCheck);
            snowLevel = this.determineSnowLevel(whitePixelPercentage);
            confidence = this.calculateConfidence(
                whitePixelPercentage,
                snowLevel,
                cameraId,
                temperatureCheck
            );
        }

        const confidenceLevel = getConfidenceLevel(confidence);

        return {
            cameraId,
            timestamp,
            snowDetected: snowLevel !== 'none',
            snowLevel,
            whitePixelPercentage: Math.max(0, whitePixelPercentage),
            confidence,
            confidenceLevel: {
                name: confidenceLevel.name,
                displayText: confidenceLevel.displayText,
                badge: confidenceLevel.badge,
                color: confidenceLevel.color,
                icon: confidenceLevel.icon
            },
            contentType,
            isAnimated,
            frameAggregation,
            imageSize,
            temperatureInfo: temperatureCheck,
            processingTime: Date.now() - timestamp
        };
    }

    detectImageMime(imageBuffer, responseContentType = null) {
        const headerType = typeof responseContentType === 'string'
            ? responseContentType.toLowerCase()
            : '';

        if (headerType.includes('image/jpeg') || headerType.includes('image/jpg')) {
            return 'image/jpeg';
        }
        if (headerType.includes('image/png')) {
            return 'image/png';
        }
        if (headerType.includes('image/gif')) {
            return 'image/gif';
        }

        if (imageBuffer.length >= 8 &&
            imageBuffer[0] === 0x89 &&
            imageBuffer[1] === 0x50 &&
            imageBuffer[2] === 0x4e &&
            imageBuffer[3] === 0x47) {
            return 'image/png';
        }

        if (imageBuffer.length >= 3 &&
            imageBuffer[0] === 0xff &&
            imageBuffer[1] === 0xd8 &&
            imageBuffer[2] === 0xff) {
            return 'image/jpeg';
        }

        if (imageBuffer.length >= 6) {
            const signature = imageBuffer.slice(0, 6).toString('ascii');
            if (signature === 'GIF87a' || signature === 'GIF89a') {
                return 'image/gif';
            }
        }

        return 'image/raw-rgb';
    }

    decodeStillImageToRgba(imageBuffer, mimeType) {
        if (mimeType === 'image/png') {
            const pngImage = PNG.sync.read(imageBuffer);
            return {
                width: pngImage.width,
                height: pngImage.height,
                data: pngImage.data
            };
        }

        if (mimeType === 'image/jpeg') {
            const jpegImage = jpegjs.decode(imageBuffer, { useTArray: true });
            return {
                width: jpegImage.width,
                height: jpegImage.height,
                data: jpegImage.data
            };
        }

        throw new Error(`Unsupported still image type: ${mimeType}`);
    }

    getGifFrameSampleIndexes(totalFrames, maxFrames = MAX_GIF_FRAMES) {
        if (totalFrames <= 0) return [];
        if (totalFrames <= maxFrames) {
            return Array.from({ length: totalFrames }, (_, i) => i);
        }

        const indexes = new Set();
        const step = (totalFrames - 1) / (maxFrames - 1);

        for (let i = 0; i < maxFrames; i++) {
            indexes.add(Math.round(i * step));
        }

        const sortedIndexes = Array.from(indexes).sort((a, b) => a - b);
        if (sortedIndexes.length >= maxFrames) {
            return sortedIndexes.slice(0, maxFrames);
        }

        for (let i = 0; i < totalFrames && sortedIndexes.length < maxFrames; i++) {
            if (!indexes.has(i)) {
                sortedIndexes.push(i);
            }
        }

        return sortedIndexes.sort((a, b) => a - b);
    }

    decodeGifFramesForSampling(imageBuffer, maxFrames = MAX_GIF_FRAMES) {
        const gif = parseGIF(imageBuffer);
        const decompressedFrames = decompressFrames(gif, true);
        const totalFrames = decompressedFrames.length;

        if (totalFrames === 0) {
            throw new Error('GIF has no decodable frames');
        }

        const width = gif?.lsd?.width || decompressedFrames[0]?.dims?.width || 0;
        const height = gif?.lsd?.height || decompressedFrames[0]?.dims?.height || 0;
        if (!width || !height) {
            throw new Error('GIF dimensions unavailable');
        }

        const sampledIndexes = new Set(this.getGifFrameSampleIndexes(totalFrames, maxFrames));
        const composited = new Uint8ClampedArray(width * height * 4);
        const sampledFrames = [];

        decompressedFrames.forEach((frame, frameIndex) => {
            const { left, top, width: frameWidth, height: frameHeight } = frame.dims;
            const patch = frame.patch;

            for (let y = 0; y < frameHeight; y++) {
                for (let x = 0; x < frameWidth; x++) {
                    const src = (y * frameWidth + x) * 4;
                    const destX = left + x;
                    const destY = top + y;
                    if (destX < 0 || destY < 0 || destX >= width || destY >= height) continue;

                    const dest = (destY * width + destX) * 4;
                    composited[dest] = patch[src];
                    composited[dest + 1] = patch[src + 1];
                    composited[dest + 2] = patch[src + 2];
                    composited[dest + 3] = patch[src + 3];
                }
            }

            if (sampledIndexes.has(frameIndex)) {
                sampledFrames.push({
                    frameIndex,
                    width,
                    height,
                    data: new Uint8ClampedArray(composited)
                });
            }
        });

        return {
            totalFrames,
            frames: sampledFrames
        };
    }

    applyTemperatureFactor(whitePixelPercentage, temperatureCheck = null) {
        if (!temperatureCheck || temperatureCheck.temperatureFactor === undefined) {
            return whitePixelPercentage;
        }

        return whitePixelPercentage * temperatureCheck.temperatureFactor;
    }

    analyzeFrameForSnow(frame, cameraId, temperatureCheck = null) {
        let whitePixelPercentage = this.analyzeRgbaPixelData(frame.data);
        whitePixelPercentage = this.applyTemperatureFactor(whitePixelPercentage, temperatureCheck);
        const snowLevel = this.determineSnowLevel(whitePixelPercentage);
        const confidence = this.calculateConfidence(
            whitePixelPercentage,
            snowLevel,
            cameraId,
            temperatureCheck
        );

        return {
            frameIndex: frame.frameIndex,
            snowLevel,
            confidence,
            whitePixelPercentage
        };
    }

    aggregateFrameDetections(frameResults = []) {
        if (!frameResults.length) {
            return {
                snowLevel: 'none',
                confidence: 0,
                whitePixelPercentage: 0,
                confidenceSpread: 0
            };
        }

        const worstFrame = frameResults.reduce((worst, current) => {
            const currentRank = this.getSnowSeverityRank(current.snowLevel);
            const worstRank = this.getSnowSeverityRank(worst.snowLevel);

            if (currentRank > worstRank) {
                return current;
            }
            if (currentRank === worstRank && current.confidence > worst.confidence) {
                return current;
            }

            return worst;
        }, frameResults[0]);

        const confidences = frameResults.map((frame) => frame.confidence);
        const confidenceSpread = Math.max(...confidences) - Math.min(...confidences);

        return {
            snowLevel: worstFrame.snowLevel,
            confidence: Math.max(...confidences),
            whitePixelPercentage: worstFrame.whitePixelPercentage,
            confidenceSpread: Math.max(0, confidenceSpread)
        };
    }

    analyzeRgbaPixelData(pixelData) {
        const stride = 4;
        const pixelCount = Math.floor(pixelData.length / stride);
        if (pixelCount === 0) return 0;

        let whitePixelCount = 0;
        let analyzedPixelCount = 0;

        for (let i = 0; i < pixelData.length; i += stride) {
            const r = pixelData[i];
            const g = pixelData[i + 1];
            const b = pixelData[i + 2];
            const alpha = pixelData[i + 3];

            if (alpha !== undefined && alpha < 16) {
                continue;
            }

            analyzedPixelCount++;

            const brightness = (r + g + b) / 3;
            const max = Math.max(r, g, b);
            const min = Math.min(r, g, b);
            const saturation = max === 0 ? 0 : ((max - min) / max) * 100;

            const avgRGB = (r + g + b) / 3;
            const rDiff = Math.abs(r - avgRGB);
            const gDiff = Math.abs(g - avgRGB);
            const bDiff = Math.abs(b - avgRGB);
            const maxDiff = Math.max(rDiff, gDiff, bDiff);
            const rgbBalance = avgRGB === 0 ? 0 : 1 - (maxDiff / avgRGB);

            const isWhite = brightness >= this.colorParams.brightnessThreshold &&
                saturation <= this.colorParams.saturationThreshold &&
                rgbBalance >= this.colorParams.rgbBalanceThreshold;

            if (isWhite) {
                whitePixelCount++;
            }
        }

        if (analyzedPixelCount === 0) return 0;
        return (whitePixelCount / analyzedPixelCount) * 100;
    }

    /**
     * Fallback analyzer for raw synthetic RGB buffers (used in tests)
     * @param {Buffer} imageBuffer - Image data (RGB format)
     * @returns {number} White pixel percentage
     */
    simulateWhitePixelAnalysis(imageBuffer) {
        const pixelCount = Math.floor(imageBuffer.length / 3);
        if (pixelCount === 0) return 0;

        let whitePixelCount = 0;

        for (let i = 0; i < imageBuffer.length; i += 3) {
            const r = imageBuffer[i];
            const g = imageBuffer[i + 1];
            const b = imageBuffer[i + 2];

            const brightness = (r + g + b) / 3;
            const max = Math.max(r, g, b);
            const min = Math.min(r, g, b);
            const saturation = max === 0 ? 0 : ((max - min) / max) * 100;

            const avgRGB = (r + g + b) / 3;
            const rDiff = Math.abs(r - avgRGB);
            const gDiff = Math.abs(g - avgRGB);
            const bDiff = Math.abs(b - avgRGB);
            const maxDiff = Math.max(rDiff, gDiff, bDiff);
            const rgbBalance = avgRGB === 0 ? 0 : 1 - (maxDiff / avgRGB);

            const isWhite = brightness >= this.colorParams.brightnessThreshold &&
                saturation <= this.colorParams.saturationThreshold &&
                rgbBalance >= this.colorParams.rgbBalanceThreshold;

            if (isWhite) {
                whitePixelCount++;
            }
        }

        return (whitePixelCount / pixelCount) * 100;
    }

    /**
     * Calculate a simple entropy measure from image buffer
     * @param {Buffer} imageBuffer - Image data
     * @returns {number} Simplified entropy measure
     */
    calculateImageEntropy(imageBuffer) {
        const sampleSize = Math.min(1000, imageBuffer.length);
        let sum = 0;
        let sumSquares = 0;
        
        for (let i = 0; i < sampleSize; i++) {
            const byte = imageBuffer[i];
            sum += byte;
            sumSquares += byte * byte;
        }
        
        const mean = sum / sampleSize;
        const variance = (sumSquares / sampleSize) - (mean * mean);
        
        // Normalize to 0-1 range
        return Math.sqrt(variance) / 255;
    }

    /**
     * Get seasonal factor for snow likelihood
     * @returns {number} Seasonal multiplier
     */
    getSeasonalFactor() {
        const month = new Date().getMonth() + 1; // 1-12
        
        // Higher multiplier in winter months
        if (month >= 11 || month <= 3) {
            return 1.5; // November through March
        } else if (month >= 4 && month <= 5) {
            return 1.2; // April and May
        } else if (month >= 9 && month <= 10) {
            return 1.1; // September and October
        } else {
            return 0.5; // Summer months
        }
    }

    /**
     * Determine snow level based on white pixel percentage
     * @param {number} whitePixelPercentage - Percentage of white pixels
     * @returns {string} Snow level classification
     */
    determineSnowLevel(whitePixelPercentage) {
        if (whitePixelPercentage >= this.thresholds.heavySnow) {
            return 'heavy';
        } else if (whitePixelPercentage >= this.thresholds.moderateSnow) {
            return 'moderate';
        } else if (whitePixelPercentage >= this.thresholds.lightSnow) {
            return 'light';
        } else {
            return 'none';
        }
    }

    /**
     * Calculate confidence score for the detection using composite approach
     * @param {number} whitePixelPercentage - White pixel percentage
     * @param {string} snowLevel - Detected snow level
     * @param {string} cameraId - Camera identifier
     * @param {Object} temperatureInfo - Temperature context
     * @returns {number} Confidence score (0-1)
     */
    calculateConfidence(whitePixelPercentage, snowLevel, cameraId, temperatureInfo = null) {
        // Build confidence from multiple sources
        const sources = [];

        // Source 1: Visual analysis confidence
        let visualConfidence = 0.5;
        if (snowLevel === 'none' && whitePixelPercentage < 3) {
            visualConfidence = 0.9;
        } else if (snowLevel === 'heavy' && whitePixelPercentage > 40) {
            visualConfidence = 0.95;
        } else if (snowLevel !== 'none') {
            visualConfidence = 0.7 + (whitePixelPercentage / 100) * 0.2;
        }
        sources.push({ confidence: visualConfidence, weight: 1.2, source: 'Camera visual analysis' });

        // Source 2: Temperature-based confidence
        if (temperatureInfo && temperatureInfo.confidence !== undefined) {
            sources.push({
                confidence: temperatureInfo.confidence,
                weight: 1.5, // Temperature is highly reliable
                source: 'Temperature conditions'
            });
        }

        // Calculate composite confidence
        let baseConfidence = calculateCompositeConfidence(sources);

        // Quality adjustments
        const history = this.detectionHistory.get(cameraId);
        const qualityIndicators = {};

        // Temporal consistency
        if (history && history.length > 3) {
            const recentResults = history.slice(-3);
            const consistency = this.calculateConsistency(recentResults);
            qualityIndicators.temporalConsistency = consistency;
        }

        // Apply quality adjustments
        const finalConfidence = adjustConfidenceForQuality(baseConfidence, qualityIndicators);

        // Validate confidence calculation
        const validation = validateConfidence(finalConfidence, {
            dataSource: 'Camera + Temperature',
            sourceCount: sources.length,
            ageMinutes: 0 // Real-time analysis
        });

        if (!validation.valid) {
            console.warn(`Confidence validation failed for ${cameraId}:`, validation.errors);
        }
        if (validation.warnings.length > 0) {
            console.debug(`Confidence warnings for ${cameraId}:`, validation.warnings);
        }

        return finalConfidence;
    }

    /**
     * Calculate consistency of recent detection results
     * @param {Array} results - Recent detection results
     * @returns {number} Consistency score (0-1)
     */
    calculateConsistency(results) {
        if (results.length < 2) return 0.5;
        
        const levels = results.map(r => r.snowLevel);
        const uniqueLevels = [...new Set(levels)];
        
        // Higher consistency if results agree
        return uniqueLevels.length === 1 ? 1.0 : 0.3;
    }

    /**
     * Update detection history for temporal analysis
     * @param {string} cameraId - Camera identifier
     * @param {Object} result - Detection result
     */
    updateDetectionHistory(cameraId, result) {
        if (!this.detectionHistory.has(cameraId)) {
            this.detectionHistory.set(cameraId, []);
        }
        
        const history = this.detectionHistory.get(cameraId);
        history.push(result);
        
        // Keep only last 10 results per camera
        if (history.length > 10) {
            history.shift();
        }
    }

    /**
     * Apply temporal smoothing to reduce false positives
     * @param {string} cameraId - Camera identifier
     * @param {Object} currentResult - Current detection result
     * @returns {Object} Smoothed result
     */
    applyTemporalSmoothing(cameraId, currentResult) {
        const history = this.detectionHistory.get(cameraId);
        if (!history || history.length < 2) {
            return currentResult;
        }
        
        // Get recent results (last 3 including current)
        const recentResults = history.slice(-2).concat([currentResult]);
        
        // Calculate average white pixel percentage
        const avgWhitePixels = recentResults.reduce((sum, r) => sum + r.whitePixelPercentage, 0) / recentResults.length;
        
        // Re-determine snow level based on smoothed data
        const smoothedSnowLevel = this.determineSnowLevel(avgWhitePixels);
        const smoothedConfidence = this.calculateConfidence(avgWhitePixels, smoothedSnowLevel, cameraId);
        
        return {
            ...currentResult,
            snowLevel: smoothedSnowLevel,
            whitePixelPercentage: avgWhitePixels,
            confidence: smoothedConfidence,
            smoothed: true,
            originalResult: {
                snowLevel: currentResult.snowLevel,
                whitePixelPercentage: currentResult.whitePixelPercentage,
                confidence: currentResult.confidence
            }
        };
    }

    /**
     * Get default result for error cases
     * @param {string} cameraId - Camera identifier
     * @param {string} errorType - Type of error
     * @returns {Object} Default result
     */
    getDefaultResult(cameraId, errorType = 'unknown') {
        return {
            cameraId,
            timestamp: Date.now(),
            snowDetected: false,
            snowLevel: 'unknown',
            whitePixelPercentage: 0,
            confidence: 0,
            contentType: null,
            isAnimated: false,
            frameAggregation: null,
            error: errorType,
            processingTime: 0
        };
    }

    /**
     * Find nearest weather station to camera
     * @param {Object} camera - Camera with lat/lng
     * @param {Array} weatherStations - Array of weather stations
     * @returns {Object|null} Nearest weather station data
     */
    findNearestWeatherStation(camera, weatherStations = []) {
        if (!weatherStations || weatherStations.length === 0) return null;
        
        let nearest = null;
        let minDistance = Infinity;
        
        weatherStations.forEach(station => {
            const distance = this.calculateDistance(
                camera.lat, camera.lng,
                station.lat, station.lng
            );
            
            if (distance < minDistance) {
                minDistance = distance;
                nearest = station;
            }
        });
        
        // Only use weather station if within 50 miles
        return minDistance < 50 ? nearest : null;
    }

    /**
     * Calculate distance between two coordinates
     * @param {number} lat1 - Latitude 1
     * @param {number} lng1 - Longitude 1
     * @param {number} lat2 - Latitude 2
     * @param {number} lng2 - Longitude 2
     * @returns {number} Distance in miles
     */
    calculateDistance(lat1, lng1, lat2, lng2) {
        const R = 3959; // Earth's radius in miles
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                Math.sin(dLng/2) * Math.sin(dLng/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    }

    /**
     * Normalize camera view status text
     * @param {string} status - Raw status string
     * @returns {string} Normalized status
     */
    normalizeViewStatus(status) {
        if (typeof status !== 'string') return '';
        return status.trim();
    }

    /**
     * Determine if a camera view should be analyzed
     * @param {Object} view - Camera view object
     * @returns {boolean} True if view has a usable URL and is not marked offline
     */
    isViewAnalyzable(view) {
        if (!view || typeof view.url !== 'string' || view.url.trim().length === 0) {
            return false;
        }

        const status = this.normalizeViewStatus(view.status).toLowerCase();
        if (!status) return true;

        const offlineTerms = ['offline', 'down', 'no feed', 'unavailable'];
        return !offlineTerms.some(term => status.includes(term));
    }

    /**
     * Severity rank used for worst-case aggregation
     * @param {string} snowLevel - Snow level label
     * @returns {number} Severity rank
     */
    getSnowSeverityRank(snowLevel) {
        switch (snowLevel) {
            case 'heavy': return 3;
            case 'moderate': return 2;
            case 'light': return 1;
            case 'none': return 0;
            default: return -1;
        }
    }

    /**
     * Map snow level to frontend display state
     * @param {string} snowLevel - Snow level label
     * @returns {string} Display state value
     */
    mapSnowLevelToDisplayState(snowLevel) {
        switch (snowLevel) {
            case 'none': return 'clear';
            case 'light': return 'light';
            case 'moderate': return 'moderate';
            case 'heavy': return 'heavy';
            default: return 'clear';
        }
    }

    /**
     * Build a default per-view record when the view cannot be analyzed
     * @param {number} viewIndex - View index
     * @param {string} description - View description
     * @param {string} status - View status
     * @param {string} error - Error code
     * @returns {Object} View-level detection record
     */
    buildDefaultViewDetection(viewIndex, description, status, error) {
        return {
            viewIndex,
            description,
            status,
            snowDetected: false,
            snowLevel: 'unknown',
            confidence: 0,
            temperatureOverride: false,
            temperature: null,
            contentType: null,
            isAnimated: false,
            frameAggregation: null,
            whitePixelPercentage: 0,
            timestamp: Date.now(),
            error
        };
    }

    /**
     * Aggregate per-view detections into one camera-level detection
     * @param {string} cameraId - Camera identifier
     * @param {Array} perViewDetections - View-level detections
     * @param {number} viewsAvailable - Total views reported by camera
     * @returns {Object} Aggregated camera detection
     */
    aggregateCameraViewDetections(cameraId, perViewDetections = [], viewsAvailable = 0) {
        const validSnowLevels = new Set(['none', 'light', 'moderate', 'heavy']);
        const successfulViews = perViewDetections.filter(
            (view) => !view.error && validSnowLevels.has(view.snowLevel)
        );

        if (successfulViews.length === 0) {
            return {
                ...this.getDefaultResult(cameraId, viewsAvailable > 0 ? 'no_valid_views' : 'no_image_url'),
                perViewDetections,
                aggregation: {
                    policy: 'worst_case_max',
                    mixed: false,
                    confidenceSpread: 0,
                    viewsAvailable,
                    viewsAnalyzed: 0
                },
                displayState: 'clear'
            };
        }

        const worstCaseView = successfulViews.reduce((worst, current) => {
            const currentRank = this.getSnowSeverityRank(current.snowLevel);
            const worstRank = this.getSnowSeverityRank(worst.snowLevel);

            if (currentRank > worstRank) {
                return current;
            }

            if (currentRank === worstRank && (current.confidence || 0) > (worst.confidence || 0)) {
                return current;
            }

            return worst;
        }, successfulViews[0]);

        const confidences = successfulViews.map((view) => view.confidence || 0);
        const maxConfidence = Math.max(...confidences);
        const minConfidence = Math.min(...confidences);
        const confidenceSpread = Math.max(0, maxConfidence - minConfidence);
        const mixed = confidenceSpread >= 0.25;
        const confidenceLevel = getConfidenceLevel(maxConfidence);

        return {
            cameraId,
            timestamp: Date.now(),
            snowDetected: worstCaseView.snowLevel !== 'none',
            snowLevel: worstCaseView.snowLevel,
            whitePixelPercentage: worstCaseView.whitePixelPercentage || 0,
            confidence: maxConfidence,
            confidenceLevel: {
                name: confidenceLevel.name,
                displayText: confidenceLevel.displayText,
                badge: confidenceLevel.badge,
                color: confidenceLevel.color,
                icon: confidenceLevel.icon
            },
            temperatureOverride: successfulViews.every((view) => view.temperatureOverride),
            temperature: worstCaseView.temperature,
            temperatureInfo: worstCaseView.temperatureInfo || null,
            contentType: worstCaseView.contentType || null,
            isAnimated: successfulViews.some((view) => view.isAnimated === true),
            frameAggregation: worstCaseView.frameAggregation || null,
            perViewDetections,
            aggregation: {
                policy: 'worst_case_max',
                mixed,
                confidenceSpread,
                viewsAvailable,
                viewsAnalyzed: successfulViews.length
            },
            displayState: mixed ? 'mixed' : this.mapSnowLevelToDisplayState(worstCaseView.snowLevel)
        };
    }

    /**
     * Analyze multiple cameras in batch with weather data
     * @param {Array} cameras - Array of camera objects with id and views
     * @param {Array} weatherStations - Array of weather station data
     * @returns {Promise<Array>} Array of detection results
     */
    async analyzeCamerasBatch(cameras, weatherStations = []) {
        // Process cameras in parallel with concurrency limit
        const concurrencyLimit = 5;
        const chunks = [];

        for (let i = 0; i < cameras.length; i += concurrencyLimit) {
            chunks.push(cameras.slice(i, i + concurrencyLimit));
        }

        // Process all chunks in parallel
        const allChunkResults = await Promise.all(
            chunks.map(chunk =>
                Promise.allSettled(
                    chunk.map(async (camera) => {
                        try {
                            const cameraId = camera.id.toString();
                            const views = Array.isArray(camera.views) ? camera.views : [];

                            // Find nearest weather station for temperature data
                            const nearestStation = this.findNearestWeatherStation(camera, weatherStations);
                            const perViewDetections = await Promise.all(
                                views.map(async (view, viewIndex) => {
                                    const description = view?.description || `View ${viewIndex + 1}`;
                                    const status = this.normalizeViewStatus(view?.status);
                                    const imageUrl = typeof view?.url === 'string' ? view.url.trim() : '';

                                    if (!this.isViewAnalyzable({ ...view, url: imageUrl })) {
                                        return this.buildDefaultViewDetection(
                                            viewIndex,
                                            description,
                                            status,
                                            imageUrl ? 'view_offline' : 'no_image_url'
                                        );
                                    }

                                    const analysisKey = `${cameraId}:view:${viewIndex}`;
                                    const viewResult = await this.analyzeImageForSnow(
                                        imageUrl,
                                        cameraId,
                                        nearestStation,
                                        analysisKey
                                    );

                                    return {
                                        viewIndex,
                                        description,
                                        status,
                                        snowDetected: viewResult.snowDetected,
                                        snowLevel: viewResult.snowLevel,
                                        confidence: viewResult.confidence,
                                        temperatureOverride: viewResult.temperatureOverride || false,
                                        temperature: viewResult.temperature ?? null,
                                        temperatureInfo: viewResult.temperatureInfo || null,
                                        whitePixelPercentage: viewResult.whitePixelPercentage || 0,
                                        contentType: viewResult.contentType || null,
                                        isAnimated: viewResult.isAnimated === true,
                                        frameAggregation: viewResult.frameAggregation || null,
                                        timestamp: viewResult.timestamp || Date.now(),
                                        error: viewResult.error || null
                                    };
                                })
                            );

                            const aggregatedResult = this.aggregateCameraViewDetections(
                                cameraId,
                                perViewDetections,
                                views.length
                            );

                            return {
                                ...aggregatedResult,
                                cameraName: camera.name,
                                cameraLocation: { lat: camera.lat, lng: camera.lng },
                                nearestStationDistance: nearestStation ?
                                    Math.round(this.calculateDistance(camera.lat, camera.lng, nearestStation.lat, nearestStation.lng)) : null
                            };
                        } catch (error) {
                            console.error(`Error analyzing camera ${camera.id}:`, error.message);
                            return {
                                ...this.getDefaultResult(camera.id.toString(), 'analysis_error'),
                                perViewDetections: [],
                                aggregation: {
                                    policy: 'worst_case_max',
                                    mixed: false,
                                    confidenceSpread: 0,
                                    viewsAvailable: Array.isArray(camera.views) ? camera.views.length : 0,
                                    viewsAnalyzed: 0
                                },
                                displayState: 'clear'
                            };
                        }
                    })
                )
            )
        );

        // Flatten and filter results
        const results = allChunkResults
            .flat()
            .filter(result => result.status === 'fulfilled')
            .map(result => result.value);

        return results;
    }

    /**
     * Generate road segment coordinates from camera location
     * @param {Object} camera - Camera with lat/lng and name
     * @returns {Array} Array of coordinate pairs representing road segment
     */
    generateRoadSegmentFromCamera_DEPRECATED(camera) {
        const lat = camera.lat;
        const lng = camera.lng;
        const name = camera.name.toLowerCase();
        
        // Generate road segments that follow actual road geometry based on specific camera locations
        let segmentCoords = [];
        
        // US-40 corridor - main east-west highway through basin
        if (name.includes('us-40') || name.includes('us 40')) {
            if (lng < -110.5) {
                // Western section near Duchesne - curves slightly north
                segmentCoords = [
                    [lat - 0.003, lng - 0.012],
                    [lat - 0.001, lng - 0.006],
                    [lat, lng],
                    [lat + 0.002, lng + 0.008],
                    [lat + 0.003, lng + 0.015]
                ];
            } else if (lng < -110.0) {
                // Central section Roosevelt area - straighter east-west
                segmentCoords = [
                    [lat - 0.002, lng - 0.015],
                    [lat, lng - 0.008],
                    [lat, lng],
                    [lat + 0.001, lng + 0.008],
                    [lat + 0.002, lng + 0.015]
                ];
            } else if (lng < -109.6) {
                // Eastern section toward Vernal - slight southeast curve
                segmentCoords = [
                    [lat + 0.003, lng - 0.015],
                    [lat + 0.002, lng - 0.008],
                    [lat, lng],
                    [lat - 0.002, lng + 0.008],
                    [lat - 0.004, lng + 0.015]
                ];
            } else {
                // Far eastern section toward Colorado - more southeast
                segmentCoords = [
                    [lat + 0.005, lng - 0.012],
                    [lat + 0.003, lng - 0.006],
                    [lat, lng],
                    [lat - 0.003, lng + 0.008],
                    [lat - 0.006, lng + 0.015]
                ];
            }
        }
        // US-191 corridor - north-south through eastern basin
        else if (name.includes('us-191') || name.includes('us 191')) {
            if (lat > 40.6) {
                // Northern section - curves northeast toward Flaming Gorge
                segmentCoords = [
                    [lat - 0.015, lng - 0.005],
                    [lat - 0.008, lng - 0.002],
                    [lat, lng],
                    [lat + 0.008, lng + 0.003],
                    [lat + 0.015, lng + 0.008]
                ];
            } else if (lat > 40.4) {
                // Vernal area - more north-south
                segmentCoords = [
                    [lat - 0.012, lng - 0.002],
                    [lat - 0.006, lng - 0.001],
                    [lat, lng],
                    [lat + 0.008, lng + 0.001],
                    [lat + 0.015, lng + 0.002]
                ];
            } else {
                // Southern section toward Duchesne - curves southwest
                segmentCoords = [
                    [lat - 0.015, lng + 0.008],
                    [lat - 0.008, lng + 0.003],
                    [lat, lng],
                    [lat + 0.008, lng - 0.002],
                    [lat + 0.015, lng - 0.005]
                ];
            }
        }
        // SR-121 - Roosevelt to Manila route
        else if (name.includes('sr-121') || name.includes('sr 121')) {
            if (lng < -109.8) {
                // Western section from Roosevelt - northeast toward Manila
                segmentCoords = [
                    [lat - 0.008, lng - 0.010],
                    [lat - 0.004, lng - 0.005],
                    [lat, lng],
                    [lat + 0.006, lng + 0.008],
                    [lat + 0.012, lng + 0.015]
                ];
            } else {
                // Eastern section approaching Manila - more northeast
                segmentCoords = [
                    [lat - 0.010, lng - 0.015],
                    [lat - 0.005, lng - 0.008],
                    [lat, lng],
                    [lat + 0.008, lng + 0.010],
                    [lat + 0.015, lng + 0.018]
                ];
            }
        }
        // SR-87 - Duchesne to Roosevelt connector
        else if (name.includes('sr-87') || name.includes('sr 87')) {
            // Generally east-west with slight curves
            segmentCoords = [
                [lat + 0.002, lng - 0.012],
                [lat + 0.001, lng - 0.006],
                [lat, lng],
                [lat - 0.001, lng + 0.006],
                [lat - 0.003, lng + 0.012]
            ];
        }
        // SR-45 - connects to Rangely
        else if (name.includes('sr-45') || name.includes('sr 45')) {
            // North-south route
            segmentCoords = [
                [lat - 0.010, lng + 0.002],
                [lat - 0.005, lng + 0.001],
                [lat, lng],
                [lat + 0.005, lng - 0.001],
                [lat + 0.010, lng - 0.003]
            ];
        }
        // SR-208 - local connector
        else if (name.includes('sr-208') || name.includes('sr 208')) {
            // East-west local road
            segmentCoords = [
                [lat + 0.001, lng - 0.008],
                [lat, lng - 0.004],
                [lat, lng],
                [lat - 0.001, lng + 0.004],
                [lat - 0.002, lng + 0.008]
            ];
        }
        // SR-88 - Pelican Lake area
        else if (name.includes('sr-88') || name.includes('sr 88')) {
            // Local road with curves
            segmentCoords = [
                [lat - 0.006, lng + 0.003],
                [lat - 0.003, lng + 0.001],
                [lat, lng],
                [lat + 0.003, lng - 0.002],
                [lat + 0.006, lng - 0.005]
            ];
        }
        // Main Street or local roads in towns
        else if (name.includes('main st') || name.includes('main street')) {
            if (name.includes('vernal')) {
                // Vernal Main St - east-west through town
                segmentCoords = [
                    [lat, lng - 0.006],
                    [lat, lng - 0.003],
                    [lat, lng],
                    [lat, lng + 0.003],
                    [lat, lng + 0.006]
                ];
            } else if (name.includes('roosevelt')) {
                // Roosevelt area - east-west
                segmentCoords = [
                    [lat + 0.001, lng - 0.005],
                    [lat, lng - 0.002],
                    [lat, lng],
                    [lat - 0.001, lng + 0.003],
                    [lat - 0.002, lng + 0.006]
                ];
            } else {
                // Generic main street
                segmentCoords = [
                    [lat, lng - 0.004],
                    [lat, lng - 0.002],
                    [lat, lng],
                    [lat, lng + 0.002],
                    [lat, lng + 0.004]
                ];
            }
        }
        // Default for unknown roads - try to infer from location
        else {
            // Use location to guess road orientation
            if (Math.abs(lat - 40.45) < 0.1 && Math.abs(lng + 109.53) < 0.1) {
                // Near Vernal - likely east-west
                segmentCoords = [
                    [lat + 0.001, lng - 0.005],
                    [lat, lng - 0.002],
                    [lat, lng],
                    [lat - 0.001, lng + 0.003],
                    [lat - 0.002, lng + 0.006]
                ];
            } else if (Math.abs(lat - 40.30) < 0.1 && Math.abs(lng + 109.99) < 0.1) {
                // Near Roosevelt - likely east-west
                segmentCoords = [
                    [lat, lng - 0.006],
                    [lat, lng - 0.003],
                    [lat, lng],
                    [lat, lng + 0.003],
                    [lat, lng + 0.006]
                ];
            } else {
                // Generic segment - slight curve
                segmentCoords = [
                    [lat + 0.002, lng - 0.005],
                    [lat + 0.001, lng - 0.002],
                    [lat, lng],
                    [lat - 0.001, lng + 0.003],
                    [lat - 0.003, lng + 0.006]
                ];
            }
        }
        
        return segmentCoords;
    }

    /**
     * Convert snow detection results to road condition data
     * @param {Array} detectionResults - Snow detection results
     * @param {Array} cameras - Camera data with location info
     * @param {Array} existingRoads - Existing UDOT road segments (to avoid duplication)
     * @returns {Array} Road condition segments
     */
    generateRoadConditionsFromDetections(detectionResults, cameras, existingRoads = []) {
        // Filter cameras that provide unique coverage (not already covered by UDOT roads)
        const uniqueCoverageDetections = detectionResults.filter(detection => {
            const camera = cameras.find(c => c.id.toString() === detection.cameraId);
            if (!camera) return false;
            
            // Check if this camera location is already covered by existing UDOT roads
            const isCoveredByExistingRoad = existingRoads.some(road => {
                if (!road.coordinates || road.coordinates.length === 0) return false;
                
                // Check if camera is within 2 miles of any existing road segment
                return road.coordinates.some(coord => {
                    const distance = this.calculateDistance(
                        camera.lat, camera.lng,
                        coord[0], coord[1]
                    );
                    return distance < 2; // 2 mile radius
                });
            });
            
            // Only include cameras that provide new coverage
            return !isCoveredByExistingRoad;
        });

        console.log(`Filtered to ${uniqueCoverageDetections.length} cameras with unique road coverage (${detectionResults.length - uniqueCoverageDetections.length} already covered by UDOT roads)`);

        return uniqueCoverageDetections.map(detection => {
            const camera = cameras.find(c => c.id.toString() === detection.cameraId);
            
            // Map snow levels to road conditions
            let roadCondition = 'clear';
            let conditionColor = 'green';
            let status = 'Clear';
            
            // Handle temperature overrides
            if (detection.temperatureOverride) {
                roadCondition = 'clear_temp';
                conditionColor = 'green';
                status = `Clear (${detection.temperature}°F)`;
            } else {
                switch (detection.snowLevel) {
                    case 'light':
                        roadCondition = 'snow_light';
                        conditionColor = 'yellow';
                        status = 'Light Snow';
                        break;
                    case 'moderate':
                        roadCondition = 'snow_moderate';
                        conditionColor = 'orange';
                        status = 'Moderate Snow';
                        break;
                    case 'heavy':
                        roadCondition = 'snow_heavy';
                        conditionColor = 'red';
                        status = 'Heavy Snow';
                        break;
                    default:
                        roadCondition = 'clear';
                        conditionColor = 'green';
                        status = 'Clear';
                }
            }
            
            // Camera analysis will be shown as colored rings around camera icons instead of road segments  
            const roadSegmentCoords = [];
            
            return {
                id: `camera_detection_${detection.cameraId}`,
                name: `${camera.name} (Camera Analysis)`,
                type: 'camera_monitored',
                coordinates: roadSegmentCoords,
                condition: conditionColor,
                overallCondition: { condition: conditionColor, status },
                roadCondition,
                snowLevel: detection.snowLevel,
                confidence: detection.confidence,
                lastUpdated: new Date(detection.timestamp).toISOString(),
                dataSource: 'camera_analysis',
                cameraId: detection.cameraId,
                detectionData: detection,
                temperatureInfo: detection.temperatureInfo,
                nearestStationDistance: detection.nearestStationDistance
            };
        });
    }
}

export default SnowDetectionService;
