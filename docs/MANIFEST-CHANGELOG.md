# Data Manifest Change Log

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
