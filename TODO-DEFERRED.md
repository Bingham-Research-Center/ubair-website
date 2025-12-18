# Deferred Items - Clyfar Integration

*Compiled from session handoffs 23-29 Nov 2025*

---

## High Priority (Pre-Dec-1 Launch)

### 1. Storage Migration to Scratch
**Source:** STORAGE-TRIAGE-URGENT.md
**Why:** Home quota ~50GB, Herbie cache can exceed this

```bash
SCRATCH=/scratch/general/vast/u0737349
mkdir -p $SCRATCH/herbie_cache $SCRATCH/clyfar_output/{figures,basinwx_export,dailymax}
mv ~/.cache/herbie/* $SCRATCH/herbie_cache/
ln -s $SCRATCH/herbie_cache ~/.cache/herbie
# Then update submit_clyfar.sh with new paths
```

### 2. Quota Monitoring Cron
**Source:** STORAGE-TRIAGE-URGENT.md
**Why:** Prevent silent failures from full disk

```bash
# Create ~/scripts/check_quota.sh
# Add cron: 0 6 * * * ~/scripts/check_quota.sh
# Alert at 80% capacity
```

### 3. HerbieWait Retry Logic
**Source:** 29NOV handoff
**Why:** If GEFS unavailable at cron time, job fails silently
**File:** `clyfar/run_gefs_clyfar.py` (HerbieWait commented out)

---

## Medium Priority (Post-Launch)

### 4. DATA_MANIFEST.json Schema
**Source:** 23NOV session
**Why:** Frontend needs to know forecast data structure
**File:** `ubair-website/public/api/DATA_MANIFEST.json`

### 5. Production Monitoring
**Source:** 23NOV session
**Why:** Automated check that pipeline succeeds daily
**Implement:** Cron that checks `/api/filelist/forecasts` has recent files

### 6. Three-Tier Forecast Display
**Source:** 29NOV handoff Priority 3
**Files:** `views/forecast_air_quality.html`, `public/js/forecast_air_quality.js`

| Tier | Content | UI |
|------|---------|-----|
| Simple | 10th-90th percentile ppb + alert | Dropdown |
| Middle | Probability of exceedance | Table |
| Full | Heatmap PNG per member | Dropdown selector |

### 7. Herbie Bbox Optimization
**Source:** 29NOV handoff Priority 2
**Why:** Currently downloads CONUS then crops to UB
**Check:** Does Herbie support `subset` or `bbox` parameter?

---

## Low Priority (Tech Debt)

### 8. Herbie Wrapper Refactor
**Source:** 25NOV handoff
**Why:** Over-engineered, bandaids applied
**Files:** `nwp/gefsdata.py`, `nwp/download_funcs.py`
**Remove:** `_build_pressure_backend_kwargs()`, custom index paths

### 9. Two Parquet Locations
**Source:** 28NOV session
**Why:** `data/` and `data/geog/` both used - confusing
**Action:** Consolidate to single location

### 10. DEPRECATED.md Cleanup List
**Source:** 23NOV session
**Why:** Identify files to remove from repos

### 11. Team Onboarding SOP
**Source:** 23NOV session
**Why:** Docs scattered across repos
**Action:** Single onboarding guide pointing to canonical docs

---

## Performance Investigation

**Source:** 29NOV handoff Priority 2
**Current config:** 16 CPUs, 32GB RAM, 2hr limit

### Check actual usage:
```bash
sacct -j JOBID --format=JobID,MaxRSS,MaxVMSize,CPUTime,Elapsed,State
```

### Areas to investigate:
1. **SLURM tuning** - Are we using allocated resources?
2. **Parallelization** - `mp.set_start_method('spawn')` vs `fork`
3. **I/O** - Scratch faster than home
4. **Early subset** - Download UB bbox only, not CONUS

---

## Quick Reference

### Key Files
| Item | Location |
|------|----------|
| SLURM script | `clyfar/scripts/submit_clyfar.sh` |
| Main runner | `clyfar/run_gefs_clyfar.py` |
| Storage docs | `ubair-website/STORAGE-TRIAGE-URGENT.md` |
| Cron reference | `ubair-website/HANDOFF-CLAUDE-SESSION-29NOV2025.md` |

### CHPC Paths
| What | Where |
|------|-------|
| Clyfar repo | `~/gits/clyfar` |
| Output data | `~/basinwx-data/clyfar/` |
| Logs | `~/logs/basinwx/` |
| Scratch | `/scratch/general/vast/u0737349` |

---

*Last updated: 29 Nov 2025*
