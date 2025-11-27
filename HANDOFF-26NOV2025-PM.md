# Claude Handoff - 26 Nov 2025 ~17:00 UTC

## Session Summary
**Goal:** BasinWx v1.0 launch prep for Dec 1. Get live data flowing, hide unfinished features.

## What Was Done This Session

### Clyfar Repo (`integration-clyfar-v0.9.5` branch)

1. **Fixed 31-member run** - `c00` control member now maps to `clyfar000`
2. **Fixed Herbie cache** - Now uses `/scratch/general/vast/` instead of home (was hitting 7.3GB quota)
3. **Added helper scripts:**
   - `scripts/setup_env.sh` - Source before salloc
   - `scripts/run_clyfar.sh YYYYMMDDHH` - Run with single arg
   - `scripts/storage_inventory.sh` - Audit storage usage

4. **Wired BasinWx export** (commit `b9524c1`):
   - `export_all_products()` now called after Clyfar inference
   - `upload_png_to_basinwx()` - New function for PNG uploads
   - `export_figures_to_basinwx()` - Uploads heatmaps + meteograms
   - Exports 63 JSON + all PNGs when `DATA_UPLOAD_API_KEY` is set

### Storage Documentation
- `docs/STORAGE-GUIDE.md` - Quick reference for CHPC storage
- Scratch purge is **60 days** (verified from CHPC policy)
- Per-user quota: 50 TB on `/scratch/general/vast/`

---

## Test the Export (First Thing for Next Session)

On CHPC:
```bash
cd ~/gits/clyfar
git pull

# Set API key for upload
export DATA_UPLOAD_API_KEY="<your-key>"
export BASINWX_API_URL="https://basinwx.com"

# Source environment
source scripts/setup_env.sh

# Run with a recent init time
salloc -n 32 -N 1 -t 4:00:00 -A lawson-np -p lawson-np
scripts/run_clyfar.sh 2025112700  # Or latest available
```

Expected output at end:
```
Exporting forecast products to BasinWx...
Exported 63 JSON files to /scratch/.../basinwx_export
Exported X heatmaps, Y meteograms
```

---

## Remaining Tasks (Priority Order)

### P0 - Critical for Dec 1
| Task | Repo | Status |
|------|------|--------|
| Test Clyfar export end-to-end | clyfar | **Ready to test** |
| Verify observation cron running | brc-tools | Not checked |
| Check why maps show Nov 7 data | ubair-website | Not investigated |

### P1 - Should Have
| Task | Repo | Files |
|------|------|-------|
| Full overlay on Agriculture/Aviation/Water/Fire | ubair-website | `views/*.html` |
| Static PNG mode for Clyfar page | ubair-website | `views/forecast_air_quality.html`, `public/js/forecast_air_quality.js` |
| Feature flags config | ubair-website | NEW: `public/js/config.js` |

### P2 - Nice to Have
| Task | Repo | Notes |
|------|------|-------|
| Wire front page dashboard to real data | ubair-website | Worst ozone across ~10 sites |
| Remove 46 console.log statements | ubair-website | Throughout JS files |
| Weather outlook placeholder | ubair-website | "Coming soon" markdown |

---

## Key Decisions Made

1. **Coming Soon treatment:** Full semi-transparent overlay (not muted colors)
2. **Front page AQ:** Show worst ozone across all basin sites (~10)
3. **Outlooks:** Use existing `template.md`; user writes AQ manually; weather is "Coming soon"
4. **Clyfar page:** Show static PNGs, hide interactive Plotly until January

---

## Current Data State

| Data Type | Location | Status |
|-----------|----------|--------|
| Observations | `/public/api/static/observations/` | Only `map_obs_20250731_0228Z.json` (July test data!) |
| Clyfar JSON | Not uploaded yet | Export wired, needs test |
| Clyfar PNGs | Not uploaded yet | Export wired, needs test |
| Outlooks | `/public/api/static/outlooks/` | 3 good examples + template.md |

---

## Website API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/upload/:dataType` | POST | Upload JSON/MD/PNG (needs API key) |
| `/api/live-observations` | GET | Latest observation file |
| `/api/static/{filename}` | GET | Serve uploaded files |

Data types: `observations`, `metadata`, `outlooks`, `images`, `timeseries`, `forecasts`

---

## File Locations (Key)

**Clyfar:**
- Main script: `run_gefs_clyfar.py`
- Export module: `export/to_basinwx.py`
- Helper scripts: `scripts/setup_env.sh`, `scripts/run_clyfar.sh`

**Website:**
- Front page: `views/index.html`
- Clyfar page: `views/forecast_air_quality.html`
- Clyfar JS: `public/js/forecast_air_quality.js`
- Pages to overlay: `views/agriculture.html`, `aviation.html`, `water.html`, `fire.html`
- Outlook template: `public/api/static/outlooks/template.md`

---

## Git Status

**Clyfar:** `integration-clyfar-v0.9.5` branch, up to date with origin
**Website:** `integration-clyfar-v0.9.5` branch, has untracked `PR_DRAFT.md`

---

## Plan File
Full plan at: `/Users/johnlawson/.claude/plans/golden-knitting-dream.md`

---

## Quick Links
- [CHPC File Storage Policies](https://www.chpc.utah.edu/documentation/policies/3.1FileStoragePolicies.php)
- CHPC OnDemand: https://ondemand.chpc.utah.edu (browser file access)
