# Data Pipeline Testing Guide: BRC-Tools → Website

## Pipeline Overview
**CHPC (compute server)** → **POST /api/upload/:dataType** → **Akamai (web server)**

The data pipeline sends processed weather/air quality data from CHPC using brc-tools to this website's API endpoints for display on basinwx.com.

## Current Pipeline Status ✅

### 1. API Upload Endpoint Configuration
- **Endpoint**: `POST /api/upload/:dataType`
- **Location**: `server/routes/dataUpload.js:126`
- **Authentication**: API key via `x-api-key` header
- **Origin Validation**: CHPC hostname via `x-client-hostname` header
- **File Types**: JSON, MD, TXT (10MB limit)
- **Upload Directory**: `/public/api/static/`

### 2. Environment Variables Setup
```bash
# Required in .env file:
DATA_UPLOAD_API_KEY=your_generated_api_key_here
BASINWX_API_KEY=your_generated_api_key_here  # Should match above
```

### 3. Data Access Patterns
- **File List**: `GET /api/filelist.json` → Lists available data files
- **Static Files**: `GET /api/static/{filename}` → Direct file access
- **Live Observations**: `GET /api/live-observations` → Latest processed data
- **Frontend Access**: `public/js/api.js:3` implements `fetchLiveObservations()`

### 4. Example Data Format
Current example data in `/public/api/static/`:
```json
[
  {
    "stid": "BUNUT",
    "variable": "air_temp",
    "value": -47.606,
    "date_time": "2025-07-31T02:10:00.000Z",
    "units": "Celsius"
  }
]
```

## Step-by-Step Testing Guide

### Prerequisites
1. **Environment Setup**:
   ```bash
   cp .env.example .env
   # Edit .env and set DATA_UPLOAD_API_KEY
   ```

2. **Start Local Server**:
   ```bash
   npm run dev
   ```

### Test 1: Local API Testing
```bash
npm run test-api
```

This runs `scripts/test-api.js` which:
- ✅ Health check: `GET /api/health`
- ✅ File listing: `GET /api/filelist.json`
- ✅ Data upload: `POST /api/upload/observations` with test JSON
- ✅ Data retrieval: `GET /api/static/{filename}`

### Test 2: Manual Upload Simulation
```bash
# Create test data file
echo '[{"stid":"TEST01","variable":"air_temp","value":15.5,"date_time":"'$(date -Iseconds)'","units":"Celsius"}]' > test_data.json

# Upload with curl (simulating CHPC)
curl -X POST http://localhost:3000/api/upload/observations \
  -H "x-api-key: YOUR_API_KEY" \
  -H "x-client-hostname: test.chpc.utah.edu" \
  -F "file=@test_data.json"

# Verify upload
curl http://localhost:3000/api/filelist.json
```

### Test 3: Frontend Data Access
1. Navigate to `http://localhost:3000/live_aq`
2. Open browser dev tools → Network tab
3. Look for API calls:
   - `GET /api/filelist.json`
   - `GET /api/static/map_obs_*.json`
   - `GET /api/static/map_obs_meta_*.json`

### Test 4: Cron Job Simulation

#### From BRC-Tools Repository:
```bash
# Example cron job command (run from brc-tools):
python upload_to_website.py \
  --api-key $BASINWX_API_KEY \
  --endpoint https://basinwx.com/api/upload/observations \
  --data-file ./output/map_obs_20250925_1200Z.json

# For metadata:
python upload_to_website.py \
  --api-key $BASINWX_API_KEY \
  --endpoint https://basinwx.com/api/upload/metadata \
  --data-file ./output/map_obs_meta_20250925_1200Z.json
```

#### Expected File Naming Convention:
- Observations: `map_obs_YYYYMMDD_HHMMZ.json`
- Metadata: `map_obs_meta_YYYYMMDD_HHMMZ.json`
- Outlooks: `outlook_YYYYMMDD_HHMM.md`

## Production Deployment Checklist

### Server Configuration:
1. **Environment Variables**:
   - `DATA_UPLOAD_API_KEY` → Strong random key
   - `PORT` → Production port (default 3000)

2. **Directory Permissions**:
   ```bash
   mkdir -p public/api/static
   chmod 755 public/api/static
   ```

3. **CHPC Hostname Validation**:
   - Requests must have `x-client-hostname: *.chpc.utah.edu`
   - Reverse DNS lookup as fallback

### BRC-Tools Configuration:
1. **API Endpoint**: `https://basinwx.com/api/upload/:dataType`
2. **Authentication**: Include `x-api-key` header
3. **Hostname Header**: Include `x-client-hostname: $(hostname -f)`
4. **Cron Schedule**: Recommended every 10-30 minutes

## Expected Data Flow Timeline

1. **Data Collection** (CHPC): Synoptic API → brc-tools processing
2. **Data Upload** (CHPC): POST to website API every 10-30 minutes
3. **File Storage** (Website): JSON files saved to `/public/api/static/`
4. **File List Update**: `filelist.json` automatically updated
5. **Frontend Refresh**: Live AQ page auto-refreshes every 10 minutes

## Troubleshooting

### Common Issues:
1. **403 Forbidden**: Check hostname header and API key
2. **Invalid JSON**: Validate JSON format before upload
3. **File Not Found**: Verify upload directory permissions
4. **CORS Issues**: API endpoints don't use CORS (server-to-server)

### Debug Commands:
```bash
# Check uploaded files
ls -la public/api/static/

# Verify API key in environment
echo $DATA_UPLOAD_API_KEY

# Test server health
curl http://localhost:3000/api/health

# Check server logs
npm run dev  # Watch console output
```

### Log Files:
- Server logs display in console during `npm run dev`
- Upload attempts logged with timestamp and file info
- Authentication failures logged for security monitoring

## Success Indicators

✅ **Pipeline Working When**:
1. `npm run test-api` passes all tests
2. New files appear in `/public/api/static/` after cron jobs
3. `GET /api/filelist.json` shows updated file list
4. Live AQ page displays fresh data timestamps
5. No 403/401 errors in server logs

The pipeline is fully configured and ready for testing with brc-tools cron jobs.