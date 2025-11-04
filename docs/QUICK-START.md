# Quick Start: Setting Up the CHPC to BasinWx Data Pipeline

This is a condensed guide to get your data pipeline running in 30 minutes.

## Prerequisites Checklist

- [ ] Access to CHPC compute node
- [ ] Python 3.8+ installed
- [ ] BasinWx API key (ask team lead)
- [ ] `brc-tools` package installed
- [ ] Network access to basinwx.com

## 5-Step Setup

### Step 1: Install Dependencies (5 min)

```bash
cd ~/
mkdir basinwx-pipeline && cd basinwx-pipeline

# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install required packages
pip install requests jsonschema

# Verify installation
python3 -c "import requests, jsonschema; print('✓ Dependencies installed')"
```

### Step 2: Download Scripts (2 min)

```bash
# Download from repository or copy manually
wget https://raw.githubusercontent.com/[repo]/main/scripts/chpc_uploader.py
wget https://raw.githubusercontent.com/[repo]/main/DATA_MANIFEST.json

# OR copy from shared location
cp /path/to/shared/chpc_uploader.py .
cp /path/to/shared/DATA_MANIFEST.json .

chmod +x chpc_uploader.py
```

### Step 3: Configure API Key (3 min)

```bash
# Add to ~/.bashrc
cat >> ~/.bashrc << 'EOF'
# BasinWx Data Pipeline
export BASINWX_API_KEY="your-api-key-here"
export BASINWX_API_URL="https://basinwx.com"
EOF

# Reload
source ~/.bashrc

# Verify
echo $BASINWX_API_KEY  # Should show your key
```

### Step 4: Test Connection (5 min)

```bash
# Test API health
python chpc_uploader.py --health-check

# Expected output:
# INFO:basinwx_uploader:✓ API health check passed

# If this fails, check:
# - API key is correct
# - basinwx.com is accessible
# - Firewall allows outbound HTTPS
```

### Step 5: Create Your Data Script (15 min)

Create `~/basinwx-pipeline/send_observations.py`:

```python
#!/usr/bin/env python3
"""
Minimal example: Fetch observations and upload
Customize this for your specific data source
"""

import json
import subprocess
import sys
from datetime import datetime, timezone

# Your data fetching logic here
def fetch_my_observations():
    """
    Replace this with your actual data fetching code
    using brc-tools or other methods
    """
    # Example: hardcoded data for testing
    return [
        {
            "stid": "TEST01",
            "variable": "air_temp",
            "value": 15.5,
            "date_time": datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z'),
            "units": "Celsius"
        },
        {
            "stid": "TEST01",
            "variable": "wind_speed",
            "value": 3.5,
            "date_time": datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z'),
            "units": "m/s"
        },
        {
            "stid": "TEST01",
            "variable": "wind_direction",
            "value": 270,
            "date_time": datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z'),
            "units": "Degrees"
        }
    ]

def save_and_upload(data):
    """Save to file and upload using manifest-compliant script"""
    timestamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%MZ')
    filename = f'/tmp/map_obs_{timestamp}.json'

    # Save data
    with open(filename, 'w') as f:
        json.dump(data, f, indent=2)

    print(f"Saved {len(data)} observations to {filename}")

    # Upload
    result = subprocess.run([
        sys.executable,
        'chpc_uploader.py',
        '--data-type', 'observations',
        '--file', filename
    ], capture_output=True, text=True)

    print(result.stdout)
    if result.returncode != 0:
        print("ERROR:", result.stderr, file=sys.stderr)
        return False

    return True

if __name__ == '__main__':
    observations = fetch_my_observations()
    success = save_and_upload(observations)
    sys.exit(0 if success else 1)
```

Make it executable:
```bash
chmod +x send_observations.py
```

Test it:
```bash
./send_observations.py

# Expected output:
# Saved 3 observations to /tmp/map_obs_20251103_1200Z.json
# INFO:basinwx_uploader:✓ Upload successful
```

## Schedule with Cron

Edit crontab:
```bash
crontab -e
```

Add these lines:
```cron
# Environment
BASINWX_API_KEY=your-api-key-here
BASINWX_API_URL=https://basinwx.com

# Send observations every 10 minutes
*/10 * * * * cd ~/basinwx-pipeline && ./send_observations.py >> /tmp/basinwx.log 2>&1

# Health check every 5 minutes
*/5 * * * * cd ~/basinwx-pipeline && python chpc_uploader.py --health-check >> /tmp/basinwx_health.log 2>&1
```

Save and exit. Verify:
```bash
crontab -l  # Should show your entries
```

## Monitor Logs

```bash
# Watch upload activity (Ctrl+C to exit)
tail -f /tmp/basinwx.log

# Check health
tail -f /tmp/basinwx_health.log

# Count successful uploads today
grep "Upload successful" /tmp/basinwx.log | wc -l
```

## Verify Data on Website

1. Wait 10 minutes for first cron run
2. Visit https://basinwx.com
3. Check monitoring API: `curl https://basinwx.com/api/monitoring/freshness`
4. Look for your station on the map

## Common Issues

### "BASINWX_API_KEY environment variable not set"
**Fix:** Add to ~/.bashrc and run `source ~/.bashrc`

### "Connection refused" or timeout
**Fix:** Check firewall, verify `curl https://basinwx.com` works

### "401 Unauthorized"
**Fix:** Verify API key is correct, check for typos

### "Data validation failed"
**Fix:** Run `python chpc_uploader.py --validate-only --file yourfile.json --data-type observations`

## Next Steps

1. **Replace test data** with real data from brc-tools
2. **Add metadata upload** (every 6 hours)
3. **Set up monitoring** email alerts
4. **Review full documentation** in docs/DATA-PIPELINE-OVERVIEW.md

## Getting Help

- Full docs: `docs/DATA-PIPELINE-OVERVIEW.md`
- Python guide: `docs/PYTHON-DEVELOPER-GUIDE.md`
- CHPC deployment: `docs/CHPC-DEPLOYMENT.md`
- Create issue: [GitHub repository]

## Success Criteria

You're done when:
- [x] Health check passes
- [x] Test upload succeeds
- [x] Cron job is running
- [x] Data appears on website
- [x] No errors in logs for 1 hour

---

**Time to complete:** ~30 minutes
**Difficulty:** Beginner-friendly
**Last updated:** 2025-11-03
