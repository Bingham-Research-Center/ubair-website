# Post-Deployment Monitoring Guide
**Purpose:** Track pipeline health and catch issues early
**Audience:** System administrators, DevOps team

---

## Monitoring Schedule

| Period | Frequency | Focus |
|--------|-----------|-------|
| First 24 hours | Every 2 hours | Verify automation, catch config errors |
| Days 2-7 | Twice daily | Confirm stability, watch for patterns |
| Week 2+ | Daily | Routine health checks |
| Month 2+ | Weekly | Long-term trends, capacity planning |

---

## Daily Monitoring (5 minutes)

### Quick Health Check

Run this one-liner on CHPC:
```bash
bash -c 'echo "=== Cron Status ==="; crontab -l | grep -v "^#" | wc -l; echo "=== Recent Uploads (last hour) ==="; grep "Successfully uploaded" ~/logs/basinwx/observations.log | tail -6; echo "=== Errors (last 24h) ==="; grep -i "error\|fail\|❌" ~/logs/basinwx/*.log | tail -5'
```

**Expected Output:**
- Cron status: 1-5 (number of active cron jobs)
- Recent uploads: 6 successful uploads (last hour = 6 × 10-min intervals)
- Errors: Empty or minimal

**Red Flags:**
- No uploads in last hour
- Multiple consecutive errors
- "Connection refused" messages

---

## Monitoring Endpoints

### 1. Data Freshness API

**Check:** How recent is the data?
```bash
curl -s https://basinwx.com/api/monitoring/freshness | python3 -m json.tool
```

**Interpret Results:**
```json
{
  "observations": {
    "status": "fresh",        // ✓ GOOD: "fresh"  ✗ BAD: "stale", "no_data"
    "ageMinutes": 8,          // ✓ GOOD: < 15     ✗ BAD: > 20
    "latestFile": "map_obs_20251104_1230Z.json",
    "totalFiles": 42
  },
  "metadata": {
    "status": "fresh",
    "ageMinutes": 90
  }
}
```

**Action Items:**
| Status | Age (min) | Action |
|--------|-----------|--------|
| fresh | < 15 | ✓ No action |
| fresh | 15-20 | ⚠️ Watch next cycle |
| stale | > 20 | 🔥 Investigate immediately |
| no_data | - | 🔥 Pipeline down |

### 2. Upload Statistics API

**Check:** Are uploads succeeding?
```bash
curl -s https://basinwx.com/api/monitoring/uploads | python3 -m json.tool
```

**Interpret Results:**
```json
{
  "total": 144,
  "success": 142,
  "failed": 2,
  "successRate": "98.6",     // ✓ GOOD: > 95%  ⚠️ WATCH: 90-95%  🔥 BAD: < 90%
  "byDataType": {
    "observations": 140,
    "metadata": 2
  }
}
```

**Action Items:**
| Success Rate | Action |
|--------------|--------|
| > 95% | ✓ Healthy |
| 90-95% | ⚠️ Review error logs |
| < 90% | 🔥 Troubleshoot immediately |

### 3. Overall Status API

**Check:** Comprehensive health report
```bash
curl -s https://basinwx.com/api/monitoring/status | python3 -m json.tool
```

**Key Fields:**
- `summary.overallHealth`: "healthy" (good) or "degraded" (bad)
- `summary.issues`: Array of problems (should be empty)
- `alerts`: Recent alerts (should be none or minimal)

---

## Log Monitoring

### Check CHPC Logs

**Primary log (observations):**
```bash
tail -50 ~/logs/basinwx/observations.log
```

**Look for:**
✓ Regular "Downloading..." and "✅ Successfully uploaded" messages every 10 min
✗ Python tracebacks, "ERROR", "Failed", "Timeout", "Connection refused"

**Check for errors:**
```bash
grep -i "error\|fail\|exception" ~/logs/basinwx/observations.log | tail -20
```

**Count recent successes:**
```bash
grep "Successfully uploaded" ~/logs/basinwx/observations.log | grep "$(date +%Y-%m-%d)" | wc -l
```
Expected: ~144 per day (24 hours × 6 uploads/hour)

### Log Rotation Check

**Check log sizes:**
```bash
du -h ~/logs/basinwx/*.log
```

**Expected:** 1-5 MB per log file
**Action if > 50MB:** Set up log rotation

---

## Website Monitoring

### Visual Check (2 min)

Open: https://basinwx.com/live_aq

**Checklist:**
- [ ] Map loads
- [ ] Stations appear as markers
- [ ] Clicking station shows data popup
- [ ] Data timestamp is recent (< 15 min)
- [ ] Temperature values are reasonable (-40°C to 50°C)
- [ ] Wind speeds are reasonable (0-100 mph)
- [ ] No JavaScript errors in browser console (F12)

**Red Flags:**
- Map shows "No data available"
- All stations showing same old timestamp
- Error messages in UI
- Map doesn't load

### File List Check

**Check available files:**
```bash
curl -s https://basinwx.com/api/filelist.json
```

**Expected:** Array of 20-50 filenames
**Look for:** Recent dates and times in filenames
**Red Flag:** Empty array or all old dates

---

## Alert Conditions

Set up alerts (email, Slack, etc.) for these conditions:

### Critical (Immediate Response)

1. **Data Stale > 30 minutes**
   ```bash
   # Check and alert
   AGE=$(curl -s https://basinwx.com/api/monitoring/freshness | python3 -c "import sys, json; print(json.load(sys.stdin)['observations']['ageMinutes'])")
   if [ $AGE -gt 30 ]; then echo "ALERT: Data is $AGE minutes old"; fi
   ```

2. **Upload Success Rate < 85%**
   ```bash
   RATE=$(curl -s https://basinwx.com/api/monitoring/uploads | python3 -c "import sys, json; print(float(json.load(sys.stdin)['successRate']))")
   if [ $(echo "$RATE < 85" | bc) -eq 1 ]; then echo "ALERT: Success rate is ${RATE}%"; fi
   ```

3. **Cron Not Running**
   ```bash
   # On CHPC, check if recent logs exist
   if [ ! -f ~/logs/basinwx/observations.log ] || [ $(find ~/logs/basinwx/observations.log -mmin +15 -print) ]; then
       echo "ALERT: No recent log activity"
   fi
   ```

### Warning (Check within 4 hours)

1. **Data Stale 15-30 minutes**
2. **Success Rate 85-95%**
3. **Repeated errors (3+ in a row)**
4. **Disk space < 1GB**

---

## Common Issues & Quick Fixes

### Issue: "Data is stale"

**Diagnose:**
```bash
# Check if cron is running
crontab -l

# Check recent logs
tail -50 ~/logs/basinwx/observations.log

# Check for errors
grep -i error ~/logs/basinwx/observations.log | tail -10
```

**Quick Fixes:**
- Cron not in crontab → Re-add cron job
- API key error → Check `$DATA_UPLOAD_API_KEY`
- Network error → Test `curl https://basinwx.com`
- Script error → Run manually to see full error

### Issue: "Upload failures"

**Diagnose:**
```bash
# Try manual upload
cd ~/brc-tools && python3 brc_tools/download/get_map_obs.py

# Check API key
echo $DATA_UPLOAD_API_KEY

# Test connectivity
bash ~/chpc-deployment/test_upload.sh --health-only
```

**Quick Fixes:**
- API key wrong → `source ~/.bashrc`
- Network issue → Check firewall, contact IT
- Server down → Check basinwx.com status

### Issue: "Cron not running"

**Diagnose:**
```bash
# Check crontab
crontab -l

# Check if cron service active
ps aux | grep cron
```

**Quick Fixes:**
- Crontab empty → Reinstall from backup
- Syntax error → Fix and re-save
- Service down → Contact CHPC support

### Issue: "Disk space full"

**Diagnose:**
```bash
df -h ~
du -sh ~/brc-tools/data/
du -sh ~/logs/
```

**Quick Fixes:**
```bash
# Clean old data files (keep last 7 days)
find ~/brc-tools/data/ -name "*.json" -mtime +7 -delete

# Compress old logs
gzip ~/logs/basinwx/*.log.[2-9]

# Clean tmp files
rm -rf /tmp/basinwx_*
```

---

## Weekly Review (15 minutes)

### 1. Upload Statistics

**Generate weekly report:**
```bash
echo "=== Weekly Upload Report ==="
echo "Period: $(date -d '7 days ago' +%Y-%m-%d) to $(date +%Y-%m-%d)"
echo ""
echo "Total uploads:"
grep "Successfully uploaded" ~/logs/basinwx/observations.log | grep "$(date +%Y-%m)" | wc -l
echo ""
echo "Failures:"
grep -i "fail\|error" ~/logs/basinwx/observations.log | grep "$(date +%Y-%m)" | wc -l
echo ""
echo "Most recent:"
tail -5 ~/logs/basinwx/observations.log
```

**Expected:** ~1000 successful uploads per week (144/day × 7)

### 2. Data Quality Check

**Check station coverage:**
```bash
curl -s https://basinwx.com/api/live-observations | python3 << 'EOF'
import sys, json
data = json.load(sys.stdin)['data']
stations = set(obs['stid'] for obs in data)
variables = set(obs['variable'] for obs in data)
print(f"Stations reporting: {len(stations)}")
print(f"Variables: {len(variables)}")
print(f"Total observations: {len(data)}")
EOF
```

**Expected:** 40-50 stations, 15-20 variables, 200-400 observations

### 3. Performance Trends

**Check log file growth:**
```bash
ls -lh ~/logs/basinwx/observations.log
```

**Expected:** ~1MB per day, ~7MB per week

**Check execution time (from logs):**
```bash
# If timestamps are in logs, calculate average execution time
# Manual check: time a single run
time (cd ~/brc-tools && python3 brc_tools/download/get_map_obs.py)
```

**Expected:** < 60 seconds per upload

---

## Monthly Maintenance (30 minutes)

### 1. Log Archival

```bash
cd ~/logs/basinwx/
# Compress logs older than 30 days
find . -name "*.log" -mtime +30 -exec gzip {} \;

# Delete compressed logs older than 90 days
find . -name "*.log.gz" -mtime +90 -delete
```

### 2. Data Cleanup

```bash
# Clean old generated data
find ~/brc-tools/data/ -name "*.json" -mtime +14 -delete
```

### 3. Dependency Check

```bash
# Check for Python package updates
pip3 list --outdated --user

# Check for brc-tools updates
cd ~/brc-tools
git fetch
git status
```

### 4. Configuration Audit

```bash
# Verify environment
echo $DATA_UPLOAD_API_KEY | wc -c  # Should be 33 (32 chars + newline)
cat ~/.config/ubair-website/website_url

# Verify cron jobs
crontab -l

# Check disk usage
df -h ~
du -sh ~/brc-tools ~/logs
```

---

## Monitoring Dashboard (Optional)

Create a simple monitoring dashboard with:

```bash
#!/bin/bash
# ~/bin/basinwx_dashboard.sh

echo "=========================================="
echo "BasinWx Pipeline Dashboard"
echo "Generated: $(date)"
echo "=========================================="
echo ""

# Data freshness
echo "DATA FRESHNESS:"
curl -s https://basinwx.com/api/monitoring/freshness | python3 -m json.tool | grep -A 3 observations

echo ""
echo "UPLOAD STATS (last 24h):"
grep "Successfully uploaded" ~/logs/basinwx/observations.log | tail -144 | wc -l
echo "Expected: 144"

echo ""
echo "ERRORS (last 24h):"
grep -i "error\|fail" ~/logs/basinwx/observations.log | grep "$(date +%Y-%m-%d)" | wc -l

echo ""
echo "DISK USAGE:"
du -sh ~/logs/basinwx/ ~/brc-tools/data/

echo ""
echo "CRON STATUS:"
crontab -l | grep -v "^#" | grep -v "^$"

echo ""
echo "=========================================="
```

Run it:
```bash
chmod +x ~/bin/basinwx_dashboard.sh
~/bin/basinwx_dashboard.sh
```

Add to daily cron for email summary:
```cron
0 8 * * * ~/bin/basinwx_dashboard.sh | mail -s "BasinWx Daily Report" you@utah.edu
```

---

## Escalation Path

### Level 1: Automatic Recovery (Self-healing)
- Cron retries every 10 minutes
- Script has built-in error handling
- Most issues resolve automatically

### Level 2: Operations Team (< 4 hours)
- Data stale > 30 minutes
- Success rate < 90%
- Repeated errors

**Actions:**
- Check logs
- Run test script
- Apply quick fixes from this guide

### Level 3: Development Team (< 24 hours)
- Code errors/bugs
- Schema mismatches
- Performance degradation

**Actions:**
- Review code changes
- Check brc-tools updates
- Test in development environment

### Level 4: Infrastructure Team (< 4 hours)
- Network issues
- Server down
- Firewall changes

**Actions:**
- Check connectivity
- Verify firewall rules
- Contact hosting provider

---

## Success Metrics

Track these KPIs:

| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| Data Freshness | < 10 min | > 30 min |
| Upload Success Rate | > 98% | < 90% |
| Uptime | > 99.5% | < 98% |
| Response Time | < 60s | > 120s |
| Disk Usage | < 10GB | > 50GB |

**Calculate Uptime:**
```bash
TOTAL=$(grep "Downloading" ~/logs/basinwx/observations.log | wc -l)
SUCCESS=$(grep "Successfully uploaded" ~/logs/basinwx/observations.log | wc -l)
UPTIME=$(echo "scale=2; $SUCCESS / $TOTAL * 100" | bc)
echo "Uptime: ${UPTIME}%"
```

---

## Resources

- **Test Script:** `~/chpc-deployment/test_upload.sh`
- **Deployment Guide:** `~/chpc-deployment/DEPLOYMENT_GUIDE.md`
- **Code Review:** `~/chpc-deployment/BRC_TOOLS_REVIEW.md`
- **Website Monitoring:** https://basinwx.com/api/monitoring/status
- **Production Data:** https://basinwx.com/live_aq

---

**Monitor regularly, respond quickly, document everything!** ✓
