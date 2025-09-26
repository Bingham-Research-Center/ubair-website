# Easter Eggs and Experimental Features Storage

## Overview

This document explains how we have "stored" easter eggs, kiosk mode, and experimental features behind development settings. During development, we tested preliminary functionality with silly and experimental features to validate the codebase architecture. Now these features are properly controlled via configuration.

## What Was Stored

### Easter Eggs
- **Dutch John Rick Rolling** (`index.html`): A toggle that claims to "hide all mention of Dutch John" but actually opens a Rick Roll video
- **Emma Park Road** (`roads.html`): A fake link promising answers about Emma Park Road that leads to a Rick Roll 
- **Chemtrails Button** (`forecast_weather.html`): A button labeled "Chemtrails ON" that opens a Rick Roll
- **Welsh Translations** (`forecast_air_quality.html`): A "Welsh Mode" toggle that translates page elements to Welsh using the Clyfar theme

### Experimental Products
- **Confidence Estimates**: Weather forecast confidence ratings displayed in air quality forecasts
- **Pixel-Derived Snow Detection**: Camera-based snow presence analysis with confidence metrics
- **Advanced Analytics**: Performance metrics and detailed forecast analysis

### Kiosk Mode
- **Kiosk Access**: Previously accessible at `/kiosk` for anyone, now restricted to development environments
- **Auto-Rotation Features**: Slideshow functionality for displays in department hallways

## How the Storage System Works

### Development Configuration (`public/js/devConfig.js`)

The system uses a centralized configuration that automatically detects the environment:

```javascript
export const devConfig = {
    easterEggs: {
        enabled: false,    // Master switch
        dutchJohn: false,  // Individual controls
        emmaPark: false,
        chemtrails: false,
        welsh: false
    },
    experimental: {
        enabled: false,
        confidenceEstimates: false,
        pixelSnowDetection: false,
        advancedAnalytics: false
    },
    internal: {
        kioskMode: false,
        testProducts: false,
        debugMode: false
    }
};
```

### Environment Detection

Features are automatically enabled in development:
- `localhost` or `127.0.0.1`
- Port `3000` (development server)
- URL parameter `?dev=true`

### Implementation Pattern

Each easter egg and experimental feature follows this pattern:

1. **Import dev config**: `import { isEasterEggEnabled } from '/public/js/devConfig.js'`
2. **Conditional display**: Check if feature is enabled before showing
3. **Hide in production**: Set `display: none` if not enabled

## File Modifications

### Frontend Files Modified
- `views/index.html` - Dutch John easter egg control
- `views/forecast_weather.html` - Chemtrails easter egg control  
- `views/roads.html` - Emma Park easter egg and pixel snow detection
- `views/forecast_air_quality.html` - Welsh mode easter egg
- `public/js/forecast_air_quality.js` - Confidence estimates control
- `public/js/roads.js` - Pixel snow detection confidence metrics

### Backend Files Modified
- `server/server.js` - Kiosk mode access restriction

## Accessing Features During Development

### Automatic (Local Development)
When running `npm run dev`, all features are automatically enabled.

### Manual Override
Add `?dev=true` to any URL to enable development features on any environment.

### Individual Control
In development, you can manually control individual features by modifying `devConfig` in browser console:

```javascript
// Enable only specific easter eggs
window.devConfig = { 
    isEasterEggEnabled: (name) => name === 'welsh',
    isExperimentalEnabled: (name) => false 
};
```

## Future Integration

This storage system provides a foundation for:

1. **Professional Easter Eggs**: Luke's training games, Michael's science club features, quiz games
2. **Experimental Toggles**: Settings panel for internal review of new features
3. **Kiosk Enhancement**: BRC-branded looping presentations for department displays
4. **A/B Testing**: Feature flags for controlled rollouts

## Testing

The storage system preserves all original functionality while hiding it in production:

- **Development**: `npm run dev` - All features accessible
- **Production**: Normal deployment - Features hidden
- **Manual Testing**: Add `?dev=true` parameter to any URL

## Benefits

1. **Code Preservation**: No functionality lost, just controlled access
2. **Professional Appearance**: Clean production site without test elements
3. **Development Flexibility**: Full feature access during development
4. **Future Ready**: Infrastructure for proper feature flags and professional easter eggs