# BASINWX-DEV → BRC-TOOLS HANDOFF
# From: Bingham-Research-Center/ubair-website (branch `dev`, HEAD a14fd93)
# To: brc-tools repo on CHPC (whichever path your session is in)
# Compiled: 2026-04-27
# Format: AI-agent consumption — code-first, dense, minimal prose
# Audience: Claude session running in brc-tools/ on CHPC. The human will copy this file in.

---

## YOUR JOB IN ONE SENTENCE

Three new website features merged into `dev` (PRs #176, #183, #188) consume dataTypes
that brc-tools has never produced or uploaded. Fix that, AND repair the fan-out so
`.dev` receives the same forecasts as `.com`. Do not change the website-side endpoint
contract — match the schemas below and the website will light up automatically.

---

## TOPOLOGY (refresher — do not re-derive)

| Box | Domain | Branch | pm2 app | Purpose |
|---|---|---|---|---|
| linode-prod | www.basinwx.com | `ops` | `basinwx-ops` | production |
| linode-dev | www.basinwx.dev | `dev` | `basinwx-dev` | rehearsal mirror, stakeholder demos |

Both boxes accept identical CHPC uploads via `POST /api/upload/:dataType`. The only thing that
differs is which branch of code is checked out. brc-tools is the **single source of truth** for
forecast/observation data; both website boxes are downstream consumers. Fan-out is brc-tools'
responsibility — receivers don't pull, they receive POSTs.

---

## CONFIRMED BROKEN (verified by curl 2026-04-27)

```
✓ observations/                   5-min cadence on .com AND .dev (control: fan-out works for this dataType)
✓ outlooks/                       present on both
✗ forecasts/forecast_clustering_*  100s of files on .com, ZERO on .dev      ← fan-out gap
✗ forecasts/forecast_hrrr_kvel_*   ZERO on .com, ZERO on .dev               ← never produced (PR #183 dark)
✗ forecasts/forecast_hrrr_surface_layers_*  ZERO on both                    ← never produced (PR #176 dark since 2026-04-17)
✗ road-forecast/latest.json       404 on both                               ← never produced (PR #188 dark)
```

**The fan-out gap is the canary.** It proves brc-tools has at least two upload paths:
one that respects multi-target fan-out (observations) and one that doesn't (clustering forecasts).
Find the second path, make it match the first.

---

## UPLOAD ENDPOINT — exact contract

```
POST  https://www.basinwx.com/api/upload/:dataType
POST  https://www.basinwx.dev/api/upload/:dataType
```

**Auth (both required):**
- Header `x-api-key: $DATA_UPLOAD_API_KEY` (same secret on both boxes; brc-tools .env should have it)
- Either:
  - Header `x-client-hostname: <something>.chpc.utah.edu`, OR
  - Reverse-DNS of source IP resolves to `*.chpc.utah.edu`

The hostname header is fastest and avoids DNS lookups. Set it once in your HTTP client.

**Multipart body (multer):**
- Field name: `file` (literal — `upload.single('file')` in `server/routes/dataUpload.js:141`)
- Filename: preserved as uploaded — match the `filename.pattern` in DATA_MANIFEST.json
- Size limit: 10 MB per upload
- Allowed extensions: JSON, MD, TXT (binary forecast files won't pass — gzip+base64 inside JSON if you must)

**Accepted dataTypes** (see `server/routes/dataUpload.js:30-40`):
```
observations | metadata | outlooks | llm_outlooks | images | timeseries | forecasts | road-forecast
```

Anything else gets a 400. Don't invent new dataTypes without a website-side PR first.

**Response shape:**
```json
{ "success": true, "filename": "...", "dataType": "..." }
```
HTTP 200 = stored. 401 = bad/missing API key. 403 = not from CHPC. 413 = >10 MB.

**Reference Python snippet (verified contract):**
```python
import requests
with open(local_path, 'rb') as f:
    r = requests.post(
        f"{base_url}/api/upload/{data_type}",
        headers={
            "x-api-key": os.environ["DATA_UPLOAD_API_KEY"],
            "x-client-hostname": socket.gethostname(),  # must end .chpc.utah.edu
        },
        files={"file": (os.path.basename(local_path), f, "application/json")},
        timeout=30,
    )
    r.raise_for_status()
```

---

## FAN-OUT CONFIG — `BASINWX_API_URLS`

The website's CLAUDE.md and PR #178 say uploads are fanned out to a comma-separated list of
URLs read from `BASINWX_API_URLS` (first = primary, rest = best-effort mirrors). For the
forecasts gap, **find the uploader that doesn't read this var and fix it.**

Suggested target value on CHPC:
```bash
export BASINWX_API_URLS="https://www.basinwx.com,https://www.basinwx.dev"
```

Audit pattern (run inside brc-tools/):
```bash
# How many distinct upload helpers exist?
grep -rn "BASINWX_API_URLS\|basinwx.com\|basinwx.dev" --include='*.py' --include='*.sh'

# Each producer (clyfar, hrrr, observations, ...) likely has its own upload call.
# The ones hardcoding www.basinwx.com or single-URL env vars are the ones not fanning out.
```

Fix once, centrally — share one `upload()` helper across all producers. Don't paper over per-call.

---

## DATATYPE 1 — `road-forecast` (PR #188)

**Endpoint:** `POST /api/upload/road-forecast`
**Filename:** `road_forecast_<YYYYMMDD_HHMMZ>.json` (any pattern; server preserves it)
**Server side-effect:** automatically copies the upload to `public/api/static/road-forecast/latest.json`
(see `server/routes/dataUpload.js:189`). brc-tools doesn't need a "latest" alias.
**Cadence:** every HRRR run is fine (hourly), but every 3h matches website caching (`server/roadWeatherService.js:368-396` caches for 1h, rejects if `init_time` >3h old).
**Manifest entry:** does not yet exist — Tier 1.2 on the website side will add one. Coordinate.

**Schema (extracted from `server/roadWeatherService.js:loadHRRRForecast` + `getHRRRConditionAtPoint`):**
```jsonc
{
  "init_time": "2026-04-27T18:00:00Z",     // ISO-8601 UTC. REJECTED if >3h old at read time.
  "model": "hrrr",                          // optional, recommended
  "domain": "uintah_basin_roads",           // optional, recommended
  "points": [
    {
      "lat": 40.4555,
      "lon": -110.0532,
      "name": "US-40 MP 90 (optional)",
      "forecasts": [
        {
          "valid_time": "2026-04-27T19:00:00Z",  // optional but recommended
          "temp_2m": -2.3,            // °C    ← NOT Kelvin. The "523°F" disaster of #170 is why.
          "precip_1hr": 0.5,           // mm
          "precip_type": "snow",       // "snow" | "rain" | "mixed" | "none"
          "wind_speed_10m": 4.2,       // m/s (the website assumes m/s; document any deviation)
          "visibility": 12.5           // km — website multiplies ×1000 to get metres
        }
        // ...as many forecast hours as you want; website uses [0] for "now"
      ]
    }
    // Aim for grid coverage of UTH-1, UTH-2, US-40, US-191. ~50-200 points is fine.
  ]
}
```

**Verification curl (after upload + fan-out fix):**
```bash
curl -fsS https://www.basinwx.dev/api/static/road-forecast/latest.json | jq .init_time
curl -fsS https://www.basinwx.com/api/static/road-forecast/latest.json | jq .init_time
# Should be the same ISO timestamp, <3h old.
curl -fsS https://www.basinwx.dev/api/road-weather/forecast | jq .success
# Should be `true`. (Currently returns "No HRRR road forecast available".)
```

---

## DATATYPE 2 — `forecast_hrrr_kvel_crosswind_*` (PR #183)

**Endpoint:** `POST /api/upload/forecasts`  (note: shared with Clyfar/clustering — same dataType, different filename prefix)
**Filename pattern:** `forecast_hrrr_kvel_crosswind_<YYYYMMDD_HHMMZ>.json`
**Cadence:** every HRRR cycle (hourly OK; suggest at least 4×/day matching the existing forecasts schedule)
**Manifest entry:** does not yet exist — coordinate with website side.

**Schema (extracted from `public/js/aviation.js:14-50`):**
```jsonc
{
  "product": "aviation_crosswind",         // literal — consumer checks this string
  "model": "hrrr",                          // becomes the page header
  "init_time": "2026-04-27T18:00:00Z",
  "valid_times": [                          // time labels for table columns
    "2026-04-27T19:00Z", "2026-04-27T20:00Z", "..."
  ],
  "series": {
    "crosswind_kt_rwy16": [3.2, 4.1, ...],  // knots; positive = crosswind from one side
    "crosswind_kt_rwy34": [-3.2, -4.1, ...] // negative = from the other (paired with rwy16)
    // Add headwind/tailwind series if the page evolves; current consumer only renders crosswind_kt_*.
  },
  "metadata": {                             // optional
    "station": "KVEL",
    "lat": 40.4408,
    "lon": -109.5119,
    "runway_headings_deg_true": [160, 340]
  }
}
```

KVEL has runways 16/34 (and was historically 7/25 — verify current chart). The series tags
(`crosswind_kt_<runway>`) must match what the consumer iterates: see line 42 of `aviation.js`.

**Verification:**
```bash
curl -fsS https://www.basinwx.dev/api/filelist/forecasts | python3 -c '
import sys,json
files = json.load(sys.stdin)
kvel = sorted([f for f in files if f.startswith("forecast_hrrr_kvel_crosswind_")])
print("count:", len(kvel), "newest:", kvel[-1] if kvel else None)
'
# Then visually: open https://www.basinwx.dev/aviation — the crosswind table should populate.
```

---

## DATATYPE 3 — `forecast_hrrr_surface_layers_*` (PR #176, dark since 2026-04-17)

**Endpoint:** `POST /api/upload/forecasts`
**Filename pattern:** `forecast_hrrr_surface_layers_<YYYYMMDD_HHMMZ>.json`
**Cadence:** existing forecasts schedule (cron `30 3,9,15,21 * * *` UTC, 3.5h after GEFS runs)
**Manifest entry:** **already exists** at `DATA_MANIFEST.json:487` — read it as the canonical schema source. Do not invent fields.

```bash
# In ubair-website:
sed -n '487,610p' DATA_MANIFEST.json   # full schema for hrrr_surface_layers
```

The schema's `product_type` enum is `"surface_layers"` (line 519). Honour it.

**Verification:**
```bash
curl -fsS https://www.basinwx.dev/api/filelist/forecasts | python3 -c '
import sys,json
files = json.load(sys.stdin)
hits = sorted([f for f in files if f.startswith("forecast_hrrr_surface_layers_")])
print("count:", len(hits), "newest:", hits[-1] if hits else None)
'
```

---

## DIAGNOSTIC STEPS (run these BEFORE writing new producers)

```bash
# 1. What does brc-tools think is the upload destination?
grep -rn "BASINWX_API_URLS\|basinwx\." --include='*.py' --include='*.sh' --include='*.toml' .

# 2. Which producer scripts already POST to the website?
grep -rln "x-api-key\|/api/upload/" --include='*.py' .

# 3. Run one of them with --dry-run / -v if available, see what URL it actually hits.
#    The hypothesis: the observations producer reads BASINWX_API_URLS and fans out;
#    the clustering/forecasts producer hardcodes www.basinwx.com and doesn't.

# 4. Check the cron table on CHPC for the user that runs these jobs:
crontab -l | grep -iE "brc|basin|clyfar|hrrr|herbie"

# 5. Are HRRR/clyfar outputs even being generated? (separate question from upload)
ls -lt $SCRATCH/clyfar_output/basinwx_export/ 2>/dev/null | head
ls -lt /uufs/chpc.utah.edu/.../forecasts/ 2>/dev/null | head
# If outputs aren't being produced, the upload work is moot — fix production first.
```

---

## RECOMMENDED PRODUCTION ORDER (smallest viable first)

1. **Fix fan-out for clustering** — add `.dev` to whatever target list the existing forecasts uploader uses. Verifies the channel without producing new content. ~30 min.
2. **`forecast_hrrr_kvel_crosswind`** — single point (KVEL), 24-48 forecast hours, two series. Smallest payload of the three. Use this to debug your producer pipeline. ~1-2 days.
3. **`road-forecast`** — grid points along Uintah Basin road network. More data, but same shape per-point as #2 conceptually. ~2-3 days.
4. **`forecast_hrrr_surface_layers`** — biggest payload (full surface grid). Schema is already pinned in DATA_MANIFEST.json. Save for last so the smaller producers shake out infrastructure first.

Each producer should use a shared `upload(dataType, filepath)` helper that:
- reads `BASINWX_API_URLS` once
- POSTs to each in order, primary then mirrors
- treats mirror failures as warnings, primary failure as error
- logs per-target success with timing
- supports `--dry-run` for dev iteration

---

## ACCEPTANCE CRITERIA

After your work, all of these must succeed:

```bash
# 1. Existing fan-out repaired:
curl -fsS https://www.basinwx.dev/api/filelist/forecasts | python3 -c '
import sys,json; d=json.load(sys.stdin)
print("clustering files on .dev:", sum(1 for f in d if "clustering_summary" in f))
'   # > 0

# 2. road-forecast live on both:
for d in com dev; do
  curl -fsS "https://www.basinwx.${d}/api/static/road-forecast/latest.json" \
    | python3 -c 'import sys,json,datetime; o=json.load(sys.stdin)
age=(datetime.datetime.now(datetime.UTC)-datetime.datetime.fromisoformat(o["init_time"].replace("Z","+00:00"))).total_seconds()/60
print(f".${d} init_time age: {age:.1f} min")'
done   # both <180 minutes

# 3. KVEL crosswind page renders:
#    Visit https://www.basinwx.dev/aviation — table populates with knots data.

# 4. HRRR surface layers visible:
curl -fsS https://www.basinwx.dev/api/filelist/forecasts | python3 -c '
import sys,json; d=json.load(sys.stdin)
print("hrrr surface files on .dev:", sum(1 for f in d if f.startswith("forecast_hrrr_surface_layers_")))
'   # > 0
```

---

## ANTI-GOALS — do NOT do these

- ❌ Change the website's `/api/upload/:dataType` route or auth — schema is the contract; everything else is implementation detail you don't control.
- ❌ Invent new dataTypes (e.g. `road-conditions-v2`) — the website only consumes the eight listed above. New consumers require a website-side PR first.
- ❌ Touch observations cadence — that's the only working channel; a regression there blanks the live map.
- ❌ Squash all producers into one mega-script — each forecast type has its own data dependencies (HRRR vs GEFS vs Synoptic). Share the `upload()` helper, not the production logic.
- ❌ Strip the Kelvin → °C conversion in HRRR pipelines — website unit tests confirm °C and the per-merge sanity check is `273 K → 524°F` if you regress.
- ❌ Skip `--dry-run`/test-fixture support — the website team will need to seed test data when you're not around.

---

## OPEN QUESTIONS (answer with the human before writing code)

1. **Where is the existing observations uploader?** That's the canonical "good" example to copy — fan-out works, hostname header set correctly, etc. Find it first.
2. **Is `road-forecast` produced from HRRR-native or post-processed?** The schema assumes 2 m / 10 m / 1-hr precip / surface visibility — all native HRRR fields. If you're going through a different model (NAM, RAP), document the deviation in the JSON's optional `model` field.
3. **What's the runway naming convention at KVEL?** Verify against current FAA chart before hardcoding `rwy16/rwy34` series tags.
4. **Where does brc-tools' python env keep `DATA_UPLOAD_API_KEY`?** Should be in a `.env` or shell profile, never in the repo. If absent, get from the human.

---

## REFERENCES (paths in the ubair-website repo)

| File | Lines | Why |
|---|---|---|
| `server/routes/dataUpload.js` | 30-40 | dataTypeMap (the 8 accepted dataTypes) |
| `server/routes/dataUpload.js` | 95-135 | CHPC origin validation logic |
| `server/routes/dataUpload.js` | 141 | route + multer field name `file` |
| `server/routes/dataUpload.js` | 188-195 | road-forecast latest.json side-effect |
| `server/roadWeatherService.js` | 368-431 | road-forecast schema (loadHRRRForecast + getHRRRConditionAtPoint) |
| `public/js/aviation.js` | 1-100 | KVEL crosswind consumer |
| `DATA_MANIFEST.json` | 247-629 | forecasts schemas (canonical for hrrr_surface_layers; clyfar variants) |
| `DATA_MANIFEST.json` | 487-610 | hrrr_surface_layers schema specifically |
| `CLAUDE.md` | "Data Pipeline" + "Recent Updates" | repository context including fan-out + PR #178 |

---

## END

When you've completed the four acceptance criteria, post back to the human with:
- the producer script paths (so they can be reviewed)
- the cron entries you added/changed
- a curl-based proof for each criterion above
- any deviation from this contract, with rationale
