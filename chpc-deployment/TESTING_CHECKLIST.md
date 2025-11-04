# End-to-End Testing Checklist
**Purpose:** Verify complete data pipeline from CHPC to website
**Time Required:** 1-2 hours
**Best Time:** During business hours for immediate issue resolution

---

## Pre-Test Preparation

- [ ] Backup current crontab: `crontab -l > ~/crontab_backup_$(date +%Y%m%d).txt`
- [ ] Note current data timestamp on website for comparison
- [ ] Have SSH access to both CHPC and website server
- [ ] Notify team of testing window

---

## Phase 1: Environment Validation (CHPC)

### 1.1 Environment Variables
```bash
echo $DATA_UPLOAD_API_KEY
echo $BASINWX_API_URL
```
- [ ] `DATA_UPLOAD_API_KEY` shows `48cd2f722c19af756e7443230efe9fcc`
- [ ] `BASINWX_API_URL` shows `https://basinwx.com`

### 1.2 Configuration Files
```bash
ls -la ~/.config/ubair-website/
cat ~/.config/ubair-website/website_url
```
- [ ] Directory exists
- [ ] `website_url` file contains `https://basinwx.com`

### 1.3 Python Dependencies
```bash
python3 -c "import requests, jsonschema; print('OK')"
```
- [ ] Prints `OK` without errors

### 1.4 brc-tools Installation
```bash
cd ~/brc-tools && git status
```
- [ ] Directory exists
- [ ] Git repository is clean
- [ ] No uncommitted changes

---

## Phase 2: Manual Upload Test (CHPC)

### 2.1 Generate Test Data
```bash
cd ~/brc-tools
python3 brc_tools/download/get_map_obs.py
```
**Expected Results:**
- [ ] "Downloading metadata..." message appears
- [ ] "Downloading latest observations..." message appears
- [ ] Two JSON files created in `../../data/`
- [ ] "✅ Successfully uploaded" messages for both files
- [ ] No error messages or tracebacks

**Record Results:**
- Observations count: ___________
- Stations count: ___________
- File sizes: ___________ (obs), ___________ (meta)

### 2.2 Verify Files Created Locally
```bash
ls -lh ~/brc-tools/data/map_obs_*.json | head -2
```
- [ ] `map_obs_YYYYMMDD_HHMMZ.json` exists
- [ ] `map_obs_meta_YYYYMMDD_HHMMZ.json` exists
- [ ] File sizes reasonable (~40KB obs, ~8KB meta)

### 2.3 Check Upload Logs
```bash
cd ~/brc-tools
python3 -c "from brc_tools.download.push_data import load_config; print(load_config())"
```
- [ ] Prints API key and URL without errors
- [ ] No "FileNotFoundError" or "ValueError"

---

## Phase 3: Website Verification

### 3.1 Check File List
```bash
curl -s https://basinwx.com/api/filelist.json | python3 -m json.tool
```
- [ ] Returns JSON array
- [ ] Contains recently uploaded filename
- [ ] No error messages

### 3.2 Check Latest Observations
```bash
curl -s https://basinwx.com/api/live-observations | python3 -m json.tool | head -50
```
- [ ] Returns JSON with `data` array
- [ ] `totalObservations` matches expected count
- [ ] `timestamp` is recent (within last hour)
- [ ] Sample observation has required fields: stid, variable, value, date_time, units

### 3.3 Verify Data Freshness
```bash
curl -s https://basinwx.com/api/monitoring/freshness | python3 -m json.tool
```
- [ ] `observations` status is `fresh` (not `stale`)
- [ ] `ageMinutes` < 15
- [ ] `lastUpdate` timestamp is recent

### 3.4 Visual Check (Browser)
Open: https://basinwx.com/live_aq

- [ ] Map loads without errors
- [ ] Station markers appear
- [ ] Clicking station shows data
- [ ] Data timestamp matches recent upload
- [ ] Temperature/wind/AQ values look reasonable

---

## Phase 4: Automated Upload Test (Cron)

### 4.1 Install Test Cron Job
```bash
crontab -e
```
Add this line (runs at next :10, :20, :30, etc.):
```cron
*/10 * * * * source ~/.bashrc && cd ~/brc-tools && python3 brc_tools/download/get_map_obs.py >> ~/logs/basinwx/test_observations.log 2>&1
```
- [ ] Saved successfully
- [ ] Verify with `crontab -l`

### 4.2 Wait for First Run
Wait until next 10-minute mark (e.g., if now is 2:07, wait until 2:10)

### 4.3 Check Cron Execution
```bash
tail -f ~/logs/basinwx/test_observations.log
```
**After cron runs:**
- [ ] Log file created
- [ ] Contains "Downloading metadata..." message
- [ ] Contains "✅ Successfully uploaded" messages
- [ ] No error messages

### 4.4 Verify Upload Occurred
```bash
curl -s https://basinwx.com/api/filelist.json | grep $(date +%Y%m%d)
```
- [ ] New file with today's date appears
- [ ] Timestamp within last 10 minutes

### 4.5 Wait for Second Run
Wait another 10 minutes for second cron execution

```bash
tail -20 ~/logs/basinwx/test_observations.log
```
- [ ] Log shows two successful upload sequences
- [ ] Both completed without errors
- [ ] Timestamps ~10 minutes apart

---

## Phase 5: Error Handling Test

### 5.1 Test with Invalid API Key
```bash
export DATA_UPLOAD_API_KEY="invalid_key_for_testing"
cd ~/brc-tools
python3 brc_tools/download/get_map_obs.py 2>&1 | tail -20
```
**Expected:**
- [ ] Upload fails with "Invalid API key" or "401" error
- [ ] Script handles error gracefully (doesn't crash)
- [ ] Clear error message displayed

**Restore correct key:**
```bash
source ~/.bashrc
echo $DATA_UPLOAD_API_KEY  # Verify it's correct again
```

### 5.2 Test with Unreachable Server
```bash
export BASINWX_API_URL="https://invalid-server-for-testing.com"
cd ~/brc-tools
python3 brc_tools/download/get_map_obs.py 2>&1 | tail -20
```
**Expected:**
- [ ] Health check fails
- [ ] Script handles error gracefully
- [ ] Timeout occurs (not infinite hang)

**Restore correct URL:**
```bash
source ~/.bashrc
```

---

## Phase 6: Data Validation

### 6.1 Download Recent Upload
```bash
LATEST_FILE=$(curl -s https://basinwx.com/api/filelist.json | python3 -c "import sys, json; print(sorted(json.load(sys.stdin))[-1])")
curl -s "https://basinwx.com/api/static/${LATEST_FILE}" > /tmp/test_obs.json
```

### 6.2 Validate JSON Structure
```bash
python3 << 'EOF'
import json
with open('/tmp/test_obs.json') as f:
    data = json.load(f)
assert isinstance(data, list), "Data should be array"
assert len(data) > 0, "Data should not be empty"
sample = data[0]
required = ['stid', 'variable', 'value', 'date_time', 'units']
for field in required:
    assert field in sample, f"Missing field: {field}"
print(f"✓ Valid: {len(data)} observations, all required fields present")
EOF
```
- [ ] Validation passes
- [ ] No assertion errors

### 6.3 Check Variable Coverage
```bash
python3 << 'EOF'
import json
with open('/tmp/test_obs.json') as f:
    data = json.load(f)
variables = set(obs['variable'] for obs in data)
critical = {'air_temp', 'wind_speed', 'wind_direction'}
print(f"Variables: {sorted(variables)}")
print(f"Critical vars present: {critical.issubset(variables)}")
EOF
```
- [ ] Shows list of variables
- [ ] Critical variables (air_temp, wind_speed, wind_direction) present

### 6.4 Check Station Coverage
```bash
python3 << 'EOF'
import json
with open('/tmp/test_obs.json') as f:
    data = json.load(f)
stations = set(obs['stid'] for obs in data)
print(f"Total stations: {len(stations)}")
print(f"Stations: {sorted(stations)}")
EOF
```
- [ ] Shows ~40-50 stations
- [ ] Includes expected stations (SLV, WBB, UB7ST, etc.)

---

## Phase 7: Performance Check

### 7.1 Measure Upload Time
```bash
time (cd ~/brc-tools && python3 brc_tools/download/get_map_obs.py)
```
**Expected:**
- [ ] Completes in < 60 seconds
- [ ] No timeout errors
- Record actual time: ___________

### 7.2 Check Log File Sizes
```bash
du -sh ~/logs/basinwx/*.log
```
- [ ] Log files growing at reasonable rate
- [ ] Not exceeding 10MB per day

### 7.3 Check Disk Space
```bash
df -h ~/brc-tools/data/
```
- [ ] Sufficient space available (> 1GB free)

---

## Phase 8: Multi-Data-Type Test (Optional)

If ready to test other data types:

### 8.1 Test Metadata Upload
```bash
cd ~/brc-tools
# Generate and upload metadata separately
python3 -c "from brc_tools.download.get_map_obs import *; from brc_tools.download.push_data import *; # test metadata"
```
- [ ] Metadata file uploads successfully
- [ ] Appears in `/api/static/metadata/`

### 8.2 Test Other Data Types
For timeseries, outlooks, images (if scripts exist):
- [ ] Timeseries generation works
- [ ] Outlooks upload works
- [ ] Images upload works

---

## Phase 9: Monitoring Dashboard

### 9.1 Check Overall Status
```bash
curl -s https://basinwx.com/api/monitoring/status | python3 -m json.tool
```
- [ ] Returns comprehensive report
- [ ] `overallHealth`: "healthy"
- [ ] No critical issues listed

### 9.2 Check Upload Statistics
```bash
curl -s https://basinwx.com/api/monitoring/uploads | python3 -m json.tool
```
- [ ] Shows upload counts
- [ ] Success rate > 90%
- [ ] Recent uploads listed

---

## Phase 10: Cleanup and Finalize

### 10.1 Remove Test Cron (if using separate test job)
```bash
crontab -e
# Remove test line if you added a separate one
```

### 10.2 Install Production Cron
```bash
crontab -e
# Install production schedule from crontab_full.txt or crontab_observations_only.txt
```
- [ ] Production cron installed
- [ ] Verified with `crontab -l`

### 10.3 Final Verification
Wait 10 minutes, then:
```bash
tail -30 ~/logs/basinwx/observations.log
curl -s https://basinwx.com/api/monitoring/freshness
```
- [ ] Production cron running successfully
- [ ] Data still fresh
- [ ] No errors in logs

---

## Test Results Summary

**Date Tested:** _______________
**Tester:** _______________

**Results:**
- [ ] All Phase 1-3 tests passed (Manual upload works)
- [ ] Phase 4 passed (Cron automation works)
- [ ] Phase 5 passed (Error handling works)
- [ ] Phase 6 passed (Data validation correct)
- [ ] Phase 7 passed (Performance acceptable)
- [ ] Phase 10 passed (Production deployment complete)

**Issues Found:**
```
(List any issues encountered and how they were resolved)


```

**Observations:**
```
(Note anything unexpected or worth documenting)


```

**Next Steps:**
- [ ] Monitor for 24 hours
- [ ] Review logs daily for first week
- [ ] Document any recurring issues
- [ ] Plan for additional data types

---

## Rollback Plan (If Tests Fail)

If major issues are found:

1. **Stop cron jobs:**
   ```bash
   crontab -r
   ```

2. **Restore backup:**
   ```bash
   crontab ~/crontab_backup_YYYYMMDD.txt
   ```

3. **Review logs:**
   ```bash
   grep -i error ~/logs/basinwx/*.log
   ```

4. **Document issues** and contact support

---

**Testing Complete** ✓

Sign-off:
- CHPC Admin: _____________ Date: _______
- Website Admin: _____________ Date: _______
