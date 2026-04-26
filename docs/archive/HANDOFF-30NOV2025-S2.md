# Session Handoff: 30 November 2025 - Session 2

## Completed This Session

| Task | Details |
|------|---------|
| CHPC cron diagnosis | Root cause: GEFS 404 on long lead times (f183), NOT memory/disk |
| Smart resubmit | `run_gefs_clyfar.py` exits 75 on 404, `submit_clyfar.sh` retries in 30min |
| Init time dropdown | `forecast_air_quality.js` - groups by forecast run, two dropdowns |
| JSON → summary cards | Fetches exceedance JSON, colors Today/Tomorrow/Week cards |
| Level color CSS | `.level-background`, `.level-moderate`, `.level-elevated`, `.level-extreme` |
| GEFS meteograms | Weather page section with 5 variable grid (temp, wind, mslp, snow, solar) |
| Model dropdown | Future-proofed for HRRR, NAM, etc. |

---

## Git Status

| Repo | Branch | Last Commit |
|------|--------|-------------|
| ubair-website | `integration-clyfar-v0.9.5` | `eebedfe` - init time dropdown, JSON wiring, GEFS meteograms |
| clyfar | `integration-clyfar-v0.9.5` | `866e1ea` - smart resubmit on GEFS 404 |

**CHPC needs:** `cd ~/gits/clyfar && git pull`

---

## Priority Queue for Next Sessions

### P1: AQ Station Data Investigation
**Status:** Ready for test queries
**Task:** Run synopticpy queries to verify UBAIR stations return ozone data

```python
from synoptic import Metadata, Latest
from datetime import timedelta

# Query 1: Find ozone stations near Uinta Basin
meta = Metadata(radius="vernal,ut,100", vars="ozone_concentration").df()

# Query 2: Test UBAIR stations
ubair_stids = ["UBHSP", "UBCSP", "UB7ST", "UBRDW", "UBORY", "UBDRF", "UBWHR"]
latest = Latest(stid=ubair_stids, vars=["ozone_concentration"], within=timedelta(hours=24)).df()
```

**If empty:** Need EPA AirNow API or Utah DAQ direct source

### P2: Deploy to Akamai
**Status:** Code pushed to GitHub, not yet on server
**Action:** SSH to Akamai, `cd ~/ubair-website && git pull && pm2 restart all`

### P3: Test Website Features
**Status:** Ready for testing once deployed
**Test checklist:**
- [ ] Init time dropdown populates with available forecast runs
- [ ] Member dropdown filters correctly
- [ ] JSON loads and colors summary cards
- [ ] GEFS meteograms display on weather page

### P4: CHPC - Pull and Test Smart Resubmit
**Status:** Code pushed, needs pull
**Action:**
```bash
ssh chpc
cd ~/gits/clyfar && git pull
# Trigger manual run to test
sbatch scripts/submit_clyfar.sh 2025113012
```

---

## Key Files Modified

| File | Changes |
|------|---------|
| `forecast_air_quality.js` | +150 lines: init time dropdown, JSON loading, summary cards |
| `forecast_air_quality.css` | +20 lines: dropdown layout, level colors |
| `forecast_weather.html` | +70 lines: GEFS meteogram section |
| `forecast_weather.js` | Complete rewrite: meteogram display logic |
| `forecast_weather.css` | +130 lines: meteogram grid styles |
| `clyfar/run_gefs_clyfar.py` | +30 lines: HTTPError 404 handler, exit code 75 |
| `clyfar/scripts/submit_clyfar.sh` | +30 lines: retry logic, sbatch --begin |

---

## API Endpoints in Use

| Endpoint | Purpose |
|----------|---------|
| `/api/filelist/images` | List PNG heatmaps and meteograms |
| `/api/filelist/forecasts` | List JSON forecast files |
| `/api/static/images/{file}` | Serve PNG files |
| `/api/static/forecasts/{file}` | Serve JSON files |

---

## Resources for AQ Investigation

- **SynopticPy Docs:** https://synopticpy.readthedocs.io/en/latest/
- **SynopticPy GitHub:** https://github.com/blaylockbk/SynopticPy
- **Synoptic API Docs:** https://docs.synopticdata.com/services/
- **EPA AirNow API:** https://docs.airnowapi.org/

---

## Conda Environments

| Location | Env Name |
|----------|----------|
| Local | `clyfar-2025` |
| CHPC | `clyfar-nov2025` |

---

## Deferred Items

See `TODO-DEFERRED.md` and `~/.claude/plans/twinkling-cooking-ladybug.md` for full roadmap.

---

*Session ended: 30 Nov 2025 ~11:00 UTC*
*Both repos committed and pushed*
*Next session: Pull to CHPC/Akamai, test features, AQ station queries*
