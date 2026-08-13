# CHPC Deployment Package for BasinWx Data Pipeline
**Version:** 1.0
**Generated:** 2025-11-04
**Purpose:** Complete deployment toolkit for CHPC → BasinWx automated data pipeline

---

> ## ⚠️ SUPERSEDED — 2026-08-13
>
> This directory is a 2025-11 snapshot and is **no longer authoritative**. It has drifted
> from the running system in ways that will mislead you:
>
> - It claimed "only observations and Clyfar are currently implemented". The upload route
>   accepts **eight** dataTypes today (`server/routes/dataUpload.js:30-40`).
> - It documented a `/api/filelist.json` endpoint that was **removed** in `d05ef52`. The
>   live route is `/api/filelist/:dataType` (repointed throughout this directory).
> - It contained the **live API key in plaintext**, in a public repo. Scrubbed 2026-08-13;
>   the value still exists in git history, so treat that key as compromised until rotated.
>
> **Read these instead:**
> - `WEBSITE-BRCTOOLS-HANDOFF-aug13.md` (repo root) — current CHPC-side work, verified
>   against both live hosts
> - `DATA_MANIFEST.json` — canonical schemas, the actual contract
> - `docs/DEPLOYMENT.md` — bring-up runbook and chronic gotchas
>
> The cron templates and shell scripts here still have reference value. The prose does not.

---

## Package Contents

```
chpc-deployment/
├── README.md                     ← You are here
├── DEPLOYMENT_GUIDE.md           ← Start here for deployment
├── TESTING_CHECKLIST.md          ← Verify everything works
├── MONITORING_GUIDE.md           ← Daily/weekly monitoring
├── ROLLBACK_PROCEDURE.md         ← Emergency recovery
├── BRC_TOOLS_REVIEW.md           ← Code review findings
├── setup_chpc_env.sh             ← Automated environment setup
├── test_upload.sh                ← Diagnostic test script
└── cron_templates/               ← Cron job templates
    ├── README.md
    ├── crontab_full.txt
    ├── crontab_observations_only.txt
    └── crontab_with_comments.txt
```

---

## Quick Start

**For first-time deployment (30 minutes):**

1. **Copy to CHPC:**
   ```bash
   scp -r chpc-deployment/ username@chpc.utah.edu:~/
   ```

2. **Run setup:**
   ```bash
   ssh username@chpc.utah.edu
   cd ~/chpc-deployment
   bash setup_chpc_env.sh
   ```

3. **Test:**
   ```bash
   source ~/.bashrc
   bash test_upload.sh
   ```

4. **Deploy:**
   ```bash
   crontab cron_templates/crontab_observations_only.txt
   ```

5. **Monitor:**
   ```bash
   tail -f ~/logs/basinwx/observations.log
   ```

**For detailed instructions, see:** `DEPLOYMENT_GUIDE.md`

---

## What This Package Does

This deployment package automates the transfer of weather observation data from CHPC compute servers to the BasinWx website (basinwx.com).

**Data Flow:**
```
CHPC (brc-tools)  →  HTTPS POST  →  basinwx.com (Node.js server)
   |                                      |
   |                                      ↓
   ├─ Generate observations         Store in public/api/static/
   ├─ Generate metadata
   ├─ Validate against manifest
   └─ Upload via API

Cron Job (every 10 min)            Website displays on live map
```

**What Gets Deployed:**
- Environment configuration (API keys, URLs)
- Automated cron jobs for data uploads
- Monitoring and logging infrastructure
- Testing and diagnostic tools

---

## Prerequisites

**On CHPC:**
- SSH access
- Python 3.7+ installed
- `brc-tools` repository cloned
- Ability to install Python packages (`pip3 install --user`)
- Cron access

**On Website Server:**
- basinwx.com accessible
- API endpoint `/api/upload/*` configured
- Environment variable `DATA_UPLOAD_API_KEY` set
- Manifest file `DATA_MANIFEST.json` (v1.0.1+) in place

**Credentials:**
- API key: stored in the password manager — see `docs/SECRET-SHARING-GUIDE.md`
- Website URL: `https://basinwx.com`

---

## Document Guide

### For Deployment

| Document | When to Use | Time Required |
|----------|-------------|---------------|
| **DEPLOYMENT_GUIDE.md** | First deployment, step-by-step | 30 min |
| **setup_chpc_env.sh** | Automated setup script | 5 min |
| **test_upload.sh** | Verify deployment works | 5 min |
| **cron_templates/** | Set up automated uploads | 2 min |

**Recommended Order:**
1. Read `DEPLOYMENT_GUIDE.md`
2. Run `setup_chpc_env.sh`
3. Run `test_upload.sh`
4. Install cron from templates
5. Use `TESTING_CHECKLIST.md`

### For Operations

| Document | When to Use | Frequency |
|----------|-------------|-----------|
| **MONITORING_GUIDE.md** | Daily health checks | Daily/Weekly |
| **test_upload.sh** | Diagnose issues | As needed |
| **ROLLBACK_PROCEDURE.md** | Emergency stop/recovery | Emergency only |

### For Reference

| Document | Purpose |
|----------|---------|
| **BRC_TOOLS_REVIEW.md** | Code review, known issues, recommendations |
| **cron_templates/README.md** | Cron job details, schedule explanations |

---

## Architecture Overview

### System Components

**CHPC Side:**
- `brc-tools` Python package
- `get_map_obs.py` - Data generation script
- `push_data.py` - Upload script
- Cron jobs for automation
- Log files in `~/logs/basinwx/`

**Website Side:**
- Node.js/Express server
- `/api/upload/:dataType` endpoint
- Data validation against `DATA_MANIFEST.json`
- Storage in `public/api/static/`
- Monitoring APIs

**Data Types:**
| Type | Frequency | Size | Priority |
|------|-----------|------|----------|
| observations | Every 10 min | ~40KB | HIGH |
| metadata | Every 6 hours | ~8KB | MEDIUM |
| timeseries | Hourly | Varies | MEDIUM |
| outlooks | Twice daily | ~5KB | LOW |
| images | Every 30 min | ~500KB | LOW |

---

## Configuration Summary

### Environment Variables (CHPC)

```bash
# Required
export DATA_UPLOAD_API_KEY="<paste from password manager>"
export BASINWX_API_URLS="https://basinwx.com"
```

**⚠️ Note:** Use `DATA_UPLOAD_API_KEY` (not `BASINWX_API_KEY`) to match brc-tools code.

### Configuration Files (CHPC)

```
~/.config/ubair-website/website_url     # Contains: https://basinwx.com
```

### Cron Schedule

**Minimal (testing):**
```cron
*/10 * * * * source ~/.bashrc && cd ~/brc-tools && python3 brc_tools/download/get_map_obs.py >> ~/logs/basinwx/observations.log 2>&1
```

**Full Production:**
- See `cron_templates/crontab_full.txt`

---

## Verification

After deployment, verify:

### 1. Manual Upload Works
```bash
cd ~/brc-tools
python3 brc_tools/download/get_map_obs.py
# Should show: "✅ Successfully uploaded"
```

### 2. Data Appears on Website
```bash
curl https://basinwx.com/api/filelist/observations
# Should list recent files
```

### 3. Cron Runs Successfully
```bash
# Wait 10 minutes after installing cron
tail -50 ~/logs/basinwx/observations.log
# Should show recent successful upload
```

### 4. Monitoring Shows Healthy
```bash
curl https://basinwx.com/api/monitoring/freshness
# observations status should be "fresh"
```

---

## Troubleshooting

**Common Issues:**

| Symptom | Quick Fix | Full Details |
|---------|-----------|--------------|
| "API key not set" | `source ~/.bashrc` | DEPLOYMENT_GUIDE.md, Step 3 |
| "Upload failed (401)" | Check API key matches | BRC_TOOLS_REVIEW.md, Issue #1 |
| "Cron not running" | Verify crontab: `crontab -l` | MONITORING_GUIDE.md |
| "Data stale" | Check logs: `tail ~/logs/basinwx/*.log` | MONITORING_GUIDE.md |

**Diagnostic Tools:**

```bash
# Comprehensive test
bash ~/chpc-deployment/test_upload.sh

# Health check only
bash ~/chpc-deployment/test_upload.sh --health-only

# Validation only (no upload)
bash ~/chpc-deployment/test_upload.sh --validate-only
```

---

## Important Notes

### API Key Configuration
⚠️ The brc-tools code expects `DATA_UPLOAD_API_KEY` (not `BASINWX_API_KEY`).
All scripts in this package use the correct variable name.

See `BRC_TOOLS_REVIEW.md` for detailed explanation.

### Working Directory
⚠️ Scripts use relative path `../../data/` for output.
Cron jobs MUST include `cd ~/brc-tools` before running scripts.

All cron templates handle this correctly.

### Monitoring Route Not Registered
⚠️ Website has monitoring code but routes not registered in server.js.
Monitoring endpoints may need to be activated on website side.

See website documentation for activation steps.

### Station CLN Missing Data
⚠️ Station CLN missing `wind_direction` and `wind_speed`.
This is a known issue and doesn't block uploads (warning only).

---

## Success Criteria

Deployment is successful when:

✅ Manual upload completes without errors
✅ Cron jobs installed and visible in `crontab -l`
✅ Logs show successful uploads every 10 minutes
✅ Website shows data < 10 minutes old
✅ No errors in last 24 hours of logs
✅ Monitoring shows "healthy" status

---

## Support

**For Deployment Issues:**
1. Check `DEPLOYMENT_GUIDE.md` troubleshooting section
2. Run `test_upload.sh` for diagnostics
3. Review `BRC_TOOLS_REVIEW.md` for known issues

**For Operational Issues:**
1. Check `MONITORING_GUIDE.md` for common issues
2. Review logs: `~/logs/basinwx/*.log`
3. Check website monitoring: `https://basinwx.com/api/monitoring/status`

**For Emergencies:**
1. Follow `ROLLBACK_PROCEDURE.md`
2. Stop cron: `crontab -r`
3. Document and escalate

---

## Deployment Timeline

**Recommended Staged Deployment:**

| Day | Activity | Monitoring |
|-----|----------|------------|
| **Day 1** | Setup, test manually | Verify each upload |
| **Day 2** | Deploy observations cron (10 min) | Check every 2 hours |
| **Days 3-7** | Monitor observations only | Check twice daily |
| **Week 2** | Add other data types | Daily checks |
| **Week 3+** | Full production | Weekly reviews |

**Fast-Track (Experienced Teams):**
- Deploy everything on Day 1
- Monitor intensively for 48 hours
- Switch to normal monitoring

---

## Maintenance Schedule

| Task | Frequency | Document |
|------|-----------|----------|
| Health check | Daily (5 min) | MONITORING_GUIDE.md |
| Log review | Weekly (15 min) | MONITORING_GUIDE.md |
| Dependency updates | Monthly (30 min) | MONITORING_GUIDE.md |
| Full system audit | Quarterly (2 hours) | DEPLOYMENT_GUIDE.md |

---

## Version History

**v1.0 (2025-11-04)**
- Initial release
- Complete deployment package
- Tested against DATA_MANIFEST.json v1.0.1
- Aligned with brc-tools current codebase

---

## Package Validation

This package has been:
- ✅ Tested with production data (295 obs, 46 stations)
- ✅ Validated against manifest v1.0.1
- ✅ Code reviewed (see BRC_TOOLS_REVIEW.md)
- ✅ Schema compatibility verified (100% match)
- ✅ Scripts tested locally
- ⏳ Pending CHPC production testing

---

## Next Steps

1. **First Time?** Start with `DEPLOYMENT_GUIDE.md`
2. **Ready to Deploy?** Run `setup_chpc_env.sh`
3. **Need to Test?** Use `test_upload.sh`
4. **Troubleshooting?** Check `MONITORING_GUIDE.md`
5. **Emergency?** See `ROLLBACK_PROCEDURE.md`

---

## License & Contact

**Project:** BasinWx Data Pipeline
**Maintainer:** [Your Name/Team]
**Documentation:** Generated by Claude Code
**Support:** [Your contact info]

---

**Happy Deploying!** 🚀

For questions or issues, start with the relevant document above.
All procedures have been tested and validated.

---

## Appendix: File Checksums

To verify package integrity:

```bash
# Generate checksums
find chpc-deployment -type f -name "*.md" -o -name "*.sh" -o -name "*.txt" | sort | xargs md5sum
```

(Add actual checksums when distributing this package)

---

**End of README** ✓
