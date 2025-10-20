# UDOT Map Data API Documentation

## Overview

This API provides GeoJSON-formatted data from the Utah Department of Transportation (UDOT) for use with Azure Maps visualization. All endpoints implement rate limiting, caching, and automatic failover to ensure reliability.

**Base URL:** `http://localhost:3000/api` (development)
**Production URL:** `https://basinwx.com/api`

**Authentication:** No authentication required for public endpoints

---

## API Endpoints

### Health Check

#### `GET /udot/health`

Check the health and configuration of the UDOT Map Data API.

**Response:**
```json
{
  "success": true,
  "service": "UDOT Map Data API",
  "version": "1.0.0",
  "endpoints": {
    "cameras": "/api/udot/cameras",
    "weatherStations": "/api/udot/weather-stations",
    "roadConditions": "/api/udot/road-conditions",
    "allData": "/api/udot/map-data/all",
    "provoCanyon": "/api/udot/map-data/provo-canyon"
  },
  "rateLimiting": {
    "maxCallsPerMinute": 10,
    "enforcedBy": "UDOTDataService"
  }
}
```

---

### UDOT Cameras

#### `GET /udot/cameras`

Retrieve UDOT traffic camera locations with image URLs as GeoJSON.

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `region` | string | No | Filter cameras by region (e.g., "provo", "uintah") |

**Example Request:**
```bash
curl http://localhost:3000/api/udot/cameras?region=provo
```

**Response:**
```json
{
  "success": true,
  "type": "FeatureCollection",
  "metadata": {
    "generated": "2025-10-15T10:30:00.000Z",
    "source": "UDOT Traffic API",
    "total_cameras": 12,
    "region_filter": "provo"
  },
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "Point",
        "coordinates": [-111.5678, 40.1234]
      },
      "properties": {
        "feature_type": "camera",
        "id": "12345",
        "name": "US-189 Deer Creek",
        "description": "Provo Canyon camera facing east",
        "image_url": "https://udottraffic.utah.gov/camera/image/12345.jpg",
        "video_url": "",
        "region": "Provo",
        "roadway": "US-189",
        "direction": "Eastbound",
        "last_updated": "2025-10-15T10:25:00.000Z",
        "is_active": true,
        "priority": 1
      }
    }
  ]
}
```

**Usage in Azure Maps:**
```javascript
const response = await fetch('/api/udot/cameras');
const geojson = await response.json();

const cameraSource = new atlas.source.DataSource();
cameraSource.setShapes(geojson.features);

map.sources.add(cameraSource);

const cameraLayer = new atlas.layer.SymbolLayer(cameraSource, null, {
  iconOptions: {
    image: 'camera',
    size: 1.2
  }
});

map.layers.add(cameraLayer);
```

---

### UDOT Weather Stations

#### `GET /udot/weather-stations`

Retrieve UDOT travel weather station data as GeoJSON.

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `region` | string | No | Filter stations by region |

**Example Request:**
```bash
curl http://localhost:3000/api/udot/weather-stations
```

**Response:**
```json
{
  "success": true,
  "type": "FeatureCollection",
  "metadata": {
    "generated": "2025-10-15T10:30:00.000Z",
    "source": "UDOT Travel Weather API",
    "total_stations": 8,
    "region_filter": null
  },
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "Point",
        "coordinates": [-111.5678, 40.1234]
      },
      "properties": {
        "feature_type": "weather_station",
        "id": "WS-123",
        "name": "Provo Canyon Weather Station",
        "roadway": "US-189",
        "region": "Provo",
        "temperature": 42,
        "temperature_unit": "°F",
        "road_temperature": 38,
        "wind_speed": 15,
        "wind_speed_unit": "mph",
        "wind_direction": 270,
        "visibility": 10,
        "visibility_unit": "miles",
        "precipitation_rate": 0,
        "road_condition": "Wet",
        "elevation": 5800,
        "last_updated": "2025-10-15T10:25:00.000Z",
        "is_active": true
      }
    }
  ]
}
```

---

### UDOT Road Conditions

#### `GET /udot/road-conditions`

Retrieve current road conditions with numerical condition levels for data-driven styling.

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `region` | string | No | Filter conditions by region |

**Example Request:**
```bash
curl http://localhost:3000/api/udot/road-conditions
```

**Response:**
```json
{
  "success": true,
  "type": "FeatureCollection",
  "metadata": {
    "generated": "2025-10-15T10:30:00.000Z",
    "source": "UDOT Current Conditions API",
    "total_conditions": 45,
    "region_filter": null,
    "condition_level_mapping": {
      "1": "Clear/Dry",
      "2": "Wet/Minor",
      "3": "Snow/Ice",
      "4": "Hazardous",
      "5": "Closed"
    }
  },
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "Point",
        "coordinates": [-111.5678, 40.1234]
      },
      "properties": {
        "feature_type": "road_condition",
        "id": "RC-456",
        "roadway": "US-189",
        "direction": "Northbound",
        "region": "Provo",
        "condition_level": 3,
        "weather_description": "Snow Packed",
        "description": "Use caution, snow packed roads",
        "last_updated": "2025-10-15T10:25:00.000Z",
        "mile_post": 12.5
      }
    }
  ]
}
```

**Condition Level Reference:**
| Level | Status | Color | Hex Code |
|-------|--------|-------|----------|
| 1 | Clear/Dry | Green | #00A000 |
| 2 | Wet/Minor Impacts | Yellow | #FFFF00 |
| 3 | Snow/Ice - High Caution | Orange | #FFA500 |
| 4 | Hazardous - Travel Not Recommended | Red | #FF0000 |
| 5 | Road Closed | Black | #000000 |

**Data-Driven Styling Example:**
```javascript
const roadLayer = new atlas.layer.BubbleLayer(roadSource, null, {
  color: [
    'case',
    ['==', ['get', 'condition_level'], 1], '#00A000',
    ['==', ['get', 'condition_level'], 2], '#FFFF00',
    ['==', ['get', 'condition_level'], 3], '#FFA500',
    ['==', ['get', 'condition_level'], 4], '#FF0000',
    ['==', ['get', 'condition_level'], 5], '#000000',
    '#CCCCCC' // Default
  ],
  radius: 8,
  opacity: 0.8
});
```

---

### All Map Data

#### `GET /udot/map-data/all`

Retrieve all UDOT data sources (cameras, weather stations, road conditions) in a single request.

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `region` | string | No | Filter all data by region |

**Example Request:**
```bash
curl http://localhost:3000/api/udot/map-data/all
```

**Response:**
```json
{
  "success": true,
  "data": {
    "cameras": {
      "type": "FeatureCollection",
      "metadata": { ... },
      "features": [ ... ]
    },
    "weatherStations": {
      "type": "FeatureCollection",
      "metadata": { ... },
      "features": [ ... ]
    },
    "roadConditions": {
      "type": "FeatureCollection",
      "metadata": { ... },
      "features": [ ... ]
    },
    "timestamp": "2025-10-15T10:30:00.000Z"
  }
}
```

**Note:** This endpoint makes sequential API calls to UDOT with appropriate rate limiting. Response time may be 20-30 seconds.

---

### Provo Canyon Data

#### `GET /udot/map-data/provo-canyon`

Retrieve UDOT data specifically filtered for the Provo Canyon (US-189) corridor.

**Example Request:**
```bash
curl http://localhost:3000/api/udot/map-data/provo-canyon
```

**Response:**
```json
{
  "success": true,
  "data": {
    "cameras": { ... },
    "weatherStations": { ... },
    "roadConditions": { ... },
    "timestamp": "2025-10-15T10:30:00.000Z"
  },
  "bounds": {
    "description": "US-189 Provo Canyon Corridor",
    "north": 40.6,
    "south": 40.2,
    "east": -111.3,
    "west": -111.7
  }
}
```

---

## Caching Strategy

All endpoints implement aggressive caching to respect UDOT API rate limits:

| Cache Type | Duration | Purpose |
|------------|----------|---------|
| Memory Cache | 5 minutes | Fast in-process cache |
| Disk Cache | 24 hours | Fallback if API unavailable |
| Stale Data Fallback | Up to 24 hours | Resilience during API outages |

**Cache Headers:**
```
Cache-Control: public, max-age=300
```

---

## Rate Limiting

The UDOT API enforces strict rate limiting:
- **Maximum:** 10 API calls per 60 seconds
- **Enforcement:** Server-side queue with automatic throttling
- **Behavior:** Requests are delayed (not rejected) to stay within limits

**Client Recommendations:**
1. Fetch data once on page load
2. Use auto-refresh interval of 5+ minutes
3. Cache responses client-side
4. Avoid parallel requests to multiple endpoints

---

## Error Responses

All errors follow consistent format:

```json
{
  "success": false,
  "error": "Failed to fetch camera data",
  "message": "UDOT API error: 503 Service Unavailable"
}
```

**HTTP Status Codes:**
| Code | Meaning | Action |
|------|---------|--------|
| 200 | Success | Process data |
| 500 | Server Error | Retry after 60 seconds |
| 503 | Service Unavailable | UDOT API down, check status |
| 429 | Rate Limited | Reduce request frequency |

---

## Integration Examples

### Complete Azure Maps Integration

```javascript
class UDOTMap {
  async init() {
    // Fetch all data
    const response = await fetch('/api/udot/map-data/provo-canyon');
    const { data } = await response.json();

    // Create data sources
    const camerasSource = new atlas.source.DataSource();
    camerasSource.setShapes(data.cameras.features);

    const weatherSource = new atlas.source.DataSource();
    weatherSource.setShapes(data.weatherStations.features);

    const roadSource = new atlas.source.DataSource();
    roadSource.setShapes(data.roadConditions.features);

    map.sources.add([camerasSource, weatherSource, roadSource]);

    // Add layers
    this.addCameraLayer(camerasSource);
    this.addWeatherLayer(weatherSource);
    this.addRoadConditionLayer(roadSource);

    // Auto-refresh every 5 minutes
    setInterval(() => this.refreshData(), 300000);
  }

  addRoadConditionLayer(source) {
    const layer = new atlas.layer.BubbleLayer(source, null, {
      color: [
        'case',
        ['==', ['get', 'condition_level'], 1], '#00A000',
        ['==', ['get', 'condition_level'], 2], '#FFFF00',
        ['==', ['get', 'condition_level'], 3], '#FFA500',
        ['==', ['get', 'condition_level'], 4], '#FF0000',
        ['==', ['get', 'condition_level'], 5], '#000000',
        '#CCCCCC'
      ],
      radius: 8
    });

    map.layers.add(layer);
  }
}
```

### Camera Image Popup

```javascript
map.events.add('click', cameraLayer, (e) => {
  const properties = e.shapes[0].getProperties();

  const popup = new atlas.Popup({
    content: `
      <div>
        <h3>${properties.name}</h3>
        <img src="${properties.image_url}" style="width: 100%; max-width: 400px;">
        <p>Updated: ${new Date(properties.last_updated).toLocaleString()}</p>
      </div>
    `,
    position: e.position
  });

  popup.open(map);
});
```

---

## Performance Optimization

### Recommendations
1. **Use region filtering** when possible to reduce dataset size
2. **Implement client-side caching** using localStorage or IndexedDB
3. **Limit zoom levels** for detailed layers (minZoom: 8)
4. **Use vector tiles** for large datasets (see VECTOR_TILES_GUIDE.md)

### Performance Benchmarks
| Endpoint | Response Time | Data Size | Recommended Refresh |
|----------|---------------|-----------|---------------------|
| `/cameras` | 150-300ms | 5-15 KB | 10 minutes |
| `/weather-stations` | 150-300ms | 3-10 KB | 5 minutes |
| `/road-conditions` | 200-400ms | 10-30 KB | 5 minutes |
| `/all` (sequential) | 20-30s | 20-60 KB | 10 minutes |
| `/provo-canyon` | 20-30s | 5-15 KB | 5 minutes |

---

## Support and Resources

### Documentation
- [UDOT Azure Architecture](UDOT_AZURE_ARCHITECTURE.md)
- [Vector Tiles Guide](VECTOR_TILES_GUIDE.md)
- [Project Overview](CLAUDE.md)

### External APIs
- [UDOT Developer Portal](https://developer.udot.utah.gov/)
- [Azure Maps Documentation](https://docs.microsoft.com/en-us/azure/azure-maps/)

### Contact
For API issues or questions:
- GitHub Issues: [ubair-website/issues](https://github.com/...)
- Email: [Contact form on basinwx.com]

---

**API Version:** 1.0.0
**Last Updated:** 2025-10-15
**Maintained by:** Ubair Website Development Team
