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
     * This is a simplified implementation - in production, you'd use image processing libraries
     * @param {Buffer} imageBuffer - Image data
     * @param {string} cameraId - Camera identifier
     * @param {Object} temperatureCheck - Temperature analysis result
     * @returns {Promise<Object>} Analysis result
     */
    async processImageForSnow(imageBuffer, cameraId, temperatureCheck = null) {
        // For this implementation, we'll simulate snow detection based on image characteristics
        // In a real implementation, you'd use libraries like sharp, jimp, or opencv4nodejs
        
        const imageSize = imageBuffer.length;
        const timestamp = Date.now();
        
        // Simulate white pixel analysis based on image entropy and size
        let whitePixelPercentage = this.simulateWhitePixelAnalysis(imageBuffer, cameraId);
        
        // Apply temperature factor to adjust sensitivity
        if (temperatureCheck && temperatureCheck.temperatureFactor !== undefined) {
            whitePixelPercentage *= temperatureCheck.temperatureFactor;
        }
        
        // Determine snow level
        const snowLevel = this.determineSnowLevel(whitePixelPercentage);

        // Calculate confidence based on various factors using new taxonomy
        const confidence = this.calculateConfidence(
            whitePixelPercentage,
            snowLevel,
            cameraId,
            temperatureCheck
        );

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
        const results = [];
        
        // Process cameras in parallel with concurrency limit
        const concurrencyLimit = 5;
        const chunks = [];
        
        for (let i = 0; i < cameras.length; i += concurrencyLimit) {
            chunks.push(cameras.slice(i, i + concurrencyLimit));
        }
        
        for (const chunk of chunks) {
            const chunkPromises = chunk.map(async (camera) => {
                try {
                    // Use first view for analysis (could be enhanced to analyze multiple views)
                    const imageUrl = camera.views && camera.views.length > 0 ? camera.views[0].url : null;
                    
                    if (!imageUrl) {
                        return this.getDefaultResult(camera.id, 'no_image_url');
                    }
                    
                    // Find nearest weather station for temperature data
                    const nearestStation = this.findNearestWeatherStation(camera, weatherStations);
                    
                    const result = await this.analyzeImageForSnow(
                        imageUrl, 
                        camera.id.toString(),
                        nearestStation
                    );
                    
                    return {
                        ...result,
                        cameraName: camera.name,
                        cameraLocation: { lat: camera.lat, lng: camera.lng },
                        nearestStationDistance: nearestStation ? 
                            Math.round(this.calculateDistance(camera.lat, camera.lng, nearestStation.lat, nearestStation.lng)) : null
                    };
                } catch (error) {
                    console.error(`Error analyzing camera ${camera.id}:`, error.message);
                    return this.getDefaultResult(camera.id.toString(), 'analysis_error');
                }
            });
            
            const chunkResults = await Promise.allSettled(chunkPromises);
            const successfulResults = chunkResults
                .filter(result => result.status === 'fulfilled')
                .map(result => result.value);
                
            results.push(...successfulResults);
        }
        
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