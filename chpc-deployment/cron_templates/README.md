# Cron Job Templates for CHPC Data Pipeline

This directory contains cron job templates for automated data uploads from CHPC to the BasinWx website.

## Quick Start

1. **Review the templates** - Adjust paths and timing if needed
2. **Edit your crontab** - `crontab -e`
3. **Paste the entries** - Copy from the templates below
4. **Save and verify** - `crontab -l` to confirm

## Schedule Overview

| Data Type | Frequency | Cron Expression | File Size | Priority |
|-----------|-----------|-----------------|-----------|----------|
| Observations | Every 10 min | `*/10 * * * *` | ~40KB | HIGH |
| Metadata | Every 6 hours | `0 */6 * * *` | ~8KB | MEDIUM |
| Timeseries | Hourly | `0 * * * *` | Varies | MEDIUM |
| Outlooks | Twice daily | `0 6,18 * * *` | ~5KB | LOW |
| Images | Every 30 min | `*/30 * * * *` | ~500KB | LOW |

## Prerequisites

Before setting up cron jobs:

1. ✅ Run `bash setup_chpc_env.sh` to configure environment
2. ✅ Run `bash test_upload.sh` to verify connectivity
3. ✅ Confirm `brc-tools` is properly installed
4. ✅ Verify data generation scripts work

## Installation

### Option 1: Install All Jobs (Recommended)

```bash
# Edit your crontab
crontab -e

# Paste the contents of crontab_full.txt
# Save and exit
```

### Option 2: Install Individual Jobs

Start with observations only, then add others:

```bash
crontab -e
# Add observations cron job first
# Test for 24 hours
# Then add remaining jobs
```

## Cron Job Files

### `crontab_full.txt`
Complete crontab configuration with all data types. Use this for full production deployment.

### `crontab_observations_only.txt`
Minimal configuration - observations only. Use this for initial testing.

### `crontab_with_comments.txt`
Fully commented version with explanations. Use this for understanding and customization.

## Important Notes

### Environment Variables

Cron runs with a minimal environment. Each script sources the environment:

```bash
source ~/.bashrc
```

This loads `BASINWX_API_KEY` and other required variables.

### Logging

All output redirected to log files in `~/logs/basinwx/`:
- `observations.log` - Observation uploads
- `metadata.log` - Metadata uploads
- `timeseries.log` - Timeseries uploads
- `cron_error.log` - Any cron errors

Monitor these files after deployment:
```bash
tail -f ~/logs/basinwx/observations.log
```

### Email Notifications

By default, cron sends email on errors. To disable:
```bash
# Add at top of crontab
MAILTO=""
```

To enable and set recipient:
```bash
MAILTO="your.email@utah.edu"
```

### Timing Considerations

**Observations (*/10):**
- Runs at :00, :10, :20, :30, :40, :50 each hour
- Most frequent job
- Critical for real-time display

**Metadata (0 */6):**
- Runs at 00:00, 06:00, 12:00, 18:00 UTC
- Stations don't change often
- Can skip if needed

**Outlooks (0 6,18):**
- Runs at 06:00 and 18:00 UTC (11pm and 11am MST)
- Requires manual markdown file creation
- May not run automatically initially

### Timezone

All times are in the server's timezone. CHPC typically uses MST/MDT.

To use UTC explicitly:
```bash
TZ=UTC
*/10 * * * * command
```

## Verification

After installing cron jobs:

### 1. Check Crontab
```bash
crontab -l
```

### 2. Monitor Logs
```bash
# Watch observations (most frequent)
tail -f ~/logs/basinwx/observations.log

# Check for errors
tail -f ~/logs/basinwx/cron_error.log
```

### 3. Verify Uploads on Website
```bash
curl https://basinwx.com/api/monitoring/freshness
```

Expected output should show recent updates (< 10 minutes for observations).

### 4. Check File Timestamps
```bash
# On website server
ls -lt /path/to/public/api/static/observations/ | head -5
```

## Troubleshooting

### Cron Job Not Running

**Check cron service:**
```bash
systemctl status cron  # or 'crond' on some systems
```

**Check cron logs:**
```bash
grep CRON /var/log/syslog
```

**Test command manually:**
```bash
# Copy the exact command from crontab and run it
bash -c "source ~/.bashrc && cd ~/brc-tools && python3 brc_tools/download/push_data.py"
```

### Upload Failures

**Check API key:**
```bash
echo $BASINWX_API_KEY
# Should show: 48cd2f722c19af756e7443230efe9fcc
```

**Check connectivity:**
```bash
bash test_upload.sh --health-only
```

**Check logs:**
```bash
grep "ERROR\|Failed" ~/logs/basinwx/*.log
```

### Data Not Appearing

**Check generation step:**
- Verify data is being generated before upload
- Check brc-tools output directory
- Confirm get_map_obs.py runs successfully

**Check file permissions:**
```bash
ls -l ~/brc-tools/output/
```

**Check website:**
```bash
curl https://basinwx.com/api/filelist.json
```

## Maintenance

### Log Rotation

Logs can grow large. Set up rotation:

Create `~/.logrotate.conf`:
```
~/logs/basinwx/*.log {
    weekly
    rotate 4
    compress
    missingok
    notifempty
}
```

Run manually or add to cron:
```bash
0 0 * * 0 /usr/sbin/logrotate ~/.logrotate.conf
```

### Monitoring

Weekly checks:
1. Verify all cron jobs running
2. Check log file sizes
3. Review error logs
4. Confirm data freshness on website

Monthly tasks:
1. Review upload success rates
2. Check disk space usage
3. Update brc-tools if needed (`git pull`)
4. Verify API key still valid

## Support

For issues:
1. Check logs in `~/logs/basinwx/`
2. Run `bash test_upload.sh` to diagnose
3. Verify environment: `source ~/.bashrc && env | grep BASINWX`
4. Check website monitoring: https://basinwx.com/api/monitoring/status
