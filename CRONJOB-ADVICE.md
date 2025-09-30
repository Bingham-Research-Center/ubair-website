# Cron Job & SLURM Guide for CHPC Data Pipeline

## Understanding the Task

You need to **automatically run your brc-tools data processing scripts** on CHPC at regular intervals (every 15-30 minutes), then **upload the results to your website**.

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
export BASINWX_API_KEY="your_api_key_here"

# Change to project directory
cd /uufs/chpc.utah.edu/common/home/your-username/brc-tools

# Activate your conda environment
source activate your-brc-tools-env

# Run data processing
echo "$(date): Starting data processing..."
python fetch_synoptic_data.py
python process_observations.py

# Upload to website
echo "$(date): Uploading to website..."
python upload_to_website.py --data-type observations --file ./output/map_obs_$(date +%Y%m%d_%H%M)Z.json
python upload_to_website.py --data-type metadata --file ./output/map_obs_meta_$(date +%Y%m%d_%H%M)Z.json

echo "$(date): Pipeline complete!"
```

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
#SBATCH --account=your-account-name        # Your CHPC account
#SBATCH --partition=notchpeak-shared-short # Or appropriate partition
#SBATCH --time=00:30:00                    # 30 minutes max
#SBATCH --nodes=1
#SBATCH --ntasks=1
#SBATCH --cpus-per-task=2
#SBATCH --mem=4GB
#SBATCH --output=/uufs/chpc.utah.edu/common/home/your-username/logs/basinwx-%j.out
#SBATCH --error=/uufs/chpc.utah.edu/common/home/your-username/logs/basinwx-%j.err

# Load modules
module load miniconda3/latest

# Set environment variables
export BASINWX_API_KEY="your_api_key_here"
export PYTHONPATH="/uufs/chpc.utah.edu/common/home/your-username/brc-tools:$PYTHONPATH"

# Change to working directory
cd /uufs/chpc.utah.edu/common/home/your-username/brc-tools

# Activate conda environment
source activate brc-tools-env

# Run the pipeline
echo "Starting pipeline at $(date)"

# Step 1: Fetch latest weather data
python scripts/fetch_synoptic_data.py --config config/production.yml

# Step 2: Process into website format
python scripts/process_observations.py --output-dir ./output/

# Step 3: Upload to website
TIMESTAMP=$(date +%Y%m%d_%H%M)
python scripts/upload_to_website.py \
    --endpoint https://basinwx.com/api/upload/observations \
    --file "./output/map_obs_${TIMESTAMP}Z.json" \
    --api-key "$BASINWX_API_KEY"

python scripts/upload_to_website.py \
    --endpoint https://basinwx.com/api/upload/metadata \
    --file "./output/map_obs_meta_${TIMESTAMP}Z.json" \
    --api-key "$BASINWX_API_KEY"

echo "Pipeline completed at $(date)"
```

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

### 1. Test Your Pipeline Manually First:
```bash
# SSH to CHPC
ssh your-username@notchpeak.chpc.utah.edu

# Run your pipeline once manually to debug
cd /path/to/brc-tools
python your_processing_script.py

# Verify output files are created correctly
ls -la output/
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

## Common Gotchas & Solutions

### Problem: "Command not found" errors
**Solution**: Load modules and set PATH properly in your script
```bash
module load miniconda3/latest
source activate your-env
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