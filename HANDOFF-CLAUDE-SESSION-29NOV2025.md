# Session Handoff: 29 November 2025

## Session Summary

Major bug fixes and infrastructure work completed. PNG uploads now working, JSON NaN issue fixed, Coming Soon UI deployed, 2TB storage freed on CHPC.

---

## Accomplishments ✅

| Task | Details |
|------|---------|
| **PNG Upload Fix** | `express.json({ type: 'application/json' })` - was parsing binary as JSON |
| **JSON NaN Fix** | Added `_sanitize_for_json()` to `clyfar/export/to_basinwx.py` |
| **Coming Soon UI** | Sidebar folder with `fa-flask`, overlay text moved to top |
| **Storage Triage** | Found/deleted 2TB old GEFS in `~/data/gefs...`, documented in `STORAGE-TRIAGE-URGENT.md` |
| **Cron Setup** | Set on CHPC, times verified (MST for UTC targets) |
| **Pipeline Audit** | Confirmed AQ variables flow correctly CHPC → Website |

---

## Outstanding / Next Session

### Priority 1: Verify Clyfar End-to-End

**Job submitted:** `sbatch ~/gits/clyfar/scripts/submit_clyfar.sh 2025112812`
**Job ID:** 8845692

**Check outcome:**
```bash
# On CHPC
sacct -j 8845692 --format=JobID,JobName,Elapsed,State,ExitCode
tail -100 ~/logs/basinwx/clyfar_8845692.out

# Check outputs exist
ls -la ~/basinwx-data/clyfar/dailymax/
ls -la ~/basinwx-data/clyfar/figures/heatmap/
ls -la ~/basinwx-data/clyfar/basinwx_export/
```

**Verify on website:**
```bash
curl -s https://basinwx.com/api/filelist/forecasts | head
curl -s https://basinwx.com/api/filelist/images | head
```

### Priority 2: Performance Optimization

User reports Clyfar runs slowly. Investigate in order:

1. **SLURM resource tuning** - current: 16 CPUs, 32GB, 2hr limit
   - Check actual usage: `sacct -j JOBID --format=JobID,MaxRSS,MaxVMSize,CPUTime,Elapsed`
   - May need to request more or optimize allocation
   - Need to document CHPC hardware specs for optimal config

2. **Parallelization** - check multiprocessing method (fork vs spawn)
   - File: `clyfar/run_gefs_clyfar.py`
   - Currently uses `mp.set_start_method('spawn')`

3. **I/O optimization** - move working data to scratch (faster)
   - See `STORAGE-TRIAGE-URGENT.md` for migration plan

4. **Subset earlier** - download only UB bounding box from GEFS?
   - Currently downloads CONUS then crops
   - Herbie may support bbox parameter

**User will provide:** Previous SLURM job examples for reference.

### Priority 3: Clyfar Three-Tier Display

Build forecast page with progressive disclosure:

| Tier | Content | UI Element |
|------|---------|------------|
| Simple | 10th-90th percentile ppb + alert level | Dropdown per member |
| Middle | Probability of exceedance table | Table |
| Full | Heatmap PNG per member | Dropdown selector |

**Files:**
- `views/forecast_air_quality.html`
- `public/js/forecast_air_quality.js`
- Data from `/api/static/forecasts/`

### Priority 4: Map Improvements (Deferred)

- Non-ozone stations: different marker style (wind arrow? black dot?)
- Tighter zoom on Basin (currently `setView([40.3033, -109.7], 9)`)
- Remove/relocate western DoT stations
- Verify duplicate STID merge logic works

---

## Cron Status (CHPC)

```bash
# Current crontab - SET AND VERIFIED
MAILTO="j.lawson@utah.edu"
SHELL=/bin/bash
HOME=/uufs/chpc.utah.edu/common/home/u0737349

# Observations - Every 5 minutes
*/5 * * * * /bin/bash -c 'source ~/.bashrc_basinwx && source ~/software/pkg/miniforge3/etc/profile.d/conda.sh && conda activate clyfar-nov2025 && python ~/gits/brc-tools/brc_tools/download/get_map_obs.py >> ~/logs/obs.log 2>&1'

# Clyfar (MST times for 03:30, 09:30, 15:30, 21:30 UTC)
30 20,2,8,14 * * * /bin/bash -c 'source ~/.bashrc_basinwx && export PATH=$PATH:/uufs/notchpeak.peaks/sys/installdir/slurm/std/bin && cd ~/gits/clyfar && sbatch scripts/submit_clyfar.sh' >> ~/logs/clyfar_submit.log 2>&1
```

**Note:** SLURM path `/uufs/notchpeak.peaks/sys/installdir/slurm/std/bin` came from previous session docs - verify with `which sbatch` if issues.

---

## Useful Monitoring Commands

### CHPC Job Monitoring

```bash
# Watch all recent jobs (run in terminal)
watch -n 5 "sacct --starttime=now-24hours --format=JobID,JobName,State,Start,Elapsed | sort -k4 -r"

# Tail latest Clyfar log
tail -f ~/logs/basinwx/clyfar_$(ls -t ~/logs/basinwx/clyfar_*.out | head -1 | grep -oP '\d+').out

# Or simpler - tail the newest log file
tail -f $(ls -t ~/logs/basinwx/clyfar_*.out | head -1)

# Check job resource usage after completion
sacct -j JOBID --format=JobID,JobName,MaxRSS,MaxVMSize,CPUTime,Elapsed,State,ExitCode
```

### Akamai Log Monitoring

```bash
# SSH to Akamai, then:
pm2 logs                          # All logs
pm2 logs --lines 100              # Last 100 lines
pm2 logs ubair-site --err         # Errors only

# Check specific log files
tail -f /root/.pm2/logs/ubair-site-out.log
tail -f /root/.pm2/logs/ubair-site-error.log
```

### Quick Health Checks

```bash
# Observations flowing?
curl -s https://basinwx.com/api/live-observations | jq '.totalObservations'

# Forecasts uploaded?
curl -s https://basinwx.com/api/filelist/forecasts | jq 'length'

# PNG images?
curl -s https://basinwx.com/api/filelist/images | jq 'length'
```

---

## Git Status at Session End

| Repo | Branch | Commits This Session |
|------|--------|---------------------|
| ubair-website | `integration-clyfar-v0.9.5` | +5 (PNG fix, Coming Soon, storage docs) |
| clyfar | `integration-clyfar-v0.9.5` | +1 (JSON NaN fix) |
| brc-tools | `integration-clyfar-v0.9.5` | No changes |

**All repos pulled on CHPC** after storage was freed.

---

## Key Files Reference

### Website (ubair-website)
| File | Purpose |
|------|---------|
| `server/server.js:22-23` | express.json type filter (PNG fix) |
| `server/routes/dataUpload.js` | Upload handling |
| `public/partials/sidebar.html` | Coming Soon folder |
| `public/css/overlays.css` | Overlay styling |
| `STORAGE-TRIAGE-URGENT.md` | **READ THIS** - storage management |

### Clyfar
| File | Purpose |
|------|---------|
| `export/to_basinwx.py` | JSON export with NaN sanitizer |
| `scripts/submit_clyfar.sh` | SLURM job script |
| `run_gefs_clyfar.py` | Main forecast script |
| `nwp/gefsdata.py:28-31` | Herbie cache location |

### CHPC Paths
| Path | Contents |
|------|----------|
| `~/gits/clyfar/` | Clyfar repo |
| `~/gits/brc-tools/` | brc-tools repo |
| `~/basinwx-data/clyfar/dailymax/` | **KEEP** - processed output |
| `~/basinwx-data/clyfar/figures/` | Regenerable PNGs |
| `~/gits/clyfar/data/herbie_cache/` | GEFS cache (can delete) |
| `~/logs/basinwx/` | Job logs |
| `~/.bashrc_basinwx` | API credentials |

---

## Known Issues / Warnings

1. **SLURM path** - not independently verified; if cron fails, check `which sbatch`
2. **Retry logic** - not implemented; if GEFS unavailable, job fails (HerbieWait commented out)
3. **Storage** - set up monitoring cron to alert at 80% capacity
4. **Performance** - user reports slow runs; needs investigation

---

## Questions for User (Next Session)

1. Did job 8845692 complete successfully? What was runtime?
2. Did automated cron runs trigger at 20:30 MST (first scheduled)?
3. Do you have CHPC hardware specs doc to share for SLURM optimization?
4. Any errors in `~/logs/clyfar_submit.log`?

---

*Session ended: 29 Nov 2025*
*PNG upload confirmed working*
*Clyfar job 8845692 in progress*
