/**
 * Units System for Science Mode Toggle
 * Handles conversion between Imperial and Metric units
 * Persists user preference in localStorage
 * Extracted from roads.js as part of refactoring
 */

/**
 * Class to manage unit system conversions (Imperial ↔ Metric)
 */
class UnitsSystem {
    constructor() {
        this.isMetric = localStorage.getItem('unitsSystem') === 'metric';
    }

    /**
     * Format temperature with current unit system
     * @param {number|string} fahrenheit - Temperature in Fahrenheit
     * @returns {string} Formatted temperature string
     */
    formatTemperature(fahrenheit) {
        if (fahrenheit === '--' || fahrenheit === null || fahrenheit === undefined) return '--';
        const temp = parseFloat(fahrenheit);
        if (isNaN(temp)) return '--';

        if (this.isMetric) {
            const celsius = (temp - 32) * 5/9;
            return `${celsius.toFixed(1)}°C`;
        }
        return `${temp.toFixed(1)}°F`;
    }

    /**
     * Format wind speed with current unit system
     * @param {number|string} mph - Wind speed in miles per hour
     * @returns {string} Formatted wind speed string
     */
    formatWindSpeed(mph) {
        if (mph === '--' || mph === null || mph === undefined) return '--';
        const speed = parseFloat(mph);
        if (isNaN(speed)) return '--';

        if (this.isMetric) {
            const kmh = speed * 1.60934;
            return `${kmh.toFixed(1)} km/h`;
        }
        return `${speed.toFixed(1)} mph`;
    }

    /**
     * Format visibility with current unit system
     * @param {number|string} miles - Visibility in miles
     * @returns {string} Formatted visibility string
     */
    formatVisibility(miles) {
        if (miles === '--' || miles === null || miles === undefined) return '--';
        const vis = parseFloat(miles);
        if (isNaN(vis)) return '--';

        if (this.isMetric) {
            const km = vis * 1.60934;
            return `${km.toFixed(1)} km`;
        }
        return `${vis.toFixed(1)} mi`;
    }

    /**
     * Toggle between Imperial and Metric systems
     * @returns {boolean} New metric state (true = metric, false = imperial)
     */
    toggle() {
        this.isMetric = !this.isMetric;
        localStorage.setItem('unitsSystem', this.isMetric ? 'metric' : 'imperial');
        return this.isMetric;
    }

    /**
     * Get current system name
     * @returns {string} "Metric" or "Imperial"
     */
    getSystemName() {
        return this.isMetric ? 'Metric' : 'Imperial';
    }

    /**
     * Get temperature unit symbol
     * @returns {string} "°C" or "°F"
     */
    getTempUnit() {
        return this.isMetric ? '°C' : '°F';
    }

    /**
     * Get wind speed unit
     * @returns {string} "km/h" or "mph"
     */
    getWindUnit() {
        return this.isMetric ? 'km/h' : 'mph';
    }

    /**
     * Get visibility unit
     * @returns {string} "km" or "mi"
     */
    getVisibilityUnit() {
        return this.isMetric ? 'km' : 'mi';
    }
}

// Global units system instance - used throughout the application
const unitsSystem = new UnitsSystem();
