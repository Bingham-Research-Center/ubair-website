# Session Handoff: 30 November 2025 - Session 1

## Completed This Session

| Task | Details |
|------|---------|
| Array mismatch fix | `clyfar/viz/plotting.py` - common index alignment |
| Map improvements | Zoom 9.5, diamond markers, road station filter |
| Cron schedule | Changed to 05/11/17/23 UTC (5hr after GEFS) |
| Parallel PNG uploads | ThreadPoolExecutor in `export/to_basinwx.py` |
| SLURM memory | 32G → 48G |
| Forecast page | Removed overlay, added member dropdown (1-31) |
| Session docs | Consolidated into `TODO-DEFERRED.md` |

---

## Priority Queue for Next Sessions

### P1: All AQ Data on Website
**Status:** Only 4 ozone stations showing (QCV, QHW, QSM, UB7ST)
**Issue:** UBAIR stations (UBHSP, UBCSP, etc.) report to EPA/DAQ, not Synoptic
**Action:** Manual investigation needed - find UBAIR data source, add to `get_map_obs.py`

### P2: Clyfar Running Every 6 Hours
**Status:** Cron running but **crashing after ~15 min** - investigate
**Done:** CHPC pulled, crontab updated, site restarted, test PNGs deleted
**Next:** Check logs for crash cause (likely disk/memory again)

### P3: Heatmap PNGs with Dropdowns
**Status:** Member dropdown done, need runtime dropdown
**Files:** `public/js/forecast_air_quality.js`
**TODO:** Add init time selector (filter by date in filename)

### P4: JSON Data → Icons/Colors
**Status:** Not started
**Files:**
- Homepage: `public/js/index.js` or similar
- Forecast: `public/js/forecast_air_quality.js`
**Data:** `/api/static/forecasts/forecast_exceedance_probabilities_*.json`

### P5: AQ Full-Screen Page
**Status:** Map changes pushed, needs Akamai pull + test
**URL:** https://basinwx.com/live-aq

### P6: LLM Summaries
**Status:** Not started
**Files:**
- `public/data/clyfar/plain.md`, `extended.md`, `detailed.md`
- Could auto-generate from JSON + templates
**Templates:** See `clyfar/docs/LLM_FORECAST_PROMPT.md`

### P7: Weather Page
**Status:** Not started
**Action:** Clone AQ map logic but filter to met-only variables
**Fallback:** Hide page if not ready for Dec 1

---

## Pending Actions

### CHPC - DONE
- ✅ Pulled clyfar and brc-tools
- ✅ Updated crontab to 0 22,4,10,16 * * *
- ⚠️ Cron job crashing after ~15 min - check logs

### Akamai - DONE
- ✅ Pulled website, restarted pm2
- ✅ Deleted test heatmaps (only real dailymax + GEFS PNGs remain)

---

## API Status

| Endpoint | Status | Notes |
|----------|--------|-------|
| `/api/live-observations` | ✅ 270 obs | Missing UBAIR ozone |
| `/api/filelist/forecasts` | ✅ 95 files | Working |
| `/api/filelist/images` | ✅ 64 files | Working |

---

## Conda Environments

| Location | Env Name |
|----------|----------|
| Local | `clyfar-2025` |
| CHPC | `clyfar-nov2025` |

---

## Key Files This Session

| File | Changes |
|------|---------|
| `clyfar/viz/plotting.py` | Array alignment fix |
| `clyfar/scripts/submit_clyfar.sh` | Schedule, memory |
| `clyfar/export/to_basinwx.py` | Parallel uploads |
| `ubair-website/public/js/map.js` | Zoom, diamonds, filter |
| `ubair-website/public/js/forecast_air_quality.js` | Member dropdown |
| `ubair-website/views/forecast_air_quality.html` | Removed overlay |

---

## Deferred Items

See `TODO-DEFERRED.md` for:
- Storage migration to scratch
- Quota monitoring cron
- HerbieWait retry logic
- Performance optimization
- Tech debt cleanup

---

*Session ended: 30 Nov 2025 ~07:30 UTC*
*Akamai deployed, cron running (but crashing)*
*Next session: Fix cron crash, fix UBAIR data source, wire JSON to UI*
