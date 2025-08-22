# Frontend Architecture & File Organization

## Overview
This guide explains how the frontend is organized, which files connect to which pages, and how data flows through the application.

## Page-to-File Mapping

### HTML Pages → CSS Files → JavaScript Files

| HTML Page | CSS File | Primary JS Files | Purpose |
|-----------|----------|------------------|---------|
| `index.html` | `index.css` | `index_map.js`, `map.js`, `loadSidebar.js` | Homepage with map & outlook |
| `about/clyfar.html` | `about.css` | `loadSidebar.js` | About page - CLYFAR information |
| `about/faq.html` | `about.css` | `loadSidebar.js` | About page - FAQ |
| `forecast_air_quality.html` | `forecast_air_quality.css` | `forecast_air_quality.js`, `loadSidebar.js` | Air quality forecasts & charts |
| `forecast_weather.html` | `forecast_weather.css` | `forecast_weather.js`, `loadSidebar.js` | Weather forecast with map |
| `forecast_outlooks.html` | `outlooks.css` | `forecast_outlooks.js`, `loadSidebar.js` | Text forecast outlooks |
| `forecast_data.html` | `forecast.css` | `forecast_data.js`, `loadSidebar.js` | Forecast data display |
| `live_aq.html` | `live_aq.css` | `loadSidebar.js` | Live air quality observations |
| `fire.html` | `fire.css` | `fire.js`, `loadSidebar.js` | Fire/smoke information |
| `roads.html` | `roads.css` | `roads.js`, `loadSidebar.js` | Road conditions |
| `agriculture.html` | `agriculture.css` | `agriculture.js`, `loadSidebar.js` | Agricultural information |
| `aviation.html` | `aviation.css` | `aviation.js`, `loadSidebar.js` | Aviation weather |
| `water.html` | `water.css` | `water.js`, `loadSidebar.js` | Water quality information |
| `vis.html` | `vis.css` | `loadSidebar.js` | Data visualization page |

## JavaScript Module Organization

### Core Utilities (`/public/js/`)

**Data Management:**
- `api.js` - API calls and data fetching
- `dataloader.js` - Load and cache data
- `data_processor.js` - Transform raw data for display
- `stationMetadata.js` - Station information management

**UI Components:**
- `uiManager.js` - UI state and interactions
- `loadSidebar.js` - Navigation sidebar
- `loadFooter.js` - Page footer
- `markdownLoader.js` - Render markdown content

**Visualization:**
- `plotManager.js` - Plotly.js chart management
- `DataViz.js` - Data visualization utilities
- `map.js` - Leaflet map initialization
- `roads.js` - Road overlay for maps

**Shared Utilities:**
- `utils.js` - Common helper functions
- `data.js` - Data constants and configs

### Page-Specific Scripts

**Homepage:**
```javascript
// index_map.js - Initialize homepage map
// index_outlook.js - Load outlook summary
// Both run on DOMContentLoaded
```

**Forecast Pages:**
```javascript
// forecast_air_quality.js - AQ forecast logic
// forecast_weather.js - Weather forecast logic
// forecast_outlooks.js - Text outlook display
```

## Data Flow Architecture

### 1. Data Upload (CHPC → Server)
```
Python Script → POST /api/upload/:dataType → Server validates → Save to /public/api/static/
```

### 2. Client Data Fetch
```javascript
// Typical data flow
async function loadData() {
    // 1. Check cache
    const cached = localStorage.getItem('data');
    if (cached && !isExpired(cached)) return cached;
    
    // 2. Fetch fresh data
    const response = await fetch('/api/live-observations');
    const data = await response.json();
    
    // 3. Process data
    const processed = processForDisplay(data);
    
    // 4. Cache for next time
    localStorage.setItem('data', JSON.stringify(processed));
    
    // 5. Update UI
    updateDisplay(processed);
}
```

### 3. Display Update Pattern
```javascript
// Common pattern across pages
document.addEventListener('DOMContentLoaded', async () => {
    // Load components
    await loadSidebar();
    await loadFooter();
    
    // Fetch data
    const data = await fetchLatestData();
    
    // Initialize visualizations
    if (hasMap) initializeMap();
    if (hasCharts) initializeCharts();
    
    // Populate data
    updateVisualization(data);
    
    // Set refresh timer
    setInterval(refreshData, 10 * 60 * 1000); // 10 minutes
});
```

## File Naming Conventions

### Data Files
```
map_obs_YYYYMMDD_HHMMZ.json         # Observations
map_obs_meta_YYYYMMDD_HHMMZ.json    # Station metadata
outlook_YYYYMMDD_HHMM.md            # Text outlooks
timeseries_STATIONID_VARIABLE.json  # Time series data
```

### Static Assets
```
/public/images/          # Images and icons
/public/data/           # Static data files
/public/api/static/     # Uploaded data from CHPC
/public/css/            # Stylesheets
/public/js/             # JavaScript files
```

## Component Reusability

### Shared Components Used Everywhere

**Sidebar Navigation:**
```javascript
// loadSidebar.js - Used on every page
loadSidebar(); // Automatically highlights current page
```

**Data Fetching:**
```javascript
// api.js - Centralized API calls
import { fetchObservations, fetchMetadata } from './api.js';
```

**Map Initialization:**
```javascript
// map.js - Reusable map setup
const map = initializeMap('mapDiv', {
    center: [40.5, -110.0],
    zoom: 8
});
```

### Modular Patterns

**Configuration Objects:**
```javascript
// Centralized configs
const MAP_CONFIG = {
    center: [40.5, -110.0],
    zoom: 8,
    tiles: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
};

const API_CONFIG = {
    baseUrl: '/api',
    timeout: 5000,
    retries: 3
};
```

**Event System:**
```javascript
// Custom events for component communication
document.addEventListener('dataUpdated', (e) => {
    updateMap(e.detail);
    updateCharts(e.detail);
});

// Trigger from anywhere
document.dispatchEvent(new CustomEvent('dataUpdated', { 
    detail: newData 
}));
```

## CSS Organization

### Base Styles (`styles.css`)
- Typography
- Colors
- Layout grid
- Common components

### Page-Specific Styles
Each page has its own CSS file with specific overrides:
```css
/* forecast_air_quality.css */
.forecast-grid {
    /* Specific to forecast page */
}
```

### Responsive Design Pattern
```css
/* Mobile First */
.container {
    width: 100%;
}

/* Tablet */
@media (min-width: 768px) {
    .container {
        width: 750px;
    }
}

/* Desktop */
@media (min-width: 1024px) {
    .container {
        width: 970px;
    }
}
```

## State Management

### Local Storage
```javascript
// Settings
localStorage.setItem('userPreferences', JSON.stringify({
    units: 'metric',
    mapStyle: 'terrain'
}));

// Cache with expiry
const cacheData = (key, data, minutes = 10) => {
    const expires = Date.now() + (minutes * 60 * 1000);
    localStorage.setItem(key, JSON.stringify({
        data,
        expires
    }));
};
```

### Session Storage
```javascript
// Temporary data (cleared on tab close)
sessionStorage.setItem('currentView', 'map');
```

### URL Parameters
```javascript
// Share specific views
const params = new URLSearchParams(window.location.search);
const station = params.get('station');
const date = params.get('date');
```

## Performance Patterns

### Lazy Loading
```javascript
// Load heavy libraries only when needed
if (needsChart) {
    const Plotly = await import('https://cdn.plot.ly/plotly-latest.min.js');
    createChart(Plotly);
}
```

### Debouncing
```javascript
// Prevent excessive updates
let timeout;
function debounce(func, wait = 250) {
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
}

window.addEventListener('resize', debounce(handleResize));
```

### Request Caching
```javascript
// Cache API responses
const cache = new Map();

async function fetchWithCache(url) {
    if (cache.has(url)) {
        return cache.get(url);
    }
    
    const data = await fetch(url).then(r => r.json());
    cache.set(url, data);
    
    // Clear after 5 minutes
    setTimeout(() => cache.delete(url), 5 * 60 * 1000);
    
    return data;
}
```

## Error Handling Patterns

### API Errors
```javascript
async function safeApiCall(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('API Error:', error);
        
        // Show user-friendly message
        showNotification('Unable to load data. Retrying...');
        
        // Fallback to cached data
        return getCachedData(url) || defaultData;
    }
}
```

### Display Fallbacks
```javascript
function updateDisplay(data) {
    if (!data || data.length === 0) {
        showEmptyState('No data available');
        return;
    }
    
    // Normal display logic
    renderData(data);
}
```

## Testing Approach

### Manual Testing Checklist
1. Load each page and verify data appears
2. Test responsive design at different widths
3. Verify refresh timer works (wait 10 min)
4. Test with slow network (Chrome DevTools)
5. Test with API errors (stop server)
6. Check console for errors

### Common Debug Commands
```javascript
// In browser console

// Check current data
JSON.parse(localStorage.getItem('observations'))

// Force refresh data (if DataViz instance exists)
if (window.dataViz) {
    window.dataViz.refreshData();
}

// Check API status
fetch('/api/health').then(r => r.json()).then(console.log)

// Check API file list
fetch('/api/filelist.json').then(r => r.json()).then(console.log)

// Clear all caches
localStorage.clear()
sessionStorage.clear()
```

## Adding New Features

### New Page Checklist
1. Create HTML file
2. Create matching CSS file
3. Create JavaScript file(s)
4. Add to navigation in `loadSidebar.js`
5. Add route in `server.js` if needed
6. Test data flow end-to-end

### New Data Type Checklist
1. Define schema in `DATA_SCHEMA.md`
2. Add upload endpoint in `dataUpload.js`
3. Create processing function in `data_processor.js`
4. Add fetch function in `api.js`
5. Create display component
6. Add to refresh cycle

## Troubleshooting Guide

### Data Not Showing
1. Check Network tab for API calls
2. Verify data exists: `ls public/api/static/`
3. Check console for errors
4. Verify data format matches schema

### Map Not Loading
1. Check Leaflet is loaded
2. Verify div ID matches: `<div id="mapDiv">`
3. Check coordinates are valid
4. Ensure tiles URL is accessible

### Charts Not Rendering
1. Verify Plotly is loaded
2. Check data format for charts
3. Ensure container div exists
4. Check for conflicting CSS

Remember: Follow existing patterns for consistency. When in doubt, check how similar features are implemented elsewhere in the codebase.