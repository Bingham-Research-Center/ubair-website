# AI Handoff: HRRR NWP Integration

This note is for a cold-start AI agent working in `ubair-website` to finish, review, or refine the HRRR weather-map integration for `basinwx.com`.

## Start Here

Work in:
- Repo: `~/gits/ubair-website`
- Current integration branch: `feat/nwp-integration`
- Website commit carrying the current implementation: `b051513`

Before changing anything, inspect:

```bash
git status -sb
git branch --all
git show --stat b051513
```

If you are not already on `feat/nwp-integration`, inspect that branch first.

## Cross-Repo Source Of Truth

The website should adapt to the current `brc-tools` exporter contract, not invent a second competing schema.

Relevant `brc-tools` commit:
- `cfcf75d` `feat: export HRRR BasinWX surface layers`

Relevant `brc-tools` files:
- `brc_tools/nwp/basinwx.py`
- `brc_tools/nwp/lookups.toml`
- `scripts/export_hrrr_surface_layers.py`
- `tests/test_basinwx_surface_export.py`

Read `brc_tools/nwp/basinwx.py` first if there is any ambiguity about file naming, payload shape, variable semantics, or cadence.

## Website Files Already Changed

These files in `ubair-website` were updated for this integration:

- `DATA_MANIFEST.json`
- `views/forecast_weather.html`
- `public/css/forecast_weather.css`
- `public/js/forecast_weather.js`

Treat those files as the current integration surface.

## Intended Product Behavior

On `/forecast_weather`:

- Keep the existing GEFS meteograms working.
- Add HRRR JSON-driven map layers for the Uintah Basin.
- Use the latest 3 HRRR runs.
- Support forecast hours `f00` through `f18`.
- Render:
  - `temperature_2m_c`
  - `rainfall_1h_mm`
  - `snowfall_1h_mm`
  - wind vectors from `wind_u_10m_ms` and `wind_v_10m_ms`

The website should load static forecast files from:
- `/api/static/forecasts`

Preferred discovery:
- `forecast_hrrr_surface_layers_index.json`

Fallback discovery:
- derive latest run files from `/api/filelist/forecasts`

## Expected HRRR Payload Contract

Expected files:
- `forecast_hrrr_surface_layers_index.json`
- `forecast_hrrr_surface_layers_YYYYMMDD_HHMMZ.json`

Expected top-level fields in each run file:

- `model = "hrrr"`
- `product = "surface_layers"`
- `region = "uinta_basin"`
- `init_time`
- `generated_at`
- `forecast_hours`
- `valid_times`
- `stride`
- `bbox`
- `grid`
- `field_shape`
- `variables`
- `fields`

Grid encoding:

- `grid.shape` is `[y, x]`
- `grid.lats` and `grid.lons` are flattened arrays matching that shape
- `field_shape` is `[time, y, x]`

Expected `fields` keys:

- `temperature_2m_c`
- `wind_u_10m_ms`
- `wind_v_10m_ms`
- `rainfall_1h_mm`
- `snowfall_1h_mm`

## Variable Semantics

From the current `brc-tools` exporter:

- temperature is Celsius
- wind is stored as U/V in m/s
- rainfall is HRRR precip partitioned by categorical rain flag
- snowfall is HRRR `ASNOW` converted to mm and partitioned by categorical snow flag
- the Basin grid is spatially decimated and rounded for smaller JSON payloads
- default exporter stride is `2`

## What Has Already Been Validated

- `brc-tools` targeted pytest for the new export path passed
- website `forecast_weather.js` passed syntax check
- website `DATA_MANIFEST.json` parses as valid JSON

## What Has Not Been Validated Yet

- no live CHPC upload to `basinwx.com`
- no browser/manual verification of `/forecast_weather` with real HRRR files
- no production performance check with real payload sizes
- no final UX polish pass

## First Tasks For A Cold-Start Agent

1. Read `brc_tools/nwp/basinwx.py` in the sibling repo and confirm the website loader matches the exporter exactly.
2. Inspect the website branch/commit listed above and understand the current integration shape.
3. Verify the current `/forecast_weather` behavior against the real payload contract:
   - run selection
   - hour selection
   - scalar field rendering
   - wind vector rendering
   - legend labels and units
   - missing-file handling
   - mobile behavior
4. Prefer small fixes on the website side over changing `brc-tools`, unless you find a real contract bug.

## Guardrails

- Do not change the `brc-tools` upload helper signature.
- Do not replace the HRRR schema with a website-only variant.
- Do not break the GEFS meteogram section while refining HRRR support.
- If there is a mismatch, assume `brc_tools/nwp/basinwx.py` is the source of truth unless there is a clear exporter bug.

## Useful Local Checks

```bash
node --check public/js/forecast_weather.js
python -m json.tool DATA_MANIFEST.json
git diff -- views/forecast_weather.html public/css/forecast_weather.css public/js/forecast_weather.js DATA_MANIFEST.json
```

Useful code to inspect:

- `server/server.js`
- `server/routes/dataUpload.js`
- `public/js/forecast_air_quality.js`

## Success Criteria

This handoff is complete when a cold-start agent can quickly answer:

- which branch and commit already contain the website-side HRRR work
- which `brc-tools` commit defines the current payload contract
- which files in `ubair-website` implement the integration
- whether the website loader truly matches the exporter schema
- what remains before the feature is safe to merge and verify live
