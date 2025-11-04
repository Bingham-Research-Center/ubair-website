# CHPC Deployment Guide
## Automated Data Pipeline Setup for BasinWx

This guide walks you through setting up the automated data pipeline from CHPC to the BasinWx website at basinwx.com.

## Prerequisites

- Access to CHPC compute nodes
- Python 3.8+ installed
- BasinWx API key (obtain from team lead)
- `brc-tools` package installed
- Network access to basinwx.com

## Installation

### 1. Clone Repository and Install Dependencies

```bash
# On CHPC
cd ~/projects
git clone <repository-url> basinwx-pipeline
cd basinwx-pipeline

# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install requests jsonschema
```

### 2. Copy Manifest and Scripts

```bash
# Copy the uploader script and manifest to your working directory
cp scripts/chpc_uploader.py ~/basinwx-pipeline/
cp DATA_MANIFEST.json ~/basinwx-pipeline/
chmod +x chpc_uploader.py
```

### 3. Configure Environment Variables

Create a `.env` file or add to your shell profile:

```bash
# ~/.bashrc or ~/.bash_profile
export BASINWX_API_KEY="your-api-key-here"
export BASINWX_API_URL="https://basinwx.com"
export CHPC_HOSTNAME="$(hostname -f)"
```

Load the environment:
```bash
source ~/.bashrc
```

### 4. Test the Setup

```bash
# Test API connectivity
python chpc_uploader.py --health-check

# Expected output:
# ✓ API health check passed
```

## Data Pipeline Configuration

### Overview

The pipeline pulls data from Synoptic Weather API using `brc-tools`, processes it, and uploads to BasinWx following the manifest schedule:

| Data Type | Frequency | Schedule (cron) |
|-----------|-----------|-----------------|
| Observations | Every 10 min | `*/10 * * * *` |
| Metadata | Every 6 hours | `0 */6 * * *` |
| Time Series | Hourly | `0 * * * *` |
| Outlooks | Twice daily | `0 6,18 * * *` |
| Images | Every 30 min | `*/30 * * * *` |

### Create Main Pipeline Script

Create `~/basinwx-pipeline/fetch_and_upload.py`:

```python
#!/usr/bin/env python3
"""
Main data pipeline: Fetch from Synoptic API and upload to BasinWx
"""

import os
import sys
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path

# Add brc-tools to path if needed
sys.path.insert(0, '/path/to/brc-tools')

from brc_tools.synoptic import fetch_stations, fetch_observations

# Configuration
API_KEY = os.environ.get('SYNOPTIC_API_TOKEN')
BASIN_API_KEY = os.environ.get('BASINWX_API_KEY')
OUTPUT_DIR = Path('/tmp/basinwx_data')
OUTPUT_DIR.mkdir(exist_ok=True)

# Station IDs to monitor (Uintah Basin network)
STATION_IDS = [
    'BUNUT', 'REDUT', 'FRUTA', 'MOAB', 'ROOUT',
    # Add your station IDs here
]

def fetch_observations():
    """Fetch latest observations from Synoptic API"""
    print(f"[{datetime.now()}] Fetching observations...")

    # Use your brc-tools functions here
    data = fetch_observations(
        api_token=API_KEY,
        stations=STATION_IDS,
        within_minutes=15
    )

    # Transform to BasinWx format
    observations = []
    for station in data:
        stid = station['stid']
        timestamp = station['timestamp']

        for variable, value in station['observations'].items():
            observations.append({
                'stid': stid,
                'variable': variable,
                'value': value,
                'date_time': timestamp,
                'units': get_units(variable)
            })

    return observations

def get_units(variable):
    """Map variable names to standard units"""
    unit_map = {
        'air_temp': 'Celsius',
        'wind_speed': 'm/s',
        'wind_direction': 'Degrees',
        'relative_humidity': '%',
        'dew_point_temperature': 'Celsius',
        'ozone': 'ppb',
        'pm25': 'µg/m³',
        'snow_depth': 'Millimeters',
        'solar_radiation': 'W/m²',
        'pressure': 'mb',
        'precip_accum': 'Millimeters'
    }
    return unit_map.get(variable, 'unknown')

def fetch_metadata():
    """Fetch station metadata"""
    print(f"[{datetime.now()}] Fetching metadata...")

    # Use your brc-tools functions
    stations = fetch_stations(
        api_token=API_KEY,
        station_ids=STATION_IDS
    )

    # Transform to BasinWx format
    metadata = []
    for station in stations:
        metadata.append({
            'stid': station['stid'],
            'name': station['name'],
            'elevation': station['elevation'],
            'latitude': station['latitude'],
            'longitude': station['longitude']
        })

    return metadata

def save_and_upload(data, data_type):
    """Save data to file and upload using manifest-compliant script"""
    timestamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%MZ')

    if data_type == 'observations':
        filename = f'map_obs_{timestamp}.json'
    elif data_type == 'metadata':
        filename = f'map_obs_meta_{timestamp}.json'
    else:
        filename = f'{data_type}_{timestamp}.json'

    filepath = OUTPUT_DIR / filename

    # Save to file
    with open(filepath, 'w') as f:
        json.dump(data, f, indent=2)

    print(f"Saved {filepath}")

    # Upload using manifest validator
    result = subprocess.run([
        sys.executable,
        'chpc_uploader.py',
        '--data-type', data_type,
        '--file', str(filepath)
    ], capture_output=True, text=True)

    if result.returncode == 0:
        print(f"✓ Successfully uploaded {filename}")
        # Clean up after successful upload
        filepath.unlink()
    else:
        print(f"✗ Upload failed for {filename}")
        print(result.stderr)
        # Keep file for debugging

    return result.returncode == 0

def main():
    """Main pipeline execution"""
    print(f"\n{'='*60}")
    print(f"BasinWx Data Pipeline - {datetime.now()}")
    print(f"{'='*60}\n")

    # Fetch observations
    try:
        observations = fetch_observations()
        print(f"Fetched {len(observations)} observations")
        save_and_upload(observations, 'observations')
    except Exception as e:
        print(f"✗ Error fetching observations: {e}")

    # Fetch metadata (only on scheduled runs)
    hour = datetime.now().hour
    if hour % 6 == 0:  # Every 6 hours
        try:
            metadata = fetch_metadata()
            print(f"Fetched metadata for {len(metadata)} stations")
            save_and_upload(metadata, 'metadata')
        except Exception as e:
            print(f"✗ Error fetching metadata: {e}")

    print(f"\n{'='*60}\n")

if __name__ == '__main__':
    main()
```

Make it executable:
```bash
chmod +x ~/basinwx-pipeline/fetch_and_upload.py
```

### Test the Pipeline Manually

```bash
cd ~/basinwx-pipeline
python fetch_and_upload.py
```

Expected output:
```
============================================================
BasinWx Data Pipeline - 2025-11-03 12:00:00
============================================================

[2025-11-03 12:00:01] Fetching observations...
Fetched 150 observations
Saved /tmp/basinwx_data/map_obs_20251103_1200Z.json
✓ Successfully uploaded map_obs_20251103_1200Z.json

============================================================
```

## Scheduling with Cron

### 1. Edit Crontab

```bash
crontab -e
```

### 2. Add Cron Jobs

```cron
# BasinWx Data Pipeline
# Load environment variables
BASINWX_API_KEY=your-api-key-here
SYNOPTIC_API_TOKEN=your-synoptic-token-here
BASINWX_API_URL=https://basinwx.com

# Observations: Every 10 minutes
*/10 * * * * cd ~/basinwx-pipeline && ./fetch_and_upload.py >> /tmp/basinwx_cron.log 2>&1

# Health check: Every 5 minutes
*/5 * * * * cd ~/basinwx-pipeline && python chpc_uploader.py --health-check >> /tmp/basinwx_health.log 2>&1

# Log rotation: Daily at midnight
0 0 * * * find /tmp/basinwx_*.log -mtime +7 -delete
```

### 3. Verify Cron Jobs

```bash
# List active cron jobs
crontab -l

# Monitor execution
tail -f /tmp/basinwx_cron.log
```

## Monitoring and Troubleshooting

### Check Logs

```bash
# Recent uploads
tail -n 50 /tmp/basinwx_upload.log

# Cron execution
tail -n 50 /tmp/basinwx_cron.log

# Health checks
tail -n 20 /tmp/basinwx_health.log
```

### Common Issues

#### 1. Authentication Failures

**Symptom:** `401 Unauthorized` or `403 Forbidden`

**Solution:**
```bash
# Verify API key is set
echo $BASINWX_API_KEY

# Test health check
python chpc_uploader.py --health-check

# Verify hostname
echo $CHPC_HOSTNAME
hostname -f
```

#### 2. Network Connectivity Issues

**Symptom:** Connection timeouts

**Solution:**
```bash
# Test connectivity
curl -I https://basinwx.com/api/health

# Check firewall rules
# Contact CHPC support if needed
```

#### 3. Data Validation Failures

**Symptom:** Upload fails with validation errors

**Solution:**
```bash
# Validate data locally before upload
python chpc_uploader.py \
  --data-type observations \
  --file /tmp/basinwx_data/map_obs_20251103_1200Z.json \
  --validate-only

# Check manifest for requirements
cat DATA_MANIFEST.json | jq '.dataTypes.observations.schema'
```

#### 4. Missing Dependencies

**Symptom:** Import errors

**Solution:**
```bash
# Activate virtual environment
source ~/basinwx-pipeline/venv/bin/activate

# Reinstall dependencies
pip install -r requirements.txt
```

### Monitor Upload Success Rate

Create a monitoring script `~/basinwx-pipeline/check_status.py`:

```python
#!/usr/bin/env python3
"""Monitor upload success rate"""

import re
from datetime import datetime, timedelta
from pathlib import Path

log_file = Path('/tmp/basinwx_upload.log')

if not log_file.exists():
    print("No log file found")
    exit(0)

# Read last 24 hours of logs
cutoff = datetime.now() - timedelta(hours=24)
success_count = 0
failure_count = 0

with open(log_file) as f:
    for line in f:
        if '✓ Upload successful' in line:
            success_count += 1
        elif '✗ Upload failed' in line:
            failure_count += 1

total = success_count + failure_count
if total > 0:
    success_rate = (success_count / total) * 100
    print(f"Last 24 hours:")
    print(f"  Success: {success_count}")
    print(f"  Failed: {failure_count}")
    print(f"  Success Rate: {success_rate:.1f}%")

    if success_rate < 90:
        print("\n⚠️  WARNING: Success rate below 90%")
        exit(1)
else:
    print("No uploads in last 24 hours")
```

Add to cron:
```cron
# Status report: Daily at 8 AM
0 8 * * * cd ~/basinwx-pipeline && python check_status.py | mail -s "BasinWx Upload Status" your-email@example.com
```

## Updating the Pipeline

### Pull Latest Manifest

```bash
cd ~/basinwx-pipeline
git pull origin main

# Restart cron jobs if manifest changed
crontab -e  # Verify schedule is still correct
```

### Adding New Stations

1. Update `STATION_IDS` in `fetch_and_upload.py`
2. Test with one station first:
```bash
# Temporarily modify script to only include new station
python fetch_and_upload.py
```
3. Verify data appears on website
4. Deploy to all stations

### Adding New Variables

1. Check if variable is in manifest: `cat DATA_MANIFEST.json | jq '.dataTypes.observations.schema.items.properties.variable.enum'`
2. If not listed, coordinate with web team to update manifest
3. Update `get_units()` function with new variable's units
4. Test with validation: `python chpc_uploader.py --validate-only --file test.json --data-type observations`

## Emergency Procedures

### Stop All Uploads

```bash
# Disable cron jobs
crontab -e
# Comment out all BasinWx lines with #

# Or remove entirely
crontab -r
```

### Resume After Outage

```bash
# Re-enable cron jobs
crontab -e
# Uncomment lines

# Force immediate run to catch up
cd ~/basinwx-pipeline
./fetch_and_upload.py
```

### Backfill Historical Data

```bash
# Modify script to fetch historical range
python fetch_and_upload.py --start-date 2025-11-01 --end-date 2025-11-03
```

## Support and Contact

- **Web Team:** Create issue at GitHub repository
- **CHPC Support:** help@chpc.utah.edu
- **Emergency Contact:** [Team lead contact info]

## Checklist for Deployment

- [ ] Python 3.8+ installed
- [ ] Virtual environment created
- [ ] Dependencies installed (`requests`, `jsonschema`)
- [ ] API keys configured in environment
- [ ] Scripts copied and made executable
- [ ] Manual test successful
- [ ] Cron jobs configured
- [ ] Monitoring set up
- [ ] Log rotation enabled
- [ ] Team notified of deployment

## Next Steps

After successful deployment:

1. Monitor logs for first 24 hours
2. Verify data appears on website
3. Check success rate after 1 week
4. Document any custom modifications
5. Share deployment experience with team
