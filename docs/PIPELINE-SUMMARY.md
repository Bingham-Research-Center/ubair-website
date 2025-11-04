# BasinWx Data Pipeline Summary

**Created:** 2025-11-03
**Status:** Ready for deployment
**Purpose:** Automated, scheduled data transfer from CHPC to basinwx.com

---

## What We Built

A **manifest-driven data pipeline** that ensures reliable, validated data transfer from CHPC compute servers to your website. The system prevents surprises by enforcing strict data schemas and schedules that both teams agree on.

## Key Features

✓ **Single Source of Truth:** `DATA_MANIFEST.json` defines all data types, formats, and schedules
✓ **Automatic Validation:** Data is validated on both CHPC and server sides before acceptance
✓ **Scheduled Transfers:** Cron-based scheduling ensures timely data delivery
✓ **Monitoring & Alerts:** Real-time pipeline health tracking with automatic alerts
✓ **Error Handling:** Automatic retries with exponential backoff
✓ **Security:** API key authentication + hostname validation

## System Components

### 1. Data Manifest (`DATA_MANIFEST.json`)
- Defines 5 data types: observations, metadata, timeseries, outlooks, images
- Specifies exact format, schedule, and validation rules for each
- Version controlled for change management

### 2. CHPC Uploader (`scripts/chpc_uploader.py`)
- Python script with manifest validation
- Validates data before upload to prevent failures
- Implements retry logic and logging
- Usage: `python chpc_uploader.py --data-type observations --file data.json`

### 3. Server Validation (`server/routes/dataUpload.js`)
- Validates incoming data against manifest
- Checks authentication, origin, file size, structure
- Returns detailed error messages for debugging

### 4. Monitoring System (`server/monitoring/`)
- Tracks data freshness (age of latest data)
- Monitors upload success rate
- Provides REST API for health checks
- Endpoints: `/api/monitoring/status`, `/api/monitoring/freshness`, etc.

## Data Flow

```
CHPC → Fetch from Synoptic API → Process with brc-tools →
Validate with manifest → Upload via HTTPS POST →
Server validates → Store in /public/api/static/ →
Website displays on map
```

## Schedules

| Data Type | Frequency | Next Steps |
|-----------|-----------|------------|
| **Observations** | Every 10 min | Deploy to CHPC, set up cron |
| **Metadata** | Every 6 hours | Deploy to CHPC, set up cron |
| **Time Series** | Hourly | Implement when needed |
| **Outlooks** | Twice daily | Implement when needed |
| **Images** | Every 30 min | Implement when needed |

## Files Created

### Documentation (7 files)
- `docs/DATA-PIPELINE-OVERVIEW.md` - Complete technical documentation
- `docs/CHPC-DEPLOYMENT.md` - Step-by-step CHPC setup guide
- `docs/QUICK-START.md` - 30-minute setup guide
- `docs/MANIFEST-GUIDE.md` - How to modify the manifest
- `docs/PYTHON-DEVELOPER-GUIDE.md` - Python developer reference (existing, enhanced)
- `docs/API-KEY-SETUP.md` - API key generation (existing)
- `docs/PIPELINE-SUMMARY.md` - This file

### Code (4 files)
- `DATA_MANIFEST.json` - Data pipeline manifest
- `scripts/chpc_uploader.py` - CHPC upload script
- `server/monitoring/dataMonitor.js` - Monitoring service
- `server/routes/monitoring.js` - Monitoring API endpoints

### Configuration (1 file)
- `requirements.txt` - Python dependencies

### Modified Files (2 files)
- `server/routes/dataUpload.js` - Added manifest validation
- `server/server.js` - Added monitoring routes

## Quick Start for Each Team

### CHPC Team

1. Install dependencies: `pip install -r requirements.txt`
2. Set API key: `export BASINWX_API_KEY="your-key"`
3. Test connection: `python chpc_uploader.py --health-check`
4. Set up cron job to run every 10 minutes
5. Monitor logs: `tail -f /tmp/basinwx_upload.log`

**Full guide:** `docs/CHPC-DEPLOYMENT.md`

### Web Team

1. Ensure manifest is in root: `ls DATA_MANIFEST.json`
2. Restart server: `npm restart`
3. Verify manifest loaded: Check logs for "✓ Loaded data manifest"
4. Test monitoring: `curl https://basinwx.com/api/monitoring/status`
5. Set up alert emails for pipeline health

**Full guide:** `docs/DATA-PIPELINE-OVERVIEW.md`

## Testing Checklist

Before going live:

- [ ] CHPC health check passes
- [ ] Test upload succeeds with sample data
- [ ] Data appears on website after upload
- [ ] Monitoring API returns valid status
- [ ] Cron job runs successfully for 1 hour
- [ ] No validation errors in logs
- [ ] Team members can access documentation

## Monitoring URLs

Once deployed:

- **Status:** https://basinwx.com/api/monitoring/status
- **Freshness:** https://basinwx.com/api/monitoring/freshness
- **Upload Stats:** https://basinwx.com/api/monitoring/uploads
- **Alerts:** https://basinwx.com/api/monitoring/alerts

## Alert Thresholds

The system will alert if:
- No data received for 30 minutes
- Data age exceeds 2x expected frequency
- 3 consecutive upload failures
- Success rate drops below 90%

## Adding New Data Types

1. Update `DATA_MANIFEST.json` with new data type definition
2. Increment manifest version
3. Notify both teams via GitHub issue
4. Test with sample data
5. Deploy to CHPC and server simultaneously

**Guide:** `docs/MANIFEST-GUIDE.md`

## Troubleshooting

| Problem | Quick Fix |
|---------|-----------|
| 401 Unauthorized | Check API key in environment variables |
| Connection timeout | Verify firewall, network connectivity |
| Validation failed | Run `--validate-only` to see specific error |
| Data not showing | Check monitoring API for freshness issues |

**Full troubleshooting:** `docs/DATA-PIPELINE-OVERVIEW.md`

## Security

✓ API key authentication (header: `x-api-key`)
✓ Origin validation (must be from `*.chpc.utah.edu`)
✓ File type validation (JSON, MD, TXT, PNG only)
✓ File size limits (10MB default)
✓ Content validation (schema checking)

## Next Actions

### Immediate (Week 1)
1. **CHPC Team:** Deploy uploader script, set up cron for observations
2. **Web Team:** Restart server, verify manifest loads
3. **Both:** Test end-to-end with sample data
4. **Both:** Set up monitoring alerts

### Short Term (Weeks 2-4)
1. Add metadata uploads (every 6 hours)
2. Monitor for 1 week to ensure stability
3. Document any custom modifications
4. Train additional team members

### Long Term (Months 2-3)
1. Add time series data (hourly)
2. Add outlook markdown files (twice daily)
3. Add image uploads (satellite, radar)
4. Implement advanced alerting (email, Slack)

## Success Metrics

Track these to measure pipeline health:

- **Uptime:** Target 99.5% (excluding planned maintenance)
- **Upload Success Rate:** Target >95%
- **Data Freshness:** No data older than 2x expected frequency
- **Alert Response Time:** Address degraded status within 1 hour
- **Team Satisfaction:** Survey team quarterly

## Support Contacts

- **CHPC Support:** help@chpc.utah.edu
- **Team Lead:** [Your contact]
- **GitHub Issues:** [Repository URL]
- **Emergency:** [Emergency contact]

## Change Log

| Date | Version | Change |
|------|---------|--------|
| 2025-11-03 | 1.0.0 | Initial pipeline implementation |

## Resources

- **All Documentation:** `/docs/` directory
- **Manifest:** `DATA_MANIFEST.json`
- **CHPC Script:** `scripts/chpc_uploader.py`
- **Python Guide:** `docs/PYTHON-DEVELOPER-GUIDE.md`
- **Quick Start:** `docs/QUICK-START.md`

---

## Questions?

Read the docs in this order:
1. `QUICK-START.md` (30 min setup)
2. `DATA-PIPELINE-OVERVIEW.md` (comprehensive technical doc)
3. `MANIFEST-GUIDE.md` (how to make changes)
4. `CHPC-DEPLOYMENT.md` (detailed CHPC setup)

For specific issues, check `DATA-PIPELINE-OVERVIEW.md` troubleshooting section.

---

**Pipeline Status:** Ready for deployment
**Documentation Status:** Complete
**Next Step:** Deploy to CHPC and test end-to-end
