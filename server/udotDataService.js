import fetch from 'node-fetch';
import NodeCache from 'node-cache';
import fs from 'fs/promises';
import path from 'path';

/**
 * UDOT Data Service
 * Comprehensive integration with UDOT API following enterprise architecture spec
 *
 * Features:
 * - Rate limiting (10 calls/60 seconds as per UDOT API constraints)
 * - GeoJSON transformation for all data types
 * - Support for Cameras, Weather Stations, Road Conditions, Events
 * - Data-driven conditional styling support
 * - Persistent caching for resilience
 */

// Optimized caching: 20 minutes for real-time data (UDOT data updates slowly)
const cache = new NodeCache({ stdTTL: 1200 }); // 20 minutes

// File-based persistent cache for backup
const CACHE_DIR = path.join(process.cwd(), '.cache');

const ensureCacheDir = async () => {
    try {
        await fs.mkdir(CACHE_DIR, { recursive: true });
    } catch (err) {
        // Directory might already exist
    }
};

class UDOTDataService {
    constructor() {
        this.udotApiKey = process.env.UDOT_API_KEY || '';

        // Rate limiting: UDOT allows max 10 calls per 60 seconds
        this.apiCallQueue = [];
        this.maxCallsPerMinute = 10;
        this.callWindowMs = 60000; // 60 seconds
        this.minCallInterval = 6000; // 6 seconds between calls (conservative)

        // API endpoints
        this.endpoints = {
            cameras: 'https://www.udottraffic.utah.gov/api/v2/get/cameras',
            weatherStations: 'https://www.udottraffic.utah.gov/api/v2/get/travelweatherstations',
            events: 'https://www.udottraffic.utah.gov/api/v2/get/event',
            alerts: 'https://www.udottraffic.utah.gov/api/v2/get/alerts',
            currentConditions: 'https://www.udottraffic.utah.gov/api/v2/get/currentconditions'
        };
    }

    /**
     * Rate-limited fetch with UDOT API throttling
     * Ensures we never exceed 10 calls per 60 seconds
     */
    async fetchWithThrottling(endpoint, params = {}) {
        // Clean old entries from call queue
        const now = Date.now();
        this.apiCallQueue = this.apiCallQueue.filter(
            timestamp => (now - timestamp) < this.callWindowMs
        );

        // Check if we're at the rate limit
        if (this.apiCallQueue.length >= this.maxCallsPerMinute) {
            const oldestCall = this.apiCallQueue[0];
            const waitTime = this.callWindowMs - (now - oldestCall);

            console.warn(`UDOT API rate limit reached. Waiting ${Math.ceil(waitTime / 1000)}s...`);
            await this.sleep(waitTime + 100); // Add 100ms buffer

            // Clean queue again after wait
            this.apiCallQueue = this.apiCallQueue.filter(
                timestamp => (Date.now() - timestamp) < this.callWindowMs
            );
        }

        // Wait minimum interval between calls
        if (this.apiCallQueue.length > 0) {
            const lastCall = this.apiCallQueue[this.apiCallQueue.length - 1];
            const timeSinceLastCall = now - lastCall;

            if (timeSinceLastCall < this.minCallInterval) {
                const waitTime = this.minCallInterval - timeSinceLastCall;
                await this.sleep(waitTime);
            }
        }

        // Make the API call
        const url = new URL(endpoint);
        url.searchParams.append('key', this.udotApiKey);
        url.searchParams.append('format', 'json');

        Object.entries(params).forEach(([key, value]) => {
            url.searchParams.append(key, value);
        });

        console.log(`Making UDOT API call: ${endpoint}`);
        this.apiCallQueue.push(Date.now());

        const response = await fetch(url.toString(), {
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'UintahBasinWeather/1.0'
            },
            timeout: 15000 // 15 second timeout
        });

        if (!response.ok) {
            throw new Error(`UDOT API error: ${response.status} ${response.statusText}`);
        }

        return response.json();
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Fetch UDOT Cameras
     * Returns GeoJSON FeatureCollection with camera locations and image URLs
     */
    async fetchCameras(region = null) {
        const cacheKey = `udot_cameras_${region || 'all'}`;

        // Check cache
        const cached = cache.get(cacheKey);
        if (cached) {
            console.log('Returning cameras from memory cache');
            return cached;
        }

        // Check disk cache
        const diskCached = await this.loadFromDiskCache(cacheKey, 20 * 60 * 1000); // 20 minutes
        if (diskCached) {
            cache.set(cacheKey, diskCached);
            return diskCached;
        }

        try {
            const data = await this.fetchWithThrottling(this.endpoints.cameras);

            // Transform to GeoJSON
            const geojson = this.transformCamerasToGeoJSON(data, region);

            // Cache
            cache.set(cacheKey, geojson);
            await this.saveToDiskCache(cacheKey, geojson);

            return geojson;
        } catch (error) {
            console.error('Error fetching UDOT cameras:', error);

            // Try to return stale cache as fallback
            const staleCache = await this.loadFromDiskCache(cacheKey, 24 * 60 * 60 * 1000);
            if (staleCache) {
                console.log('Returning stale camera data as fallback');
                return staleCache;
            }

            throw error;
        }
    }

    /**
     * Transform UDOT camera data to GeoJSON Point features
     */
    transformCamerasToGeoJSON(cameras, regionFilter = null) {
        const features = cameras
            .filter(camera => {
                // Filter by region if specified
                if (regionFilter && camera.Region) {
                    return camera.Region.toLowerCase().includes(regionFilter.toLowerCase());
                }
                return true;
            })
            .filter(camera => camera.Latitude && camera.Longitude)
            .map(camera => ({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [parseFloat(camera.Longitude), parseFloat(camera.Latitude)]
                },
                properties: {
                    feature_type: 'camera',
                    id: camera.Id,
                    name: camera.Location || 'Unknown Location',
                    location: camera.Location || '',
                    source: camera.Source || '',
                    source_id: camera.SourceId || '',
                    // Add views array for multiple camera angles (like roadWeatherService.js)
                    views: (camera.Views || []).map(view => ({
                        url: view.Url,
                        status: view.Status,
                        description: view.Description || ''
                    })),
                    // Keep for backwards compatibility
                    image_url: camera.Views && camera.Views[0]?.Url || '',
                    roadway: camera.Roadway || '',
                    direction: camera.Direction || '',
                    sort_order: camera.SortOrder || 0
                }
            }));

        return {
            type: 'FeatureCollection',
            metadata: {
                generated: new Date().toISOString(),
                source: 'UDOT Traffic API',
                total_cameras: features.length,
                region_filter: regionFilter
            },
            features
        };
    }

    /**
     * Fetch UDOT Weather Stations
     * Returns GeoJSON FeatureCollection with station data and sensor readings
     */
    async fetchWeatherStations(region = null) {
        const cacheKey = `udot_weather_stations_${region || 'all'}`;

        const cached = cache.get(cacheKey);
        if (cached) {
            console.log('Returning weather stations from memory cache');
            return cached;
        }

        const diskCached = await this.loadFromDiskCache(cacheKey, 5 * 60 * 1000);
        if (diskCached) {
            cache.set(cacheKey, diskCached);
            return diskCached;
        }

        try {
            const data = await this.fetchWithThrottling(this.endpoints.weatherStations);

            const geojson = this.transformWeatherStationsToGeoJSON(data, region);

            cache.set(cacheKey, geojson);
            await this.saveToDiskCache(cacheKey, geojson);

            return geojson;
        } catch (error) {
            console.error('Error fetching UDOT weather stations:', error);

            const staleCache = await this.loadFromDiskCache(cacheKey, 24 * 60 * 60 * 1000);
            if (staleCache) {
                console.log('Returning stale weather station data as fallback');
                return staleCache;
            }

            throw error;
        }
    }

    /**
     * Transform UDOT weather station data to GeoJSON Point features
     */
    transformWeatherStationsToGeoJSON(stations, regionFilter = null) {
        const features = stations
            .filter(station => {
                if (regionFilter && station.Region) {
                    return station.Region.toLowerCase().includes(regionFilter.toLowerCase());
                }
                return true;
            })
            .filter(station => station.Latitude && station.Longitude)
            .map(station => ({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [parseFloat(station.Longitude), parseFloat(station.Latitude)]
                },
                properties: {
                    feature_type: 'weather_station',
                    id: station.Id,
                    name: station.Name || 'Unnamed Station',
                    roadway: station.RoadwayName || '',
                    region: station.Region || 'Unknown',

                    // Weather data
                    temperature: station.AirTemperature,
                    temperature_unit: '°F',
                    road_temperature: station.RoadSurfaceTemperature,
                    wind_speed: station.WindSpeed,
                    wind_speed_unit: 'mph',
                    wind_direction: station.WindDirection,
                    visibility: station.Visibility,
                    visibility_unit: 'miles',
                    precipitation_rate: station.PrecipitationRate,
                    road_condition: station.RoadCondition || 'Unknown',

                    // Metadata
                    elevation: station.Elevation,
                    last_updated: station.LastUpdated ? new Date(station.LastUpdated * 1000).toISOString() : null,
                    is_active: station.IsActive !== false
                }
            }));

        return {
            type: 'FeatureCollection',
            metadata: {
                generated: new Date().toISOString(),
                source: 'UDOT Travel Weather API',
                total_stations: features.length,
                region_filter: regionFilter
            },
            features
        };
    }

    /**
     * Fetch UDOT Current Road Conditions
     * Returns GeoJSON with condition_level for data-driven styling
     */
    async fetchRoadConditions(region = null) {
        const cacheKey = `udot_road_conditions_${region || 'all'}`;

        const cached = cache.get(cacheKey);
        if (cached) {
            console.log('Returning road conditions from memory cache');
            return cached;
        }

        const diskCached = await this.loadFromDiskCache(cacheKey, 5 * 60 * 1000);
        if (diskCached) {
            cache.set(cacheKey, diskCached);
            return diskCached;
        }

        try {
            const data = await this.fetchWithThrottling(this.endpoints.currentConditions);

            const geojson = this.transformRoadConditionsToGeoJSON(data, region);

            cache.set(cacheKey, geojson);
            await this.saveToDiskCache(cacheKey, geojson);

            return geojson;
        } catch (error) {
            console.error('Error fetching UDOT road conditions:', error);

            const staleCache = await this.loadFromDiskCache(cacheKey, 24 * 60 * 60 * 1000);
            if (staleCache) {
                console.log('Returning stale road condition data as fallback');
                return staleCache;
            }

            throw error;
        }
    }

    /**
     * Transform road conditions to GeoJSON
     * Maps condition descriptions to numerical levels for data-driven styling
     */
    transformRoadConditionsToGeoJSON(conditions, regionFilter = null) {
        const features = conditions
            .filter(condition => {
                if (regionFilter && condition.Region) {
                    return condition.Region.toLowerCase().includes(regionFilter.toLowerCase());
                }
                return true;
            })
            .filter(condition => condition.Latitude && condition.Longitude)
            .map(condition => {
                const conditionLevel = this.mapConditionToLevel(condition.Condition);

                return {
                    type: 'Feature',
                    geometry: {
                        type: 'Point', // Note: Would be LineString in production with highway network data
                        coordinates: [parseFloat(condition.Longitude), parseFloat(condition.Latitude)]
                    },
                    properties: {
                        feature_type: 'road_condition',
                        id: condition.Id,
                        roadway: condition.RoadwayName || 'Unknown',
                        direction: condition.DirectionOfTravel || '',
                        region: condition.Region || 'Unknown',

                        // Data-driven styling property (1-5 scale)
                        condition_level: conditionLevel,

                        // Original condition data
                        weather_description: condition.Condition || 'Unknown',
                        description: condition.Description || '',

                        // Metadata
                        last_updated: condition.LastUpdated ? new Date(condition.LastUpdated * 1000).toISOString() : null,
                        mile_post: condition.MilePost
                    }
                };
            });

        return {
            type: 'FeatureCollection',
            metadata: {
                generated: new Date().toISOString(),
                source: 'UDOT Current Conditions API',
                total_conditions: features.length,
                region_filter: regionFilter,
                condition_level_mapping: {
                    1: 'Clear/Dry',
                    2: 'Wet/Minor',
                    3: 'Snow/Ice',
                    4: 'Hazardous',
                    5: 'Closed'
                }
            },
            features
        };
    }

    /**
     * Map UDOT condition description to numerical level (1-5)
     * For data-driven conditional styling in Azure Maps
     */
    mapConditionToLevel(conditionString) {
        if (!conditionString) return 1;

        const condition = conditionString.toLowerCase();

        // Level 5: Road Closure / Severe
        if (condition.includes('closed') || condition.includes('impassable')) {
            return 5;
        }

        // Level 4: Hazardous (travel not recommended)
        if (condition.includes('very poor') ||
            condition.includes('extremely hazardous') ||
            condition.includes('severe')) {
            return 4;
        }

        // Level 3: Snow/Ice (high caution)
        if (condition.includes('snow') ||
            condition.includes('ice') ||
            condition.includes('packed') ||
            condition.includes('slush') ||
            condition.includes('poor')) {
            return 3;
        }

        // Level 2: Wet/Minor impacts
        if (condition.includes('wet') ||
            condition.includes('damp') ||
            condition.includes('rain') ||
            condition.includes('fair')) {
            return 2;
        }

        // Level 1: Clear/Dry (default)
        return 1;
    }

    /**
     * Fetch UDOT Traffic Events
     * Returns GeoJSON FeatureCollection with construction/roadwork/closure events
     */
    async fetchEvents(region = null) {
        const cacheKey = `udot_events_${region || 'all'}`;

        // Check cache
        const cached = cache.get(cacheKey);
        if (cached) {
            console.log('Returning events from memory cache');
            return cached;
        }

        // Check disk cache
        const diskCached = await this.loadFromDiskCache(cacheKey, 20 * 60 * 1000); // 20 minutes
        if (diskCached) {
            cache.set(cacheKey, diskCached);
            return diskCached;
        }

        try {
            const data = await this.fetchWithThrottling(this.endpoints.events);

            // Transform to GeoJSON
            const geojson = this.transformEventsToGeoJSON(data, region);

            // Cache
            cache.set(cacheKey, geojson);
            await this.saveToDiskCache(cacheKey, geojson);

            return geojson;
        } catch (error) {
            console.error('Error fetching UDOT events:', error);

            // Try to return stale cache as fallback
            const staleCache = await this.loadFromDiskCache(cacheKey, 24 * 60 * 60 * 1000);
            if (staleCache) {
                console.log('Returning stale event data as fallback');
                return staleCache;
            }

            throw error;
        }
    }

    /**
     * Transform UDOT event data to GeoJSON Point features
     */
    transformEventsToGeoJSON(events, regionFilter = null) {
        const features = events
            .filter(event => event.Latitude && event.Longitude)
            .map(event => {
                // Calculate priority score
                const priority = this.calculateEventPriority(event);
                const displayIcon = this.getEventIcon(event);
                const displayColor = this.getEventColor(event);

                return {
                    type: 'Feature',
                    geometry: {
                        type: 'Point',
                        coordinates: [parseFloat(event.Longitude), parseFloat(event.Latitude)]
                    },
                    properties: {
                        feature_type: 'construction_event',
                        id: event.ID,
                        name: event.Name || event.Location || 'Unnamed Event',
                        roadway: event.RoadwayName || '',
                        direction: event.DirectionOfTravel || '',
                        description: event.Description || '',
                        location: event.Location || '',
                        county: event.County || '',
                        event_type: event.EventType || '',
                        event_category: event.EventCategory || '',
                        event_subtype: event.EventSubType || '',
                        start_date: event.StartDate ? new Date(event.StartDate * 1000).toISOString() : null,
                        planned_end_date: event.PlannedEndDate ? new Date(event.PlannedEndDate * 1000).toISOString() : null,
                        reported: event.Reported ? new Date(event.Reported * 1000).toISOString() : null,
                        last_updated: event.LastUpdated ? new Date(event.LastUpdated * 1000).toISOString() : null,
                        is_full_closure: event.IsFullClosure || false,
                        severity: event.Severity || 'Unknown',
                        lanes_affected: event.LanesAffected || '',
                        comment: event.Comment || '',
                        priority: priority,
                        display_icon: displayIcon,
                        display_color: displayColor,
                        encoded_polyline: event.EncodedPolyline || '',
                        detour_polyline: event.DetourPolyline || '',
                        detour_instructions: event.DetourInstructions || '',
                        recurrence: event.Recurrence || '',
                        mp_start: event.MPStart || '',
                        mp_end: event.MPEnd || ''
                    }
                };
            });

        return {
            type: 'FeatureCollection',
            metadata: {
                generated: new Date().toISOString(),
                source: 'UDOT Traffic API',
                total_events: features.length,
                region_filter: regionFilter
            },
            features
        };
    }

    /**
     * Calculate event priority for display ordering
     */
    calculateEventPriority(event) {
        let priority = 0;

        // High priority for full closures
        if (event.IsFullClosure) priority += 10;

        // High priority for current/active events
        const now = new Date();
        const startDate = new Date(event.StartDate * 1000);
        const endDate = event.PlannedEndDate ? new Date(event.PlannedEndDate * 1000) : null;

        if (startDate <= now && (!endDate || endDate >= now)) {
            priority += 8; // Currently active
        } else if (startDate > now) {
            const daysUntilStart = (startDate - now) / (1000 * 60 * 60 * 24);
            if (daysUntilStart <= 7) priority += 6;
            else if (daysUntilStart <= 30) priority += 3;
        }

        // Event type priorities
        const eventType = (event.EventType || '').toLowerCase();
        if (eventType === 'accidentsandincidents') priority += 9;
        else if (eventType === 'closures') priority += 8;
        else if (eventType === 'roadwork') priority += 5;

        // Severity priorities
        const severity = (event.Severity || '').toLowerCase();
        if (severity.includes('major') || severity.includes('high')) priority += 5;
        else if (severity.includes('moderate') || severity.includes('medium')) priority += 3;
        else if (severity.includes('minor') || severity.includes('low')) priority += 1;

        return Math.max(0, priority);
    }

    /**
     * Get display icon for event type
     */
    getEventIcon(event) {
        const eventType = (event.EventType || '').toLowerCase();
        const eventCategory = (event.EventCategory || '').toLowerCase();

        if (eventType === 'accidentsandincidents') return '🚨';
        if (eventType === 'closures' || event.IsFullClosure) return '🚫';
        if (eventType === 'roadwork' || eventCategory.includes('construction')) return '🚧';
        if (eventCategory.includes('weather')) return '🌨️';
        if (eventCategory.includes('maintenance')) return '🔧';

        return '⚠️'; // Default warning icon
    }

    /**
     * Get display color for event type/severity
     */
    getEventColor(event) {
        if (event.IsFullClosure) return '#dc2626'; // Red for closures

        const eventType = (event.EventType || '').toLowerCase();
        const severity = (event.Severity || '').toLowerCase();

        if (eventType === 'accidentsandincidents') return '#dc2626'; // Red for accidents
        if (severity.includes('major') || severity.includes('high')) return '#dc2626'; // Red for major
        if (eventType === 'closures') return '#dc2626'; // Red for closures
        if (severity.includes('moderate') || severity.includes('medium')) return '#f59e0b'; // Orange for moderate
        if (eventType === 'roadwork') return '#f59e0b'; // Orange for roadwork

        return '#10b981'; // Green for minor/info
    }

    /**
     * Fetch UDOT Alerts
     * Returns array of active alerts
     */
    async fetchAlerts() {
        const cacheKey = 'udot_alerts';

        // Check cache
        const cached = cache.get(cacheKey);
        if (cached) {
            console.log('Returning alerts from memory cache');
            return cached;
        }

        // Check disk cache
        const diskCached = await this.loadFromDiskCache(cacheKey, 20 * 60 * 1000); // 20 minutes
        if (diskCached) {
            cache.set(cacheKey, diskCached);
            return diskCached;
        }

        try {
            const data = await this.fetchWithThrottling(this.endpoints.alerts);

            // Process alerts
            const processedAlerts = data
                .filter(alert => this.isAlertActive(alert))
                .map(alert => ({
                    id: alert.Id,
                    message: alert.Message || '',
                    notes: alert.Notes || '',
                    start_time: alert.StartTime ? new Date(alert.StartTime * 1000).toISOString() : null,
                    end_time: alert.EndTime ? new Date(alert.EndTime * 1000).toISOString() : null,
                    regions: alert.Regions || [],
                    high_importance: alert.HighImportance || false,
                    send_notification: alert.SendNotification || false
                }));

            // Cache
            cache.set(cacheKey, processedAlerts);
            await this.saveToDiskCache(cacheKey, processedAlerts);

            return processedAlerts;
        } catch (error) {
            console.error('Error fetching UDOT alerts:', error);

            // Try to return stale cache as fallback
            const staleCache = await this.loadFromDiskCache(cacheKey, 24 * 60 * 60 * 1000);
            if (staleCache) {
                console.log('Returning stale alert data as fallback');
                return staleCache;
            }

            return []; // Return empty array instead of throwing
        }
    }

    /**
     * Check if alert is currently active
     */
    isAlertActive(alert) {
        const now = Date.now() / 1000; // Convert to Unix timestamp
        const startTime = alert.StartTime;
        const endTime = alert.EndTime;

        if (startTime && startTime > now) return false; // Not started yet
        if (endTime && endTime < now) return false; // Already ended

        return true;
    }

    /**
     * Fetch all UDOT data sources in parallel (respecting rate limits)
     * For comprehensive map display
     */
    async fetchAllMapData(region = null) {
        try {
            console.log('Fetching all UDOT map data...');

            // Sequential calls to respect rate limiting
            const cameras = await this.fetchCameras(region);
            await this.sleep(this.minCallInterval);

            const weatherStations = await this.fetchWeatherStations(region);
            await this.sleep(this.minCallInterval);

            const roadConditions = await this.fetchRoadConditions(region);

            return {
                cameras,
                weatherStations,
                roadConditions,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.error('Error fetching all map data:', error);
            throw error;
        }
    }

    /**
     * Get Provo Canyon specific data (OPTIMIZED)
     * Filters for US-189 corridor area with aggressive caching and parallel fetching
     */
    async getProvoCanyonData() {
        const provoCanyonCacheKey = 'provo_canyon_complete_data';
        const startTime = Date.now();

        // 1. Check if complete Provo Canyon data is cached (FASTEST PATH)
        const cachedProvoData = cache.get(provoCanyonCacheKey);
        if (cachedProvoData) {
            console.log(`✓ Serving Provo Canyon data from cache (${Date.now() - startTime}ms)`);
            return cachedProvoData;
        }

        // 2. Check disk cache for complete Provo Canyon data
        const diskCachedProvoData = await this.loadFromDiskCache(provoCanyonCacheKey, 20 * 60 * 1000);
        if (diskCachedProvoData) {
            console.log(`✓ Serving Provo Canyon data from disk cache (${Date.now() - startTime}ms)`);
            cache.set(provoCanyonCacheKey, diskCachedProvoData);

            // Refresh data in background without blocking response (stale-while-revalidate)
            this.refreshProvoCanyonDataInBackground().catch(err =>
                console.warn('Background refresh failed:', err.message)
            );

            return diskCachedProvoData;
        }

        // 3. Cache miss - fetch fresh data (PARALLEL FETCHING)
        console.log('⚠ Cache miss - fetching fresh Provo Canyon data...');

        const bounds = {
            north: 40.6,
            south: 40.2,
            east: -111.3,
            west: -111.7
        };

        const filterByBounds = (features) => features.filter(feature => {
            const [lng, lat] = feature.geometry.coordinates;
            return lat >= bounds.south && lat <= bounds.north &&
                   lng >= bounds.west && lng <= bounds.east;
        });

        // Fetch all data in parallel using Promise.allSettled (failures won't block successes)
        const [camerasResult, weatherResult, conditionsResult, eventsResult, alertsResult] = await Promise.allSettled([
            this.fetchCameras(),
            this.fetchWeatherStations(),
            this.fetchRoadConditions(),
            this.fetchEvents(),
            this.fetchAlerts()
        ]);

        console.log(`✓ Parallel fetch completed in ${Date.now() - startTime}ms`);

        // Process cameras (critical)
        let cameras = { type: 'FeatureCollection', features: [] };
        if (camerasResult.status === 'fulfilled') {
            const boundedCameras = filterByBounds(camerasResult.value.features);
            const us189Cameras = boundedCameras.filter(feature => {
                const roadway = feature.properties.roadway || '';
                return roadway.match(/\b(US|SR|HWY|Highway)[\s-]?189\b/i) ||
                       roadway.toLowerCase().includes('provo canyon');
            });
            cameras = { ...camerasResult.value, features: us189Cameras };
            console.log(`✓ Loaded ${cameras.features.length} cameras on US-189`);
        } else {
            console.error('Failed to fetch cameras:', camerasResult.reason?.message);
        }

        // Process weather stations (optional)
        let weatherStations = { type: 'FeatureCollection', features: [] };
        if (weatherResult.status === 'fulfilled') {
            weatherStations = {
                ...weatherResult.value,
                features: filterByBounds(weatherResult.value.features)
            };
            console.log(`✓ Loaded ${weatherStations.features.length} weather stations`);
        } else {
            console.warn('⚠ Weather stations unavailable:', weatherResult.reason?.message);
        }

        // Process road conditions (optional)
        let roadConditions = { type: 'FeatureCollection', features: [] };
        if (conditionsResult.status === 'fulfilled') {
            roadConditions = {
                ...conditionsResult.value,
                features: filterByBounds(conditionsResult.value.features)
            };
            console.log(`✓ Loaded ${roadConditions.features.length} road conditions`);
        } else {
            console.warn('⚠ Road conditions unavailable:', conditionsResult.reason?.message);
        }

        // Process construction events (optional)
        let constructionEvents = { type: 'FeatureCollection', features: [] };
        if (eventsResult.status === 'fulfilled') {
            const boundedEvents = filterByBounds(eventsResult.value.features);
            const us189Events = boundedEvents.filter(feature => {
                const roadway = feature.properties.roadway || '';
                const location = feature.properties.location || '';
                const description = feature.properties.description || '';
                return roadway.match(/\b(US|SR|HWY|Highway)[\s-]?189\b/i) ||
                       roadway.toLowerCase().includes('provo canyon') ||
                       location.toLowerCase().includes('provo canyon') ||
                       description.toLowerCase().includes('provo canyon') ||
                       description.match(/\b(US|SR|HWY|Highway)[\s-]?189\b/i);
            });
            constructionEvents = { ...eventsResult.value, features: us189Events };
            console.log(`✓ Loaded ${constructionEvents.features.length} construction events`);
        } else {
            console.warn('⚠ Construction events unavailable:', eventsResult.reason?.message);
        }

        // Process alerts (optional)
        let alerts = [];
        if (alertsResult.status === 'fulfilled') {
            const provoCanyonKeywords = [
                'provo canyon', 'us-189', 'us 189', 'highway 189',
                'wasatch', 'utah county', 'wallsburg', 'charleston', 'deer creek'
            ];
            alerts = alertsResult.value.filter(alert => {
                const message = (alert.message || '').toLowerCase();
                const notes = (alert.notes || '').toLowerCase();
                const regions = alert.regions || [];
                return provoCanyonKeywords.some(keyword =>
                    message.includes(keyword) ||
                    notes.includes(keyword) ||
                    regions.some(region => region.toLowerCase().includes(keyword))
                );
            });
            console.log(`✓ Loaded ${alerts.length} relevant alerts`);
        } else {
            console.warn('⚠ Alerts unavailable:', alertsResult.reason?.message);
        }

        const result = {
            cameras,
            weatherStations,
            roadConditions,
            constructionEvents,
            alerts,
            timestamp: new Date().toISOString()
        };

        // Cache the complete result
        cache.set(provoCanyonCacheKey, result);
        await this.saveToDiskCache(provoCanyonCacheKey, result);

        console.log(`✓ Total Provo Canyon data fetch completed in ${Date.now() - startTime}ms`);
        return result;
    }

    /**
     * Background refresh for stale-while-revalidate pattern
     * Updates cache without blocking the current request
     */
    async refreshProvoCanyonDataInBackground() {
        console.log('🔄 Background refresh: Updating Provo Canyon cache...');
        const provoCanyonCacheKey = 'provo_canyon_complete_data';

        // Temporarily remove from cache to force fresh fetch
        cache.del(provoCanyonCacheKey);

        // Fetch fresh data
        await this.getProvoCanyonData();

        console.log('✓ Background refresh completed');
    }

    // Disk cache helper methods
    async saveToDiskCache(key, data) {
        try {
            await ensureCacheDir();
            const filePath = path.join(CACHE_DIR, `${key}.json`);
            const cacheData = {
                timestamp: Date.now(),
                data: data
            };
            await fs.writeFile(filePath, JSON.stringify(cacheData), 'utf8');
        } catch (error) {
            console.warn('Failed to save to disk cache:', error.message);
        }
    }

    async loadFromDiskCache(key, maxAge) {
        try {
            const filePath = path.join(CACHE_DIR, `${key}.json`);
            const fileContent = await fs.readFile(filePath, 'utf8');
            const cacheData = JSON.parse(fileContent);

            const now = Date.now();
            const age = now - cacheData.timestamp;

            if (age < maxAge) {
                console.log(`Loading ${key} from disk cache (age: ${Math.round(age / 1000 / 60)} minutes)`);
                return cacheData.data;
            } else {
                console.log(`Disk cache for ${key} expired`);
                await fs.unlink(filePath).catch(() => {});
                return null;
            }
        } catch (error) {
            return null;
        }
    }
}

export default UDOTDataService;
