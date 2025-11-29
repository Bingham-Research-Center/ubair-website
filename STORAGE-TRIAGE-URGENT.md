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

## TODO Before Operations Begin

- [ ] Run quota check, identify largest directories
- [ ] Delete safe regenerable data (figures, exports, old logs)
- [ ] Migrate Herbie cache to scratch (biggest win)
- [ ] Update `submit_clyfar.sh` to use scratch paths
- [ ] Test Clyfar run with new paths
- [ ] Verify SLURM bin path is correct
- [ ] Set up automated cleanup cron (delete files >7 days in scratch)

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
