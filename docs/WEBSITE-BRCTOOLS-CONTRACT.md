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

**Both boxes ingest over public HTTPS from notchpeak1**, through nginx, into the app. Prod logs
`::ffff:127.0.0.1` only because its proxy does not pass `X-Forwarded-For`; there is no SSH
tunnel (corrected 2026-09-23, `docs/DEPLOYMENT.md` §1a). Consequences:

- nginx's body limit applies on **both** boxes. It caused the four-month outage on dev
  (`docs/DEPLOYMENT.md` §8); prod's nginx passed a 1.5 MB probe on 2026-08-25.
- A green `/api/health` means the box is reachable, not that a push landed. Ask
  `/api/monitoring/freshness`, or `/api/monitoring/uploads` with the key (1.5.5+).
- POST to `https://www.basinwx.com`, not the bare domain, which also resolves to a Namecheap
  forwarding host (`docs/DEPLOYMENT.md` §8).

**Pre-flight check.** `GET /api/health` returns `version` + `manifestVersion` (and, since
1.5.5, `commit`, `startedAt` and `vendorAssets`, so a half-finished deploy is visible too). Use it to
confirm which box and which contract you are talking to before uploading anything — the two
boxes deliberately never report the same version.

---

## 2. Upload endpoint

```
POST  https://www.basinwx.com/api/upload/:dataType
POST  https://www.basinwx.dev/api/upload/:dataType
```

**Auth — both required** (`server/routes/dataUpload.js`, `validateApiKey` and
`validateOrigin`; the rules themselves are in `server/uploadPolicy.js`):

- Header `x-api-key: $BASINWX_API_KEY` — must equal `DATA_UPLOAD_API_KEY` on the target box.
  **This is the authentication.**
- Either header `x-client-hostname: <host>`, **or** reverse-DNS of the source IP, must be on
  the box's host allowlist. The header is faster and skips the DNS round-trip.

**The host allowlist (1.7.3+).** `UPLOAD_ALLOWED_HOSTS` in each box's `.env` is a comma- or
space-separated list. An entry that starts with a dot is a suffix (`.chpc.utah.edu` matches
`chpc.utah.edu` and any host under it); any other entry is one exact hostname. Unset, it is
`.chpc.utah.edu`, so CHPC needs nothing. Setting it **replaces** the default, so a box that
takes a second producer lists both: `UPLOAD_ALLOWED_HOSTS=.chpc.utah.edu,<hub's name>`.

- It is a filter, not a second lock: the header is the client's own word. It keeps a
  misconfigured producer out; the key keeps strangers out.
- A producer outside CHPC sends a fixed, agreed `x-client-hostname` (not whatever
  `socket.gethostname()` returns: a Linode may well call itself `localhost`).
- The match is on a label boundary. Before 1.7.3 it was `endsWith('chpc.utah.edu')`, which
  also let `evilchpc.utah.edu` through.

**Multipart body** (`upload.single('file')`, route ~:163):

- Field name: `file` — literal.
- Filename is preserved exactly as uploaded. Match the manifest `filename.pattern`.
- Size ceiling: **10 MB** (multer `limits.fileSize`, ~:79).
- Allowed extensions (checked *after* multer writes): **`.json` `.md` `.txt` `.png` `.pdf`**
  for the seven older dataTypes; `llm_forecasts` takes **`.json` only** and `aircraft` takes
  **`.json` `.png`** (`allowedExtensions` in `server/uploadPolicy.js`). Anything else is
  unlinked and 400s. `.json` is additionally `JSON.parse`d; `.md`/`.txt` are rejected if they
  contain a NUL byte; `.png`/`.pdf` skip content validation.

**Accepted dataTypes** (`UPLOAD_DATA_TYPES` in `server/uploadPolicy.js`):

```
observations | metadata | outlooks | llm_outlooks | images | forecasts | road-forecast
llm_forecasts | aircraft                                              (both new in 1.7.3)
```

**Any other dataType is a 400 (1.7.3+)**, answered before anything is written, with the
accepted list in `supported`. Until then the route used the supplied name as a directory name
as it came, so a typo made a new directory and a name such as `../..` wrote outside the upload
root. A box still on an older version (check `version` at `/api/health`) stores an unknown
dataType unchecked: see the pinning rule in `docs/DEPLOYMENT.md` §7a.

**Responses:** `200` stored · `400` unknown dataType / invalid file extension / invalid JSON /
no file / an `llm_forecasts` file that breaks its contract (§5d) · `401` bad key ·
`403` host not on the allowlist · `413` over a body limit.

**Two body limits, not one.** multer's is 10 MB. nginx's `client_max_body_size` sits in front
of the public path — 32 MB on dev since 2026-08-25, and unset means a **1 MB** default that
413s before Express ever sees the request. `express.json()` has an explicit
100 kb limit for *raw JSON* bodies; oversized JSON returns 413 and malformed JSON returns 400.
A raw-JSON probe does not exercise multipart uploads. **Probe with multipart, the way the real producer posts.** Full detail:
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
Consumer of record: `public/js/aviation.js` `forecastComponents()` and `summariseRunway()`, the
`/aviation` page (back on `dev` in 1.6.1 after being parked on 12 Nov 2026). It pairs reciprocal
headings into one strip (`[179, 359]` → `Rwy 17/35`), reads `crosswind_kt_<h>` / `headwind_kt_<h>`
for the lower heading of each pair and computes them from `wind_speed_kt` / `wind_dir_deg` when
either is missing. Steps more than 7.5 min in the past are not shown: a run lands about three
hours after `init_time`, so roughly half of its six hours is already history.

```jsonc
{
  "product": "aviation_crosswind",       // exact string; else the header falls back to "hrrr"
  "model": "hrrr_subh",                  // shown in the <h2> when product matches
  "init_time": "2026-08-13T18:00:00Z",   // shown as "1800Z"
  "runway_headings_deg": [179, 359],     // TOP-LEVEL. Degrees true. Drives all column pairs.
  "valid_times": ["2026-08-13T19:00:00Z", "..."],   // drives row count
  "series": {
    "wind_speed_kt":     [12, 14, ...],  // knots
    "wind_dir_deg":      [210, 215, ...],// degrees true
    "gust_kt":           [18, 21, ...],  // scales the crosswind ("In gusts"); floored at the wind
    "headwind_kt_179":   [ 8,  9, ...],  // key = "headwind_kt_" + String(heading).padStart(3,'0')
    "crosswind_kt_179":  [ 9, 11, ...],
    "headwind_kt_359":   [-8, -9, ...],
    "crosswind_kt_359":  [-9,-11, ...]
  }
}
```

**Every `series` array must be index-aligned with `valid_times`.** Missing or short arrays
render as `—`, not an error — a silent misalignment looks like partial data, not a failure.
Runway numbers derive as `String(Math.floor(heading / 10)).padStart(2,'0')`, matching the
producer's `heading // 10`: `179` → `17`, `359` → `35`.

Runway headings confirmed against the FAA chart 2026-08-13 — 17/35, true `[179, 359]`, shipped
in brc-tools #59 / v0.1.1. An earlier (deleted) apr27 handoff specified `crosswind_kt_rwy16` /
`crosswind_kt_rwy34` and a nested `metadata.runway_headings_deg_true`; **building to that spec
renders an empty table.** Recorded here so it is not rediscovered.

### 5d. `llm_forecasts` (1.7.3+)

**Endpoint** `POST /api/upload/llm_forecasts` · **Filename**
`llm_forecast_<persona>_YYYYMMDD_HHMMZ.json` · **JSON only**
**Schema:** `llm_forecast/1`, pinned in `DATA_MANIFEST.json` → `dataTypes.llm_forecasts`
(a JSON Schema plus the placement table). The same rules as code:
`public/js/llmForecast.js`. Sample files: `public/js/__tests__/fixtures/llm_forecasts/`.

Tiered LLM forecast text. The producer generates and pushes; **the site only renders**, with
no LLM key on either box. One file per run per persona. Each text belongs to a *placement*
(where it appears) and a *tier* (`public`, `industry`, `expert`).

**This is the one dataType the server validates against its contract.** A file that breaks it
gets `400` with every reason in `errors`, is not stored, and shows in
`/api/monitoring/uploads` as `llm_forecast refused: <first reason>`. Beyond the JSON Schema,
the server enforces three rules the schema cannot express:

1. **Who writes what.** Each tier of each placement belongs to one persona (the manifest's
   `placements` table). Rhiannon writes `expert` tiers only; a file in which she writes a
   `public` tier is refused.
2. **Word budgets.** Each tier has a budget; a text longer than 1.5× its budget is refused.
   The site never truncates, so the producer must write to length.
3. **Name and time.** The filename's persona matches `persona`, its stamp is `issued` to the
   minute (UTC), and `issued` is not more than 15 minutes ahead of the server's clock.

**`latest_<persona>.json`.** After a valid upload the server copies it to
`latest_ffion.json` or `latest_rhiannon.json` in the same directory, unless the copy already
there was issued later (so a late backfill cannot roll the site back). Pages read these;
**do not upload them yourself** (the name fails rule 3).

**What the site does with it.** Text is shown as written: plain text, blank lines as
paragraph breaks, no Markdown or HTML. A block is hidden, never replaced by a placeholder,
when its file is missing, past `valid_until`, older than the persona's `staleHours` (Ffion
12 h, Rhiannon 6 h), or describes an older GEFS cycle than the chart beside it. Readers see
the label "LLM forecast", never a persona name.

### 5e. `aircraft` (1.7.3+)

**Endpoint** `POST /api/upload/aircraft` · **Filename**
`aircraft_<product>_YYYYMMDD_HHMMZ.json` (or `.png`)
**Schema:** none pinned yet. The dataType exists so the ADS-B hub has somewhere to send
products; no page reads it. Each file family gets a manifest entry and a schema **before**
the website reads it. The hub's `x-client-hostname` must be on each box's host allowlist (§2).

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
- **Do not put the API key in any file in either repo.** It leaked into the old CHPC
  deployment helpers once (scrubbed 2026-08-13, directory deleted 2026-09-28, value still in
  git history) and the repo is public.

---

## 9. Website-side reference map

Symbol-anchored; line numbers verified 2026-08-26 against `dev` and expected to drift.

| Symbol | File | Why |
|---|---|---|
| `UPLOAD_DATA_TYPES`, `allowedExtensions` | `server/uploadPolicy.js` | the nine accepted dataTypes and what files each takes |
| `parseAllowedHosts`, `isAllowedHost` | `server/uploadPolicy.js` | the host allowlist rules |
| `validateApiKey` | `server/routes/dataUpload.js` | `x-api-key` check |
| `validateOrigin`, `validateDataType` | `server/routes/dataUpload.js` | hostname / reverse-DNS check; 400 for an unknown dataType |
| `validateLlmForecast`, `PLACEMENTS` | `public/js/llmForecast.js` | the `llm_forecast/1` contract, shared with the pages |
| `updateLatestLlmForecast` | `server/routes/dataUpload.js` | `latest_<persona>.json` side-effect |
| `multer({limits})` (~:77) | `server/routes/dataUpload.js` | 10 MB ceiling |
| extension gate (~:169) | `server/routes/dataUpload.js` | allowed extensions + JSON parse |
| road-forecast copy (~:214) | `server/routes/dataUpload.js` | `latest.json` side-effect |
| `loadHRRRForecast` (~:336) | `server/roadWeatherService.js` | 3 h reject gate, 1 h cache |
| `getHRRRConditionAtPoint` (~:367) | `server/roadWeatherService.js` | the five fields actually read |
| `DEFAULT_WEIGHTS` (~:417) | `server/roadWeatherService.js` | source blend weights |
| `forecastComponents`, `summariseRunway` | `public/js/aviation.js` | KVEL crosswind consumer (authoritative) |
| `fetchSurfaceRunIndex` (~:371) | `public/js/forecast_weather.js` | index + filelist fallback |
| `parseCronIntervalMinutes` (~:111) | `server/monitoring/dataMonitor.js` | staleness window derivation |
| `parse_api_urls` (:192), `upload_file` (:241) | `scripts/chpc_uploader.py` | fan-out + upload with retries |
| `dataTypes["road-forecast"]`, `dataTypes.forecasts.products.*` | `DATA_MANIFEST.json` | canonical schemas |
