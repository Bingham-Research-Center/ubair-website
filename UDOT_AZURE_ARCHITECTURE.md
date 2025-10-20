# UDOT-Azure Maps Weather Road Map Architecture

## Executive Summary

This document describes the comprehensive architecture for integrating Utah Department of Transportation (UDOT) API data with Azure Maps to create a high-performance, real-time weather road map for Utah highways.

## Architecture Overview

### Four-Stage Stream Processing Pipeline

```
┌─────────────┐      ┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│   INGEST    │ ---> │  TRANSFORM  │ ---> │    STORE    │ ---> │  VISUALIZE  │
│             │      │             │      │             │      │             │
│ UDOT API    │      │  GeoJSON    │      │   Vector    │      │ Azure Maps  │
│ Polling     │      │ Generation  │      │   Tiles     │      │   Web SDK   │
└─────────────┘      └─────────────┘      └─────────────┘      └─────────────┘
```

### Current Implementation Status

| Component | Status | Location |
|-----------|--------|----------|
| UDOT Events API Integration | ✅ Implemented | `server/routes/trafficEvents.js` |
| UDOT Road Conditions API | ✅ Implemented | `server/routes/roadWeather.js` |
| Azure Maps Frontend | ✅ Implemented | `public/js/provo-canyon.js` |
| Traffic Flow Visualization | ✅ Implemented | Azure Maps Native |
| Camera Integration | 🚧 In Progress | Planned |
| Weather Stations | 🚧 In Progress | Planned |
| Vector Tiles | 📋 Planned | Requires Azure infrastructure |
| Data-Driven Road Styling | 📋 Planned | Frontend enhancement |

## 1. Data Source Layer: UDOT API

### API Governance and Constraints

**Critical Constraint:** UDOT API enforces strict throttling:
- **Maximum:** 10 API calls per 60 seconds
- **Consequence:** API key suspension if exceeded
- **Mitigation:** Server-side polling with rate limiting

### UDOT API Endpoints

#### 1.1 Current Road Conditions
```
GET https://api.udot.utah.gov/v1/roadconditions
Headers: x-api-key: {UDOT_API_KEY}
```

**Response Format:**
- Road condition status (clear, wet, snow, ice, etc.)
- Location references (mile markers, coordinates)
- Condition severity levels

**Geometry Requirement:** LineString
- UDOT provides point/segment references
- Must be spatially joined to Utah highway network geometries
- Required for data-driven road coloring

#### 1.2 Events and Alerts
```
GET https://api.udot.utah.gov/v1/events
Headers: x-api-key: {UDOT_API_KEY}
```

**Response Fields:**
```json
{
  "latitude": 40.1234,
  "longitude": -111.5678,
  "roadwayName": "US-189",
  "eventType": "CONSTRUCTION",
  "description": "Lane closure",
  "severity": "MAJOR",
  "startDate": "2025-10-13T22:00:00Z",
  "plannedEndDate": "2025-10-14T06:00:00Z",
  "isFullClosure": false
}
```

**Geometry Type:** Point (SymbolLayer)

#### 1.3 Weather Stations
```
GET https://api.udot.utah.gov/v1/weatherstations
Headers: x-api-key: {UDOT_API_KEY}
```

**Provides:**
- Temperature, wind speed, visibility
- Road surface temperature
- Precipitation status
- Geographic coordinates

**Geometry Type:** Point (BubbleLayer with sensor values)

#### 1.4 Cameras
```
GET https://api.udot.utah.gov/v1/cameras
Headers: x-api-key: {UDOT_API_KEY}
```

**Critical Fields:**
```json
{
  "name": "US-189 Deer Creek",
  "latitude": 40.1234,
  "longitude": -111.5678,
  "imageUrl": "https://...",
  "lastUpdated": "2025-10-15T10:30:00Z"
}
```

**Geometry Type:** Point (SymbolLayer with interactive image popups)

### 1.5 API Rate Limiting Implementation

```javascript
class UDOTAPIClient {
  constructor() {
    this.requestQueue = [];
    this.maxCallsPerMinute = 10;
    this.callInterval = 6000; // 6 seconds between calls
  }

  async fetchWithThrottling(endpoint) {
    // Wait for rate limit window
    await this.waitForSlot();

    const response = await fetch(endpoint, {
      headers: {
        'x-api-key': process.env.UDOT_API_KEY
      }
    });

    return response.json();
  }
}
```

## 2. Data Transformation Layer: GeoJSON Standardization

### Target GeoJSON Schema

#### Road Conditions (LineString Features)
```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "LineString",
        "coordinates": [[-111.5, 40.4], [-111.6, 40.5]]
      },
      "properties": {
        "road_id": "US-189-S-SEG-0123",
        "condition_level": 3,
        "weather_description": "Heavy Snow",
        "direction": "Southbound",
        "last_updated": "2025-10-15T10:00:00Z"
      }
    }
  ]
}
```

#### Condition Level Mapping
| Level | Status | Visual Color | Use Case |
|-------|--------|--------------|----------|
| 1 | Clear, Dry | #00A000 (Green) | Normal operations |
| 2 | Wet, Minor | #FFFF00 (Yellow) | Caution advised |
| 3 | Snow/Ice | #FFA500 (Orange) | High caution |
| 4 | Hazardous | #FF0000 (Red) | Travel not recommended |
| 5 | Closed | #000000 (Black) | Road closure |

#### Point Features (Cameras, Events, Stations)
```json
{
  "type": "Feature",
  "geometry": {
    "type": "Point",
    "coordinates": [-111.5, 40.4]
  },
  "properties": {
    "feature_type": "camera",
    "name": "US-189 Deer Creek",
    "image_url": "https://...",
    "last_updated": "2025-10-15T10:30:00Z"
  }
}
```

### Spatial Join Requirement

**Challenge:** UDOT road conditions are reported as points/segments, but visualization requires LineString geometries.

**Solution:**
1. Maintain a static GIS dataset of Utah highway network (LineString geometries)
2. Perform spatial join in transformation layer:
   - Load UDOT condition reports (point data)
   - Match to highway segments using proximity analysis
   - Assign `condition_level` to matching LineString features
3. Output enriched GeoJSON with LineString + condition properties

**Tools:**
- Python: `geopandas`, `shapely`
- Node.js: `turf.js` for spatial operations
- Pre-processed highway network: `utah_highways.geojson`

## 3. Storage and Optimization Layer

### 3.1 Current Implementation: Direct GeoJSON Serving

**Endpoint:** `GET /api/road-conditions-geojson`
- Server generates GeoJSON on-demand
- Suitable for small to medium datasets
- Works well for Provo Canyon corridor (limited geographic scope)

**Limitations:**
- Large statewide datasets (>10MB) cause slow initial load
- Not suitable for high-traffic production at scale

### 3.2 Recommended Production Architecture: Vector Tiles

#### Why Vector Tiles?
- **Performance:** 90% smaller file size vs. GeoJSON
- **Scalability:** Only loads tiles for visible map area
- **Rendering:** GPU-accelerated, supports millions of features

#### Vector Tile Generation Workflow

```
GeoJSON → Tippecanoe CLI → Vector Tiles (PBF) → Azure Blob Storage → CDN
```

**Tippecanoe Command:**
```bash
tippecanoe -o utah_roads.mbtiles \
  --minimum-zoom=5 \
  --maximum-zoom=20 \
  --drop-densest-as-needed \
  --extend-zooms-if-still-dropping \
  utah_road_conditions.geojson
```

**Output:** Directory structure with PBF tiles
```
tiles/
  ├── 5/
  ├── 6/
  ├── ...
  └── 20/
```

#### Azure Blob Storage Configuration

```javascript
// Upload tiles to Azure Blob Storage
const { BlobServiceClient } = require('@azure/storage-blob');

async function uploadVectorTiles(tilesDirectory) {
  const blobServiceClient = BlobServiceClient.fromConnectionString(
    process.env.AZURE_STORAGE_CONNECTION_STRING
  );

  const containerClient = blobServiceClient.getContainerClient('vector-tiles');

  // Enable public access and CORS
  await containerClient.setAccessPolicy('container');
}
```

**CORS Configuration (Required):**
```xml
<Cors>
  <CorsRule>
    <AllowedOrigins>*</AllowedOrigins>
    <AllowedMethods>GET</AllowedMethods>
    <AllowedHeaders>*</AllowedHeaders>
  </CorsRule>
</Cors>
```

## 4. Visualization Layer: Azure Maps Web SDK

### 4.1 Data-Driven Road Condition Styling

**Implementation:** LineLayer with conditional expression

```javascript
// Create vector tile source
const roadTileSource = new atlas.source.VectorTileSource('road-conditions', {
  tiles: ['https://{subdomain}.blob.core.windows.net/tiles/{z}/{x}/{y}.pbf'],
  minZoom: 5,
  maxZoom: 20
});

map.sources.add(roadTileSource);

// Create data-driven line layer
const roadLayer = new atlas.layer.LineLayer(roadTileSource, 'road-layer', {
  sourceLayer: 'road_conditions',
  strokeColor: [
    'case',
    ['==', ['get', 'condition_level'], 1], '#00A000', // Green: Clear
    ['==', ['get', 'condition_level'], 2], '#FFFF00', // Yellow: Wet
    ['==', ['get', 'condition_level'], 3], '#FFA500', // Orange: Snow/Ice
    ['==', ['get', 'condition_level'], 4], '#FF0000', // Red: Hazardous
    ['==', ['get', 'condition_level'], 5], '#000000', // Black: Closed
    '#CCCCCC' // Default: Gray
  ],
  strokeWidth: [
    'interpolate',
    ['linear'],
    ['zoom'],
    5, 2,  // At zoom 5: 2px width
    10, 4, // At zoom 10: 4px width
    15, 6  // At zoom 15: 6px width
  ],
  minZoom: 8, // Only show detailed roads at zoom 8+
  filter: ['has', 'condition_level']
});

map.layers.add(roadLayer);
```

### 4.2 Camera Markers with Interactive Image Popups

```javascript
// Add camera markers
cameras.forEach(camera => {
  const marker = new atlas.HtmlMarker({
    position: [camera.longitude, camera.latitude],
    htmlContent: `<i class="fas fa-video" style="color: #0044AA; font-size: 24px;"></i>`
  });

  // Create popup with embedded image
  const popup = new atlas.Popup({
    content: `
      <div class="camera-popup">
        <h3>${camera.name}</h3>
        <img src="${camera.imageUrl}" alt="${camera.name}" style="width: 100%; max-width: 400px;">
        <p><small>Updated: ${new Date(camera.lastUpdated).toLocaleString()}</small></p>
      </div>
    `,
    pixelOffset: [0, -30]
  });

  map.events.add('click', marker, () => {
    popup.setOptions({ position: [camera.longitude, camera.latitude] });
    popup.open(map);
  });

  map.markers.add(marker);
});
```

### 4.3 Layer Visibility Controls

```javascript
// Add custom layer toggle control
class LayerToggleControl {
  onAdd(map) {
    this._map = map;
    this._container = document.createElement('div');
    this._container.className = 'azure-custom-control';
    this._container.innerHTML = `
      <label><input type="checkbox" id="toggle-road-conditions" checked> Road Conditions</label>
      <label><input type="checkbox" id="toggle-cameras" checked> Cameras</label>
      <label><input type="checkbox" id="toggle-weather-stations" checked> Weather Stations</label>
    `;

    this._container.querySelector('#toggle-road-conditions').addEventListener('change', (e) => {
      map.layers.getLayerById('road-layer').setOptions({ visible: e.target.checked });
    });

    return this._container;
  }

  onRemove() {
    this._container.parentNode.removeChild(this._container);
    this._map = null;
  }
}

map.controls.add(new LayerToggleControl(), { position: 'top-left' });
```

## 5. Azure Cloud Infrastructure (Production Setup)

### 5.1 Azure Functions: Scheduled Data Ingestion

**Function Type:** Time-triggered (CRON)
**Schedule:** Every 5 minutes
**Runtime:** Node.js 18 or Python 3.11

```javascript
// function.json
{
  "bindings": [
    {
      "name": "timer",
      "type": "timerTrigger",
      "direction": "in",
      "schedule": "0 */5 * * * *"
    }
  ]
}

// index.js
module.exports = async function (context, timer) {
  const udotClient = new UDOTAPIClient();

  // Sequential calls to respect 10 calls/60s limit
  const roadConditions = await udotClient.fetchWithThrottling('/roadconditions');
  await sleep(6000);

  const events = await udotClient.fetchWithThrottling('/events');
  await sleep(6000);

  const cameras = await udotClient.fetchWithThrottling('/cameras');

  // Transform to GeoJSON
  const geojson = transformToGeoJSON(roadConditions, events, cameras);

  // Upload to Blob Storage
  await uploadToBlob(geojson);
};
```

### 5.2 Azure Blob Storage Structure

```
container: udot-geospatial-data
├── geojson/
│   ├── utah_road_conditions_latest.geojson
│   ├── utah_cameras_latest.geojson
│   └── utah_weather_stations_latest.geojson
├── vector-tiles/
│   └── utah_roads/
│       ├── 5/
│       ├── 6/
│       └── ...
└── archive/
    └── {timestamp}/
```

### 5.3 Cost Optimization

| Service | Estimated Cost | Optimization Strategy |
|---------|----------------|----------------------|
| Azure Functions | ~$20/month | Consumption plan, 5-min intervals |
| Blob Storage | ~$5/month | Lifecycle policies, archive old data |
| CDN | ~$50/month | Cache for 5 minutes, reduce origin hits |
| Azure Maps | ~$100/month | Limit to authenticated users, implement quotas |

**Total Estimated:** ~$175/month for statewide coverage

## 6. Security and API Key Management

### Environment Variables (.env)
```bash
# Azure Services
AZURE_MAPS_KEY=your_azure_maps_subscription_key
AZURE_STORAGE_CONNECTION_STRING=your_blob_storage_connection

# UDOT API
UDOT_API_KEY=your_udot_developer_key

# Server
PORT=3000
NODE_ENV=production
```

### Key Vault Integration (Production)
```javascript
const { SecretClient } = require('@azure/keyvault-secrets');
const { DefaultAzureCredential } = require('@azure/identity');

const credential = new DefaultAzureCredential();
const client = new SecretClient('https://your-vault.vault.azure.net/', credential);

const udotKey = await client.getSecret('UDOT-API-KEY');
```

## 7. Testing and Validation

### API Testing
```bash
# Test UDOT API connection
npm run test-api

# Test GeoJSON generation
curl http://localhost:3000/api/road-conditions-geojson

# Test Azure Maps frontend
npm run dev
# Open http://localhost:3000/provo-canyon
```

### Data Quality Checks
1. Validate all GeoJSON features have required properties
2. Ensure condition_level is integer 1-5
3. Verify camera image URLs are accessible
4. Check coordinate validity (Utah bounding box)

## 8. Monitoring and Alerting

### Azure Monitor Configuration
```javascript
const appInsights = require('applicationinsights');
appInsights.setup(process.env.APPLICATIONINSIGHTS_CONNECTION_STRING);
appInsights.start();

// Track UDOT API calls
appInsights.defaultClient.trackMetric({
  name: 'UDOT_API_Calls',
  value: 1
});

// Alert if approaching rate limit
if (callCount > 8) {
  appInsights.defaultClient.trackEvent({
    name: 'UDOT_RateLimit_Warning',
    properties: { callCount }
  });
}
```

## 9. Roadmap and Future Enhancements

### Phase 1: Current Implementation ✅
- [x] Basic Azure Maps integration
- [x] UDOT Events API
- [x] Traffic flow visualization
- [x] Provo Canyon corridor focus

### Phase 2: Enhanced Data Integration 🚧
- [ ] UDOT Cameras with image popups
- [ ] UDOT Weather Stations
- [ ] Road condition LineString styling
- [ ] Data-driven conditional coloring

### Phase 3: Production Infrastructure 📋
- [ ] Azure Functions scheduled polling
- [ ] Vector tile generation pipeline
- [ ] Azure Blob Storage + CDN
- [ ] Statewide coverage

### Phase 4: Advanced Features 📋
- [ ] Intelligent routing (avoid hazardous roads)
- [ ] Geofencing alerts
- [ ] Push notifications for closures
- [ ] Mobile app integration

## 10. References and Resources

### Documentation
- [Azure Maps Web SDK](https://docs.microsoft.com/en-us/azure/azure-maps/how-to-use-map-control)
- [UDOT Developer API](https://developer.udot.utah.gov/)
- [Tippecanoe Vector Tiles](https://github.com/mapbox/tippecanoe)
- [GeoJSON Specification](https://geojson.org/)

### Support
- **UDOT API Issues:** developer@udot.utah.gov
- **Azure Maps Support:** Azure Portal Support
- **Project Team:** See CLAUDE.md

---

**Document Version:** 1.0
**Last Updated:** 2025-10-15
**Author:** Ubair Website Development Team
