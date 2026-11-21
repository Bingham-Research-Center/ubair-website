# Data Manifest Change Log

## Version 2.4.0 (2026-11-21)

### Type: Minor - Cadences corrected to the crontab, a schedule for every product; nothing a producer sends changes

**Summary:** The declared schedules now say what the crontab on notchpeak1 does (read there on
2026-11-21, brc-tools' reply to open ask A4), and each product in `forecasts` has its own, so
that website 1.7.9 can judge freshness product by product. Answers A4 and A11.

### Changes Made

- **Changed:** `observations` to `*/5 * * * *` (was `*/10`; the cron has always been every 5).
- **Changed:** `road-forecast` to `20 * * * *` (was `ad-hoc (proof-of-concept)`, which the
  monitor read as hourly by accident). A11.
- **Changed:** `forecasts.products.hrrr_surface_layers` to `45 0,6,12,18 * * *` (was
  `0 * * * *`, which it never was).
- **Changed:** `forecasts` and `llm_outlooks` to Clyfar's line, `15 3,9,15,21 * * *`
  (`forecasts` said `30 3,9,15,21`; `llm_outlooks` said `ad-hoc`).
- **Added:** a `schedule` on `possibility_heatmap`, `exceedance_probabilities` and
  `percentile_scenarios`, which had none.
- **Added:** `schedule.seasonal: true` on everything the Clyfar job sends (`images`,
  `llm_outlooks`, the three Clyfar products). A seasonal product that has sent nothing for
  7 days reads `dormant`, not `stale`.
- **Added:** `monitoring.freshness`, which states the rules: twice the interval; `ad-hoc` is
  never judged; products are judged one by one; the crontab runs in Mountain time.
- **Changed:** `metadata` description (on change, at least every 6 hours, since brc-tools #76)
  and the surface-layers `notes`: the snowfall total no longer drops to zero (#77) and the wind
  components are relative to true north (#78), both checked against the files.

### Why MINOR

Nothing a producer sends changes. `seasonal` is a new optional key that only the website's
freshness check reads. A schedule here is a description of the crontab, and the crontab is
unchanged.

### Still not declared

Three families arrive in `forecasts` with no product entry: `forecast_gefs_weather_clyfar*`,
`forecast_gefs_weather_percentiles_*` and `forecast_clustering_summary_*` (the last is read by
the air-quality forecast page). `/api/monitoring/freshness` lists them under `undeclared`.

## Version 2.3.0 (2026-11-20)

### Type: Minor - One product documented, optional fields named; nothing a producer sends changes

**Summary:** Gives the HRRR waypoints product the entry it never had, and names the fields the
weather map will draw when the surface layers carry them. Website 1.7.7 is the first version
that reads them.

### Changes Made

- **Added:** `forecasts.products.hrrr_waypoints`. The town table has read
  `forecast_hrrr_waypoints_us40_dense_*` since website 1.7.6 with no entry here. The schema is
  what the website reads; `variablesRead` gives each variable's unit, and
  `variablesSentButUnread` lists the two it ignores.
- **Added:** `forecasts.products.hrrr_surface_layers.optionalFields`: `wind_gust_10m_ms`,
  `snow_depth_mm`, `cloud_cover_pct` and `rh_2m_pct`, each with its unit. The map draws one as
  soon as a run carries it (`public/js/mapLayers.js`). `namesReserved` holds five more names
  agreed for later.
- **Added:** `notes` on the surface layers: the snowfall field is a running total (P10), the
  runs arrive three at a time every six hours rather than hourly, and the direction the wind
  components are measured from is not stated (P17).

### Why MINOR

Additive. No existing field, unit, filename or schedule changes, and CHPC needs no change to
keep uploading. The new fields are optional: a run without them validates as before.

### Declared cadence is still wrong for two products

The surface layers' schedule says hourly and the waypoints entry gives the measured time, but
`/api/monitoring/freshness` reads only the dataType's own schedule (`forecasts`, four times a
day), so neither affects the monitor. The surface-layers schedule is left as declared until
the producer moves it to hourly (handoff ask P11); the note says what happens today.

## Version 2.2.0 (2026-11-20)

### Type: Minor - Two new dataTypes, no change to an existing one

**Summary:** Adds `llm_forecasts` (tiered LLM forecast text, schema `llm_forecast/1`) and
`aircraft` (products from the ADS-B hub), and rewrites `globalValidation.originValidation` to
describe a host allowlist instead of a hard-coded CHPC suffix. Website 1.7.3 is the first
version that accepts and checks them (issue #402).

### Changes Made

- **Added:** `dataTypes.llm_forecasts`: a JSON Schema, the placement table (which persona
  writes which tier, and to what word budget), the personas' cadence and stale times, and the
  filename rule. `public/js/llmForecast.js` holds the same rules as code, and
  `public/js/__tests__/llmForecast.test.js` fails if the two disagree.
- **Added:** `dataTypes.aircraft`, with no schema yet. No page reads it; each product gets a
  schema here before one does.
- **Changed:** `globalValidation.originValidation` now describes `UPLOAD_ALLOWED_HOSTS`
  (`.chpc.utah.edu` by default) and says plainly that the hostname is a filter and the API
  key is the authentication.
- **Added:** `monitoring.expectedDataFlow` lines for both.
- **Server:** the upload route now answers 400 for a dataType that is not in the manifest's
  list. It used to store anything under the name it was given (noted under 2.1.0 below).

### Why MINOR

Additive: no existing dataType, field, unit or filename changes, and CHPC needs no change to
keep uploading. `/api/monitoring/freshness` will list both new dataTypes as `missing` until
their producers start, which is true.

### Server-side validation is new, and only for `llm_forecasts`

The manifest has never been enforced by the server (`CLAUDE.md`). `llm_forecasts` is the
exception: it is prose shown to the public on both boxes, so a file that breaks the contract
is refused with every reason listed. Three of those rules cannot be written in JSON Schema
and are listed in the entry's `notes`.

## Version 2.1.1 (2026-09-28)

### Type: Patch - Monitoring cadence correction, no schema change

**Summary:** `dataTypes.images.schedule` said every 30 minutes (`*/30 * * * *`). What
actually lands is one batch of five GEFS meteograms (wind, temp, solar, snow, MSLP) per
6-hourly cycle, about 9.5 h after 00/06/12/18Z. The monitor flags stale at twice the
declared interval, so the box reported `images` stale 73 minutes after a normal upload,
on every cycle, and the alert carried no information.

### Changes Made

- **Changed:** `dataTypes.images.schedule.frequency` `*/30 * * * *` -> `0 */6 * * *`, with a
  description that names the product and the lag.
- **Changed:** `monitoring.expectedDataFlow.images` to match.
- **Added:** a test in `server/__tests__/dataMonitorFreshness.test.js` that loads the real
  manifest and checks a 7 h gap reads fresh and a 13 h gap reads stale.
- **Docs:** the "every 30 min" line in `docs/DATA-PIPELINE-OVERVIEW.md` and in the two CHPC
  deployment guides since deleted from the tree (2026-09-28; last present at `b6dbddf`).

### Why the interval is 6 h and not 6 h + 9.5 h

Freshness is the newest file's age, and stale means older than 2x the interval. With 6 h
that is 12 h: exactly one missed cycle. Folding the 9.5 h upload lag into the interval
would push the threshold past 30 h and hide four missed cycles in a row, which is what
happened 2026-09-26 to 09-27 (Clyfar's `submit_gefs_plots.sh` hung on a Herbie download
with no timeout; 19 of 114 runs since 08-31 failed the same way, fixed on the Clyfar side).

### What is still wrong in `dataTypes.images`

`filename.pattern`, `filename.example` and `validation.imageTypes` still describe
satellite/radar imagery. The files are `meteogram_UB-repr_<var>_<YYYYMMDD-HHMM>_GEFS.png`.
Left for the producer side (brc-tools/Clyfar) to correct as the contract-holder.

## Version 2.1.0 (2026-08-27)

### Type: Minor - Removal of a never-implemented declaration

**Summary:** Removes `dataTypes.timeseries`. It was declared with an hourly schedule
(`0 * * * *`) from the manifest's first version and **has never been uploaded to either
host, once, ever** — so `/api/monitoring/freshness` carried a permanently false
"missing" for it.

### Changes Made

- **Removed:** `dataTypes.timeseries` (endpoint `/api/upload/timeseries`, schema for
  `{station_id, variable, units, data[]}`).
- **Removed:** `monitoring.expectedDataFlow.timeseries`.
- **Removed:** `'timeseries'` from `dataTypeMap` in `server/routes/dataUpload.js`.
- **Corrected:** `forecasts.products.hrrr_kvel_crosswind.schedule.description` no longer
  says "cron pending install on CHPC" — it was installed on notchpeak1 on 2026-08-27,
  and the first file landed on both hosts the same day.

### Why MINOR rather than MAJOR

`docs/MANIFEST-GUIDE.md` reserves MAJOR for changes that break a producer or consumer.
Nothing can break here:

- **No producer has ever targeted it.** Every brc-tools exporter uses
  `DEFAULT_UPLOAD_BUCKET = "forecasts"`, including the waypoint and KVEL crosswind
  exporters. There is no code path anywhere that posts to `/api/upload/timeseries`.
- **No consumer reads it.** The frontend takes station time series live from Synoptic
  via `/api/synoptic/timeseries` (`public/js/api.js`, `server/routes/synopticAPI.js`),
  which is unaffected. `WEBSITE-BRCTOOLS-HANDOFF-aug13.md` recorded this at the time:
  *"not needed — frontend uses live /api/synoptic/timeseries"*.

The upload route still accepts an unknown `:dataType` (`dataTypeMap[dataType] || dataType`),
so even a stray post would be stored rather than rejected. Removing the declaration only
stops the monitor expecting data that was never coming.

### If it comes back

Re-add under a MINOR bump, with a producer landing in the same release. A declared
dataType with no producer is a standing false alarm, which is what this removes.

---
## Version 2.0.0 (2026-08-14)

### Type: Major - Contract Correction

**Summary:** First declaration of `dataTypes.forecasts.products.hrrr_kvel_crosswind` —
the HRRR sub-hourly runway head/crosswind forecast for KVEL (Vernal Regional) — under
the corrected KVEL 17/35 contract (FAA redesignation: true headings 179/359, series keys
`headwind_kt_179`/`crosswind_kt_179` and `headwind_kt_359`/`crosswind_kt_359`).

### Changes Made

- **Added:** `dataTypes.forecasts.products.hrrr_kvel_crosswind` — filename pattern
  `forecast_hrrr_kvel_crosswind_YYYYMMDD_HHMMZ.json`, hourly schedule (`55 * * * *`),
  full payload schema keyed off the top-level `runway_headings_deg` array. Rides the
  existing `forecasts` endpoint; no upload-route change.
- **Counters:** `validation.filesPerProduct` gains `"hrrr_kvel_crosswind": 1`;
  `totalFilesPerRun` 63 → 64.

### Why MAJOR

The previously *documented* (never published) contract — `WEBSITE-BRCTOOLS-HANDOFF-apr27.md`
§DATATYPE 2, since deleted — used `*_kt_160`/`*_kt_340` series keys, so the field-name rule
in `docs/MANIFEST-GUIDE.md` applies. 2.0.0 is also the coordination signal promised in
brc-tools PR #59 / tag v0.1.1 (the producer, which released first on 2026-08-13). Zero
KVEL files have ever been uploaded to `.com` or `.dev`, so no data migration is needed.

---

## Version 1.2.0 (2026-08-13)

### Type: Minor - Additive

**Summary:** Documented the `llm_outlooks` dataType, which the upload route has accepted
since launch and which is live on basinwx.com (462 PDFs), but which the manifest never
declared.

### Changes Made

- **Added:** `dataTypes.llm_outlooks` — endpoint `/api/upload/llm_outlooks`, format `pdf`,
  filename pattern `LLM-OUTLOOK-YYYYMMDD_HHMMZ.pdf`, ad-hoc schedule.
- **Effect:** `scripts/chpc_uploader.py` can now push this dataType (it validates
  `--data-type` against the manifest), and `server/monitoring/dataMonitor.js` now reports
  its freshness.

**Backwards compatible.** No existing dataType changed; no producer needs updating.

### Not logged at the time

`1.1.0` added `dataTypes["road-forecast"]` (PR #190, 2026-04-28) without a changelog entry.
Recorded here for the audit trail.

---

## Version 1.0.1 (2025-11-04)

### Type: Patch - Production Alignment

**Summary:** Updated manifest to match actual production data format.

### Changes Made

#### Variable Names Updated
- **Changed:** `"ozone"` → `"ozone_concentration"`
- **Changed:** `"pm25"` → `"PM_25_concentration"`

#### Variables Added (from production data)
- `soil_temp` - Soil temperature (19 occurrences in production)
- `sea_level_pressure` - Sea level pressure (17 occurrences)
- `altimeter` - Altimeter setting (17 occurrences)
- `NOx_concentration` - Nitrogen oxide concentration (1 occurrence)
- `ceiling` - Cloud ceiling height (2 occurrences)
- `outgoing_radiation_sw` - Outgoing shortwave radiation (2 occurrences)

#### Unit Mappings Updated (ASCII format)
- **Changed:** `"ozone": "ppb"` → `"ozone_concentration": "ppb"`
- **Changed:** `"pm25": "µg/m³"` → `"PM_25_concentration": "ug/m3"` (ASCII)
- **Changed:** `"solar_radiation": "W/m²"` → `"solar_radiation": "W/m**2"` (ASCII)
- **Changed:** `"pressure": "mb"` → `"pressure": "Pascals"`
- **Added:** `"soil_temp": "Celsius"`
- **Added:** `"sea_level_pressure": "Pascals"`
- **Added:** `"altimeter": "Pascals"`
- **Added:** `"NOx_concentration": "ppb"`
- **Added:** `"ceiling": "Meters"`
- **Added:** `"outgoing_radiation_sw": "W/m**2"`

### Impact

**Frontend:** No changes required - frontend already works with this format.

**CHPC Scripts:** No changes required - production data already uses these variable names.

**Server Validation:** Now correctly validates production data without warnings.

### Testing

Validated against production files:
- ✓ `map_obs_20250731_0228Z.json` - 295 observations across 46 stations
- ✓ `map_obs_meta_20250731_0228Z.json` - 46 station metadata records

### Migration Notes

**None required** - This update aligns the manifest with existing production behavior. No code changes needed.

### Notes

- Variables `relative_humidity` and `precip_accum` remain in manifest but do not appear in current production data
- Station `CLN` missing required variables (`wind_direction`, `wind_speed`) but only generates warning, not error

---

## Version 1.0.0 (2025-11-03)

### Type: Initial Release

**Summary:** Initial manifest-driven data pipeline implementation.

### Features
- Defined 5 data types: observations, metadata, timeseries, outlooks, images
- JSON Schema validation for all data types
- Transfer schedules and frequency specifications
- Authentication and security rules
- Monitoring and alerting thresholds
- Change management processes

### Components
- `DATA_MANIFEST.json` - Manifest file
- `scripts/chpc_uploader.py` - CHPC upload script with validation
- `server/routes/dataUpload.js` - Enhanced server-side validation
- `server/monitoring/dataMonitor.js` - Monitoring service
- Comprehensive documentation suite

---

**Semantic Versioning:**
- **MAJOR.MINOR.PATCH** format
- **MAJOR:** Breaking changes requiring code updates
- **MINOR:** New features, backward compatible
- **PATCH:** Bug fixes, documentation updates, alignment changes
