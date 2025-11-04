# CHPC to BasinWx Data Pipeline - README

## What Was Built

A complete, production-ready data pipeline system that ensures reliable, validated data transfer from CHPC to your website with **no surprises**.

## The Problem We Solved

You needed a way to ensure that:
1. Data transfers happen on a predictable schedule
2. Data format is consistent and validated
3. Both CHPC and website teams know what to expect
4. Anomalies are caught before they break the website
5. Pipeline health can be monitored in real-time

## The Solution: Manifest-Driven Pipeline

**Central Manifest File (`DATA_MANIFEST.json`)** defines everything:
- What data types exist (observations, metadata, timeseries, outlooks, images)
- Exact format and schema for each type
- Transfer schedule (every 10 min, hourly, etc.)
- Validation rules (required fields, units, size limits)
- Error handling and retry policies

Both CHPC scripts and the web server read this manifest and enforce it.

## What You Can Do Now

### For CHPC Team

```bash
# 1. Install the uploader
pip install -r requirements.txt

# 2. Set your API key
export BASINWX_API_KEY="your-key-here"

# 3. Test connection
python scripts/chpc_uploader.py --health-check

# 4. Validate your data (no upload)
python scripts/chpc_uploader.py \
  --data-type observations \
  --file your_data.json \
  --validate-only

# 5. Upload data
python scripts/chpc_uploader.py \
  --data-type observations \
  --file your_data.json

# 6. Schedule with cron (every 10 minutes)
# See docs/CHPC-DEPLOYMENT.md for details
```

### For Web Team

```bash
# 1. Start server (manifest loads automatically)
npm run dev
# Look for: "✓ Loaded data manifest v1.0.0"

# 2. Check pipeline health
curl http://localhost:3000/api/monitoring/status | jq

# 3. Check data freshness
curl http://localhost:3000/api/monitoring/freshness | jq

# 4. View recent alerts
curl http://localhost:3000/api/monitoring/alerts | jq
```

## File Structure

```
ubair-website/
├── DATA_MANIFEST.json              # ⭐ Central manifest (single source of truth)
├── requirements.txt                # Python dependencies for CHPC
│
├── scripts/
│   └── chpc_uploader.py           # ⭐ CHPC upload script with validation
│
├── server/
│   ├── routes/
│   │   ├── dataUpload.js          # ✏️ Modified: Added manifest validation
│   │   └── monitoring.js          # ⭐ New: Monitoring API
│   ├── monitoring/
│   │   └── dataMonitor.js         # ⭐ New: Monitoring service
│   └── server.js                  # ✏️ Modified: Added monitoring routes
│
└── docs/
    ├── PIPELINE-SUMMARY.md        # ⭐ Quick reference (start here!)
    ├── QUICK-START.md             # ⭐ 30-minute setup guide
    ├── DATA-PIPELINE-OVERVIEW.md  # ⭐ Complete technical docs
    ├── CHPC-DEPLOYMENT.md         # ⭐ Detailed CHPC setup
    ├── MANIFEST-GUIDE.md          # ⭐ How to modify manifest
    └── PYTHON-DEVELOPER-GUIDE.md  # Existing, still relevant

⭐ = New file
✏️ = Modified file
```

## Quick Reference: Data Types

| Type | Schedule | Format | Purpose |
|------|----------|--------|---------|
| **observations** | Every 10 min | JSON | Live weather readings |
| **metadata** | Every 6 hours | JSON | Station locations/info |
| **timeseries** | Hourly | JSON | Historical/forecast data |
| **outlooks** | Twice daily | Markdown | Weather forecast text |
| **images** | Every 30 min | PNG/JPG | Satellite/radar/maps |

## Example: Sending Observations from CHPC

```python
import json
import subprocess
from datetime import datetime, timezone

# Your data (from brc-tools or other source)
observations = [
    {
        "stid": "BUNUT",
        "variable": "air_temp",
        "value": 15.5,
        "date_time": datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z'),
        "units": "Celsius"
    },
    # ... more observations
]

# Save to file
timestamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%MZ')
filename = f'/tmp/map_obs_{timestamp}.json'

with open(filename, 'w') as f:
    json.dump(observations, f, indent=2)

# Upload with validation
subprocess.run([
    'python', 'chpc_uploader.py',
    '--data-type', 'observations',
    '--file', filename
])
```

## Monitoring Endpoints

Once server is running:

- **GET /api/monitoring/status** - Full pipeline health report
- **GET /api/monitoring/freshness** - Data age for each type
- **GET /api/monitoring/uploads** - Upload success statistics
- **GET /api/monitoring/alerts** - Recent alerts
- **POST /api/monitoring/alerts/clear** - Clear alerts

## Security Features

✓ API key authentication (header: `x-api-key`)
✓ Origin validation (must be from `*.chpc.utah.edu`)
✓ File type validation (JSON/MD/TXT/PNG only)
✓ File size limits (configurable per data type)
✓ Schema validation (enforces data structure)
✓ Content validation (checks required fields, units, ranges)

## Getting Started

### Choose Your Path

**I'm setting up CHPC (data sender):**
→ Read `docs/QUICK-START.md` (30 minutes)
→ Then `docs/CHPC-DEPLOYMENT.md` (comprehensive)

**I'm working on the website (data receiver):**
→ Read `docs/DATA-PIPELINE-OVERVIEW.md`
→ Restart server and check monitoring endpoints

**I need to modify the data format:**
→ Read `docs/MANIFEST-GUIDE.md`
→ Update `DATA_MANIFEST.json`
→ Notify both teams

**I want a high-level overview:**
→ Read `docs/PIPELINE-SUMMARY.md` (this file)

## Testing the Pipeline

### Test 1: Health Check
```bash
python scripts/chpc_uploader.py --health-check
# Should print: "✓ API health check passed"
```

### Test 2: Validate Sample Data
```bash
python scripts/chpc_uploader.py \
  --data-type observations \
  --file public/api/static/observations/map_obs_20250731_0228Z.json \
  --validate-only
# Should print: "✓ All validation checks passed"
```

### Test 3: Check Server Manifest
```bash
npm run dev
# Look for: "✓ Loaded data manifest v1.0.0"
```

### Test 4: Monitoring API
```bash
curl http://localhost:3000/api/monitoring/status
# Should return JSON with pipeline health
```

## Common Issues & Solutions

**Problem:** "BASINWX_API_KEY not set"
**Solution:** `export BASINWX_API_KEY="your-key"` and add to ~/.bashrc

**Problem:** "Manifest not loaded" in server logs
**Solution:** Ensure DATA_MANIFEST.json is in project root

**Problem:** "Data validation failed"
**Solution:** Run with `--validate-only` to see specific errors

**Problem:** Data not appearing on website
**Solution:** Check `/api/monitoring/freshness` for data age

## Modifying the Pipeline

### Adding a New Weather Variable

1. Update `DATA_MANIFEST.json`:
   ```json
   "variable": {
     "enum": [..., "new_variable"]
   },
   "unitMapping": {
     "new_variable": "Units"
   }
   ```

2. Increment manifest version: `1.0.0` → `1.1.0`

3. Notify both teams via GitHub issue

4. Test with one station before rollout

See `docs/MANIFEST-GUIDE.md` for details.

## Next Steps

1. **CHPC Team:** Deploy uploader, set up cron job
2. **Web Team:** Verify manifest loads, set up monitoring alerts
3. **Both Teams:** Test end-to-end with sample data
4. **Both Teams:** Monitor for 24-48 hours
5. **Both Teams:** Document any customizations

## Support

- **Documentation:** All files in `/docs/`
- **Issues:** Create GitHub issue
- **CHPC Support:** help@chpc.utah.edu
- **Emergency:** [Team lead contact]

## Success Criteria

You'll know it's working when:
- ✓ Health check passes from CHPC
- ✓ Data uploads successfully
- ✓ Data appears on website within expected timeframe
- ✓ Monitoring shows "healthy" status
- ✓ No validation errors in logs

---

**Status:** Ready for deployment
**Created:** 2025-11-03
**Version:** 1.0.0

**Start here:** `docs/PIPELINE-SUMMARY.md` or `docs/QUICK-START.md`
