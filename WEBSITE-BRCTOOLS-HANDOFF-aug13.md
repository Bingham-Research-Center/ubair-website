# BASINWX → BRC-TOOLS HANDOFF
# Status: TEMPORARY (expires when the four acceptance criteria pass — then delete)
# From: Bingham-Research-Center/ubair-website, branch `dev`, HEAD 57e07f8
# To:   brc-tools repo on CHPC
# Compiled: 2026-08-13
# Supersedes: WEBSITE-BRCTOOLS-HANDOFF-apr27.md (deleted in this PR — it contained a
#             WRONG KVEL schema and a WRONG allowed-extensions list; see §CORRECTIONS)
# Audience: AI agent + human working in brc-tools/ on CHPC. Code-first, minimal prose.

---

## YOUR JOB IN ONE SENTENCE

Three website features (PRs #176, #183, #188) consume dataTypes brc-tools has never
produced, and the fan-out to `.dev` is broken for everything except observations/metadata.
Fix both. **Do not change the website-side endpoint contract** — match the schemas below and
the pages light up on their own.

---

## TOPOLOGY (do not re-derive)

| Box | Domain | Branch | pm2 app |
|---|---|---|---|
| linode-prod | www.basinwx.com | `ops` | `ubair-site` (verified 2026-08-13) |
| linode-dev | www.basinwx.dev | `dev` | unverified |

pm2 app names are irrelevant to brc-tools — you only ever touch the HTTP endpoint — but the
earlier `basinwx-ops` / `basinwx-dev` values were aspirational, not deployed. Ignore them.

Both accept identical uploads at `POST /api/upload/:dataType`. Only the checked-out branch
differs. brc-tools is the single source of truth; both websites are downstream receivers.
**Fan-out is brc-tools' responsibility** — receivers never pull.

---

## VERIFIED STATE — 2026-08-13 (live curl against both hosts)

| dataType | .com | .dev | verdict |
|---|---|---|---|
| observations | 70,690 files, newest `map_obs_20260813_0845Z.json` | 31,416, same newest | ✅ working — **this is the known-good fan-out path** |
| metadata | live | live | ✅ working |
| outlooks | present | present | manual workflow, fine |
| forecasts (Clyfar/GEFS) | 39,076 files, newest **2026-03-30 0600Z** | **1 file** | ⚠️ seasonal stop (expected) + fan-out gap |
| images (heatmaps/meteograms) | 29,824, newest **2026-03-30** | **404** | ⚠️ same |
| llm_outlooks | 462 PDFs, newest **2026-03-30** | **404** | ⚠️ same |
| `forecast_hrrr_surface_layers_*` | **1** (Apr-27 one-off) | 1 | ❌ never produced — PR #176 dark since 2026-04-17 |
| `forecast_hrrr_kvel_crosswind_*` | **0** | **0** | ❌ never produced — PR #183 dark |
| `road-forecast/latest.json` | **404** | **404** | ❌ never produced — PR #188 dark |
| timeseries | 404 | 404 | not needed — frontend uses live `/api/synoptic/timeseries` |

### Three independent problems, do not conflate them

1. **Fan-out gap.** Only observations/metadata reach `.dev`. Everything else goes to `.com`
   only. This proves brc-tools has **≥2 upload code paths** — one reads `BASINWX_API_URLS`,
   one hardcodes `.com`. Find the second one.
2. **Seasonal stop (EXPECTED — not a bug).** forecasts + images + llm_outlooks all end at
   exactly `2026-03-30 0600Z`. That is the winter-ozone season wind-down, confirmed by JRL
   2026-08-13. **Do not spend time resurrecting Clyfar now.** But the fan-out must be fixed
   **before ozone season (~Nov)** or `.dev` runs blind all winter and stops being a usable
   rehearsal mirror.
3. **Three dark PRs.** Website code merged, producers never written. That is the actual work.

---

## PRIORITY ORDER (decided with JRL 2026-08-13)

1. **`road-forecast`** ← START HERE. Server side is 100% complete; purely a producer job.
2. **Fan-out repair** — make `.dev` receive what `.com` already gets. No new content, proves
   the channel, and is the prerequisite for ozone season.
3. **`forecast_hrrr_kvel_crosswind`** — smallest payload, good pipeline shakeout.
4. **`forecast_hrrr_surface_layers`** — biggest payload, schema already pinned. Last.

---

## UPLOAD ENDPOINT — exact contract

```
POST  https://www.basinwx.com/api/upload/:dataType
POST  https://www.basinwx.dev/api/upload/:dataType
```

**Auth — both required** (`server/routes/dataUpload.js:65`, `:92`):
- Header `x-api-key: $BASINWX_API_KEY` (must equal `DATA_UPLOAD_API_KEY` on the target box)
- Either header `x-client-hostname: <host>.chpc.utah.edu`, **or** reverse-DNS of the source
  IP resolving to `*.chpc.utah.edu`. The header is faster and avoids the DNS round-trip.

**Multipart body** (multer, `server/routes/dataUpload.js:141`):
- Field name: `file` (literal — `upload.single('file')`)
- Filename preserved exactly as uploaded — match the manifest `filename.pattern`
- Size limit: **10 MB** per upload
- Allowed extensions: **`.json` `.md` `.txt` `.png` `.pdf`** (`dataUpload.js:147-151`)

**Accepted dataTypes** (`dataUpload.js:30-40`) — anything else 400s:
```
observations | metadata | outlooks | llm_outlooks | images | timeseries | forecasts | road-forecast
```

**Responses:** 200 stored · 400 bad type/invalid JSON · 401 bad key · 403 not CHPC · 413 >10 MB

**Use the repo's own uploader — it is manifest-driven and already does fan-out:**
```bash
# ubair-website/scripts/chpc_uploader.py  (this PR unblocked forecasts/road-forecast/llm_outlooks)
export BASINWX_API_URLS="https://www.basinwx.com,https://www.basinwx.dev"
export BASINWX_API_KEY="..."          # from the password manager, NOT from any doc in this repo
python3 scripts/chpc_uploader.py --data-type road-forecast --file rf.json --validate-only
python3 scripts/chpc_uploader.py --data-type road-forecast --file rf.json
```
`--validate-only` runs the pinned JSON Schema from `DATA_MANIFEST.json` locally. **Use it in
CI/dev before ever POSTing** — it is the cheapest place to catch a unit regression.

---

## FAN-OUT — `BASINWX_API_URLS`

First URL is primary (its failure fails the job); the rest are best-effort mirrors (failures
log WARN only). Parsed once by `parse_api_urls()`, `scripts/chpc_uploader.py:192`.

```bash
export BASINWX_API_URLS="https://www.basinwx.com,https://www.basinwx.dev"
```

Audit inside `brc-tools/`:
```bash
# How many distinct upload paths exist?
grep -rn "BASINWX_API_URLS\|basinwx\.com\|basinwx\.dev" --include='*.py' --include='*.sh' --include='*.toml' .

# Which producers POST directly?
grep -rln "x-api-key\|/api/upload/" --include='*.py' .

# Hypothesis to confirm: the observations producer fans out; the clustering/forecasts
# producer hardcodes www.basinwx.com. The observations producer is the KNOWN-GOOD template.
```

Fix **centrally** — one shared `upload(data_type, path)` helper for all producers. Share the
uploader, not the production logic.

---

## TARGET 1 — `road-forecast` (PR #188) ← DO THIS FIRST

**Endpoint:** `POST /api/upload/road-forecast`
**Filename:** `road_forecast_YYYYMMDD_HHMMZ.json`
**Schema:** **already pinned** — `DATA_MANIFEST.json` → `dataTypes["road-forecast"].schema`.
Read it there; do not invent fields. (This is new since apr27 — added by PR #190.)

**Server does the rest for you:** on success it copies the upload to
`public/api/static/road-forecast/latest.json` (`dataUpload.js:188-193`). Do not upload a
`latest.json` yourself.

**Load-bearing fields.** `getHRRRConditionAtPoint` (`server/roadWeatherService.js:367-396`)
reads **only these five**, from `points[].forecasts[0]`:

| field | unit | notes |
|---|---|---|
| `temp_2m` | **°C** | NOT Kelvin. See §ANTI-GOALS. |
| `precip_1hr` | mm | defaults 0 |
| `precip_type` | enum | `snow` triggers the snowfall path |
| `wind_speed_10m` | m/s | defaults 0 |
| `visibility` | **km** | server multiplies ×1000 → metres; defaults 10 |

Every other field in the manifest (`wind_gust`, `snow_depth`, `cloud_cover`, `rh_2m`,
`elevation_m`, `reference_stid`, …) is accepted and currently **ignored**. Emit them anyway —
they future-proof the payload — but do not expect them to change any output today.

**Freshness gate:** `loadHRRRForecast` (`roadWeatherService.js:336-365`) **rejects the whole
file** if `init_time` is more than **3 hours** old, and caches for 1 h. So cadence must be
**hourly, or at worst every 3 h**. Anything slower and the file is permanently rejected.

**Geometry:** 17 waypoints today — 9 `us40`, 4 `us191`, 4 `basin_roads`. Nearest-neighbour
match by Euclidean lat/lon. Densifying later is fine and needs no website change.

**Blend weight:** HRRR contributes 0.25 of a segment's condition, alongside UDOT 0.50,
camera 0.15, station 0.10 (`roadWeatherService.js:417`). Expect a *subtle* map change, not a
dramatic one.

---

## TARGET 2 — `forecast_hrrr_kvel_crosswind` (PR #183)

**Endpoint:** `POST /api/upload/forecasts` (shared dataType, distinguished by filename prefix)
**Filename:** `forecast_hrrr_kvel_crosswind_YYYYMMDD_HHMMZ.json`
**Manifest entry:** none yet — the schema below is extracted directly from the consumer,
`public/js/aviation.js:33-84`. Coordinate a manifest addition when you build it.

> ⚠️ **The apr27 handoff doc got this wrong.** It specified `crosswind_kt_rwy16` /
> `crosswind_kt_rwy34` and `metadata.runway_headings_deg_true`. Building to that spec renders
> an **empty table**. The real contract keys off zero-padded runway *headings* and a
> **top-level** `runway_headings_deg`. Verified against the code 2026-08-13.

```jsonc
{
  "product": "aviation_crosswind",   // exact string; else header falls back to "hrrr"
  "model": "hrrr",                   // shown in the <h2> when product matches
  "init_time": "2026-08-13T18:00:00Z",  // rendered verbatim as a string
  "runway_headings_deg": [160, 340],    // TOP-LEVEL. Degrees true. Drives all column pairs.
  "valid_times": ["2026-08-13T19:00:00Z", "..."],   // drives row count
  "series": {
    "wind_speed_kt":     [12, 14, ...],   // knots
    "wind_dir_deg":      [210, 215, ...], // degrees true
    "headwind_kt_160":   [ 8,  9, ...],   // key = "headwind_kt_" + String(heading).padStart(3,'0')
    "crosswind_kt_160":  [ 9, 11, ...],   // key = "crosswind_kt_" + same tag
    "headwind_kt_340":   [-8, -9, ...],
    "crosswind_kt_340":  [-9,-11, ...]
  }
}
```

**Every `series` array must be index-aligned with `valid_times`.** Missing/short arrays render
as `—`, not an error — so a silent misalignment looks like partial data, not a failure.
Column headers are derived as `Rwy` + `round(heading/10)` → `160` → `Rwy16`, `340` → `Rwy34`.

Confirm KVEL's current runway headings against the live FAA chart before hardcoding.

---

## TARGET 3 — `forecast_hrrr_surface_layers` (PR #176)

**Endpoint:** `POST /api/upload/forecasts`
**Filename:** `forecast_hrrr_surface_layers_YYYYMMDD_HHMMZ.json`
**Schema:** pinned — `DATA_MANIFEST.json` → `dataTypes.forecasts.products.hrrr_surface_layers`.
Honour the `product_type` enum. Do not invent fields.
**Cadence:** the existing forecasts schedule, `30 3,9,15,21 * * *` UTC.

**Optional index file.** `public/js/forecast_weather.js:370-387` first tries
`forecast_hrrr_surface_layers_index.json` (shape `{"runs": [{filename, init_time}, ...]}`) and
only falls back to scanning `/api/filelist/forecasts` for the newest 3. With ~39 k files in
that directory the filelist path is slow — **publishing the index file is strongly
recommended** once you have more than a handful of runs.

---

## CHPC DIAGNOSTICS — run BEFORE writing any producer

```bash
# 1. Is the data even being generated? (separate question from upload)
ls -lt $SCRATCH/clyfar_output/basinwx_export/ 2>/dev/null | head
crontab -l | grep -iE "brc|basin|clyfar|hrrr|herbie"

# 2. Where does the API key live? Must NOT be in the repo.
env | grep BASINWX          # expect BASINWX_API_KEY + BASINWX_API_URLS

# 3. Prove the channel works before building anything:
python3 scripts/chpc_uploader.py --health-check

# 4. Website-side freshness (endpoint went live in this PR — it 404'd before):
curl -fsS https://www.basinwx.dev/api/monitoring/freshness | python3 -m json.tool
curl -fsS https://www.basinwx.com/api/monitoring/freshness | python3 -m json.tool
```

`/api/monitoring/freshness` is now the fastest way to see, per dataType, whether the website
considers your uploads fresh, stale, or missing. Use it instead of eyeballing `ls`.

---

## ACCEPTANCE CRITERIA

```bash
# 1. road-forecast live on both, under the 3h gate:
for d in com dev; do
  curl -fsS "https://www.basinwx.${d}/api/static/road-forecast/latest.json" \
  | python3 -c 'import sys,json,datetime
o=json.load(sys.stdin)
age=(datetime.datetime.now(datetime.timezone.utc)-datetime.datetime.fromisoformat(o["init_time"].replace("Z","+00:00"))).total_seconds()/60
print(f"init_time age: {age:.1f} min  (must be < 180)")'
done
curl -fsS https://www.basinwx.dev/api/road-weather/forecast | jq .success   # true (currently false)

# 2. Fan-out repaired — .dev sees what .com sees:
for d in com dev; do
  printf "%s forecasts: " "$d"
  curl -fsS "https://www.basinwx.${d}/api/filelist/forecasts" | python3 -c 'import sys,json; print(len(json.load(sys.stdin)))'
done   # counts should track each other from here on

# 3. KVEL crosswind renders:
curl -fsS https://www.basinwx.dev/api/filelist/forecasts | python3 -c '
import sys,json; f=[x for x in json.load(sys.stdin) if x.startswith("forecast_hrrr_kvel_crosswind_")]
print("count:",len(f),"newest:",sorted(f)[-1] if f else None)'
# then open https://www.basinwx.dev/aviation — table must have populated HW/XW columns, not "—"

# 4. Surface layers visible:
curl -fsS https://www.basinwx.dev/api/filelist/forecasts | python3 -c '
import sys,json; print(sum(1 for f in json.load(sys.stdin) if f.startswith("forecast_hrrr_surface_layers_")))'
```

---

## ANTI-GOALS

- ❌ **Do not change** `/api/upload/:dataType`, its auth, or the schemas. The contract is the
  contract; the website side is already merged and waiting.
- ❌ **Do not invent dataTypes.** Only the eight listed are accepted; new ones need a
  website-side PR first.
- ❌ **Do not touch the observations cadence.** It is the only fully-working channel and the
  live map depends on it.
- ❌ **Do not emit Kelvin for `temp_2m`.** The website assumes °C and does no range check —
  `273 K` renders as **523 °F** and nobody notices until a stakeholder does. This regressed
  once already (#170).
- ❌ **Do not skip `--validate-only` / `--dry-run` support.** The website team needs to seed
  test fixtures when you are not around.
- ❌ **Do not put the API key in any file in either repo.** It leaked into this repo's
  `chpc-deployment/` docs and the repo is public.

---

## KNOWN GAP (accepted, documented deliberately)

The pinned `road-forecast` schema types `temp_2m` as `[number, null]` with **no range bound**,
so `--validate-only` will happily pass a Kelvin value. Schema validation catches structural
errors, not unit errors. Until a range bound is added, **the Kelvin check is on you** — assert
it in the producer.

---

## OPEN QUESTIONS FOR JRL

1. Which producer currently uploads clustering forecasts, and why does it not fan out?
2. Should `road-forecast` run hourly (matching HRRR) or 3-hourly (matching the website's 1 h
   cache)? Hourly is safer given the hard 3 h reject.
3. Confirm current KVEL runway headings against the FAA chart before hardcoding `[160, 340]`.
4. Retention: `.com` is carrying 100 k+ files with no pruning policy. Agree one before the
   Clyfar producers restart in November.

---

## WEBSITE-SIDE REFERENCES

| File | Lines | Why |
|---|---|---|
| `server/routes/dataUpload.js` | 30-40 | the 8 accepted dataTypes |
| `server/routes/dataUpload.js` | 65-135 | API key + CHPC origin validation |
| `server/routes/dataUpload.js` | 147-151 | allowed file extensions |
| `server/routes/dataUpload.js` | 188-193 | road-forecast → latest.json side-effect |
| `server/roadWeatherService.js` | 336-396 | road-forecast load, 3 h gate, field reads |
| `server/roadWeatherService.js` | 417 | source blend weights |
| `public/js/aviation.js` | 33-84 | KVEL crosswind consumer (authoritative) |
| `public/js/forecast_weather.js` | 370-387 | surface-layers index + fallback |
| `DATA_MANIFEST.json` | `dataTypes["road-forecast"]` | canonical road-forecast schema |
| `scripts/chpc_uploader.py` | 192, 241-292 | fan-out parsing + upload with retries |

---

## CORRECTIONS TO THE APR27 HANDOFF (now deleted)

1. **KVEL schema was wrong** — see §TARGET 2. Building to it yields an empty table.
2. **Allowed extensions were wrong** — it said "JSON, MD, TXT (binary won't pass)". `.png` and
   `.pdf` are accepted (`dataUpload.js:147-151`); `.com` has been receiving PNG and PDF for
   months.
3. **`road-forecast` manifest entry now exists** (PR #190) — it did not on apr27. The manifest
   is canonical; the apr27 doc's inline schema is not.
4. **The Mar-30 stop is seasonal**, not the failure the apr27 doc implied.

---

## WHEN DONE

Report back with: producer script paths, the cron entries added, a curl proof for each of the
four acceptance criteria, and any deviation from this contract with rationale.
