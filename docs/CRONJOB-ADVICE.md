# Cron Job & SLURM Guide for CHPC Data Pipeline

## Understanding the Task

You need to **automatically run your brc-tools data processing scripts** on CHPC at regular intervals (every 15-30 minutes), then **upload the results to basinwx.com**.

The main script is `brc_tools/download/get_map_obs.py` which:
1. Downloads latest observations from Synoptic Weather API
2. Downloads station metadata
3. Processes data into JSON format with units
4. Uploads to your website via POST to `/api/upload/:dataType`

## Two Approaches on CHPC

### Approach 1: Traditional Cron Jobs (Simpler)
Good for: Lightweight scripts, short-running tasks, always-available compute nodes

### Approach 2: SLURM Scheduled Jobs (HPC Standard)
Good for: Resource-intensive processing, queue management, production HPC environments

---

## Option 1: Traditional Cron Jobs

### Basic Setup:
```bash
# On CHPC login node or dedicated compute node:
crontab -e

# Add entries like this:
# Minute Hour Day Month DayOfWeek Command
*/15 * * * * cd /uufs/chpc.utah.edu/common/home/your-username/brc-tools && ./run_pipeline.sh >> /var/log/basinwx.log 2>&1
```

### Example Pipeline Script (`run_pipeline.sh`):
```bash
#!/bin/bash
set -e  # Exit on any error

# Set environment
export PATH="/uufs/chpc.utah.edu/sys/installdir/anaconda3/bin:$PATH"

# Load environment variables from .env file
export DATA_UPLOAD_API_KEY="your_32_char_hex_api_key"
export SYNOPTIC_API_KEY="your_synoptic_api_key"

# Change to project directory
cd /uufs/chpc.utah.edu/common/home/your-username/brc-tools

# Activate your conda environment
source activate brc-tools-env

# Ensure website URL config exists
mkdir -p ~/.config/ubair-website
echo "https://basinwx.com" > ~/.config/ubair-website/website_url

# Run the main data pipeline script
echo "$(date): Starting data pipeline..."
python -m brc_tools.download.get_map_obs

echo "$(date): Pipeline complete!"
```

**Note**: The `get_map_obs.py` script handles:
- Downloading data from Synoptic API
- Processing into JSON format (with units preserved)
- Uploading to website (both observations and metadata)

### Cron Schedule Examples:
```bash
# Every 15 minutes
*/15 * * * * /path/to/run_pipeline.sh

# Every 30 minutes
*/30 * * * * /path/to/run_pipeline.sh

# Every hour at minute 5
5 * * * * /path/to/run_pipeline.sh

# Every 4 hours during business hours
0 8,12,16,20 * * * /path/to/run_pipeline.sh
```

---

## Option 2: SLURM Scheduled Jobs (Recommended for CHPC)

### Why Use SLURM Instead of Cron?
- **Resource Management**: Guarantees CPU/memory for your job
- **Queue System**: Won't fail if compute nodes are busy
- **Better Logging**: Built-in job output capture
- **Scalability**: Can request more resources when needed
- **HPC Standard**: What CHPC is designed for

### SLURM Job Script (`basinwx_pipeline.sh`):
```bash
#!/bin/bash
#SBATCH --job-name=basinwx-pipeline
#SBATCH --account=your-account-name        # Your CHPC account (e.g., owner-guest)
#SBATCH --partition=notchpeak-shared-short # Or kingspeak-shared-short
#SBATCH --time=00:15:00                    # 15 minutes should be plenty
#SBATCH --nodes=1
#SBATCH --ntasks=1
#SBATCH --cpus-per-task=2
#SBATCH --mem=2GB                          # 2GB is enough for this task
#SBATCH --output=/uufs/chpc.utah.edu/common/home/your-username/logs/basinwx-%j.out
#SBATCH --error=/uufs/chpc.utah.edu/common/home/your-username/logs/basinwx-%j.err

# Load modules
module load miniconda3/latest

# Set environment variables (use your actual keys)
export DATA_UPLOAD_API_KEY="your_32_char_hex_api_key"
export SYNOPTIC_API_KEY="your_synoptic_api_key"

# Ensure website URL config exists
mkdir -p ~/.config/ubair-website
echo "https://basinwx.com" > ~/.config/ubair-website/website_url

# Change to working directory
cd /uufs/chpc.utah.edu/common/home/your-username/brc-tools

# Activate conda environment
source activate brc-tools-env

# Run the pipeline
echo "Starting pipeline at $(date)"

# This single script handles everything:
# 1. Downloads from Synoptic API
# 2. Processes observations and metadata
# 3. Uploads both JSON files to website
python -m brc_tools.download.get_map_obs

echo "Pipeline completed at $(date)"
```

**Key Points**:
- `get_map_obs.py` does all three steps automatically
- Data saved to `../../data/` relative to script location
- Uploads use hostname verification (must be from chpc.utah.edu)
- API key must be exactly 32 characters (hex format)

### Scheduling SLURM Jobs with Cron:
```bash
# Edit crontab to submit SLURM jobs:
crontab -e

# Submit SLURM job every 15 minutes
*/15 * * * * cd /uufs/chpc.utah.edu/common/home/your-username/brc-tools && sbatch basinwx_pipeline.sh

# Or use a wrapper script that checks if job is already running:
*/15 * * * * /uufs/chpc.utah.edu/common/home/your-username/brc-tools/submit_if_not_running.sh
```

### Smart Job Submission Script (`submit_if_not_running.sh`):
```bash
#!/bin/bash

# Check if job is already in queue
if squeue -u $USER --name=basinwx-pipeline | grep -q basinwx-pipeline; then
    echo "$(date): Job already running or queued, skipping..."
    exit 0
fi

# Submit new job
echo "$(date): Submitting new pipeline job..."
cd /uufs/chpc.utah.edu/common/home/your-username/brc-tools
sbatch basinwx_pipeline.sh
```

---

## Choosing the Right Approach

### Use **Traditional Cron** If:
- Your scripts run in <5 minutes
- You have dedicated compute access
- Simple data fetching/processing
- Low resource requirements

### Use **SLURM** If:
- Processing takes >5 minutes
- You need guaranteed resources
- Working with large datasets
- Running on shared CHPC infrastructure (recommended)

---

## Practical Setup Steps

### 0. Prerequisites on CHPC:
```bash
# SSH to CHPC
ssh your-username@notchpeak.chpc.utah.edu

# Clone brc-tools repository
cd /uufs/chpc.utah.edu/common/home/your-username
git clone <brc-tools-repo-url>
cd brc-tools

# Create conda environment
module load miniconda3/latest
conda create -n brc-tools-env python=3.11
conda activate brc-tools-env

# Install dependencies
pip install -r requirements.txt

# Set up configuration directory
mkdir -p ~/.config/ubair-website
echo "https://basinwx.com" > ~/.config/ubair-website/website_url

# Set environment variables (add these to your ~/.bashrc for persistence)
export DATA_UPLOAD_API_KEY="your_32_char_hex_key"
export SYNOPTIC_API_KEY="your_synoptic_key"
```

### 1. Test Your Pipeline Manually First:
```bash
# Navigate to brc-tools
cd /uufs/chpc.utah.edu/common/home/your-username/brc-tools

# Activate environment
conda activate brc-tools-env

# Run the script once manually
python -m brc_tools.download.get_map_obs

# Verify output files in data directory
ls -la data/
# Should see: map_obs_YYYYMMDD_HHMMZ.json and map_obs_meta_YYYYMMDD_HHMMZ.json

# Check if upload succeeded by visiting:
# https://basinwx.com/api/filelist.json
```

### 2. Create the SLURM Script:
```bash
# Copy the template above
nano basinwx_pipeline.sh

# Customize paths, account names, resource requirements
# Test: sbatch basinwx_pipeline.sh
```

### 3. Set Up Logging Directory:
```bash
mkdir -p /uufs/chpc.utah.edu/common/home/your-username/logs
```

### 4. Add to Cron:
```bash
crontab -e
# Add your schedule line
```

### 5. Monitor for a Few Cycles:
```bash
# Watch job queue
squeue -u $USER

# Check logs
tail -f logs/basinwx-*.out

# Verify uploads on website
curl https://basinwx.com/api/filelist.json
```

---

## Important: Data Format & Recent Changes

### JSON Structure (as of October 2025)
The data pipeline now **preserves units dynamically** from Synoptic API:

```json
[
  {
    "stid": "BUNUT",
    "variable": "air_temp",
    "value": 15.2,
    "date_time": "2025-10-01T14:00:00.000Z",
    "units": "Celsius"
  },
  {
    "stid": "BUNUT",
    "variable": "snow_depth",
    "value": 0.0,
    "date_time": "2025-10-01T14:00:00.000Z",
    "units": "Millimeters"
  }
]
```

**Key Features**:
- Units are extracted from JSON and displayed dynamically on website
- Snow Depth now included in priority variables (value of 0 is treated as valid data)
- Wind Direction automatically converted to cardinal directions (N, NNE, etc.)
- Stations without ozone data display as gray markers

### Environment Variables Required
```bash
# REQUIRED for get_map_obs.py:
DATA_UPLOAD_API_KEY=<32-char hex key from website>
SYNOPTIC_API_KEY=<your synoptic token>

# REQUIRED config file:
~/.config/ubair-website/website_url
# Contains: https://basinwx.com
```

---

## Common Gotchas & Solutions

### Problem: "DATA_UPLOAD_API_KEY environment variable not set"
**Solution**: Export the key in your script or add to ~/.bashrc
```bash
export DATA_UPLOAD_API_KEY="your_32_char_hex_key"
```

### Problem: "Website URL file not found"
**Solution**: Create the config directory and file:
```bash
mkdir -p ~/.config/ubair-website
echo "https://basinwx.com" > ~/.config/ubair-website/website_url
```

### Problem: "Command not found" errors
**Solution**: Load modules and set PATH properly in your script
```bash
module load miniconda3/latest
conda activate brc-tools-env
```

### Problem: Jobs pile up in queue
**Solution**: Use the "submit_if_not_running" wrapper script

### Problem: Network access denied
**Solution**: Make sure you're running on compute nodes with external access:
```bash
#SBATCH --partition=notchpeak-shared-short  # Has internet access
```

### Problem: API uploads fail intermittently
**Solution**: Add retry logic:
```python
import time
import requests

def upload_with_retry(url, files, headers, max_retries=3):
    for attempt in range(max_retries):
        try:
            response = requests.post(url, files=files, headers=headers, timeout=30)
            if response.status_code == 200:
                return True
        except:
            time.sleep(2 ** attempt)  # Exponential backoff
    return False
```

### Problem: File permissions
**Solution**: Make scripts executable:
```bash
chmod +x run_pipeline.sh
chmod +x basinwx_pipeline.sh
```

---

## Monitoring Your Pipeline

### Check Job Status:
```bash
# See running/queued jobs
squeue -u $USER

# See recent job history
sacct --starttime=$(date -d '1 day ago' +%Y-%m-%d) --user=$USER
```

### Check Website Data Freshness:
```bash
# Quick test from CHPC
curl -s https://basinwx.com/api/filelist.json | jq '.'

# Check timestamps
curl -s https://basinwx.com/api/live-observations | jq '.timestamp'
```

### Log Analysis:
```bash
# Find failed uploads
grep -i "error\|failed" logs/basinwx-*.out

# Check success rate
grep -c "Pipeline completed" logs/basinwx-*.out
```

---

## Recommended Schedule for Weather Data

```bash
# Every 15 minutes (aggressive, good for development)
*/15 * * * * sbatch basinwx_pipeline.sh

# Every 30 minutes (recommended for production)
*/30 * * * * sbatch basinwx_pipeline.sh

# Every hour at :05 (conservative, less server load)
5 * * * * sbatch basinwx_pipeline.sh
```

Weather data typically updates every 15-60 minutes, so matching that frequency makes sense.

The key is: **Start with SLURM approach on CHPC** - it's more robust and follows HPC best practices!

---

## Quick Reference: File Locations & Key Commands

### Important Files in brc-tools:
```
brc_tools/download/get_map_obs.py    # Main pipeline script
brc_tools/download/push_data.py      # Upload functions
brc_tools/utils/lookups.py           # Station IDs and variable mappings
data/                                 # Output directory for JSON files
```

### Key Commands Cheat Sheet:
```bash
# Manual run (for testing)
python -m brc_tools.download.get_map_obs

# Submit SLURM job
sbatch basinwx_pipeline.sh

# Check job status
squeue -u $USER

# View job output (replace JOBID with actual number)
tail -f logs/basinwx-JOBID.out

# Cancel a job
scancel JOBID

# Check website data freshness
curl https://basinwx.com/api/filelist.json | python -m json.tool

# View latest observations on website
curl https://basinwx.com/api/live-observations | python -m json.tool | head -50
```

### API Upload Endpoint:
- **URL**: `https://basinwx.com/api/upload/:dataType`
- **Method**: POST
- **Headers**:
  - `x-api-key`: Your 32-character API key
  - `x-client-hostname`: Automatically set by push_data.py
- **Data Types**:
  - `observations` → saves to `/api/static/observations/`
  - `metadata` → saves to `/api/static/metadata/`

### Website Display Variables (Priority Order):
1. Ozone (ppb)
2. PM2.5 (µg/m³)
3. PM10 (µg/m³)
4. NOx (ppb)
5. NO (ppb)
6. NO2 (ppb)
7. Temperature (Celsius)
8. Wind Speed (m/s)
9. Wind Direction (cardinal: N, NNE, NE...)
10. Snow Depth (Millimeters)

**Marker Colors**:
- **Green**: Ozone < 50 ppb
- **Orange**: Ozone 50-70 ppb
- **Red**: Ozone ≥ 70 ppb
- **Gray**: No ozone data available