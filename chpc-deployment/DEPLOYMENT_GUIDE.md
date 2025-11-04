# CHPC Deployment Guide - BasinWx Data Pipeline
**Last Updated:** 2025-11-04
**Estimated Time:** 30 minutes
**Prerequisites:** SSH access to CHPC, brc-tools installed

---

## Overview

This guide will help you deploy the BasinWx data pipeline on CHPC to automatically upload weather data to the basinwx.com website.

**What You'll Set Up:**
1. Environment configuration (API keys, URLs)
2. Configuration files
3. Test the upload process
4. Schedule automated uploads with cron

---

## Pre-Deployment Checklist

Before starting, ensure:

- [ ] You have SSH access to CHPC
- [ ] `brc-tools` is installed at `~/brc-tools` (or note your path)
- [ ] Python 3 is available
- [ ] You can install Python packages with `pip3 install --user`
- [ ] Website server is running (basinwx.com is accessible)

---

## Step 1: Download Deployment Files

On your local machine, copy the deployment files to CHPC:

```bash
# From local machine
scp -r chpc-deployment/ username@chpc.utah.edu:~/
```

Or create them manually on CHPC from the templates in this directory.

---

## Step 2: Run Environment Setup

SSH into CHPC and run the setup script:

```bash
ssh username@chpc.utah.edu

cd ~/chpc-deployment
bash setup_chpc_env.sh
```

**What This Does:**
- Installs/checks Python dependencies (requests, jsonschema)
- Creates configuration directory (`~/.config/ubair-website/`)
- Sets environment variables in `~/.bashrc`
- Creates log directory
- Tests API connectivity

**Expected Output:**
```
✓ Found: Python 3.x.x
✓ requests installed
✓ jsonschema installed
✓ Created: /home/username/.config/ubair-website
✓ Added to /home/username/.bashrc
✓ Created: /home/username/logs/basinwx
✓ Health check successful
```

**If Setup Fails:**
- Check Python version: `python3 --version` (need 3.7+)
- Install missing packages: `pip3 install --user requests jsonschema`
- Check network: `curl https://basinwx.com`

---

## Step 3: Activate Environment

Load the new environment variables:

```bash
source ~/.bashrc
```

Verify they're set:

```bash
echo $DATA_UPLOAD_API_KEY
echo $BASINWX_API_URL
```

You should see:
```
48cd2f72... (truncated)
https://basinwx.com
```

---

## Step 4: Test the Pipeline

Run the comprehensive test suite:

```bash
cd ~/chpc-deployment
bash test_upload.sh
```

**Expected Output:**
```
Test 1: Environment Check
✓ DATA_UPLOAD_API_KEY set
✓ BASINWX_API_URL: https://basinwx.com
✓ Python package: requests
✓ Python package: jsonschema

Test 2: Network Connectivity
✓ Website reachable

Test 3: API Health Check
✓ API health check passed

Test 4: Manifest Validation
✓ Downloaded manifest
  Version: 1.0.1

Test 5: Sample Data Check
✓ Found sample data files

Test 6: Test Upload
✓ Test upload successful!

✓ All tests passed!
```

**If Tests Fail:**

| Test | Failure | Solution |
|------|---------|----------|
| Test 1 | ENV not set | Run `source ~/.bashrc` |
| Test 2 | Network unreachable | Check firewall/network |
| Test 3 | Health check fail | Verify basinwx.com is up |
| Test 6 | Upload failed | Check API key, origin validation |

---

## Step 5: Generate Test Data

Before setting up cron jobs, generate some data:

```bash
cd ~/brc-tools
python3 brc_tools/download/get_map_obs.py
```

**Expected Output:**
```
Downloading metadata...
Exporting 46 records to ../../data/map_obs_meta_YYYYMMDD_HHMMZ.json
Downloading latest observations...
Exporting 295 records to ../../data/map_obs_YYYYMMDD_HHMMZ.json
Using API key 48cd2... and server URL starting https://ba
Uploading map_obs_meta_YYYYMMDD_HHMMZ.json...
✅ Successfully uploaded map_obs_meta_YYYYMMDD_HHMMZ.json
Uploading map_obs_YYYYMMDD_HHMMZ.json...
✅ Successfully uploaded map_obs_YYYYMMDD_HHMMZ.json
```

**Verify on Website:**
```bash
curl https://basinwx.com/api/filelist.json
```

You should see your uploaded file listed.

---

## Step 6: Set Up Cron Jobs

### Option A: Start with Observations Only (Recommended)

For initial testing, set up only the observations job:

```bash
crontab -e
```

Paste this line:
```cron
*/10 * * * * source ~/.bashrc && cd ~/brc-tools && python3 brc_tools/download/get_map_obs.py >> ~/logs/basinwx/observations.log 2>&1
```

Save and exit (`:wq` in vim, `Ctrl+X` then `Y` in nano).

Verify:
```bash
crontab -l
```

**Wait 10 minutes**, then check the log:
```bash
tail -f ~/logs/basinwx/observations.log
```

You should see successful uploads every 10 minutes.

### Option B: Install All Jobs (After Testing)

Once observations work reliably for 24 hours, add all jobs:

```bash
crontab -e
```

Delete the single line and paste the full configuration from:
```bash
cat ~/chpc-deployment/cron_templates/crontab_full.txt
```

This adds:
- Observations (every 10 min)
- Metadata (every 6 hours)
- Timeseries (hourly)
- Outlooks (twice daily)
- Images (every 30 min)

---

## Step 7: Monitor the Pipeline

### Check Logs

```bash
# Watch observations in real-time
tail -f ~/logs/basinwx/observations.log

# Check for errors
grep "ERROR\|Failed\|❌" ~/logs/basinwx/*.log

# View recent uploads
tail -20 ~/logs/basinwx/observations.log
```

### Check Website Data Freshness

```bash
curl https://basinwx.com/api/monitoring/freshness
```

Expected output shows data age < 10 minutes for observations.

### View Latest Data

```bash
curl https://basinwx.com/api/filelist.json
curl https://basinwx.com/api/static/observations/map_obs_YYYYMMDD_HHMMZ.json | head -50
```

---

## Troubleshooting

### Issue: Cron Job Not Running

**Check if cron is active:**
```bash
systemctl status cron  # or crond
```

**Check crontab syntax:**
```bash
crontab -l
```

**Run command manually:**
```bash
source ~/.bashrc && cd ~/brc-tools && python3 brc_tools/download/get_map_obs.py
```

If manual works but cron doesn't:
- Ensure full paths in crontab
- Check cron logs: `grep CRON /var/log/syslog`
- Verify `MAILTO` is set (or empty)

### Issue: Upload Fails with "Invalid API key"

```bash
# Check key is set
echo $DATA_UPLOAD_API_KEY

# Should be: 48cd2f722c19af756e7443230efe9fcc

# If wrong, edit ~/.bashrc and reload
vim ~/.bashrc
source ~/.bashrc
```

### Issue: Upload Fails with "Forbidden: Not from authorized CHPC system"

This means origin validation failed. Ensure:
1. Running from `chpc.utah.edu` domain
2. Hostname check: `hostname -f` should end with `chpc.utah.edu`

If hostname doesn't match, the script sets `x-client-hostname` header automatically.

### Issue: "FileNotFoundError: Website URL file not found"

```bash
# Check file exists
cat ~/.config/ubair-website/website_url

# Should show: https://basinwx.com

# If missing, create it
echo "https://basinwx.com" > ~/.config/ubair-website/website_url
```

### Issue: No Data Generated

```bash
# Check Synoptic API token
echo $SYNOPTIC_API_TOKEN

# Test Synoptic directly
python3 -c "import synoptic; print(synoptic.Latest(stid='WBB').df())"
```

If this fails, check brc-tools configuration for Synoptic API credentials.

---

## Maintenance

### Weekly Checks

```bash
# Check cron is still running
crontab -l

# Review logs for errors
grep -i "error\|fail" ~/logs/basinwx/*.log | tail -20

# Check disk space
du -sh ~/logs/basinwx/
du -sh ~/brc-tools/data/
```

### Monthly Tasks

1. **Update brc-tools**
   ```bash
   cd ~/brc-tools
   git fetch
   git status
   # If updates available:
   git pull
   ```

2. **Clean Old Data**
   ```bash
   # Keep last 7 days only
   find ~/brc-tools/data/ -name "*.json" -mtime +7 -delete
   ```

3. **Rotate Logs**
   ```bash
   # Archive old logs
   cd ~/logs/basinwx/
   gzip observations.log.{2..4}
   ```

### Emergency: Stop All Uploads

```bash
# Temporarily disable cron jobs
crontab -e
# Comment out all lines with # at the start
# Save and exit

# Or remove crontab entirely
crontab -r

# To re-enable later
crontab -e
# Uncomment lines or re-add from template
```

---

## Verification Checklist

After deployment, verify:

- [ ] Environment variables set (`echo $DATA_UPLOAD_API_KEY`)
- [ ] Config files created (`ls ~/.config/ubair-website/`)
- [ ] Manual upload works (`python3 brc_tools/download/get_map_obs.py`)
- [ ] Cron jobs installed (`crontab -l`)
- [ ] Logs being written (`ls -lh ~/logs/basinwx/`)
- [ ] Data appearing on website (`curl https://basinwx.com/api/filelist.json`)
- [ ] Data is recent (< 10 min old)
- [ ] No errors in logs (`grep ERROR ~/logs/basinwx/*.log`)

---

## Success Criteria

Your deployment is successful when:

✅ Observations upload automatically every 10 minutes
✅ Latest data visible at https://basinwx.com/live_aq
✅ No errors in logs for 24+ hours
✅ Data freshness < 10 minutes consistently
✅ Monitoring shows "healthy" status

---

## Next Steps

Once deployment is stable:

1. **Set Up Monitoring Alerts** (optional)
   - Configure email notifications for failures
   - Set up monitoring dashboard

2. **Document Your Setup**
   - Note any custom paths or configurations
   - Document any issues encountered

3. **Schedule Maintenance**
   - Add calendar reminders for monthly checks
   - Plan for brc-tools updates

4. **Expand Data Types**
   - Add timeseries, images, outlooks
   - Customize schedules if needed

---

## Support

**For issues:**
1. Check logs: `~/logs/basinwx/*.log`
2. Run test script: `bash test_upload.sh`
3. Review troubleshooting section above
4. Check website monitoring: https://basinwx.com/api/monitoring/status

**Reference Documents:**
- `BRC_TOOLS_REVIEW.md` - Code review findings
- `cron_templates/README.md` - Cron job details
- `test_upload.sh` - Diagnostic script

---

**Deployment Guide Complete** ✓

Good luck with your deployment!
