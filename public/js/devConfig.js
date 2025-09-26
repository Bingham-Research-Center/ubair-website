/**
 * Development Configuration
 * Controls easter eggs, experimental features, and internal testing products
 */

// Configuration for development features
export const devConfig = {
    // Easter eggs (hidden by default in production)
    easterEggs: {
        enabled: false,  // Set to true in development to enable all easter eggs
        dutchJohn: false,       // Dutch John Rick Rolling on homepage
        emmaPark: false,        // Emma Park Road love easter egg
        chemtrails: false,      // Chemtrails joke button
        welsh: false            // Welsh translations on Clyfar page
    },
    
    // Experimental products (hidden by default)
    experimental: {
        enabled: false,  // Set to true in development to enable experimental features
        confidenceEstimates: false,     // Weather confidence estimates
        pixelSnowDetection: false,      // Pixel-derived snow presence
        advancedAnalytics: false        // Advanced analytics and metrics
    },
    
    // Kiosk mode and internal testing
    internal: {
        kioskMode: false,               // Public kiosk mode access
        testProducts: false,            // Internal test products
        debugMode: false,               // Debug logging and tools
        apiTesting: false               // API testing features
    }
};

// Environment detection
export function isDevEnvironment() {
    // First check for explicit dev parameter
    if (window.location.search.includes('dev=false')) {
        return false;
    }
    
    return window.location.hostname === 'localhost' || 
           window.location.hostname === '127.0.0.1' ||
           window.location.port === '3000' ||
           window.location.search.includes('dev=true');
}

// Initialize development settings based on environment
export function initDevConfig() {
    if (isDevEnvironment()) {
        // Enable features in development
        devConfig.easterEggs.enabled = true;
        devConfig.experimental.enabled = true;
        devConfig.internal.debugMode = true;
        
        // Individual easter eggs can still be controlled
        devConfig.easterEggs.dutchJohn = true;
        devConfig.easterEggs.emmaPark = true;
        devConfig.easterEggs.chemtrails = true;
        devConfig.easterEggs.welsh = true;
        
        // Experimental features
        devConfig.experimental.confidenceEstimates = true;
        devConfig.experimental.pixelSnowDetection = true;
        
        console.log('Development mode active - Easter eggs and experimental features enabled');
    } else {
        console.log('Production mode - Easter eggs and experimental features hidden');
    }
}

// Utility functions for checking feature availability
export function isEasterEggEnabled(eggName) {
    return devConfig.easterEggs.enabled && devConfig.easterEggs[eggName];
}

export function isExperimentalEnabled(featureName) {
    return devConfig.experimental.enabled && devConfig.experimental[featureName];
}

export function isInternalEnabled(featureName) {
    return devConfig.internal[featureName];
}

// Initialize on load
initDevConfig();