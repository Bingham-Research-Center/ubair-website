# Website Logs - Where to Find Them

This guide explains how to view logs for the Uintah Basin Air Quality website, written for all experience levels.

## Quick Reference

**Main logs to watch:**
- **Application logs**: `/root/.pm2/logs/ubair-site-out.log` (normal output)
- **Error logs**: `/root/.pm2/logs/ubair-site-error.log` (errors only)
- **Web server logs**: `/var/log/nginx/access.log` and `/var/log/nginx/error.log`

## What is PM2?

PM2 is a process manager that keeps the Node.js website running continuously. It automatically restarts the site if it crashes and manages log files for us.

## How to View Logs

### Option 1: Watch Live Logs (Recommended for Beginners)

This shows both normal output and errors in real-time:

```bash
pm2 logs ubair-site
```

Press `Ctrl+C` to stop watching.

### Option 2: View Specific Log Files

**See the most recent output:**
```bash
tail -f /root/.pm2/logs/ubair-site-out.log
```

**See the most recent errors:**
```bash
tail -f /root/.pm2/logs/ubair-site-error.log
```

**See last 50 lines only:**
```bash
tail -n 50 /root/.pm2/logs/ubair-site-out.log
```

Press `Ctrl+C` to stop watching.

### Option 3: Check Nginx Logs (Web Server)

**See who is visiting the website:**
```bash
tail -f /var/log/nginx/access.log
```

**See web server errors:**
```bash
tail -f /var/log/nginx/error.log
```

## Common Workflows

### After Restarting the Website

```bash
# Restart the site and immediately watch logs
pm2 restart ubair-site && pm2 logs ubair-site
```

### After Pulling New Code

```bash
# Pull changes, restart, and watch
git pull && pm2 restart ubair-site && pm2 logs ubair-site
```

### Check if Site is Running

```bash
pm2 list
```

Shows the status, uptime, and memory usage.

### View Detailed Site Info

```bash
pm2 info ubair-site
```

Shows log paths, uptime, restarts, and more.

## Understanding Log Messages

Our application outputs timestamped messages for important events:

```
🔄 Starting background refresh service...
   UDOT API Rate Limit: 10 calls/60 seconds
✓ Background refresh service started
[2025-11-04T08:30:00.000Z] Refreshing essential data...
   ✓ Essential data refreshed (1234ms)
```

- **🔄** = Starting a service
- **✓** = Success
- **⚠️** = Warning
- **Timestamps** in brackets show when events occurred
- **Duration** in milliseconds shows how long operations took

## Log Maintenance

### Clear Old Logs (Helpful When Logs Get Too Big)

```bash
# Clear all logs for the site
pm2 flush ubair-site

# Or clear all PM2 logs
pm2 flush
```

**Note:** Your error log is currently 77MB. Consider flushing if it gets too large.

### View Log File Sizes

```bash
ls -lh /root/.pm2/logs/
```

## Troubleshooting

### "Log file not found"
The site might not be running. Check with `pm2 list`.

### "Permission denied"
You need to be root or use `sudo` to view these logs.

### "Too many lines scrolling by"
- Press `Ctrl+C` to stop
- Use `tail -n 50` instead of `tail -f` to see just the last 50 lines
- Use `grep` to filter: `tail -f /root/.pm2/logs/ubair-site-out.log | grep ERROR`

### Site isn't working but logs look fine
Check nginx logs: `tail -f /var/log/nginx/error.log`

## PM2 Cheat Sheet

```bash
pm2 list                    # Show all running apps
pm2 info ubair-site        # Detailed info about the site
pm2 logs ubair-site        # Watch logs in real-time
pm2 restart ubair-site     # Restart the website
pm2 stop ubair-site        # Stop the website
pm2 start ubair-site       # Start the website
pm2 flush ubair-site       # Clear logs
pm2 monit                  # Live CPU/memory monitor
```

## Additional Resources

- PM2 Documentation: https://pm2.keymetrics.io/docs/usage/log-management/
- Our server file: `server/server.js` (shows what gets logged)
- Background refresh: `server/backgroundRefresh.js` (scheduled tasks logging)
