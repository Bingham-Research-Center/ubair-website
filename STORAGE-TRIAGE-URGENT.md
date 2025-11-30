# STORAGE TRIAGE - URGENT

**Priority:** Must resolve before automated Clyfar operations begin.

---

## Immediate Diagnosis

Run on CHPC:

```bash
# Check quota status
myquota

# Find space usage by directory
du -sh ~/* 2>/dev/null | sort -hr | head -20

# Check specific likely culprits
du -sh ~/basinwx-data ~/gits ~/software ~/logs ~/.cache ~/.local 2>/dev/null

# Herbie GEFS cache (often the biggest)
du -sh ~/.cache/herbie
```

---

## Safe to Delete (Regenerates Automatically)

| Path | Size? | Notes |
|------|-------|-------|
| `~/.cache/herbie/*` | **Large** | GEFS cache, re-downloads as needed |
| `~/basinwx-data/clyfar/figures/*` | Medium | PNGs regenerate each run, uploaded to website |
| `~/basinwx-data/clyfar/basinwx_export/*` | Medium | JSONs regenerate, already on website |
| `~/logs/basinwx/*.out` (>7 days) | Small | Old SLURM job logs |
| `~/logs/basinwx/*.err` (>7 days) | Small | Old SLURM error logs |

**Quick cleanup:**
```bash
# Preview sizes first
du -sh ~/.cache/herbie ~/basinwx-data/clyfar/figures ~/basinwx-data/clyfar/basinwx_export

# Delete regenerable data
rm -rf ~/.cache/herbie/*
rm -rf ~/basinwx-data/clyfar/figures/*
rm -rf ~/basinwx-data/clyfar/basinwx_export/*
find ~/logs -name "*.out" -mtime +7 -delete
find ~/logs -name "*.err" -mtime +7 -delete
```

---

## Caution - Review Before Deleting

| Path | Notes |
|------|-------|
| `~/basinwx-data/clyfar/dailymax/*.parquet` | Keep latest run; archive or delete older runs |
| `~/basinwx-data/clyfar/*.parquet` | Model output - may want to archive |
| `~/software/pkg/miniforge3/` | Conda install - large but needed |

---

## Long-Term Solution: Move to Scratch/Group Storage

### CHPC Storage Options

| Type | Path | Characteristics |
|------|------|-----------------|
| **Home** | `/uufs/chpc.utah.edu/common/home/u0737349` | 50GB quota, backed up, persistent |
| **Scratch** | `/scratch/general/vast/u0737349` | Large, fast, auto-purged after ~60 days unused |
| **Group** | `/uufs/chpc.utah.edu/common/home/bingham-group/` | Shared, if allocation exists |

### Recommended Layout

```
# HOME (~50GB) - code, configs, small persistent data
~/gits/clyfar/                    # Code repo
~/gits/brc-tools/                 # Code repo
~/.bashrc_basinwx                 # API credentials
~/.config/ubair-website/          # Config files
~/logs/                           # Keep recent logs only

# SCRATCH (large) - regenerable data, caches
/scratch/general/vast/u0737349/
├── herbie_cache/                 # GEFS downloads (symlink ~/.cache/herbie here)
├── clyfar_output/                # Daily model output
│   ├── figures/
│   ├── basinwx_export/
│   └── dailymax/
└── archive/                      # Older runs if needed
```

### Migration Commands

```bash
# Create scratch structure
SCRATCH=/scratch/general/vast/u0737349
mkdir -p $SCRATCH/herbie_cache $SCRATCH/clyfar_output/{figures,basinwx_export,dailymax}

# Move Herbie cache to scratch (big win)
mv ~/.cache/herbie/* $SCRATCH/herbie_cache/
rmdir ~/.cache/herbie
ln -s $SCRATCH/herbie_cache ~/.cache/herbie

# Update clyfar paths (in submit_clyfar.sh or as env vars)
export CLYFAR_DATA_ROOT=$SCRATCH/clyfar_output
export CLYFAR_FIG_ROOT=$SCRATCH/clyfar_output/figures
```

---

## CHPC Resource Inventory

### User Account
- **Username:** u0737349
- **Home:** `/uufs/chpc.utah.edu/common/home/u0737349`
- **Scratch:** `/scratch/general/vast/u0737349`

### Repository Locations
- **clyfar:** `~/gits/clyfar`
- **brc-tools:** `~/gits/brc-tools`

### Data Directories
- **Clyfar output:** `~/basinwx-data/clyfar/`
- **Figures:** `~/basinwx-data/clyfar/figures/`
- **JSON exports:** `~/basinwx-data/clyfar/basinwx_export/`
- **Logs:** `~/logs/basinwx/`

### Conda Environment
- **Miniforge:** `~/software/pkg/miniforge3`
- **Environment:** `clyfar-nov2025`

### Credentials (stored in ~/.bashrc_basinwx)
- `DATA_UPLOAD_API_KEY` - BasinWx upload authentication
- `BASINWX_API_URL` - Target server URL
- `SYNOPTIC_API_TOKEN` - Weather data API (if used)

### Compute Resources
- **Partition:** `notchpeak-shared-short`
- **Account:** `notchpeak-shared-short`
- **Typical job:** 16 CPUs, 32GB RAM, 2hr limit

### SLURM Path (for cron)
- `/uufs/notchpeak.peaks/sys/installdir/slurm/std/bin`
- Verify with: `which sbatch` on compute node

---

## Data Archival Strategy

### Tier 1: Archive (Small, Valuable, Keep)

| Data | Location | Why Keep |
|------|----------|----------|
| UB-cropped GEFS (parquet) | `~/basinwx-data/clyfar/*.parquet` | Hours of processing, small after crop |
| Clyfar dailymax | `~/basinwx-data/clyfar/dailymax/` | Model output, basis for evaluation |
| JSON exports | `~/basinwx-data/clyfar/basinwx_export/` | Tiny, website has backup |
| Geography files | `~/gits/clyfar/data/geog/` | Masks, elevations - annoying to regenerate |
| Run logs (recent) | `~/logs/basinwx/` | Debugging, provenance |

### Tier 2: Regenerable (Delete, Re-download as Needed)

| Data | Why Not Archive |
|------|-----------------|
| Raw GEFS grib2 files | Huge, available from NOAA/AWS forever |
| Herbie cache | Re-downloads automatically |
| Pre-crop NWP grids | Intermediate, regenerates from raw |
| PNG figures | Regenerate from parquet in seconds |

### Archive Destinations

```bash
# Option 1: CHPC group storage (if BRC has allocation)
/uufs/chpc.utah.edu/common/home/bingham-group/clyfar-archive/

# Option 2: CHPC Research Data Archive (long-term, request access)
# https://www.chpc.utah.edu/resources/data_services.php

# Option 3: Cloud via rclone (Box, Google Drive)
rclone copy ~/basinwx-data/clyfar/dailymax remote:clyfar-archive/dailymax/
```

### Suggested Archive Structure

```
clyfar-archive/
├── 2025-11/
│   ├── dailymax/           # All parquet files
│   ├── ub_gefs_subset/     # Cropped GEFS if saved separately
│   └── run_logs/           # SLURM logs for provenance
├── 2025-12/
│   └── ...
└── geography/
    ├── masks/              # UB basin masks
    └── elevations/         # Terrain data
```

### Archive Commands

```bash
# Create archive structure
ARCHIVE=/uufs/chpc.utah.edu/common/home/bingham-group/clyfar-archive
mkdir -p $ARCHIVE/$(date +%Y-%m)/{dailymax,run_logs}
mkdir -p $ARCHIVE/geography

# Archive dailymax parquet (keep these!)
cp -r ~/basinwx-data/clyfar/dailymax/* $ARCHIVE/$(date +%Y-%m)/dailymax/

# Archive geography (one-time)
cp -r ~/gits/clyfar/data/geog/* $ARCHIVE/geography/

# Archive recent logs
cp ~/logs/basinwx/clyfar_*.out $ARCHIVE/$(date +%Y-%m)/run_logs/
```

### What Users Must Re-download Themselves

If someone needs raw GEFS data for reprocessing:

```python
from herbie import Herbie
H = Herbie("2025-01-15 00:00", model="gefs", product="atmos.5")
H.download()  # Downloads from NOAA/AWS
```

Raw GEFS is always available from:
- AWS: `s3://noaa-gefs-pds/`
- NOAA: `https://nomads.ncep.noaa.gov/`

---

## TODO Before Operations Begin

- [ ] Run quota check, identify largest directories
- [ ] Delete safe regenerable data (figures, exports, old logs)
- [ ] Migrate Herbie cache to scratch (biggest win)
- [ ] Update `submit_clyfar.sh` to use scratch paths
- [ ] Test Clyfar run with new paths
- [ ] Verify SLURM bin path is correct
- [ ] Set up automated cleanup cron (delete files >7 days in scratch)

---

## Storage Monitoring & Alerts

### Known GEFS Cache Locations (Check All)

Stray GEFS data can accumulate in multiple places from testing/old scripts:

```bash
# Scan for all potential GEFS caches
du -sh ~/data/gefs* 2>/dev/null
du -sh ~/gits/clyfar/data/herbie_cache 2>/dev/null
du -sh ~/.cache/herbie 2>/dev/null
du -sh ~/basinwx-data/*/gefs* 2>/dev/null
du -sh /scratch/general/vast/$USER/*gefs* 2>/dev/null

# Find any .grib2 files (raw GEFS)
find ~ -name "*.grib2" -type f 2>/dev/null | head -20
find ~ -name "*.grb2" -type f 2>/dev/null | head -20
```

**Issue found 29 Nov 2025:** `~/data/gefs...` contained ~2TB of old training data - deleted.

### Quota Monitoring Script

Add to crontab for daily alerts:

```bash
# Check quota daily at 6am, email if >80% full
0 6 * * * /uufs/chpc.utah.edu/common/home/u0737349/scripts/check_quota.sh
```

Create `~/scripts/check_quota.sh`:
```bash
#!/bin/bash
USAGE=$(df -h ~ | awk 'NR==2 {gsub(/%/,""); print $5}')
if [ "$USAGE" -gt 80 ]; then
    echo "WARNING: Home directory at ${USAGE}% capacity" | mail -s "CHPC Quota Alert" your@email.edu
fi
```

### What Gets Saved Where (Clyfar Pipeline)

| Data | Location | Size | Keep? |
|------|----------|------|-------|
| Raw GEFS grib2 | `herbie_cache/` or `~/data/gefs*/` | **HUGE** | NO - delete |
| UB-cropped processed | `~/basinwx-data/clyfar/dailymax/` | ~20MB/run | YES |
| PNG figures | `~/basinwx-data/clyfar/figures/` | ~50MB/run | Regenerable |
| JSON exports | `~/basinwx-data/clyfar/basinwx_export/` | ~5MB/run | On website |
| Geography masks | `~/gits/clyfar/data/geog/` | ~10MB | YES (one-time) |

### Edge Cases to Watch

1. **Old test scripts** may hardcode paths like `~/data/` - grep for these
2. **Herbie default cache** at `~/.cache/herbie` if env var not set
3. **Conda pkgs cache** at `~/software/pkg/miniforge3/pkgs/` - run `conda clean --all` monthly
4. **Jupyter checkpoints** - `.ipynb_checkpoints/` scattered around

---

## Automated Cleanup Cron (Future)

Add to crontab after migration:
```bash
# Clean old Clyfar outputs daily at 01:00 MST (keep last 3 days)
0 1 * * * find /scratch/general/vast/u0737349/clyfar_output/figures -mtime +3 -delete
0 1 * * * find /scratch/general/vast/u0737349/clyfar_output/basinwx_export -mtime +3 -delete
```

---

*Created: 29 Nov 2025*
*Priority: Resolve before Dec 1 operational launch*
