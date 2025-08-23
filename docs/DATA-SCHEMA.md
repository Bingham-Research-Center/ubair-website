# Data Schema Documentation

## Overview
Data flows from CHPC (brc-tools Python repo) → Akamai (ubair-website Node.js repo) via secure API.

## Data Types & Formats

### 1. Live Observations
**Files:** `map_obs_YYYYMMDD_HHMMZ.json`
**Structure:**
```json
[
  {
    "stid": "BUNUT",           // Station ID
    "variable": "air_temp",    // Variable name
    "value": -47.606,          // Measurement value
    "date_time": "2025-07-31T02:10:00.000Z",  // ISO timestamp
    "units": "Celsius"         // Unit of measurement
  }
]
```

### 2. Station Metadata
**Files:** `map_obs_meta_YYYYMMDD_HHMMZ.json`
**Structure:**
```json
[
  {
    "stid": "BUNUT",           // Station ID
    "variable": "latitude",    // Coordinate type
    "value": 40.1234,          // Coordinate value
    "date_time": "2025-07-31T02:10:00.000Z",
    "units": "degrees"
  }
]
```

### 3. Markdown Outlooks
**Files:** `outlook_YYYYMMDD_HHMM.md`
**Structure:** Standard markdown text for weather forecasts

### 4. File Listing
**Files:** `filelist.json`
**Structure:**
```json
[
  "map_obs_20250731_0228Z.json",
  "map_obs_meta_20250731_0228Z.json"
]
```

## Variable Names
- `air_temp` - Air temperature
- `ozone_concentration` - Ozone levels
- `pm25_concentration` - PM2.5 particles
- `relative_humidity` - Humidity
- `wind_speed`, `wind_direction` - Wind data
- `latitude`, `longitude` - Station coordinates

## API Endpoints
- **Upload:** `POST /api/upload/:dataType` (CHPC only)
- **Fetch data:** `GET /api/static/{filename}`
- **File list:** `GET /api/filelist.json`

## Testing Workflow

### Local Testing (No CHPC)
1. Start server: `npm run dev`
2. Place test JSON files in `/public/api/static/`
3. Update `filelist.json` with new filenames
4. Check browser console for API errors
5. Test map display at `localhost:3000/live_aq`

### CHPC-to-Akamai Testing
1. Set up API key: `export DATA_UPLOAD_API_KEY="your-key"`
2. Test upload from brc-tools:
   ```bash
   curl -X POST \
   -H "x-api-key: your-key" \
   -H "x-client-hostname: something.chpc.utah.edu" \
   -F "file=@test_data.json" \
   http://your-server/api/upload/observations
   ```
3. Check upload appears in `/public/api/static/`
4. Verify website displays new data

## Data Flow
1. **CHPC:** Python processes Synoptic Weather data
2. **Transform:** Pandas → JSON array format
3. **Upload:** POST to `/api/upload/observations`
4. **Store:** Files saved to `/public/api/static/`
5. **Serve:** Website fetches latest files via API
6. **Display:** Leaflet map shows station markers