# CHPC Data Pipeline - Implementation Guide

**Version:** 1.0
**Last Updated:** 2025-11-22
**Status:** Production (observations) + Development (Clyfar forecasts)

This is the definitive guide for deploying and operating the BasinWx data pipeline on CHPC. Based on actual working code, not aspirational features.

---

## Table of Contents

1. [Current Operational Status](#current-operational-status)
2. [Architecture Overview](#architecture-overview)
3. [Prerequisites](#prerequisites)
4. [Installation Guide](#installation-guide)
5. [Cron Configuration](#cron-configuration)
6. [Schema Reference](#schema-reference)
7. [Clyfar Integration Status](#clyfar-integration-status)
8. [Testing Procedures](#testing-procedures)
9. [Monitoring & Logs](#monitoring--logs)
10. [Troubleshooting](#troubleshooting)
11. [Future Roadmap](#future-roadmap)

---

## Current Operational Status

### ✅ Production Ready
- **Observations Pipeline**: Live weather data from Synoptic API → Website
  - Script: `brc-tools/brc_tools/download/get_map_obs.py`
  - Frequency: Every 10 minutes
  - Status: 100% schema match, fully tested
  - Data: 295 observations across 46 stations

### 🚧 In Development
- **Clyfar Forecasts**: Ozone alert predictions
  - Model: v0.9.5 fuzzy inference system
  - Integration: Partial (output generation working, upload pending)
  - Target: Twice-daily forecast updates

### ❌ Not Implemented
- **Timeseries Data**: Hourly time-series graphs (future)
- **Images**: Automated image generation (future)
- **Outlooks**: Manual text outlooks (workflow needed)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│ CHPC (chpc.utah.edu)                                        │
│                                                             │
│  ┌──────────────┐         ┌──────────────┐                │
│  │  brc-tools   │         │   clyfar     │                │
│  │              │         │              │                │
│  │ get_map_obs  │         │ run_gefs     │                │
│  │    .py       │         │  _clyfar.py  │                │
│  └──────┬───────┘         └──────┬───────┘                │
│         │                        │                         │
│         │ Uses                   │ (Integration            │
│         │ send_json_to_server()  │  in development)        │
│         │                        │                         │
│         └────────────────────────┴─────────────┐           │
│                                                 │           │
│                                    POST with    │           │
│                                    x-api-key    │           │
│                                                 │           │
└─────────────────────────────────────────────────┼───────────┘
                                                  │
                                                  ▼
                        ┌──────────────────────────────────────┐
                        │ Akamai/Linode (basinwx.com)          │
                        │                                      │
                        │  POST /api/upload/:dataType          │
                        │                                      │
                        │  ┌─────────────────────────────┐    │
                        │  │ Validation:                 │    │
                        │  │ 1. API key auth             │    │
                        │  │ 2. CHPC hostname check      │    │
                        │  │ 3. File type validation     │    │
                        │  │ 4. JSON schema check        │    │
                        │  └─────────────────────────────┘    │
                        │                                      │
                        │  Storage:                            │
                        │  /public/api/static/:dataType/       │
                        │                                      │
                        │  Retrieval:                          │
                        │  GET /api/static/{filename}          │
                        └──────────────────────────────────────┘
```

### Data Flow
1. **CHPC Scheduler (cron)** triggers Python scripts
2. **brc-tools** pulls from Synoptic Weather API, processes with polars
3. **Upload module** POSTs JSON to website with API key authentication
4. **Website API** validates, stores to `/public/api/static/`
5. **Frontend** fetches via `/api/static/` or `/api/live-observations`

---

## Prerequisites

### On CHPC
- **Python 3.8+** with pip
- **Git** for repository management
- **Network access** to:
  - `api.synopticdata.com` (Synoptic Weather API)
  - `basinwx.com` (website upload endpoint)

### API Credentials Required
1. **DATA_UPLOAD_API_KEY**: Website upload authentication
2. **SYNOPTIC_API_TOKEN**: Synoptic Weather API access
3. **UDOT_API_KEY**: UDOT data access (if using)

### Disk Space
- Logs: ~100MB/month (rotated)
- Data cache: ~50MB
- Total: 500MB recommended

---

## Installation Guide

### Step 1: Clone Repositories

```bash
# Navigate to home directory
cd ~

# Clone brc-tools
git clone https://github.com/Bingham-Research-Center/brc-tools.git
cd brc-tools
git checkout main  # or specific branch

# Clone clyfar (if using forecasts)
cd ~
git clone https://github.com/Bingham-Research-Center/clyfar.git
cd clyfar
git checkout main  # or specific version tag
```

### Step 2: Set Up Python Environment

**For brc-tools:**
```bash
cd ~/brc-tools
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

**For clyfar:**
```bash
cd ~/clyfar
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

### Step 3: Configure Environment Variables

Create `~/.bashrc_basinwx` file:

```bash
# BasinWx Data Pipeline Configuration
export DATA_UPLOAD_API_KEY="your-api-key-here"
export SYNOPTIC_API_TOKEN="your-synoptic-token-here"
export UDOT_API_KEY="your-udot-key-here"  # if needed

# Activate brc-tools venv by default
# source ~/brc-tools/venv/bin/activate
```

Add to `~/.bashrc`:
```bash
# BasinWx Configuration
if [ -f ~/.bashrc_basinwx ]; then
    source ~/.bashrc_basinwx
fi
```

**Security Note:** Keep `.bashrc_basinwx` private (chmod 600)

### Step 4: Configure Website URL

Create `~/.config/ubair-website/website_url`:

```bash
mkdir -p ~/.config/ubair-website
echo "https://basinwx.com" > ~/.config/ubair-website/website_url
```

**Note:** `push_data.py` reads from this file (line 92-97)

### Step 5: Create Log Directories

```bash
mkdir -p ~/logs/basinwx
```

### Step 6: Test Authentication

```bash
cd ~/brc-tools
source venv/bin/activate

# Test health endpoint
python3 -c "
import requests
response = requests.get('https://basinwx.com/api/health')
print(f'Health check: {response.status_code}')
print(response.json())
"

# Test API key (requires DATA_UPLOAD_API_KEY set)
python3 brc_tools/download/push_data.py --test
```

---

## Cron Configuration

### Production Cron (Observations Only)

**File:** `~/basinwx_crontab.txt`

```bash
# BasinWx Data Pipeline - Production Configuration
# Observations every 10 minutes

*/10 * * * * source ~/.bashrc && cd ~/brc-tools && ~/brc-tools/venv/bin/python3 ~/brc-tools/brc_tools/download/get_map_obs.py >> ~/logs/basinwx/observations.log 2>&1
```

**Install cron:**
```bash
crontab ~/basinwx_crontab.txt
crontab -l  # verify
```

### Why This Works

1. **`source ~/.bashrc`**: Loads environment variables (DATA_UPLOAD_API_KEY)
2. **`cd ~/brc-tools`**: Sets working directory (script uses relative paths)
3. **Full path to Python**: Uses virtualenv Python with dependencies
4. **Full path to script**: Explicit, no ambiguity
5. **Redirect to log**: Captures stdout and stderr

### What `get_map_obs.py` Does

**Lines 23-93 of `brc_tools/download/get_map_obs.py`:**
1. Fetches latest observations from Synoptic API
2. Processes with polars (filtering, timezone conversion)
3. Generates two files:
   - `map_obs_YYYYMMDD_HHMMZ.json` (observations)
   - `map_obs_meta_YYYYMMDD_HHMMZ.json` (station metadata)
4. **Automatically uploads** via `send_json_to_server()` (lines 85-93)

**No separate upload step needed** - cron templates suggesting `&& push_data.py` are outdated.

### Development Cron (With Clyfar - Coming Soon)

**File:** `~/basinwx_crontab_full.txt`

```bash
# BasinWx Data Pipeline - Full Configuration

# Observations every 10 minutes
*/10 * * * * source ~/.bashrc && cd ~/brc-tools && ~/brc-tools/venv/bin/python3 ~/brc-tools/brc_tools/download/get_map_obs.py >> ~/logs/basinwx/observations.log 2>&1

# Clyfar forecasts twice daily (6am and 6pm Mountain Time)
0 6,18 * * * source ~/.bashrc && cd ~/clyfar && ~/clyfar/venv/bin/python3 ~/clyfar/run_gefs_clyfar.py >> ~/logs/basinwx/clyfar.log 2>&1
```

**Status:** Clyfar integration pending (see section 7)

---

## Schema Reference

### Observations Format

**Data Type:** `observations`
**Schema Version:** DATA_MANIFEST.json v1.0.1
**Compatibility:** brc-tools ✅ 100% match

**Required Fields:**
```json
[
  {
    "stid": "WBB",
    "variable": "air_temp",
    "value": 45.2,
    "date_time": "2025-11-22T15:30:00Z",
    "units": "Fahrenheit"
  }
]
```

**Field Specifications:**
- `stid`: Station ID (3-10 uppercase alphanumeric)
- `variable`: Must be from approved list (51 variables - see DATA_MANIFEST.json)
- `value`: Numeric measurement
- `date_time`: ISO 8601 with UTC (Z suffix required)
- `units`: String (e.g., "Fahrenheit", "mph", "degrees")

**Supported Variables (partial list):**
- Meteorological: `air_temp`, `wind_speed`, `wind_direction`, `dew_point_temperature`, `pressure`, `relative_humidity`
- Air Quality: `ozone_concentration`, `PM_25_concentration`, `NOx_concentration`
- Other: `soil_temp`, `snow_depth`, `solar_radiation`, `precip_accum`

**Full list:** See `/DATA_MANIFEST.json` in website repo

### Metadata Format

**Data Type:** `metadata`
**Purpose:** Station information for map display

**Required Fields:**
```json
[
  {
    "stid": "WBB",
    "name": "William Browning Building",
    "elevation": 4806.0,
    "latitude": 40.76623,
    "longitude": -111.84755
  }
]
```

**Field Specifications:**
- `elevation`: Feet above sea level (float)
- `latitude`: Decimal degrees (float)
- `longitude`: Decimal degrees (float)

### Data Validation

**Website performs these checks** (`server/routes/dataUpload.js:144-169`):
1. File extension must be `.json`
2. Must parse as valid JSON
3. Must be array format
4. Fields must match schema
5. File size ≤ 10MB

**Validation failures return HTTP 400** with specific error message

---

## Clyfar Integration Status

### Current State (2025-11-22)

**Model Version:** v0.9.0 (code) / v0.9.5 (planned deployment)

**What Works:**
- Fuzzy inference system configured (`fis/v0p9.py`)
- GEFS data processing (`run_gefs_clyfar.py`)
- Ozone prediction generation
- Local output to `./data/clyfar_output/`

**What's Missing:**
- Upload to website (no `send_to_website()` function)
- Output format specification for website consumption
- Cron configuration for scheduled runs
- Schema definition in DATA_MANIFEST.json

### Integration Plan

#### Step 1: Define Output Schema

**Proposed format** (to be confirmed):
```json
{
  "forecast_date": "2025-11-23T00:00:00Z",
  "prediction_run": "2025-11-22T18:00:00Z",
  "ozone_level": "moderate",
  "max_8hr_avg_ppb": 65,
  "confidence": 0.82,
  "contributing_factors": [
    "temperature_inversion",
    "low_wind_speed"
  ],
  "alert_issued": false
}
```

#### Step 2: Implement Upload Function

**Add to `run_gefs_clyfar.py`:**
```python
from brc_tools.download.push_data import send_json_to_server
import os

def upload_forecast(output_file):
    """Upload Clyfar forecast to BasinWx website."""
    server_url = "https://basinwx.com"  # or read from config
    api_key = os.environ.get('DATA_UPLOAD_API_KEY')

    with open(output_file, 'r') as f:
        forecast_data = json.load(f)

    send_json_to_server(
        server_address=server_url,
        fpath=output_file,
        file_data=forecast_data,
        API_KEY=api_key
    )
```

#### Step 3: Update DATA_MANIFEST.json

Add forecast schema to website validation rules.

#### Step 4: Configure Cron

Run twice daily at 6am and 6pm Mountain Time (forecast generation takes ~30 min).

### Timeline
- Schema definition: Pending stakeholder review
- Upload implementation: 1-2 hours development
- Testing: 1 hour local + 1 hour CHPC
- Production deployment: After successful test cycle

---

## Testing Procedures

### Manual Test: Observations Upload

```bash
cd ~/brc-tools
source venv/bin/activate

# Run observation script manually
python3 brc_tools/download/get_map_obs.py

# Check output
tail -n 50 ~/logs/basinwx/observations.log

# Verify on website
curl https://basinwx.com/api/live-observations | jq '.observations | length'
```

**Expected result:** Should see recent observations (within 10 minutes)

### Test Upload with Existing File

```bash
cd ~/brc-tools
source venv/bin/activate

# Use test script from website repo
# (Copy from ubair-website/chpc-deployment/test_upload.sh)
./test_upload.sh observations /path/to/test/file.json
```

### Verify Data on Website

**Check file listing:**
```bash
curl https://basinwx.com/api/filelist.json | jq '.observations | .[0]'
```

**Check specific file:**
```bash
curl https://basinwx.com/api/static/map_obs_20251122_1530Z.json | jq '. | length'
```

**Check live endpoint:**
```bash
curl https://basinwx.com/api/live-observations | jq '.metadata'
```

---

## Monitoring & Logs

### Log Locations

```
~/logs/basinwx/
├── observations.log      # Observation updates (every 10 min)
├── clyfar.log           # Forecast generation (twice daily)
└── errors.log           # Critical failures (if implemented)
```

### Log Rotation

**Add to crontab:**
```bash
# Rotate logs weekly (keep 4 weeks)
0 0 * * 0 find ~/logs/basinwx/ -name "*.log" -mtime +28 -delete
```

### Monitoring Checklist

**Daily:**
- [ ] Check latest observation timestamp: `curl basinwx.com/api/live-observations | jq '.timestamp'`
- [ ] Verify log for errors: `grep -i error ~/logs/basinwx/observations.log | tail -n 10`

**Weekly:**
- [ ] Check disk space: `du -sh ~/logs/basinwx/`
- [ ] Verify cron is running: `crontab -l`
- [ ] Review upload success rate in logs

**On-Call:**
- [ ] Missing data alert: Check CHPC connectivity and Synoptic API status
- [ ] Authentication failures: Verify `DATA_UPLOAD_API_KEY` is set
- [ ] Schema errors: Check if Synoptic API changed response format

### Success Indicators

```bash
# Last 10 successful uploads
grep "successfully" ~/logs/basinwx/observations.log | tail -n 10

# Upload success rate (last 24 hours)
grep "$(date +%Y-%m-%d)" ~/logs/basinwx/observations.log | \
  grep -c "successfully"
# Should be ~144 (24 hours * 6 per hour)
```

---

## Troubleshooting

### Problem: "API key authentication failed"

**Symptoms:**
```
Error: 401 Unauthorized
{"error": "Invalid API key"}
```

**Diagnosis:**
```bash
# Check if env var is set
echo $DATA_UPLOAD_API_KEY

# Verify in Python
python3 -c "import os; print(os.environ.get('DATA_UPLOAD_API_KEY'))"
```

**Solutions:**
1. Ensure `~/.bashrc_basinwx` exists and is sourced
2. Verify API key matches website configuration
3. In cron, ensure `source ~/.bashrc` comes before script execution

### Problem: "Hostname validation failed"

**Symptoms:**
```
Error: 403 Forbidden
{"error": "Access denied: Invalid origin"}
```

**Cause:** Website expects `x-client-hostname` to end with `chpc.utah.edu`

**Diagnosis:**
```bash
# Check hostname
hostname
# Should output something like: notch042.chpc.utah.edu
```

**Solutions:**
1. Run only from CHPC login nodes (notchXXX.chpc.utah.edu)
2. If testing locally, temporarily disable hostname check in website code (NOT for production)

### Problem: Relative path error in `get_map_obs.py`

**Symptoms:**
```
FileNotFoundError: [Errno 2] No such file or directory: '../../data/schema/ubair_schema.json'
```

**Cause:** Hardcoded relative path on line 25: `data_root = "../../data"`

**Solutions:**
1. **Ensure cron `cd`s to correct directory:** `cd ~/brc-tools` before running script
2. **Or modify script** to use absolute paths:
   ```python
   import os
   from pathlib import Path

   # Get script directory
   SCRIPT_DIR = Path(__file__).parent
   data_root = SCRIPT_DIR / "../../data"
   ```

### Problem: "Module not found" errors

**Symptoms:**
```
ModuleNotFoundError: No module named 'polars'
```

**Cause:** Using system Python instead of virtualenv

**Solutions:**
1. Use full path to venv Python in cron: `~/brc-tools/venv/bin/python3`
2. Or activate venv in cron: `source ~/brc-tools/venv/bin/activate && python3 ...`

### Problem: No data appearing on website

**Diagnosis steps:**

1. **Check if script ran:**
   ```bash
   tail ~/logs/basinwx/observations.log
   ```

2. **Check if upload succeeded:**
   ```bash
   grep "successfully" ~/logs/basinwx/observations.log | tail -n 1
   ```

3. **Check if file exists on website:**
   ```bash
   curl https://basinwx.com/api/filelist.json | jq '.observations[-1]'
   ```

4. **Check file contents:**
   ```bash
   curl https://basinwx.com/api/static/map_obs_YYYYMMDD_HHMMZ.json | jq '.'
   ```

5. **Check website API:**
   ```bash
   curl https://basinwx.com/api/live-observations | jq '.observations | length'
   ```

**Common causes:**
- Cron not running (`crontab -l` to verify)
- Environment variables not loaded (add `source ~/.bashrc` to cron)
- API authentication failure (check logs for 401/403 errors)
- Network connectivity (ping basinwx.com from CHPC)

### Problem: Old data showing on website

**Cause:** Cron stopped running, last successful upload was hours/days ago

**Diagnosis:**
```bash
# Check last cron execution
ls -lt ~/logs/basinwx/observations.log

# Check last successful upload
grep "successfully" ~/logs/basinwx/observations.log | tail -n 1
```

**Solutions:**
1. Verify cron is installed: `crontab -l`
2. Check cron service status: `systemctl status crond` (if applicable)
3. Run script manually to confirm it works: `python3 brc_tools/download/get_map_obs.py`
4. Check CHPC scheduled maintenance (may pause cron jobs)

---

## Future Roadmap

### Short Term (1-2 months)
- [ ] Complete Clyfar upload integration
- [ ] Implement timeseries data generation (`get_timeseries.py`)
- [ ] Create manual outlook upload workflow
- [ ] Add monitoring dashboard on website

### Medium Term (3-6 months)
- [ ] Automate image generation and upload (`get_images.py`)
- [ ] Implement alert notifications for data gaps
- [ ] Create backup/failover mechanism
- [ ] Add data quality validation in pipeline

### Long Term (6+ months)
- [ ] Real-time data streaming (WebSocket)
- [ ] Predictive models beyond ozone (PM2.5, temperature inversions)
- [ ] Mobile app data sync
- [ ] Historical data archive system

---

## Additional Resources

### Documentation in This Repo
- `/chpc-deployment/README.md` - Deployment guide index
- `/chpc-deployment/DEPLOYMENT_GUIDE.md` - Detailed step-by-step
- `/chpc-deployment/MONITORING_GUIDE.md` - Operational monitoring
- `/chpc-deployment/BRC_TOOLS_REVIEW.md` - Code review findings
- `/DATA_MANIFEST.json` - Data schema specification v1.0.1
- `/docs/DATA-PIPELINE-OVERVIEW.md` - Technical architecture details

### External Documentation
- Synoptic Weather API: https://developers.synopticdata.com/
- CHPC User Guide: https://www.chpc.utah.edu/documentation/
- brc-tools repo: `https://github.com/Bingham-Research-Center/brc-tools`
- clyfar repo: `https://github.com/Bingham-Research-Center/clyfar`

### Configuration Files
- **Environment variables:** `~/.bashrc_basinwx`
- **Website URL:** `~/.config/ubair-website/website_url`
- **Cron jobs:** `crontab -e` or `~/basinwx_crontab.txt`
- **Station schema:** `~/brc-tools/data/schema/ubair_schema.json`

### Support Contacts
- Technical issues: Open issue in respective GitHub repo
- CHPC support: https://www.chpc.utah.edu/resources/get_help.php
- Website downtime: Check Akamai/Linode status

---

**Document Maintenance:**
- Update this document when adding new data types
- Update schema reference when DATA_MANIFEST.json changes
- Update cron configuration when scheduling changes
- Mark sections as "deprecated" rather than removing (for historical reference)

**Version History:**
- v1.0 (2025-11-22): Initial comprehensive implementation guide
