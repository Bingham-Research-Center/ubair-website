# Cache Cron Job Setup Guide

This guide explains how to set up the optional standalone cache refresh cron job.

## Overview

The `server/cacheCronJob.js` script is a standalone Node.js script that refreshes the disk cache with fresh UDOT API data. The main server works perfectly fine without this cron job, but running it can help:

1. **Keep cache fresh** - Pre-populate disk cache before it expires
2. **Reduce API load** - Spread out API calls over time instead of bursts
3. **Faster restarts** - Server always has fresh cache to load from

## How It Works

```
┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│  Cron Job   │ ──────▶ │  UDOT APIs   │ ──────▶ │ .cache/*.json│
│ (every 5min)│         │              │         │ (disk cache) │
└─────────────┘         └──────────────┘         └─────────────┘
                                                          │
                                                          ▼
                                                   ┌─────────────┐
                                                   │ Node Server │
                                                   │(loads cache)│
                                                   └─────────────┘
```

## Basic Usage

### Test Run

Test the cron job manually first:

```bash
cd /path/to/ubair-website
node server/cacheCronJob.js
```

Expected output:
```
[2025-10-14T12:00:00.000Z] 🔄 Starting cache refresh...
  ✓ Road conditions cached
  ✓ Cameras cached
  ✓ Weather stations cached
  ✓ Traffic events cached
  ✓ Traffic alerts cached
[2025-10-14T12:00:02.567Z] ✅ Cache refresh completed in 2567ms (5 succeeded, 0 failed)
Cache refresh job finished successfully
```

### Make Executable (Optional)

```bash
chmod +x server/cacheCronJob.js
```

Then you can run it with:
```bash
./server/cacheCronJob.js
```

## Cron Setup

### Using crontab (Linux/macOS)

1. Open your crontab:
```bash
crontab -e
```

2. Add one of these entries:

**Every 5 minutes** (recommended for high-traffic sites):
```cron
*/5 * * * * cd /path/to/ubair-website && node server/cacheCronJob.js >> /var/log/cache-cron.log 2>&1
```

**Every 15 minutes** (good balance):
```cron
*/15 * * * * cd /path/to/ubair-website && node server/cacheCronJob.js >> /var/log/cache-cron.log 2>&1
```

**Every hour**:
```cron
0 * * * * cd /path/to/ubair-website && node server/cacheCronJob.js >> /var/log/cache-cron.log 2>&1
```

3. Save and exit (`:wq` in vim)

### Using systemd Timer (Linux)

More reliable for production systems.

1. Create service file: `/etc/systemd/system/cache-refresh.service`
```ini
[Unit]
Description=UDOT Cache Refresh Job
After=network.target

[Service]
Type=oneshot
User=www-data
WorkingDirectory=/path/to/ubair-website
Environment="NODE_ENV=production"
EnvironmentFile=/path/to/ubair-website/.env
ExecStart=/usr/bin/node server/cacheCronJob.js
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

2. Create timer file: `/etc/systemd/system/cache-refresh.timer`
```ini
[Unit]
Description=Run UDOT Cache Refresh every 5 minutes
Requires=cache-refresh.service

[Timer]
OnBootSec=1min
OnUnitActiveSec=5min
AccuracySec=1s

[Install]
WantedBy=timers.target
```

3. Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable cache-refresh.timer
sudo systemctl start cache-refresh.timer
```

4. Check status:
```bash
sudo systemctl status cache-refresh.timer
sudo systemctl list-timers
```

### Using PM2 (Node.js Process Manager)

Good for development and production.

1. Create PM2 ecosystem file: `ecosystem.config.js`
```javascript
module.exports = {
  apps: [
    {
      name: 'cache-cron',
      script: './server/cacheCronJob.js',
      cron_restart: '*/5 * * * *',  // Every 5 minutes
      autorestart: false,
      watch: false
    }
  ]
};
```

2. Start with PM2:
```bash
pm2 start ecosystem.config.js
pm2 save
```

3. Monitor:
```bash
pm2 logs cache-cron
pm2 status
```

## Environment Variables

The cron job needs these environment variables:

- `UDOT_API_KEY`: Your UDOT API key (required)

### Loading .env in Cron

Cron doesn't load `.env` files by default. Solutions:

**Option 1: Source .env in crontab**
```cron
*/5 * * * * cd /path/to/ubair-website && export $(cat .env | xargs) && node server/cacheCronJob.js >> /var/log/cache-cron.log 2>&1
```

**Option 2: Use full path to node with --env-file** (Node 20+)
```cron
*/5 * * * * cd /path/to/ubair-website && /usr/bin/node --env-file=.env server/cacheCronJob.js >> /var/log/cache-cron.log 2>&1
```

**Option 3: System environment variables**
Add to `/etc/environment` or user profile:
```bash
export UDOT_API_KEY="your-key-here"
```

## Monitoring

### Check Logs

Crontab logs:
```bash
tail -f /var/log/cache-cron.log
```

Systemd logs:
```bash
journalctl -u cache-refresh.service -f
```

PM2 logs:
```bash
pm2 logs cache-cron
```

### Verify Cache Files

Check that cache files are being updated:
```bash
ls -lh .cache/
```

Should show recent modification times:
```
-rw-r--r-- 1 user user  124K Oct 14 12:05 udot_road_conditions.json
-rw-r--r-- 1 user user   87K Oct 14 12:05 udot_cameras.json
-rw-r--r-- 1 user user   42K Oct 14 12:05 udot_weather_stations.json
-rw-r--r-- 1 user user   15K Oct 14 12:05 udot_traffic_events.json
-rw-r--r-- 1 user user    8K Oct 14 12:05 udot_alerts.json
```

### Health Check Script

Create a simple health check:
```bash
#!/bin/bash
# health-check.sh

CACHE_DIR=".cache"
MAX_AGE_MINUTES=10

for file in udot_road_conditions.json udot_cameras.json udot_weather_stations.json; do
    if [ ! -f "$CACHE_DIR/$file" ]; then
        echo "ERROR: Missing cache file: $file"
        exit 1
    fi

    age=$(( ($(date +%s) - $(stat -f %m "$CACHE_DIR/$file")) / 60 ))
    if [ $age -gt $MAX_AGE_MINUTES ]; then
        echo "WARNING: Cache file $file is ${age} minutes old (max: $MAX_AGE_MINUTES)"
    fi
done

echo "All cache files present and fresh"
```

## Troubleshooting

### Cron job not running?

1. Check cron is running:
```bash
sudo systemctl status cron  # systemd
sudo service cron status     # init.d
```

2. Verify crontab is set:
```bash
crontab -l
```

3. Check system logs:
```bash
grep CRON /var/log/syslog
```

### Permissions issues?

Make sure the cron user has:
- Read access to project directory
- Write access to `.cache/` directory
- Read access to `.env` file

```bash
chmod 755 /path/to/ubair-website
chmod 775 /path/to/ubair-website/.cache
chmod 600 /path/to/ubair-website/.env
```

### API errors?

Check that `UDOT_API_KEY` is correctly loaded:
```bash
cd /path/to/ubair-website
node -e "require('dotenv').config(); console.log(process.env.UDOT_API_KEY)"
```

## Recommended Schedule

Based on cache TTLs in the application:

| Data Type | Memory Cache TTL | Disk Cache TTL | Recommended Cron |
|-----------|------------------|----------------|------------------|
| Road conditions | 5 minutes | 2 hours | Every 5 minutes |
| Cameras | 5 minutes | 2 hours | Every 5 minutes |
| Weather stations | 5 minutes | 2 hours | Every 5 minutes |
| Traffic events | 2 hours | 24 hours | Every 15 minutes |
| Traffic alerts | 2 hours | 24 hours | Every 15 minutes |

**Recommendation**: Run every 5 minutes to keep road/camera/weather data fresh.

## Alternative: No Cron Job

You don't need this cron job if:

1. **Your server runs 24/7** - Memory cache stays warm
2. **Low traffic** - Cache warming on startup is sufficient
3. **Development environment** - Not needed for local dev

The application will fetch data when needed and cache it automatically.

## Production Best Practices

1. **Use systemd timers** over cron for better reliability
2. **Set up monitoring** - Alert if cron job fails repeatedly
3. **Log rotation** - Prevent log files from growing too large:
   ```bash
   # /etc/logrotate.d/cache-cron
   /var/log/cache-cron.log {
       daily
       rotate 7
       compress
       missingok
       notifempty
   }
   ```
4. **Health checks** - Monitor cache file ages
5. **Graceful degradation** - Application should work even if cron fails

## Summary

- ✅ Optional - server works fine without it
- ✅ Keeps cache fresh and reduces API load
- ✅ Multiple setup options (crontab, systemd, PM2)
- ✅ Run every 5 minutes for best results
- ✅ Monitor logs to ensure it's working
