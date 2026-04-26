# BasinWx Cron Setup - 27 Nov 2025

## Issues Found in Code Audit

### 1. submit_clyfar.sh has WRONG paths (lines 66-74)
```bash
# WRONG:
source ~/miniconda3/etc/profile.d/conda.sh
conda activate clyfar-2025
CLYFAR_DIR=~/clyfar

# CORRECT:
source ~/software/pkg/miniforge3/etc/profile.d/conda.sh
conda activate clyfar-nov2025
CLYFAR_DIR=~/gits/clyfar
```

### 2. push_data.py config requirements
Needs two things:
1. **Env var:** `DATA_UPLOAD_API_KEY` (32-char hex)
2. **File:** `~/.config/ubair-website/website_url` containing `https://basinwx.com`

### 3. Server updateFileList() only matches observations
`dataUpload.js` line 14-19 regex only matches `map_obs_*.json` - won't list forecast files!

---

## Corrected Crontab for CHPC

```bash
# ============================================================
# BasinWx Data Pipeline - CHPC Crontab
# Last updated: 27 Nov 2025
# ============================================================

MAILTO=""
SHELL=/bin/bash
HOME=/uufs/chpc.utah.edu/common/home/u0737349

# ------------------------------------------------------------
# OBSERVATIONS - Every 10 minutes
# ------------------------------------------------------------
*/10 * * * * /bin/bash -l -c 'source $HOME/software/pkg/miniforge3/etc/profile.d/conda.sh && conda activate clyfar-nov2025 && python $HOME/gits/brc-tools/brc_tools/download/get_map_obs.py' >> $HOME/logs/obs.log 2>&1

# ------------------------------------------------------------
# CLYFAR FORECASTS - 4x daily (3.5hr after GEFS: 00Z, 06Z, 12Z, 18Z)
# Schedule: 03:30, 09:30, 15:30, 21:30 UTC
# ------------------------------------------------------------
30 3,9,15,21 * * * /bin/bash -l -c 'source $HOME/software/pkg/miniforge3/etc/profile.d/conda.sh && conda activate clyfar-nov2025 && cd $HOME/gits/clyfar && sbatch scripts/submit_clyfar.sh' >> $HOME/logs/clyfar_submit.log 2>&1
```

---

## Pre-Setup Checklist (CHPC)

### 1. Create directories
```bash
mkdir -p ~/logs
mkdir -p ~/.config/ubair-website
```

### 2. Set up config file
```bash
echo "https://basinwx.com" > ~/.config/ubair-website/website_url
cat ~/.config/ubair-website/website_url  # verify
```

### 3. Set environment variable (add to ~/.bashrc)
```bash
echo 'export DATA_UPLOAD_API_KEY="your-32-char-hex-key-here"' >> ~/.bashrc
source ~/.bashrc
echo $DATA_UPLOAD_API_KEY  # verify (should show key)
```

### 4. Fix submit_clyfar.sh paths
```bash
cd ~/gits/clyfar
# Edit scripts/submit_clyfar.sh lines 66, 67, 74
sed -i 's|~/miniconda3|~/software/pkg/miniforge3|g' scripts/submit_clyfar.sh
sed -i 's|clyfar-2025|clyfar-nov2025|g' scripts/submit_clyfar.sh
sed -i 's|CLYFAR_DIR=~/clyfar|CLYFAR_DIR=~/gits/clyfar|g' scripts/submit_clyfar.sh
```

### 5. Pull latest brc-tools (has UBAIR station fix)
```bash
cd ~/gits/brc-tools
git pull origin integration-clyfar-v0.9.5
```

### 6. Test manual runs
```bash
# Test observations
source ~/software/pkg/miniforge3/etc/profile.d/conda.sh
conda activate clyfar-nov2025
python ~/gits/brc-tools/brc_tools/download/get_map_obs.py

# Check upload success
tail -20 ~/logs/obs.log
```

### 7. Install crontab
```bash
crontab -e
# Paste the corrected crontab above
crontab -l  # verify
```

---

## Pre-Setup Checklist (Akamai/Web Server)

### 1. Pull latest ops branch
```bash
cd /path/to/ubair-website
git pull origin ops
```

### 2. Verify environment
```bash
echo $DATA_UPLOAD_API_KEY  # should be set
```

### 3. Restart Node.js
```bash
pm2 restart all  # or your restart method
```

---

## Verification Commands

### Check cron is firing (CHPC)
```bash
# Add test entry temporarily
echo "*/1 * * * * echo \"\$(date): cron test\" >> \$HOME/logs/cron_test.log" | crontab -

# Wait 2 minutes, then check
cat ~/logs/cron_test.log

# Remove test entry
crontab -e  # delete the test line
```

### Check observations uploaded (anywhere)
```bash
curl -s https://basinwx.com/api/filelist/observations | python3 -c "
import json,sys
files = sorted(json.load(sys.stdin))
print(f'Total files: {len(files)}')
print(f'Latest: {files[-1] if files else \"NONE\"}')"
```

### Check ozone stations in data (anywhere)
```bash
LATEST=$(curl -s https://basinwx.com/api/filelist/observations | python3 -c "import json,sys; print(sorted(json.load(sys.stdin))[-1])")
curl -s "https://basinwx.com/api/static/observations/$LATEST" | python3 -c "
import json,sys
d=json.load(sys.stdin)
ozones=[r for r in d if r.get('variable')=='ozone_concentration']
print(f'Ozone records: {len(ozones)}')
for o in ozones: print(f'  {o[\"stid\"]}: {o[\"value\"]} ppb')"
```

---

## Known Issues to Fix Later

1. **Server `/api/live-observations` endpoint** - Returns "No files found" even when files exist. Bug in sorting/filtering logic in `server.js`.

2. **File cleanup** - 500+ old observation files accumulating. Need cleanup script.

3. **Clyfar GEFS delay handling** - `submit_clyfar.sh` should add retry logic if GEFS data not yet available.

---

## Quick Reference: Data Flow

```
CHPC (cron every 10 min)
    │
    ▼
get_map_obs.py
    │ - Pulls from Synoptic API
    │ - Saves to ~/gits/brc-tools/data/
    │
    ▼
push_data.py
    │ - Reads DATA_UPLOAD_API_KEY env var
    │ - Reads URL from ~/.config/ubair-website/website_url
    │ - POST to /api/upload/observations
    │
    ▼
Akamai (dataUpload.js)
    │ - Validates API key
    │ - Validates CHPC hostname
    │ - Saves to /public/api/static/observations/
    │ - Updates filelist.json
    │
    ▼
Frontend (api.js)
    - Fetches /api/filelist/observations
    - Fetches latest file
    - Renders on map
```
