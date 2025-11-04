# Rollback Procedure for CHPC Deployment
**Purpose:** Quick recovery when deployment issues occur
**Time Required:** 5-15 minutes
**Use When:** Critical issues prevent normal operation

---

## When to Rollback

Execute rollback if:

- ✗ Uploads consistently failing (> 50% failure rate)
- ✗ Data corruption or invalid data on website
- ✗ CHPC system instability caused by pipeline
- ✗ Security concerns (API key compromised, etc.)
- ✗ Unrecoverable errors after 30+ minutes troubleshooting

**DO NOT rollback for:**
- Single failed upload (wait for next cron cycle)
- Temporary network issues (usually self-resolves)
- Website server maintenance (expected downtime)
- Minor data quality issues (fix without rollback)

---

## Emergency Stop (30 seconds)

If you need to stop everything immediately:

```bash
# SSH to CHPC
ssh username@chpc.utah.edu

# Remove all cron jobs
crontab -r
```

**Result:** All automated uploads stop immediately

**Note:** This is drastic - only use if actively causing problems!

---

## Rollback Levels

Choose the appropriate level based on the issue:

| Level | What It Does | Use When | Time |
|-------|--------------|----------|------|
| Level 1 | Pause cron jobs | Need to stop temporarily | 1 min |
| Level 2 | Restore cron backup | Cron configuration broken | 3 min |
| Level 3 | Revert environment | Config issues | 5 min |
| Level 4 | Full system restore | Major issues | 15 min |

---

## Level 1: Pause Cron Jobs

**Use for:** Temporary issues, need time to investigate

**Steps:**
```bash
# 1. List current cron jobs
crontab -l > ~/crontab_paused_$(date +%Y%m%d_%H%M).txt

# 2. Edit crontab
crontab -e

# 3. Comment out all BasinWx jobs (add # at start of line)
# Example:
# */10 * * * * source ~/.bashrc && cd ~/brc-tools && ...

# 4. Save and exit

# 5. Verify
crontab -l
```

**Verify Success:**
```bash
# No active BasinWx cron jobs
crontab -l | grep -v "^#" | grep basinwx
# (Should return nothing)
```

**To Resume:**
```bash
# Edit crontab
crontab -e

# Remove # from commented lines
# Save and exit
```

---

## Level 2: Restore Cron Backup

**Use for:** Cron configuration corrupted/lost

**Prerequisites:**
- Cron backup exists (created during deployment)
- Backup location: `~/crontab_backup_YYYYMMDD.txt`

**Steps:**
```bash
# 1. Find most recent backup
ls -lt ~/crontab_backup_*.txt | head -1

# 2. View backup to confirm it's correct
cat ~/crontab_backup_YYYYMMDD.txt

# 3. Restore backup
crontab ~/crontab_backup_YYYYMMDD.txt

# 4. Verify restoration
crontab -l
```

**Verify Success:**
```bash
# Should see expected cron jobs
crontab -l | grep basinwx
```

**If No Backup Exists:**
```bash
# Use template from deployment files
crontab ~/chpc-deployment/cron_templates/crontab_full.txt
```

---

## Level 3: Revert Environment Configuration

**Use for:** Environment variable issues, config file corruption

### Step 1: Remove Environment Variables

```bash
# Edit ~/.bashrc
vim ~/.bashrc  # or nano ~/.bashrc

# Find and remove these lines:
# export DATA_UPLOAD_API_KEY="..."
# export BASINWX_API_URL="..."

# Save and exit

# Reload
source ~/.bashrc
```

### Step 2: Remove Configuration Files

```bash
# Backup first (just in case)
mv ~/.config/ubair-website ~/.config/ubair-website.old_$(date +%Y%m%d)

# Verify removal
ls ~/.config/ | grep ubair
# (Should return nothing or just .old backup)
```

### Step 3: Clean Logs

```bash
# Archive current logs
cd ~/logs/basinwx/
tar -czf archive_$(date +%Y%m%d_%H%M).tar.gz *.log
rm *.log

# Or just move them
mkdir -p ~/logs/basinwx_old/
mv ~/logs/basinwx/*.log ~/logs/basinwx_old/
```

**Verify Success:**
```bash
# Environment variables gone
echo $DATA_UPLOAD_API_KEY
# (Should be empty)

# Config directory removed
ls ~/.config/ubair-website
# (Should show "No such file")
```

---

## Level 4: Full System Restore

**Use for:** Complete failure, need to start fresh

**WARNING:** This removes ALL deployment artifacts!

### Step 1: Stop All Activity

```bash
# Remove crontab
crontab -r

# Verify
crontab -l
# (Should show "no crontab for user")
```

### Step 2: Clean Environment

```bash
# Remove environment variables
vim ~/.bashrc
# Delete lines:
#   export DATA_UPLOAD_API_KEY="..."
#   export BASINWX_API_URL="..."
source ~/.bashrc

# Remove config directory
rm -rf ~/.config/ubair-website/
```

### Step 3: Archive Logs

```bash
# Create archive directory
mkdir -p ~/archives/basinwx_rollback_$(date +%Y%m%d)/

# Move logs
mv ~/logs/basinwx/* ~/archives/basinwx_rollback_$(date +%Y%m%d)/

# Or delete if not needed
# rm -rf ~/logs/basinwx/*.log
```

### Step 4: Clean Generated Data (Optional)

```bash
# Archive data files
mkdir -p ~/archives/basinwx_data_$(date +%Y%m%d)/
mv ~/brc-tools/data/*.json ~/archives/basinwx_data_$(date +%Y%m%d)/

# Or delete
# rm ~/brc-tools/data/map_obs_*.json
```

### Step 5: Remove Deployment Files (Optional)

```bash
# Move deployment directory
mv ~/chpc-deployment ~/chpc-deployment.old_$(date +%Y%m%d)
```

**Verify Success:**
```bash
# No cron jobs
crontab -l 2>&1 | grep "no crontab"

# No environment variables
echo $DATA_UPLOAD_API_KEY $BASINWX_API_URL
# (Both empty)

# No config files
ls ~/.config/ubair-website/
# (No such file)

# No active processes
ps aux | grep get_map_obs
# (Only the grep command itself)
```

---

## Post-Rollback Actions

After performing rollback:

### 1. Document What Happened

Create an incident report:
```bash
cat > ~/basinwx_incident_$(date +%Y%m%d).txt << 'EOF'
Date: $(date)
Issue: [Describe what went wrong]
Rollback Level: [1/2/3/4]
Actions Taken: [What you did]
Root Cause: [If known]
Resolution: [How to prevent]
EOF
```

### 2. Notify Team

Inform stakeholders:
- Pipeline is offline
- Estimated time to restore
- Alternative data sources (if any)

### 3. Investigate Root Cause

**Check logs:**
```bash
# View archived logs
cat ~/logs/basinwx_old/*.log | grep -i error

# Check system logs
grep basinwx /var/log/syslog
```

**Common root causes:**
- API key changed/expired
- Network/firewall changes
- Server maintenance
- Disk space full
- Code changes in brc-tools
- Python package updates

### 4. Test in Isolation

Before redeploying:
```bash
# Test manual upload
cd ~/brc-tools
python3 brc_tools/download/get_map_obs.py

# Test with test script
bash ~/chpc-deployment/test_upload.sh
```

### 5. Gradual Redeployment

Don't deploy everything at once:

```bash
# Day 1: Test environment only
# Run manual uploads

# Day 2: Single cron job
crontab -e
# Add ONLY observations cron

# Day 3-4: Monitor closely
# Watch logs, check website

# Day 5+: Full deployment
# Add remaining cron jobs if all stable
```

---

## Rollback Testing (Do This During Deployment)

**Before production deployment, test rollback:**

```bash
# 1. Deploy to test environment
bash setup_chpc_env.sh

# 2. Verify it works
bash test_upload.sh

# 3. Perform Level 1 rollback
crontab -e
# Comment out jobs

# 4. Verify stopped
# Wait 15 minutes, check no new uploads

# 5. Restore
crontab -e
# Uncomment jobs

# 6. Verify resumed
# Wait 15 minutes, check uploads resume

# 7. Practice Level 4 rollback
# Follow full system restore steps

# 8. Re-deploy fresh
bash setup_chpc_env.sh
```

This ensures you can rollback confidently in an emergency.

---

## Alternative: Disable on Website Side

If you can't access CHPC but need to stop uploads:

**On website server:**

```bash
# Temporary: Change API key
# Edit .env file
vim /path/to/.env
# Change DATA_UPLOAD_API_KEY to a different value

# Restart server to apply
# This will reject all uploads with 401 Unauthorized
```

**Pros:** Immediate, no CHPC access needed
**Cons:** Doesn't stop CHPC from trying (logs will show failures)

---

## Recovery After Rollback

Once issue is resolved:

### Option A: Quick Recovery (Issue was simple)

```bash
# Re-run setup
cd ~/chpc-deployment
bash setup_chpc_env.sh

# Test
bash test_upload.sh

# Deploy cron
crontab ~/chpc-deployment/cron_templates/crontab_observations_only.txt
```

### Option B: Staged Recovery (Issue was serious)

**Day 1:**
```bash
# Manual uploads only
cd ~/brc-tools
python3 brc_tools/download/get_map_obs.py
# Repeat every few hours
```

**Day 2:**
```bash
# Single cron job (hourly, not every 10 min)
crontab -e
# Add:
0 * * * * source ~/.bashrc && cd ~/brc-tools && python3 brc_tools/download/get_map_obs.py >> ~/logs/basinwx/observations.log 2>&1
```

**Day 3-5:**
```bash
# Increase frequency if stable
# Change to */30 (every 30 min), then */10
```

**Day 7+:**
```bash
# Full deployment if all stable
crontab ~/chpc-deployment/cron_templates/crontab_full.txt
```

---

## Rollback Checklist

**Before Rollback:**
- [ ] Documented current state (logs, errors, symptoms)
- [ ] Notified team of impending rollback
- [ ] Verified backup files exist
- [ ] Chosen appropriate rollback level

**During Rollback:**
- [ ] Followed procedure step-by-step
- [ ] Verified each step completed successfully
- [ ] Documented all actions taken
- [ ] Confirmed system in safe state

**After Rollback:**
- [ ] Verified uploads stopped (if that was goal)
- [ ] No orphaned processes running
- [ ] Logs archived for analysis
- [ ] Incident report created
- [ ] Team notified of status

---

## Contact Information

**In Emergency:**
1. Stop the pipeline (Level 1 rollback)
2. Notify: [Your team contact info]
3. Document the issue
4. Follow escalation path from MONITORING_GUIDE.md

**For Questions:**
- Deployment issues: [DevOps contact]
- Data issues: [Data team contact]
- Infrastructure: [CHPC support]

---

## Rollback Decision Matrix

| Symptom | Severity | Action | Timeline |
|---------|----------|--------|----------|
| Single upload failure | Low | Monitor next cycle | Wait 10 min |
| 3 consecutive failures | Medium | Level 1 rollback | 5 min |
| Corrupt data on website | High | Level 1 rollback + investigate | Immediate |
| System instability | Critical | Level 4 rollback | Immediate |
| API key compromised | Critical | Change key + Level 3 rollback | Immediate |

---

**Remember:** Rollback is reversible. Better to rollback early than let issues compound!

**Stay Calm. Document Everything. Test Before Redeploying.** ✓
