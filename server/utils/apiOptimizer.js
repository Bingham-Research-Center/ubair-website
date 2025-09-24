import NodeCache from 'node-cache';
import fs from 'fs/promises';
import path from 'path';

/**
 * API Optimization Utilities for UDOT API usage
 * Provides intelligent caching, rate limiting, and request deduplication
 */

// Configuration from environment variables with sensible defaults
const config = {
    // Cache TTL values in seconds
    CACHE_TTL_SHORT: parseInt(process.env.CACHE_TTL_SHORT) || 300,      // 5 minutes - for frequently changing data
    CACHE_TTL_MEDIUM: parseInt(process.env.CACHE_TTL_MEDIUM) || 1800,   // 30 minutes - for moderate changes
    CACHE_TTL_LONG: parseInt(process.env.CACHE_TTL_LONG) || 7200,       // 2 hours - for slow changing data
    CACHE_TTL_STATIC: parseInt(process.env.CACHE_TTL_STATIC) || 86400,  // 24 hours - for static-like data
    
    // Rate limiting
    MIN_API_INTERVAL: parseInt(process.env.MIN_API_INTERVAL) || 30000,  // 30 seconds between API calls
    
    // Disk cache settings
    DISK_CACHE_DIR: process.env.DISK_CACHE_DIR || path.join(process.cwd(), '.cache'),
    DISK_CACHE_MAX_AGE: parseInt(process.env.DISK_CACHE_MAX_AGE) || 7200000, // 2 hours in ms
    
    // Stale data fallback thresholds
    STALE_DATA_MAX_AGE: parseInt(process.env.STALE_DATA_MAX_AGE) || 86400000, // 24 hours in ms
};

// Memory cache with optimized settings
const memoryCache = new NodeCache({ 
    stdTTL: config.CACHE_TTL_MEDIUM,
    checkperiod: 60,
    useClones: false, // Better performance for read-only data
    maxKeys: 1000     // Prevent memory bloat
});

// Request deduplication map - prevents concurrent identical requests
const pendingRequests = new Map();

// Rate limiting tracker
const lastApiCalls = new Map();

// API quota tracking
const apiQuotaTracker = {
    hourlyCallCount: 0,
    dailyCallCount: 0,
    lastHourReset: Date.now(),
    lastDayReset: Date.now(),
    
    incrementCall() {
        const now = Date.now();
        
        // Reset hourly counter
        if (now - this.lastHourReset > 3600000) { // 1 hour
            this.hourlyCallCount = 0;
            this.lastHourReset = now;
        }
        
        // Reset daily counter
        if (now - this.lastDayReset > 86400000) { // 24 hours
            this.dailyCallCount = 0;
            this.lastDayReset = now;
        }
        
        this.hourlyCallCount++;
        this.dailyCallCount++;
    },
    
    getStats() {
        return {
            hourlyCallCount: this.hourlyCallCount,
            dailyCallCount: this.dailyCallCount,
            lastHourReset: new Date(this.lastHourReset).toISOString(),
            lastDayReset: new Date(this.lastDayReset).toISOString()
        };
    }
};

/**
 * Ensure cache directory exists
 */
async function ensureCacheDir() {
    try {
        await fs.mkdir(config.DISK_CACHE_DIR, { recursive: true });
    } catch (error) {
        console.warn('Failed to create cache directory:', error.message);
    }
}

/**
 * Smart cache key generator with compression for complex objects
 */
function generateCacheKey(baseKey, params = {}) {
    if (Object.keys(params).length === 0) return baseKey;
    
    const paramString = JSON.stringify(params, Object.keys(params).sort());
    const hash = require('crypto').createHash('md5').update(paramString).digest('hex').substring(0, 8);
    return `${baseKey}_${hash}`;
}

/**
 * Save data to persistent disk cache
 */
async function saveToDiskCache(key, data, maxAge = config.DISK_CACHE_MAX_AGE) {
    try {
        await ensureCacheDir();
        const filePath = path.join(config.DISK_CACHE_DIR, `${key}.json`);
        const cacheData = {
            timestamp: Date.now(),
            maxAge: maxAge,
            data: data,
            size: JSON.stringify(data).length
        };
        await fs.writeFile(filePath, JSON.stringify(cacheData), 'utf8');
    } catch (error) {
        console.warn(`Failed to save to disk cache [${key}]:`, error.message);
    }
}

/**
 * Load data from persistent disk cache
 */
async function loadFromDiskCache(key, maxAge = config.DISK_CACHE_MAX_AGE) {
    try {
        const filePath = path.join(config.DISK_CACHE_DIR, `${key}.json`);
        const fileContent = await fs.readFile(filePath, 'utf8');
        const cacheData = JSON.parse(fileContent);
        
        const age = Date.now() - cacheData.timestamp;
        if (age <= (cacheData.maxAge || maxAge)) {
            return cacheData.data;
        }
        
        // Data is stale, but might be useful as fallback
        return null;
    } catch (error) {
        // File doesn't exist or is corrupted
        return null;
    }
}

/**
 * Load stale data as fallback when API fails
 */
async function loadStaleDataFallback(key) {
    try {
        const filePath = path.join(config.DISK_CACHE_DIR, `${key}.json`);
        const fileContent = await fs.readFile(filePath, 'utf8');
        const cacheData = JSON.parse(fileContent);
        
        const age = Date.now() - cacheData.timestamp;
        if (age <= config.STALE_DATA_MAX_AGE) {
            console.warn(`Using stale data fallback [${key}], age: ${Math.round(age / 60000)} minutes`);
            return cacheData.data;
        }
        
        return null;
    } catch (error) {
        return null;
    }
}

/**
 * Rate limiting check
 */
function isRateLimited(apiCallKey) {
    const lastCall = lastApiCalls.get(apiCallKey);
    if (lastCall && (Date.now() - lastCall) < config.MIN_API_INTERVAL) {
        return true;
    }
    return false;
}

/**
 * Update rate limiting tracker
 */
function updateRateLimit(apiCallKey) {
    lastApiCalls.set(apiCallKey, Date.now());
    apiQuotaTracker.incrementCall();
}

/**
 * Optimized cache fetch with multi-layer fallback
 */
async function optimizedFetch(cacheKey, fetchFunction, options = {}) {
    const {
        ttl = config.CACHE_TTL_MEDIUM,
        diskCacheMaxAge = config.DISK_CACHE_MAX_AGE,
        apiCallKey = cacheKey,
        retryOnError = true,
        useStaleOnError = true
    } = options;
    
    // 1. Check memory cache first
    const memoryData = memoryCache.get(cacheKey);
    if (memoryData) {
        return memoryData;
    }
    
    // 2. Check disk cache
    const diskData = await loadFromDiskCache(cacheKey, diskCacheMaxAge);
    if (diskData) {
        // Restore to memory cache
        memoryCache.set(cacheKey, diskData, ttl);
        return diskData;
    }
    
    // 3. Check if request is already pending (deduplication)
    if (pendingRequests.has(cacheKey)) {
        return await pendingRequests.get(cacheKey);
    }
    
    // 4. Rate limiting check
    if (isRateLimited(apiCallKey)) {
        console.log(`Rate limited [${apiCallKey}], using stale data if available`);
        const staleData = await loadStaleDataFallback(cacheKey);
        if (staleData) {
            return staleData;
        }
        throw new Error(`Rate limited and no fallback data available for ${cacheKey}`);
    }
    
    // 5. Make API call with deduplication
    const fetchPromise = (async () => {
        try {
            console.log(`Making API call [${apiCallKey}]...`);
            updateRateLimit(apiCallKey);
            
            const data = await fetchFunction();
            
            // Cache in both memory and disk
            memoryCache.set(cacheKey, data, ttl);
            await saveToDiskCache(cacheKey, data, diskCacheMaxAge);
            
            return data;
        } catch (error) {
            console.error(`API call failed [${apiCallKey}]:`, error.message);
            
            if (useStaleOnError) {
                const staleData = await loadStaleDataFallback(cacheKey);
                if (staleData) {
                    console.warn(`Using stale data due to API error [${cacheKey}]`);
                    return staleData;
                }
            }
            
            throw error;
        } finally {
            pendingRequests.delete(cacheKey);
        }
    })();
    
    pendingRequests.set(cacheKey, fetchPromise);
    return await fetchPromise;
}

/**
 * Clear all caches (useful for debugging or forced refresh)
 */
async function clearAllCaches() {
    memoryCache.flushAll();
    pendingRequests.clear();
    
    try {
        const files = await fs.readdir(config.DISK_CACHE_DIR);
        await Promise.all(
            files.filter(f => f.endsWith('.json'))
                 .map(f => fs.unlink(path.join(config.DISK_CACHE_DIR, f)))
        );
    } catch (error) {
        console.warn('Failed to clear disk cache:', error.message);
    }
}

/**
 * Get cache statistics
 */
function getCacheStats() {
    return {
        memory: {
            keys: memoryCache.keys().length,
            hits: memoryCache.getStats().hits,
            misses: memoryCache.getStats().misses,
            size: memoryCache.getStats().vsize
        },
        pendingRequests: pendingRequests.size,
        apiQuota: apiQuotaTracker.getStats(),
        config: {
            cacheTtlShort: config.CACHE_TTL_SHORT,
            cacheTtlMedium: config.CACHE_TTL_MEDIUM,
            cacheTtlLong: config.CACHE_TTL_LONG,
            minApiInterval: config.MIN_API_INTERVAL
        }
    };
}

/**
 * Cache TTL presets for different data types
 */
const CacheTTL = {
    ROAD_CONDITIONS: config.CACHE_TTL_SHORT,      // Road conditions change frequently
    WEATHER_STATIONS: config.CACHE_TTL_SHORT,     // Weather data updates frequently  
    TRAFFIC_EVENTS: config.CACHE_TTL_LONG,        // Events change less frequently
    CAMERAS: config.CACHE_TTL_MEDIUM,             // Camera list is semi-static
    REST_AREAS: config.CACHE_TTL_STATIC,          // Rest areas rarely change
    DIGITAL_SIGNS: config.CACHE_TTL_MEDIUM,       // Signs update moderately
    MOUNTAIN_PASSES: config.CACHE_TTL_SHORT,      // Pass conditions change with weather
    ALERTS: config.CACHE_TTL_MEDIUM,              // Alerts have medium lifespan
    SNOW_PLOWS: config.CACHE_TTL_SHORT           // Plow locations change frequently
};

export {
    optimizedFetch,
    generateCacheKey,
    clearAllCaches,
    getCacheStats,
    CacheTTL,
    config as apiOptimizerConfig
};