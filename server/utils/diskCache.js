/**
 * Shared Disk Cache Utilities
 *
 * Provides persistent file-based caching with atomic writes for data that
 * needs to survive server restarts. Uses temp-file-then-rename pattern
 * for atomic writes (safe on POSIX filesystems).
 */

import fs from 'fs/promises';
import path from 'path';

// Cache directory location
export const CACHE_DIR = path.join(process.cwd(), '.cache');

/**
 * Ensures the cache directory exists
 * @returns {Promise<void>}
 */
export async function ensureCacheDir() {
    try {
        await fs.mkdir(CACHE_DIR, { recursive: true });
    } catch (err) {
        // Directory might already exist, ignore error
    }
}

/**
 * Saves data to disk cache with atomic write
 * @param {string} key - Cache key (will be used as filename)
 * @param {any} data - Data to cache (will be JSON stringified)
 * @returns {Promise<void>}
 */
export async function saveToDiskCache(key, data) {
    try {
        await ensureCacheDir();
        const filePath = path.join(CACHE_DIR, `${key}.json`);
        const tempPath = `${filePath}.tmp`;
        const cacheData = {
            timestamp: Date.now(),
            data: data
        };

        // Write to temp file first
        await fs.writeFile(tempPath, JSON.stringify(cacheData), 'utf8');

        // Then atomically rename (atomic on most filesystems)
        await fs.rename(tempPath, filePath);

    } catch (error) {
        console.warn(`Failed to save ${key} to disk cache:`, error.message);
    }
}

/**
 * Loads data from disk cache if not expired
 * @param {string} key - Cache key
 * @param {number} maxAge - Maximum age in milliseconds
 * @returns {Promise<any|null>} Cached data or null if not found/expired
 */
export async function loadFromDiskCache(key, maxAge) {
    try {
        const filePath = path.join(CACHE_DIR, `${key}.json`);

        // Read directly - safe because writes use atomic rename
        const fileContent = await fs.readFile(filePath, 'utf8');
        const cacheData = JSON.parse(fileContent);

        const now = Date.now();
        const age = now - cacheData.timestamp;

        if (age < maxAge) {
            console.log(`Loading ${key} from disk cache (age: ${Math.round(age / 1000 / 60)} minutes)`);
            return cacheData.data;
        } else {
            console.log(`Disk cache for ${key} expired (age: ${Math.round(age / 1000 / 60)} minutes)`);
            // Clean up expired cache file
            await fs.unlink(filePath).catch(() => {});
            return null;
        }
    } catch (error) {
        // File doesn't exist or is corrupted - not a problem
        if (error.code !== 'ENOENT') {
            console.warn(`Error loading ${key} from disk cache:`, error.message);
        }
        return null;
    }
}
