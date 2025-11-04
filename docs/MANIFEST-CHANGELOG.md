# Data Manifest Change Log

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
