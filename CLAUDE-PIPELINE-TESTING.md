# Data Pipeline Testing Guide

## Pipeline Overview
**CHPC (compute server)** → **POST /api/upload/:dataType** → **Website Server**

All CHPC data flows through a unified API pipeline to organized subdirectories.

## Directory Structure

```
public/
├── api/static/              # All API-uploaded data
│   ├── observations/        # Weather observation JSON
│   ├── metadata/            # Station metadata JSON
│   ├── outlooks/            # Outlook markdown files
│   ├── images/              # Forecast images, plots
│   └── timeseries/          # Time series data
└── content/                 # Static content (not uploaded)
    ├── about/
    ├── clyfar/
    └── weather/
```

## API Configuration ✅

### Upload Endpoint
- **URL**: `POST /api/upload/:dataType`
- **Data Types**: `observations`, `metadata`, `outlooks`, `images`, `timeseries`
- **File Types**: JSON, MD, TXT, PNG (10MB limit)
- **Authentication**: `x-api-key` header + `x-client-hostname` validation

### Access Endpoints
- **File List**: `GET /api/filelist.json`
- **Data Files**: `GET /api/static/{dataType}/{filename}`
- **Live Observations**: `GET /api/live-observations`

## Testing Steps

### 1. Environment Setup
```bash
cp .env.example .env
# Set DATA_UPLOAD_API_KEY in .env
```

### 2. Start Server
```bash
npm run dev
```

### 3. Run Test Suite
```bash
npm run test-api
```

### 4. Manual Upload Test
```bash
# Test observations
curl -X POST http://localhost:3000/api/upload/observations \
  -H "x-api-key: $DATA_UPLOAD_API_KEY" \
  -H "x-client-hostname: test.chpc.utah.edu" \
  -F "file=@test_data.json"

# Test outlooks
curl -X POST http://localhost:3000/api/upload/outlooks \
  -H "x-api-key: $DATA_UPLOAD_API_KEY" \
  -H "x-client-hostname: test.chpc.utah.edu" \
  -F "file=@outlook_20250930_1200.md"
```

### 5. Verify Upload
```bash
# Check file listing
curl http://localhost:3000/api/filelist.json

# Check specific directory
ls -la public/api/static/observations/
ls -la public/api/static/outlooks/
```

## Production Deployment

### From CHPC (Sending Data):
```bash
# Upload observations
curl -X POST https://basinwx.com/api/upload/observations \
  -H "x-api-key: $BASINWX_API_KEY" \
  -H "x-client-hostname: $(hostname -f)" \
  -F "file=@map_obs_20250930_1200Z.json"

# Upload outlooks
curl -X POST https://basinwx.com/api/upload/outlooks \
  -H "x-api-key: $BASINWX_API_KEY" \
  -H "x-client-hostname: $(hostname -f)" \
  -F "file=@outlook_20250930_1200.md"
```

### Expected File Naming:
- Observations: `map_obs_YYYYMMDD_HHMMZ.json`
- Metadata: `map_obs_meta_YYYYMMDD_HHMMZ.json`
- Outlooks: `outlook_YYYYMMDD_HHMM.md`

## Success Indicators

✅ **Pipeline Working When:**
1. `npm run test-api` passes all tests
2. Files appear in correct subdirectories
3. `GET /api/filelist.json` shows updated files
4. Frontend pages display fresh data
5. No authentication errors in logs

## Frontend Integration

All frontend code updated to use unified API structure:
- `/api/static/observations/` for weather data
- `/api/static/outlooks/` for forecast text
- `/api/static/metadata/` for station info

See `public/js/api.js` for data access examples.
