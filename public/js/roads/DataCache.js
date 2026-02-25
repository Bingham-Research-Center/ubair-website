/**
 * Data Cache for Route Conditions
 * Caches API responses to avoid redundant calls
 * 5-minute cache TTL
 * Extracted from roads.js as part of refactoring
 */

/**
 * Route data cache object
 * Stores stations and events data with timestamp
 * Automatically refreshes after 5 minutes
 */
const routeDataCache = {
    stations: null,
    events: null,
    lastUpdated: null,

    /**
     * Check if cached data is still valid (< 5 minutes old)
     * @returns {boolean} True if cache is valid
     */
    isValid() {
        return this.stations && this.events && this.lastUpdated &&
               (Date.now() - this.lastUpdated) < 300000; // 5 minutes cache
    },

    /**
     * Update cache with fresh data from API
     * Fetches stations and events in parallel
     * @returns {Object|null} Object with stations and events, or null on error
     */
    async updateCache() {
        try {
            const [stationsResponse, eventsResponse] = await Promise.all([
                fetch('/api/road-weather/stations'),
                fetch('/api/traffic-events')
            ]);

            if (stationsResponse.ok && eventsResponse.ok) {
                this.stations = await stationsResponse.json();
                this.events = await eventsResponse.json();
                this.lastUpdated = Date.now();
                return { stations: this.stations, events: this.events };
            }
        } catch (error) {
            console.error('Failed to update route data cache:', error);
        }
        return null;
    },

    /**
     * Get data from cache, refreshing if needed
     * @returns {Object} Object with stations and events
     */
    async getData() {
        if (!this.isValid()) {
            const refreshed = await this.updateCache();
            if (!refreshed) {
                return null;
            }
        }

        if (!Array.isArray(this.stations) || !this.events) {
            return null;
        }

        return { stations: this.stations, events: this.events };
    }
};
