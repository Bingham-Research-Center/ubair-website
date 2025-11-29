# Session Handoff: 28 November 2025

## Session Focus
Operationalize Clyfar v0.9.5 ozone forecasts and fix observation pipeline from CHPC to BasinWx website.

---

## Accomplishments ✅

### Observation Pipeline (WORKING)
- Fixed `DATA_UPLOAD_API_KEY` env var issue for cron jobs
- Created `~/.bashrc_basinwx` on CHPC with API credentials
- Created `~/.config/ubair-website/website_url` config file
- Obs data now flowing every 5 minutes to basinwx.com

### Clyfar Model Execution (WORKING)
- Fixed CLI argument mismatch (`--dt` → `-i`, etc.)
- Added `'all'` option for `-m/--nmembers` (converts to 31)
- Fixed `numpy.int64` → Python `int` for Herbie timedelta
- Fixed UB crop missing from `herbie_load_variable()`
- Clyfar successfully runs and produces valid forecasts
- JSON exports generated (63 files per run)
- PNG heatmaps generated (62 files)

### Website Code (DEPLOYED but needs verification)
- Added PNG upload support to `dataUpload.js`
- Added `.png` to filelist filter in `server.js`
- Added `forecasts` dataType to upload route
- Created `/public/api/static/images/` and `/forecasts/` directories
- **Deployed to Akamai** (`git pull` + `pm2 restart all`) - needs inspection

### Documentation
- Updated `clyfar/README.md` with CLI usage and operational status
- Created `clyfar/docs/LLM_FORECAST_PROMPT.md` for AI forecast summaries

---

## Outstanding Bugs 🐛

### 1. PNG Upload Failing (400 "Invalid file type")
**Status:** Website code deployed but still rejecting PNGs
**Location:** `server/routes/dataUpload.js:148-152`
**Investigate:**
- Check Akamai server logs for actual error
- Verify the deployed code matches local (file may not have been saved before commit?)
- Test: `curl -X POST -H "x-api-key: KEY" -F "file=@test.png" https://basinwx.com/api/upload/images`

### 2. JSON Upload Failing (400 "Invalid JSON file")
**Status:** JSONs contain `NaN` which isn't valid JSON spec
**Location:** `clyfar/export/to_basinwx.py`
**Fix:** Replace `json.dump()` with:
```python
import math
def nan_safe_json(obj):
    if isinstance(obj, float) and math.isnan(obj):
        return None
    raise TypeError
json.dump(payload, f, indent=2, default=nan_safe_json)
```
Or use `df.fillna(None)` before serialization.

### 3. Cron Can't Find sbatch
**Status:** SLURM not in cron PATH
**Location:** CHPC crontab
**Fix:** Update cron line to:
```bash
30 2,8,14,20 * * * /bin/bash -c 'source ~/.bashrc_basinwx && export PATH=$PATH:/uufs/notchpeak.peaks/sys/installdir/slurm/std/bin && cd ~/gits/clyfar && sbatch scripts/submit_clyfar.sh' >> ~/logs/clyfar_submit.log 2>&1
```

### 4. Cron Times Are Local, Not UTC
**Current:** `30 3,9,15,21` (MST)
**Should be:** `30 2,8,14,20` (MST = 03:30, 09:30, 15:30, 21:30 UTC)

---

## Key Files Modified This Session

### ubair-website
| File | Changes |
|------|---------|
| `server/routes/dataUpload.js` | PNG support, forecasts dataType, skip binary validation |
| `server/server.js` | Include `.png` in filelist filter |

### clyfar
| File | Changes |
|------|---------|
| `run_gefs_clyfar.py` | `parse_nmembers()` for 'all' option |
| `scripts/submit_clyfar.sh` | Fixed CLI args, added PNG export call |
| `nwp/download_funcs.py` | `int(fxx)` conversion, `crop_to_UB()` call |
| `nwp/gefsdata.py` | `int(fxx)` in multiple locations |
| `export/to_basinwx.py` | Added `x-client-hostname` header to PNG uploads |
| `README.md` | CLI usage docs, operational status |
| `docs/LLM_FORECAST_PROMPT.md` | NEW - prompt template for AI summaries |

### brc-tools
- No changes this session (9 commits ahead of main from previous sessions)

---

## CHPC Reference

```
Username: u0737349
Home: /uufs/chpc.utah.edu/common/home/u0737349
Clyfar repo: ~/gits/clyfar
brc-tools repo: ~/gits/brc-tools
Data output: ~/basinwx-data/clyfar/
Figures: ~/basinwx-data/clyfar/figures/
JSON exports: ~/basinwx-data/clyfar/basinwx_export/
Logs: ~/logs/basinwx/clyfar_*.out
Conda: ~/software/pkg/miniforge3
Env: clyfar-nov2025
```

---

## Lessons Learned / Gotchas

1. **Cron doesn't inherit shell environment** - Must source `~/.bashrc_basinwx` explicitly
2. **Cron doesn't have SLURM in PATH** - Must add SLURM bin directory
3. **numpy.int64 ≠ Python int** for timedelta - Always `int(fxx)` when passing to Herbie
4. **Herbie returns global grid** - Must call `crop_to_UB()` after download
5. **JSON spec doesn't allow NaN** - Must convert to `null` or number before serialization
6. **Cached geography files** - If shape mismatch errors, check `data/` and `data/geog/` for stale files
7. **Two locations for parquet files** - `data/` and `data/geog/` both used (tech debt)

---

## Verification Steps for Next Session

1. **Check Akamai logs** for PNG upload errors:
   ```bash
   ssh to akamai
   pm2 logs
   ```

2. **Test PNG upload manually:**
   ```bash
   curl -X POST \
     -H "x-api-key: YOUR_KEY" \
     -H "x-client-hostname: test.chpc.utah.edu" \
     -F "file=@test.png" \
     https://basinwx.com/api/upload/images
   ```

3. **Check if forecast page loads** (Coming Soon overlay still active):
   https://basinwx.com/forecast/air-quality

4. **Verify obs still flowing:**
   ```bash
   curl -s https://basinwx.com/api/live-observations | head -c 200
   ```

---

## Git Status at Session End

| Repo | Branch | Status |
|------|--------|--------|
| ubair-website | `integration-clyfar-v0.9.5` | 2 commits ahead of `ops`, deployed to Akamai |
| clyfar | `integration-clyfar-v0.9.5` | Multiple commits ahead, pushed to GitHub |
| brc-tools | `integration-clyfar-v0.9.5` | 9 commits ahead of `main`, has uncommitted changes |

**Do NOT merge to ops/main until:**
- PNG uploads working
- JSON NaN issue fixed
- Clyfar data visible on forecast page

---

## PR Open
- ubair-website PR #111: https://github.com/Bingham-Research-Center/ubair-website/pull/111
- Update PR description with bug findings before merging

---

## Token Efficiency Tips for Next Session

1. **Start with this file** - contains all context needed
2. **Key index files:**
   - `ubair-website/CLAUDE.md`
   - `clyfar/README.md`
   - `clyfar/docs/LLM_FORECAST_PROMPT.md`
3. **Don't re-explore** - bugs are identified, just need fixes
4. **Test on CHPC** - have SSH ready for quick iteration
