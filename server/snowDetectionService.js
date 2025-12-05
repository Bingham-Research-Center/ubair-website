import fetch from 'node-fetch';
import NodeCache from 'node-cache';
import {
    getConfidenceLevel,
    calculateCompositeConfidence,
    adjustConfidenceForQuality,
    validateConfidence
} from './confidenceThresholds.js';

// Cache for 5 minutes to avoid excessive processing
const cache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

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
            brightnessThreshold: 160,    // Min brightness for white pixels (lowered to detect wet/dirty snow)
            saturationThreshold: 30,     // Max saturation for white pixels
            rgbBalanceThreshold: 0.8,    // RGB balance ratio
            contrastThreshold: 50        // Min contrast to avoid overexposure
        };
    }

    /**
     * Detect if image is the UDOT "camera offline" placeholder
     * The placeholder has a distinctive dark blue gradient with white text
     * @param {Buffer} imageBuffer - Image data (RGB format)
     * @returns {Object} Detection result with isOffline flag
     */
    detectOfflinePlaceholder(imageBuffer) {
        const pixelCount = Math.floor(imageBuffer.length / 3);
        if (pixelCount === 0) {
            return { isOffline: false, confidence: 0 };
        }

        // Sample pixels to analyze color distribution
        // The UDOT offline placeholder has:
        // - Dark blue gradient background (dominant color)
        // - Small amount of white text
        // - Orange accent in logo
        let darkBlueCount = 0;
        let whiteCount = 0;
        let orangeCount = 0;
        let totalSampled = 0;

        // Sample every 10th pixel for efficiency
        for (let i = 0; i < imageBuffer.length; i += 30) { // 30 = 10 pixels * 3 bytes
            if (i + 2 >= imageBuffer.length) break;

            const r = imageBuffer[i];
            const g = imageBuffer[i + 1];
            const b = imageBuffer[i + 2];
            totalSampled++;

            // Dark blue detection (the gradient background)
            // RGB roughly: 35-75, 50-95, 95-140
            if (r >= 30 && r <= 80 && g >= 45 && g <= 100 && b >= 90 && b <= 145 && b > r && b > g) {
                darkBlueCount++;
            }

            // White text detection
            if (r > 200 && g > 200 && b > 200) {
                whiteCount++;
            }

            // Orange accent detection (logo stripes)
            // RGB roughly: 220-255, 100-150, 30-80
            if (r > 200 && g >= 80 && g <= 160 && b < 100 && r > g && r > b) {
                orangeCount++;
            }
        }

        const darkBluePercent = (darkBlueCount / totalSampled) * 100;
        const whitePercent = (whiteCount / totalSampled) * 100;
        const orangePercent = (orangeCount / totalSampled) * 100;

        // The offline placeholder signature:
        // - 60-85% dark blue gradient
        // - 5-20% white (text and logo)
        // - 1-5% orange (logo accent)
        const isOffline = darkBluePercent >= 55 && darkBluePercent <= 90 &&
                          whitePercent >= 3 && whitePercent <= 25 &&
                          orangePercent >= 0.5 && orangePercent <= 8;

        // Calculate confidence based on how well it matches the signature
        let confidence = 0;
        if (isOffline) {
            // Higher confidence if percentages are closer to expected values
            const darkBlueScore = 1 - Math.abs(darkBluePercent - 72) / 30;
            const whiteScore = 1 - Math.abs(whitePercent - 12) / 15;
            const orangeScore = 1 - Math.abs(orangePercent - 2) / 5;
            confidence = Math.max(0.6, (darkBlueScore + whiteScore + orangeScore) / 3);
        }

        return {
            isOffline,
            confidence,
            stats: {
                darkBluePercent: Math.round(darkBluePercent * 10) / 10,
                whitePercent: Math.round(whitePercent * 10) / 10,
                orangePercent: Math.round(orangePercent * 10) / 10
            }
        };
    }

    /**
     * Analyze camera image for snow conditions with temperature override
     * @param {string} imageUrl - URL of the camera image
     * @param {string} cameraId - Camera identifier
     * @param {Object} weatherData - Optional weather station data for temperature
     * @returns {Promise<Object>} Snow detection result
     */
    async analyzeImageForSnow(imageUrl, cameraId, weatherData = null) {
        const cacheKey = `snow_detection_${cameraId}`;
        const cached = cache.get(cacheKey);
        if (cached) return cached;

        try {
            // Check temperature first - if too warm, skip image analysis
            const temperatureCheck = this.checkTemperatureConditions(weatherData);
            if (temperatureCheck.skipAnalysis) {
                const result = {
                    cameraId,
                    timestamp: Date.now(),
                    snowDetected: false,
                    snowLevel: 'none',
                    whitePixelPercentage: 0,
                    confidence: temperatureCheck.confidence,
                    temperatureOverride: true,
                    reason: temperatureCheck.reason,
                    temperature: temperatureCheck.temperature,
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

            // Check if this is the UDOT "camera offline" placeholder image
            const offlineCheck = this.detectOfflinePlaceholder(imageBuffer);
            if (offlineCheck.isOffline) {
                const result = {
                    cameraId,
                    timestamp: Date.now(),
                    snowDetected: false,
                    snowLevel: 'offline',
                    whitePixelPercentage: 0,
                    confidence: offlineCheck.confidence,
                    cameraOffline: true,
                    reason: 'Camera offline - no data available',
                    offlineDetection: offlineCheck.stats,
                    processingTime: 1
                };
                cache.set(cacheKey, result);
                return result;
            }

            // Analyze the image for snow
            const analysisResult = await this.processImageForSnow(imageBuffer, cameraId, temperatureCheck);
            
            // Store in history for temporal analysis
            this.updateDetectionHistory(cameraId, analysisResult);
            
            // Apply temporal smoothing
            const smoothedResult = this.applyTemporalSmoothing(cameraId, analysisResult);
            
            cache.set(cacheKey, smoothedResult);
            return smoothedResult;

        } catch (error) {
            console.error(`Snow detection error for camera ${cameraId}:`, error.message);
            return this.getDefaultResult(cameraId, 'error');
        }
    }

    /**
     * Check temperature conditions to determine if snow analysis is needed
     * @param {Object} weatherData - Weather station data
     * @returns {Object} Temperature check result
     */
    checkTemperatureConditions(weatherData) {
        let temperature = null;
        let surfaceTemp = null;
        let skipAnalysis = false;
        let reason = '';
        let confidence = 0.5;
        let usingSurfaceTemp = false;

        // Prioritize road surface temperature over air temperature
        if (weatherData) {
            if (weatherData.surfaceTemp !== null && weatherData.surfaceTemp !== undefined) {
                surfaceTemp = parseFloat(weatherData.surfaceTemp);
                if (!isNaN(surfaceTemp)) {
                    temperature = surfaceTemp;
                    usingSurfaceTemp = true;
                    reason += 'Using road surface temp. ';
                }
            }
            // Fall back to air temperature if no surface temp
            if (temperature === null && weatherData.airTemperature !== null && weatherData.airTemperature !== undefined) {
                temperature = parseFloat(weatherData.airTemperature);
                if (isNaN(temperature)) temperature = null;
            }
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
        // For surface temp, use 35°F as threshold (snow won't stick on warm pavement)
        const noSnowThreshold = usingSurfaceTemp ? 35 : this.temperatureThresholds.noSnowTemp;

        if (temperature > noSnowThreshold) {
            skipAnalysis = true;
            confidence = 0.95;
            reason += `Too warm for snow (${Math.round(temperature)}°F${usingSurfaceTemp ? ' surface' : ''})`;
        } else if (temperature > this.temperatureThresholds.lowSnowTemp) {
            skipAnalysis = false; // Still analyze but adjust confidence
            confidence = 0.3; // Low confidence for snow in marginal temps
            reason += `Marginal snow conditions (${Math.round(temperature)}°F${usingSurfaceTemp ? ' surface' : ''})`;
        } else if (temperature < this.temperatureThresholds.heavySnowTemp) {
            skipAnalysis = false;
            confidence = 0.9; // High baseline confidence for very cold conditions
            reason += `Ideal snow conditions (${Math.round(temperature)}°F${usingSurfaceTemp ? ' surface' : ''})`;
        } else {
            skipAnalysis = false;
            confidence = 0.7; // Good confidence for typical snow temps
            reason += `Snow possible (${Math.round(temperature)}°F${usingSurfaceTemp ? ' surface' : ''})`;
        }

        return {
            temperature: Math.round(temperature),
            surfaceTemp: surfaceTemp !== null ? Math.round(surfaceTemp) : null,
            usingSurfaceTemp,
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
     * This is a simplified implementation - in production, you'd use image processing libraries
     * @param {Buffer} imageBuffer - Image data
     * @param {string} cameraId - Camera identifier
     * @param {Object} temperatureCheck - Temperature analysis result
     * @returns {Promise<Object>} Analysis result
     */
    async processImageForSnow(imageBuffer, cameraId, temperatureCheck = null) {
        const imageSize = imageBuffer.length;
        const timestamp = Date.now();

        // Run both pixel analysis and histogram analysis
        let whitePixelPercentage = this.simulateWhitePixelAnalysis(imageBuffer, cameraId);
        const histogramResult = this.analyzeRGBHistogram(imageBuffer);

        // Combine pixel analysis with histogram analysis for better accuracy
        // Use weighted average: 40% pixel analysis, 60% histogram (histogram is more robust)
        const combinedSnowScore = (whitePixelPercentage * 0.4) + (histogramResult.snowLikelihood * 0.6);

        // Apply temperature factor to adjust sensitivity
        if (temperatureCheck && temperatureCheck.temperatureFactor !== undefined) {
            whitePixelPercentage = combinedSnowScore * temperatureCheck.temperatureFactor;
        } else {
            whitePixelPercentage = combinedSnowScore;
        }

        // Determine snow level based on combined score
        const snowLevel = this.determineSnowLevel(whitePixelPercentage);

        // Calculate confidence based on various factors using new taxonomy
        // Boost confidence if histogram analysis agrees
        let confidence = this.calculateConfidence(
            whitePixelPercentage,
            snowLevel,
            cameraId,
            temperatureCheck
        );

        // Adjust confidence based on histogram agreement
        if (histogramResult.confidence > 0.7 && histogramResult.snowLikelihood > 50) {
            confidence = Math.min(0.95, confidence * 1.15); // Boost confidence
        }

        // Get semantic confidence level
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
            histogramAnalysis: histogramResult,
            imageSize,
            temperatureInfo: temperatureCheck,
            processingTime: Date.now() - timestamp
        };
    }

    /**
     * Analyze actual pixel data to detect white pixels (snow)
     * @param {Buffer} imageBuffer - Image data (RGB format)
     * @param {string} cameraId - Camera identifier
     * @returns {number} White pixel percentage
     */
    simulateWhitePixelAnalysis(imageBuffer, cameraId) {
        // Assume buffer is RGB format (3 bytes per pixel)
        const pixelCount = Math.floor(imageBuffer.length / 3);

        if (pixelCount === 0) return 0;

        let whitePixelCount = 0;

        // Analyze each pixel
        for (let i = 0; i < imageBuffer.length; i += 3) {
            const r = imageBuffer[i];
            const g = imageBuffer[i + 1];
            const b = imageBuffer[i + 2];

            // Calculate brightness (average of RGB)
            const brightness = (r + g + b) / 3;

            // Calculate saturation (how colorful vs grey/white)
            const max = Math.max(r, g, b);
            const min = Math.min(r, g, b);
            const saturation = max === 0 ? 0 : ((max - min) / max) * 100;

            // Calculate RGB balance (how close R, G, B are to each other)
            const avgRGB = (r + g + b) / 3;
            const rDiff = Math.abs(r - avgRGB);
            const gDiff = Math.abs(g - avgRGB);
            const bDiff = Math.abs(b - avgRGB);
            const maxDiff = Math.max(rDiff, gDiff, bDiff);
            const rgbBalance = avgRGB === 0 ? 0 : 1 - (maxDiff / avgRGB);

            // Detect white pixels (snow) using thresholds
            const isWhite = brightness >= this.colorParams.brightnessThreshold &&
                           saturation <= this.colorParams.saturationThreshold &&
                           rgbBalance >= this.colorParams.rgbBalanceThreshold;

            if (isWhite) {
                whitePixelCount++;
            }
        }

        const whitePixelPercentage = (whitePixelCount / pixelCount) * 100;
        return whitePixelPercentage;
    }

    /**
     * Analyze RGB histogram for snow detection
     * Snow signature: high concentration in 150-255 brightness range with low saturation
     * @param {Buffer} imageBuffer - Image data (RGB format)
     * @returns {Object} Histogram analysis result
     */
    analyzeRGBHistogram(imageBuffer) {
        const pixelCount = Math.floor(imageBuffer.length / 3);
        if (pixelCount === 0) {
            return { snowLikelihood: 0, confidence: 0, reason: 'No pixel data' };
        }

        // Build brightness histogram (256 bins)
        const brightnessHist = new Array(256).fill(0);
        // Track saturation for bright pixels
        let brightLowSatCount = 0;
        let brightPixelCount = 0;

        for (let i = 0; i < imageBuffer.length; i += 3) {
            const r = imageBuffer[i];
            const g = imageBuffer[i + 1];
            const b = imageBuffer[i + 2];

            const brightness = Math.floor((r + g + b) / 3);
            brightnessHist[brightness]++;

            // Track bright pixels (potential snow)
            if (brightness >= 140) {
                brightPixelCount++;
                const max = Math.max(r, g, b);
                const min = Math.min(r, g, b);
                const saturation = max === 0 ? 0 : ((max - min) / max) * 100;

                // Low saturation bright pixels are snow-like
                if (saturation <= 35) {
                    brightLowSatCount++;
                }
            }
        }

        // Calculate histogram statistics
        const snowRangePixels = brightnessHist.slice(150, 256).reduce((a, b) => a + b, 0);
        const darkRangePixels = brightnessHist.slice(0, 80).reduce((a, b) => a + b, 0);
        const midRangePixels = brightnessHist.slice(80, 150).reduce((a, b) => a + b, 0);

        const snowRangePercent = (snowRangePixels / pixelCount) * 100;
        const darkPercent = (darkRangePixels / pixelCount) * 100;

        // Bimodal detection: dark road + bright snow
        const isBimodal = darkPercent > 20 && snowRangePercent > 15;

        // Snow likelihood based on bright, low-saturation pixels
        const brightLowSatPercent = brightPixelCount > 0
            ? (brightLowSatCount / brightPixelCount) * 100
            : 0;

        // Calculate snow likelihood score (0-100)
        let snowLikelihood = 0;
        let confidence = 0.5;
        let reason = '';

        if (snowRangePercent >= 30 && brightLowSatPercent >= 70) {
            snowLikelihood = 90;
            confidence = 0.85;
            reason = 'High bright/low-saturation pixel concentration';
        } else if (snowRangePercent >= 20 && brightLowSatPercent >= 60) {
            snowLikelihood = 70;
            confidence = 0.75;
            reason = 'Moderate snow signature detected';
        } else if (isBimodal && brightLowSatPercent >= 50) {
            snowLikelihood = 60;
            confidence = 0.7;
            reason = 'Bimodal distribution (road + snow)';
        } else if (snowRangePercent >= 10 && brightLowSatPercent >= 40) {
            snowLikelihood = 40;
            confidence = 0.6;
            reason = 'Possible light snow coverage';
        } else {
            snowLikelihood = Math.min(20, snowRangePercent);
            confidence = 0.5;
            reason = 'Low snow signature';
        }

        return {
            snowLikelihood,
            confidence,
            reason,
            stats: {
                snowRangePercent: Math.round(snowRangePercent * 10) / 10,
                darkPercent: Math.round(darkPercent * 10) / 10,
                brightLowSatPercent: Math.round(brightLowSatPercent * 10) / 10,
                isBimodal
            }
        };
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
            console.warn(`Confidence warnings for ${cameraId}:`, validation.warnings);
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
     * Calculate multi-view consensus for cameras with multiple views
     * Requires majority agreement for snow detection
     * @param {Array} viewResults - Array of detection results from different views
     * @param {string} cameraId - Camera identifier
     * @returns {Object} Consensus detection result
     */
    calculateMultiViewConsensus(viewResults, cameraId) {
        if (!viewResults || viewResults.length === 0) {
            return this.getDefaultResult(cameraId, 'no_views');
        }

        // Check if all views are offline
        const offlineViews = viewResults.filter(r => r.cameraOffline || r.snowLevel === 'offline');
        if (offlineViews.length === viewResults.length) {
            // All views are offline - return offline status
            return {
                cameraId,
                timestamp: Date.now(),
                snowDetected: false,
                snowLevel: 'offline',
                whitePixelPercentage: 0,
                confidence: offlineViews[0].confidence || 0.8,
                cameraOffline: true,
                reason: 'Camera offline - no data available',
                consensusType: 'all_offline',
                viewsAnalyzed: viewResults.length,
                processingTime: 1
            };
        }

        // Filter out offline views for analysis
        const activeViews = viewResults.filter(r => !r.cameraOffline && r.snowLevel !== 'offline');

        // If no active views remain, return offline
        if (activeViews.length === 0) {
            return {
                cameraId,
                timestamp: Date.now(),
                snowDetected: false,
                snowLevel: 'offline',
                whitePixelPercentage: 0,
                confidence: 0.5,
                cameraOffline: true,
                reason: 'No active camera views available',
                consensusType: 'no_active_views',
                viewsAnalyzed: viewResults.length,
                offlineViews: offlineViews.length,
                processingTime: 1
            };
        }

        // Single active view - return as is
        if (activeViews.length === 1) {
            return {
                ...activeViews[0],
                cameraId,
                consensusType: 'single_view',
                viewsAnalyzed: activeViews.length,
                offlineViews: offlineViews.length
            };
        }

        // Count snow detections (majority vote) among active views
        const snowDetectedCount = activeViews.filter(r => r.snowDetected).length;
        const majorityThreshold = activeViews.length / 2;
        const snowDetectedByConsensus = snowDetectedCount > majorityThreshold;

        // Calculate agreement ratio (0-1)
        const agreementCount = snowDetectedByConsensus ? snowDetectedCount : (activeViews.length - snowDetectedCount);
        const consensusFactor = agreementCount / activeViews.length;

        // Average confidence across active views
        const avgConfidence = activeViews.reduce((sum, r) => sum + r.confidence, 0) / activeViews.length;

        // Final confidence = average confidence * consensus factor
        // High agreement boosts confidence, disagreement reduces it
        const finalConfidence = Math.min(0.95, avgConfidence * (0.7 + (consensusFactor * 0.3)));

        // Average white pixel percentage
        const avgWhitePixels = activeViews.reduce((sum, r) => sum + r.whitePixelPercentage, 0) / activeViews.length;

        // Determine snow level based on consensus
        let snowLevel = 'none';
        if (snowDetectedByConsensus) {
            // Use mode (most common) snow level among detecting views
            const detectingViews = activeViews.filter(r => r.snowDetected);
            const levelCounts = detectingViews.reduce((acc, r) => {
                acc[r.snowLevel] = (acc[r.snowLevel] || 0) + 1;
                return acc;
            }, {});

            snowLevel = Object.entries(levelCounts)
                .sort((a, b) => b[1] - a[1])[0]?.[0] || 'light';
        }

        // Get confidence level for display
        const confidenceLevel = getConfidenceLevel(finalConfidence);

        // Aggregate temperature info (use first available from active views)
        const temperatureInfo = activeViews.find(r => r.temperatureInfo)?.temperatureInfo || null;

        return {
            cameraId,
            timestamp: Date.now(),
            snowDetected: snowDetectedByConsensus,
            snowLevel,
            whitePixelPercentage: Math.round(avgWhitePixels * 10) / 10,
            confidence: Math.round(finalConfidence * 100) / 100,
            confidenceLevel: {
                name: confidenceLevel.name,
                displayText: confidenceLevel.displayText,
                badge: confidenceLevel.badge,
                color: confidenceLevel.color,
                icon: confidenceLevel.icon
            },
            consensusType: 'multi_view',
            viewsAnalyzed: activeViews.length,
            offlineViews: offlineViews.length,
            consensusFactor: Math.round(consensusFactor * 100) / 100,
            snowDetectingViews: snowDetectedCount,
            temperatureInfo,
            viewDetails: viewResults.map(r => ({
                snowDetected: r.snowDetected,
                snowLevel: r.snowLevel,
                confidence: r.confidence,
                whitePixelPercentage: r.whitePixelPercentage,
                cameraOffline: r.cameraOffline || false
            })),
            processingTime: viewResults.reduce((sum, r) => sum + (r.processingTime || 0), 0)
        };
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
                            const views = camera.views && camera.views.length > 0 ? camera.views : [];

                            if (views.length === 0) {
                                return this.getDefaultResult(camera.id, 'no_image_url');
                            }

                            // Find nearest weather station for temperature data
                            const nearestStation = this.findNearestWeatherStation(camera, weatherStations);

                            // Multi-view consensus: analyze all available views
                            const viewResults = await Promise.allSettled(
                                views.slice(0, 3).map(async (view, index) => { // Max 3 views
                                    if (!view.url || view.status === 'inactive') return null;
                                    return await this.analyzeImageForSnow(
                                        view.url,
                                        `${camera.id}_view${index}`,
                                        nearestStation
                                    );
                                })
                            );

                            // Filter successful results
                            const successfulResults = viewResults
                                .filter(r => r.status === 'fulfilled' && r.value !== null)
                                .map(r => r.value);

                            if (successfulResults.length === 0) {
                                return this.getDefaultResult(camera.id, 'no_valid_views');
                            }

                            // Multi-view consensus calculation
                            const result = this.calculateMultiViewConsensus(successfulResults, camera.id.toString());

                            return {
                                ...result,
                                cameraName: camera.name,
                                cameraLocation: { lat: camera.lat, lng: camera.lng },
                                viewsAnalyzed: successfulResults.length,
                                totalViews: views.length,
                                nearestStationDistance: nearestStation ?
                                    Math.round(this.calculateDistance(camera.lat, camera.lng, nearestStation.lat, nearestStation.lng)) : null
                            };
                        } catch (error) {
                            console.error(`Error analyzing camera ${camera.id}:`, error.message);
                            return this.getDefaultResult(camera.id.toString(), 'analysis_error');
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