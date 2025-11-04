# BasinWx Data Pipeline - Complete Overview

## Executive Summary

This document provides a comprehensive overview of the automated data pipeline that transfers weather data from CHPC compute servers to the BasinWx website at basinwx.com. The pipeline is manifest-driven, meaning all data types, formats, validation rules, and schedules are defined in a central `DATA_MANIFEST.json` file that both CHPC and the web server adhere to.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         CHPC (Compute Server)                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐      ┌──────────────┐     ┌───────────────┐ │
│  │  Synoptic    │      │  brc-tools   │     │ chpc_uploader │ │
│  │  Weather API ├─────>│  (Python)    ├────>│    .py        │ │
│  │              │      │              │     │ (Validation)  │ │
│  └──────────────┘      └──────────────┘     └───────┬───────┘ │
│                                                      │         │
│                                                      │ HTTPS   │
│                          Scheduled via cron          │ POST    │
│                          (Every 10 min)              │         │
└──────────────────────────────────────────────────────┼─────────┘
                                                       │
                                                       │
                            ┌──────────────────────────▼──────┐
                            │    Linode/Akamai CDN           │
                            │    (basinwx.com)               │
                            ├────────────────────────────────┤
                            │                                │
                            │  ┌────────────────────────┐   │
                            │  │ /api/upload/:dataType  │   │
                            │  │ - API Key Auth         │   │
                            │  │ - Hostname Validation  │   │
                            │  │ - Manifest Validation  │   │
                            │  └───────────┬────────────┘   │
                            │              │                 │
                            │  ┌───────────▼────────────┐   │
                            │  │ /public/api/static/    │   │
                            │  │ - observations/        │   │
                            │  │ - metadata/            │   │
                            │  │ - timeseries/          │   │
                            │  │ - outlooks/            │   │
                            │  │ - images/              │   │
                            │  └───────────┬────────────┘   │
                            │              │                 │
                            │  ┌───────────▼────────────┐   │
                            │  │  Website Frontend      │   │
                            │  │  - Leaflet Maps        │   │
                            │  │  - Plotly Charts       │   │
                            │  └────────────────────────┘   │
                            │                                │
                            └────────────────────────────────┘
```

## Key Components

### 1. DATA_MANIFEST.json

**Location:** `/DATA_MANIFEST.json`

**Purpose:** Single source of truth for all data types, formats, validation rules, and transfer schedules.

**Key sections:**
- `dataTypes`: Defines each data type (observations, metadata, timeseries, outlooks, images)
- `schema`: JSON Schema for validation
- `schedule`: Cron expression for transfer frequency
- `validation`: Rules like maxFileSize, required fields, unit mappings
- `globalValidation`: Authentication, rate limits, retry policies
- `monitoring`: Expected data flow and alert thresholds

### 2. CHPC Uploader Script

**Location:** `/scripts/chpc_uploader.py`

**Purpose:** Manifest-driven Python script that validates and uploads data from CHPC.

**Key features:**
- Reads DATA_MANIFEST.json to understand data requirements
- Validates file size, JSON structure, and data content before upload
- Implements retry logic with exponential backoff
- Provides detailed logging
- Supports dry-run validation mode

**Usage:**
```bash
# Validate only (no upload)
python chpc_uploader.py --data-type observations --file data.json --validate-only

# Upload with validation
python chpc_uploader.py --data-type observations --file data.json

# Health check
python chpc_uploader.py --health-check
```

### 3. Server-Side Validation

**Location:** `/server/routes/dataUpload.js`

**Purpose:** Validates incoming data against manifest on the web server.

**Validation layers:**
1. **Authentication:** API key via `x-api-key` header
2. **Origin:** Hostname must be `*.chpc.utah.edu`
3. **File type:** JSON, MD, TXT, PNG, JPG only
4. **File size:** 10MB limit (configurable per data type)
5. **JSON structure:** Validates against manifest schema
6. **Data integrity:** Checks required fields, unit consistency, record counts

### 4. Monitoring System

**Location:** `/server/monitoring/dataMonitor.js` and `/server/routes/monitoring.js`

**Purpose:** Tracks pipeline health and data freshness.

**Monitoring endpoints:**
- `GET /api/monitoring/status` - Comprehensive status report
- `GET /api/monitoring/freshness` - Data age for each type
- `GET /api/monitoring/uploads` - Upload statistics
- `GET /api/monitoring/alerts` - Recent alerts

**Metrics tracked:**
- Data freshness (age of latest file vs expected frequency)
- Upload success rate
- Missing data types
- Stale data alerts

## Data Types and Schedules

| Data Type | Frequency | Format | Description |
|-----------|-----------|--------|-------------|
| **observations** | Every 10 min | JSON | Live weather readings (temp, wind, etc.) |
| **metadata** | Every 6 hours | JSON | Station locations and info |
| **timeseries** | Every hour | JSON | Historical/forecast time series |
| **outlooks** | Twice daily (6am, 6pm) | Markdown | Weather forecast text |
| **images** | Every 30 min | PNG/JPG | Satellite, radar, model output |

## Data Formats

### Observations

```json
[
  {
    "stid": "BUNUT",
    "variable": "air_temp",
    "value": 15.5,
    "date_time": "2025-11-03T12:00:00.000Z",
    "units": "Celsius"
  }
]
```

**Required variables per station:** `air_temp`, `wind_speed`, `wind_direction`

**Optional variables:** `dew_point_temperature`, `relative_humidity`, `snow_depth`, `ozone`, `pm25`, etc.

### Metadata

```json
[
  {
    "stid": "BUNUT",
    "name": "Bunnells Ridge",
    "elevation": 8800.0,
    "latitude": 40.314757,
    "longitude": -111.563976
  }
]
```

### Time Series

```json
{
  "station_id": "BUNUT",
  "variable": "ozone",
  "units": "ppb",
  "data": [
    {"time": "2025-11-03T00:00:00Z", "value": 45.2},
    {"time": "2025-11-03T01:00:00Z", "value": 46.8}
  ]
}
```

## Security

### Authentication
- **API Key:** Set in `BASINWX_API_KEY` environment variable
- **Header:** Must be sent as `x-api-key: your-key-here`
- **Generation:** Use `scripts/generate-api-key.js`

### Origin Validation
- **Method 1:** Check `x-client-hostname` header for `*.chpc.utah.edu`
- **Method 2:** Reverse DNS lookup of client IP
- **Purpose:** Ensure data only comes from authorized CHPC servers

### File Validation
- **Type checking:** Only JSON, MD, TXT, PNG, JPG allowed
- **Size limits:** 10MB default (5MB for images, 1MB for metadata)
- **Content validation:** JSON parsing, schema validation, data integrity checks

## Deployment Steps

### On CHPC

1. **Install dependencies:**
   ```bash
   pip install requests jsonschema
   ```

2. **Set environment variables:**
   ```bash
   export BASINWX_API_KEY="your-key-here"
   export BASINWX_API_URL="https://basinwx.com"
   ```

3. **Test connection:**
   ```bash
   python chpc_uploader.py --health-check
   ```

4. **Schedule with cron:**
   ```cron
   */10 * * * * cd ~/basinwx-pipeline && ./fetch_and_upload.py >> /tmp/basinwx_cron.log 2>&1
   ```

5. **Monitor logs:**
   ```bash
   tail -f /tmp/basinwx_upload.log
   ```

### On Web Server

1. **Ensure manifest is present:**
   ```bash
   ls -la DATA_MANIFEST.json
   ```

2. **Restart server to load manifest:**
   ```bash
   npm restart
   ```

3. **Verify manifest loaded:**
   ```bash
   # Check server logs for:
   # "✓ Loaded data manifest v1.0.0"
   ```

4. **Test monitoring endpoint:**
   ```bash
   curl https://basinwx.com/api/monitoring/status
   ```

## Monitoring and Alerts

### Check Pipeline Health

```bash
# Comprehensive status
curl https://basinwx.com/api/monitoring/status

# Data freshness only
curl https://basinwx.com/api/monitoring/freshness

# Upload statistics
curl https://basinwx.com/api/monitoring/uploads
```

### Alert Thresholds

- **Missing data:** Alert if no data received for 30 minutes
- **Stale data:** Alert if data age exceeds 2x expected frequency
- **Upload failures:** Alert after 3 consecutive failures
- **Success rate:** Alert if success rate drops below 90%

### Automated Monitoring

Set up cron job to check status and send email alerts:

```cron
# Monitor every 15 minutes
*/15 * * * * curl -s https://basinwx.com/api/monitoring/status | jq '.summary' | grep -q 'degraded' && echo "BasinWx pipeline degraded" | mail -s "Pipeline Alert" team@example.com
```

## Troubleshooting

### Problem: Data not appearing on website

**Check:**
1. CHPC upload logs: `tail /tmp/basinwx_upload.log`
2. Server logs: `tail /var/log/nginx/access.log`
3. Monitoring API: `curl https://basinwx.com/api/monitoring/freshness`
4. Station ID consistency between observations and metadata

**Solution:**
- Verify API key is correct
- Check network connectivity from CHPC
- Validate data format matches manifest

### Problem: Validation failures

**Check:**
1. Run local validation: `python chpc_uploader.py --validate-only --file data.json --data-type observations`
2. Compare against manifest schema: `cat DATA_MANIFEST.json | jq '.dataTypes.observations.schema'`

**Solution:**
- Fix data format issues
- Update units to match manifest
- Ensure required variables are present

### Problem: Upload timeouts

**Check:**
1. File size: `ls -lh data.json`
2. Network connectivity: `curl -I https://basinwx.com`
3. Server health: `curl https://basinwx.com/api/health`

**Solution:**
- Reduce file size if needed
- Check CHPC firewall rules
- Contact web team if server is down

## Change Management

### Adding New Variables

1. **Update manifest:**
   ```json
   "variable": {
     "enum": [..., "new_variable"]
   },
   "unitMapping": {
     "new_variable": "units"
   }
   ```

2. **Notify team:** Create GitHub issue describing new variable

3. **Test with one station:** Deploy to single station first

4. **Roll out:** Deploy to all stations after verification

### Changing Data Formats

1. **Coordinate with team:** Discuss breaking changes in advance (2 weeks notice)

2. **Update manifest version:** Increment major version for breaking changes

3. **Implement on CHPC:** Update Python scripts

4. **Deploy to web server:** Update validation and frontend code

5. **Monitor closely:** Check for errors after deployment

## Key Files Reference

| File | Purpose |
|------|---------|
| `DATA_MANIFEST.json` | Single source of truth for data pipeline |
| `scripts/chpc_uploader.py` | CHPC upload script with validation |
| `server/routes/dataUpload.js` | Server-side upload endpoint |
| `server/monitoring/dataMonitor.js` | Monitoring service |
| `docs/PYTHON-DEVELOPER-GUIDE.md` | Detailed Python developer guide |
| `docs/CHPC-DEPLOYMENT.md` | CHPC deployment instructions |
| `docs/API-KEY-SETUP.md` | API key generation guide |

## Testing

### Local Testing

```bash
# Test API (requires .env file)
npm run test-api

# Expected output:
# ✓ Health check passed
# ✓ Upload successful
```

### CHPC Testing

```bash
# Validate data locally
python chpc_uploader.py --validate-only --file test.json --data-type observations

# Test upload to staging
BASINWX_API_URL="https://staging.basinwx.com" python chpc_uploader.py --data-type observations --file test.json

# Health check
python chpc_uploader.py --health-check
```

## Support

- **GitHub Issues:** [Repository URL]
- **CHPC Support:** help@chpc.utah.edu
- **Team Lead:** [Contact info]
- **Documentation:** `/docs/` directory

## Next Steps

1. **Review manifest:** Ensure all data types are defined correctly
2. **Deploy to CHPC:** Follow CHPC-DEPLOYMENT.md guide
3. **Set up monitoring:** Configure alert emails
4. **Test thoroughly:** Run for 24 hours with monitoring
5. **Document customizations:** Add notes for team-specific modifications

## Appendix: Environment Variables

### CHPC
```bash
BASINWX_API_KEY         # API key for authentication
BASINWX_API_URL         # Base URL (default: https://basinwx.com)
SYNOPTIC_API_TOKEN      # Synoptic Weather API token
```

### Web Server
```bash
DATA_UPLOAD_API_KEY     # API key (matches BASINWX_API_KEY)
PORT                    # Server port (default: 3000)
UDOT_API_KEY           # UDoT traffic API key
SYNOPTIC_API_TOKEN     # Synoptic Weather API token
```

## Appendix: Manifest Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-11-03 | Initial manifest with 5 data types |

---

**Last Updated:** 2025-11-03
**Manifest Version:** 1.0.0
**Documentation Version:** 1.0
