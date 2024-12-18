// public/js/dataLoader.js

import { TIME_RANGES } from './constants.js';

/**
 * DataLoader
 * Handles fetching and caching of data from specified URLs.
 */
export class DataLoader {
    /**
     * Constructs a new DataLoader instance.
     *
     * @param {Object} dataUrls - URLs for fetching data.
     * @param {string} dataUrls.liveObs - URL for live observations data.
     * @param {string} dataUrls.wind - URL for wind time series data.
     */
    constructor(dataUrls) {
        this.dataUrls = dataUrls; // { liveObs: 'url', wind: 'url' }
        this.cache = {}; // Simple in-memory cache
    }

    /**
     * fetchData
     * Fetches all required data concurrently.
     *
     * @returns {Promise<Object>} Resolves with fetched data: { liveObsData, windData }.
     */
    async fetchData() {
        const { liveObs, wind } = this.dataUrls;
        try {
            const [liveObsData, windData] = await Promise.all([
                this.getJson(liveObs, 'liveObs'),
                this.getJson(wind, 'wind')
            ]);
            return { liveObsData, windData };
        } catch (error) {
            throw error;
        }
    }

    /**
     * getJson
     * Fetches JSON data from a URL with caching.
     *
     * @param {string} url - The URL to fetch data from.
     * @param {string} key - The cache key.
     * @returns {Promise<Object>} Resolves with JSON data.
     */
    async getJson(url, key) {
        if (this.cache[key]) {
            return this.cache[key];
        }
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to load ${key} data: ${response.statusText}`);
        }
        const data = await response.json();
        this.cache[key] = data;
        return data;
    }
}
