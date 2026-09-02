# WEBSITE ↔ BRC-TOOLS CONTRACT

**Status: PERMANENT.** This file does not expire and carries no date suffix. It describes the
interface between the `brc-tools` producers on CHPC and the two basinwx receivers. Open work
lives in `WEBSITE-BRCTOOLS-OPEN-ASKS.md` (repo root) — keep the two separate, and do not fold
transient state back into this file.

**Supersedes** `WEBSITE-BRCTOOLS-HANDOFF-aug13.md` and `WEBSITE-BRCTOOLS-HANDOFF-aug25.md`
(both deleted 2026-08-26). Their contract material is here; their open asks moved to the
open-asks file; the 2026-04→08 silent-413 incident is recorded permanently in
`docs/DEPLOYMENT.md` §8 and is not repeated in either.

**Code references are symbol-anchored.** Line numbers drift — every citation below was
re-verified against `dev` on 2026-08-26, but trust the symbol, not the number.

**Audience:** an AI agent or human working in `brc-tools/` on CHPC. Code-first, minimal prose.

---

## 1. The two receivers

| Role | Domain | Branch | pm2 app | Path | User |
|---|---|---|---|---|---|
| Production | `www.basinwx.com` | `ops` | `ubair-site` | `/var/www/ubair-website` | `root` |
| Rehearsal mirror | `www.basinwx.dev` | `dev` | `basinwx-dev` (:3001) | `/srv/ubair-website` | `deploy` |

Both accept identical uploads. **brc-tools is the single source of truth; both websites are
downstream receivers that never pull.** Fan-out is the producer's responsibility.

**The two ingest paths are not alike.** Prod's uploads arrive on loopback over an SSH tunnel
(`::ffff:127.0.0.1`, `x-client-hostname: notchpeak1.int.chpc.utah.edu`); dev's arrive as
ordinary public HTTPS from notchpeak1's real IP through nginx. Consequences:

- A green `https://www.basinwx.com/api/health` proves **nothing** about prod ingest — the paths
  are independent. If prod uploads stop, check the SSH path first (`docs/DEPLOYMENT.md` §1a).
- On dev the public path **is** the ingest path, so nginx sits in front of it and its body
  limit applies. This is what caused the four-month outage; see `docs/DEPLOYMENT.md` §8.

**Pre-flight check.** `GET /api/health` returns `version` + `manifestVersion`. Use it to
confirm which box and which contract you are talking to before uploading anything — the two
boxes deliberately never report the same version.

---

## 2. Upload endpoint

```
POST  https://www.basinwx.com/api/upload/:dataType
POST  https://www.basinwx.dev/api/upload/:dataType
```

**Auth — both required** (`server/routes/dataUpload.js`, `validateApiKey` ~:86 and
`validateCHPCOrigin` ~:117):

- Header `x-api-key: $BASINWX_API_KEY` — must equal `DATA_UPLOAD_API_KEY` on the target box.
- Either header `x-client-hostname: <host>.chpc.utah.edu`, **or** reverse-DNS of the source IP
  resolving to `*.chpc.utah.edu`. The header is faster and skips the DNS round-trip.

**Multipart body** (`upload.single('file')`, route ~:163):

- Field name: `file` — literal.
- Filename is preserved exactly as uploaded. Match the manifest `filename.pattern`.
- Size ceiling: **10 MB** (multer `limits.fileSize`, ~:79).
- Allowed extensions (checked *after* multer writes, ~:169-176): **`.json` `.md` `.txt`
  `.png` `.pdf`**. Anything else is unlinked and 400s. `.json` is additionally `JSON.parse`d;
  `.md`/`.txt` are rejected if they contain a NUL byte; `.png`/`.pdf` skip content validation.

**Accepted dataTypes** (`dataTypeMap`, ~:48-57) — anything else 400s:

```
observations | metadata | outlooks | llm_outlooks | images | forecasts | road-forecast
```

**Responses:** `200` stored · `400` bad type / invalid JSON / no file · `401` bad key ·
`403` not CHPC · `413` over a body limit.

**Two body limits, not one.** multer's is 10 MB. nginx's `client_max_body_size` sits in front
of the public path — 32 MB on dev since 2026-08-25, and unset means a **1 MB** default that
413s before Express ever sees the request. `express.json()` is mounted with no `limit`, so its
100 kb default applies to *raw JSON* bodies only; a raw-JSON probe returns 500 and is a red
herring. **Probe with multipart, the way the real producer posts.** Full detail:
`docs/DEPLOYMENT.md` §8.

---

## 3. Fan-out — `BASINWX_API_URLS`

First URL is primary (its failure fails the job); the rest are best-effort mirrors (failures
log WARN only). Parsed by `parse_api_urls()`, `scripts/chpc_uploader.py:192`.

```bash
export BASINWX_API_URLS="https://www.basinwx.com,https://www.basinwx.dev"
export BASINWX_API_KEY="..."          # from the password manager, never from a file in either repo
python3 scripts/chpc_uploader.py --data-type road-forecast --file rf.json --validate-only
python3 scripts/chpc_uploader.py --data-type road-forecast --file rf.json
```

`--validate-only` runs the pinned JSON Schema from `DATA_MANIFEST.json` locally. Use it in CI
before ever POSTing — it is the cheapest place to catch a unit regression.

**Fan-out is per-dataType, not global** — confirmed by measurement, not hypothesis.
`observations`, `metadata` and `road-forecast` reach both hosts; `llm_outlooks` has still
never created a directory on `.dev`. `images` did once, on 2026-08-27 (5 GEFS meteograms) — so
that path is not wholly dead, which narrows the cause. That means **more than one upload code
path exists** in brc-tools: one reads `BASINWX_API_URLS`, another hardcodes `www.basinwx.com`. The
observations producer is the known-good template. Fix centrally — share the uploader, not the
production logic.

```bash
# Audit inside brc-tools/
grep -rn "BASINWX_API_URLS\|basinwx\.com\|basinwx\.dev" --include='*.py' --include='*.sh' --include='*.toml' .
grep -rln "x-api-key\|/api/upload/" --include='*.py' .
```

---

## 4. Index files — the load-bearing rule

Several products ship a small `<product>_index.json` alongside their large run files. The
website reads the index first and only falls back to scanning `/api/filelist/forecasts` if it
is absent (`fetchSurfaceRunIndex()`, `public/js/forecast_weather.js` ~:371-387). With ~39 k
files in that directory the fallback is slow, so publishing the index is strongly recommended.

Shape: `{"runs": [{"filename": "...", "init_time": "..."}, ...]}`

**The index is a promise about files that exist.** Publish it only after every run file it
names has returned 200:

```
1. upload every run file
2. verify all returned 200
3. ONLY THEN upload <product>_index.json
```

If step 2 fails, do not publish the index at all. **A stale-but-honest index beats a fresh
lie** — an index pointing at 404s is what turned a four-month outage into an *invisible*
four-month outage. The current producer already uploads run files before the index; what is
missing is the gate between steps 2 and 3.

---

## 5. Products

### 5a. `road-forecast`

**Endpoint** `POST /api/upload/road-forecast` · **Filename** `road_forecast_YYYYMMDD_HHMMZ.json`
**Schema:** pinned in `DATA_MANIFEST.json` → `dataTypes["road-forecast"].schema`. Read it
there; do not invent fields.

On success the server copies the upload to `public/api/static/road-forecast/latest.json`
(`dataUpload.js` ~:214-218). **Do not upload a `latest.json` yourself.**

**Load-bearing fields.** `getHRRRConditionAtPoint` (`server/roadWeatherService.js` ~:367-396)
reads **only these five**, from `points[].forecasts[0]`:

| field | unit | notes |
|---|---|---|
| `temp_2m` | **°C** | not Kelvin — see §6 |
| `precip_1hr` | mm | defaults 0 |
| `precip_type` | enum | `snow` triggers the snowfall path |
| `wind_speed_10m` | m/s | defaults 0 |
| `visibility` | **km** | server multiplies ×1000 → metres; defaults 10 |

Every other manifest field (`wind_gust`, `snow_depth`, `cloud_cover`, `rh_2m`, `elevation_m`,
`reference_stid`, …) is accepted and currently **ignored**. Emit them anyway — they future-proof
the payload — but do not expect them to change any output today.

**Hard freshness gate.** `loadHRRRForecast` (~:336-365) **rejects the whole file** if
`init_time` is more than **3 hours** old, and caches for 1 h. Cadence must be hourly, or at
worst 3-hourly. Anything slower and the file is permanently rejected. Observed cadence as of
2026-08-26 is hourly at `:22`.

**Geometry:** 17 waypoints — 9 `us40`, 4 `us191`, 4 `basin_roads`. Nearest-neighbour match by
Euclidean lat/lon. Densifying later needs no website change.

**Blend weight:** HRRR contributes 0.25 of a segment's condition, alongside UDOT 0.50, camera
0.15, station 0.10 (`roadWeatherService.js` ~:417). Expect a subtle map change, not a dramatic
one.

### 5b. `forecast_hrrr_surface_layers`

**Endpoint** `POST /api/upload/forecasts` · **Filename**
`forecast_hrrr_surface_layers_YYYYMMDD_HHMMZ.json`
**Schema:** pinned — `DATA_MANIFEST.json` → `dataTypes.forecasts.products.hrrr_surface_layers`.
Honour the `product_type` enum. Do not invent fields.

Run files are ~1.5 MB each; a bundle is three of them plus the ~3 KB index. That size
difference is exactly what the nginx trap exploited — the index passed while every run file
413'd. See §4 and `docs/DEPLOYMENT.md` §8.

### 5c. `forecast_hrrr_kvel_crosswind`

**Endpoint** `POST /api/upload/forecasts` (shared dataType, distinguished by filename prefix)
**Filename** `forecast_hrrr_kvel_crosswind_YYYYMMDD_HHMMZ.json`
**Manifest:** `dataTypes.forecasts.products.hrrr_kvel_crosswind` (manifest 2.0.0).
Consumer of record: `public/js/aviation.js` `buildTable()` (~:32-50).

```jsonc
{
  "product": "aviation_crosswind",       // exact string; else the header falls back to "hrrr"
  "model": "hrrr_subh",                  // shown in the <h2> when product matches
  "init_time": "2026-08-13T18:00:00Z",   // rendered verbatim as a string
  "runway_headings_deg": [179, 359],     // TOP-LEVEL. Degrees true. Drives all column pairs.
  "valid_times": ["2026-08-13T19:00:00Z", "..."],   // drives row count
  "series": {
    "wind_speed_kt":     [12, 14, ...],  // knots
    "wind_dir_deg":      [210, 215, ...],// degrees true
    "gust_kt":           [18, 21, ...],  // producer sends it; the page currently ignores it
    "headwind_kt_179":   [ 8,  9, ...],  // key = "headwind_kt_" + String(heading).padStart(3,'0')
    "crosswind_kt_179":  [ 9, 11, ...],
    "headwind_kt_359":   [-8, -9, ...],
    "crosswind_kt_359":  [-9,-11, ...]
  }
}
```

**Every `series` array must be index-aligned with `valid_times`.** Missing or short arrays
render as `—`, not an error — a silent misalignment looks like partial data, not a failure.
Column headers derive as `Rwy` + `String(Math.floor(heading / 10)).padStart(2,'0')`:
`179` → `Rwy17`, `359` → `Rwy35`.

Runway headings confirmed against the FAA chart 2026-08-13 — 17/35, true `[179, 359]`, shipped
in brc-tools #59 / v0.1.1. An earlier (deleted) apr27 handoff specified `crosswind_kt_rwy16` /
`crosswind_kt_rwy34` and a nested `metadata.runway_headings_deg_true`; **building to that spec
renders an empty table.** Recorded here so it is not rediscovered.

---

## 6. Traps

**Kelvin.** `temp_2m` is °C and the website does no range check — `273` renders as **523 °F**
and nobody notices until a stakeholder does. This regressed once already (#170). The pinned
schema types `temp_2m` as `[number, null]` with **no range bound**, so `--validate-only` will
happily pass a Kelvin value: schema validation catches structural errors, not unit errors.
**Until a bound is added, the Kelvin assertion belongs in the producer.**

**Declared cadence drives our staleness window.** `/api/monitoring/freshness` derives each
dataType's staleness threshold from the manifest's cron expression
(`parseCronIntervalMinutes`, `server/monitoring/dataMonitor.js` ~:111). A declared expression
that disagrees with the real cron produces false "stale" or false "fresh". An unparseable
expression (fewer than five fields) silently falls back to **60 minutes**. brc-tools is the
contract-holder: move the cron, or send the correct expression and we update the manifest —
but do not leave them disagreeing.

**`latestFile` is mtime-ordered, not init-time-ordered.** When a bundle uploads three runs
newest-first, the freshness readout names the *oldest* init time in that bundle. Cosmetic, but
do not read it as "the newest run we have".

---

## 7. Verifying an upload landed

```bash
# Which contract does this box speak?
curl -fsS https://www.basinwx.dev/api/health | python3 -m json.tool

# Did the bundle land COMPLETE — does every file the index advertises actually exist?
curl -fsS https://www.basinwx.dev/api/static/forecasts/forecast_hrrr_surface_layers_index.json \
  | python3 -c 'import json,sys; [print(r["filename"]) for r in json.load(sys.stdin)["runs"]]' \
  | while read f; do
      echo "$(curl -s -o /dev/null -w '%{http_code}' "https://www.basinwx.dev/api/static/forecasts/$f") $f"
    done
# EVERY line must be 200. A single 404 means the index is lying.

# Per-dataType freshness, as the website sees it
curl -fsS https://www.basinwx.dev/api/monitoring/freshness | python3 -m json.tool

# Prove the channel before building anything
python3 scripts/chpc_uploader.py --health-check
```

`/api/filelist/:dataType` returns **404** when a dataType's directory has never been created —
that is "never uploaded here", distinguishable from a 500 since v1.5.2.

---

## 8. Anti-goals

- **Do not change the endpoint contract.** `POST /api/upload/:dataType`, multipart `file=@...`,
  `x-api-key` + CHPC hostname. It works; it has never been the problem.
- **Do not invent dataTypes.** Only the eight listed are accepted; a new one needs a
  website-side PR first.
- **Do not touch the observations cadence.** It is the most reliable channel and the live map
  depends on it.
- **Do not raise limits to make a symptom go away.** multer is 10 MB, nginx is 32 MB on dev.
  A file exceeding those is a conversation, not a config bump.
- **Do not retry a 413 in a loop.** It will never succeed. Fail and exit non-zero.
- **Do not emit Kelvin for `temp_2m`.** See §6.
- **Do not drop `--validate-only` / `--dry-run` support.** The website team needs to seed test
  fixtures when you are not around.
- **Do not put the API key in any file in either repo.** It leaked into `chpc-deployment/`
  once and the repo is public.

---

## 9. Website-side reference map

Symbol-anchored; line numbers verified 2026-08-26 against `dev` and expected to drift.

| Symbol | File | Why |
|---|---|---|
| `dataTypeMap` (~:48) | `server/routes/dataUpload.js` | the 8 accepted dataTypes |
| `validateApiKey` (~:86) | `server/routes/dataUpload.js` | `x-api-key` check |
| `validateCHPCOrigin` (~:117) | `server/routes/dataUpload.js` | hostname / reverse-DNS check |
| `multer({limits})` (~:77) | `server/routes/dataUpload.js` | 10 MB ceiling |
| extension gate (~:169) | `server/routes/dataUpload.js` | allowed extensions + JSON parse |
| road-forecast copy (~:214) | `server/routes/dataUpload.js` | `latest.json` side-effect |
| `loadHRRRForecast` (~:336) | `server/roadWeatherService.js` | 3 h reject gate, 1 h cache |
| `getHRRRConditionAtPoint` (~:367) | `server/roadWeatherService.js` | the five fields actually read |
| `DEFAULT_WEIGHTS` (~:417) | `server/roadWeatherService.js` | source blend weights |
| `buildTable` (~:32) | `public/js/aviation.js` | KVEL crosswind consumer (authoritative) |
| `fetchSurfaceRunIndex` (~:371) | `public/js/forecast_weather.js` | index + filelist fallback |
| `parseCronIntervalMinutes` (~:111) | `server/monitoring/dataMonitor.js` | staleness window derivation |
| `parse_api_urls` (:192), `upload_file` (:241) | `scripts/chpc_uploader.py` | fan-out + upload with retries |
| `dataTypes["road-forecast"]`, `dataTypes.forecasts.products.*` | `DATA_MANIFEST.json` | canonical schemas |
