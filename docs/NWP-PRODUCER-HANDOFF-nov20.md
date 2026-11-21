# NWP Producer Handoff — Nov 20

**Status:** temporary. Written 2026-11-20, then regrouped by repo the same evening after a
session on notchpeak1 answered four of the asks and fixed six. It is for whoever builds the
producer side of the NWP dashboard: John, or an AI agent working in one of the repos named in
§2. Delete this file once every row in §2 is done or has moved to
`WEBSITE-BRCTOOLS-OPEN-ASKS.md`. The permanent rules are in
[`WEBSITE-BRCTOOLS-CONTRACT.md`](WEBSITE-BRCTOOLS-CONTRACT.md) §2 and §5d–5e; this file is the
to-do list, the worked example and the evidence.

**The short version.** The website is ready to receive tiered LLM forecast text (`llm_forecasts`)
and aircraft products (`aircraft`); it never writes text itself. Its version 1.8.0 is held until
the Ffion weather run (P2) delivers live text, so **P2 is the critical path**, and it now needs
new repos (§2c). On 20 Nov: the brc-tools fixes for P8, P9, P10, P15, P16/R1 and P17 went up as
PRs #76–#78, and the Clyfar winter job was switched back on (which closes the `llm_outlooks` half
of P1 and delivers P4 for the winter once its first cycle checks out). On 21 Nov an audit of the
observation feed added P21–P24 for the air-quality stations (§9).

---

## 1. Rules for every producer

1. **Send everything to both hosts, identically** (John, 20 Nov). `.com` and `.dev` get the same
   files at the same time. A product goes to `.dev` only when this file or the manifest says so,
   with the reason and the condition that ends it. Never pin by habit.

   | Dev-only today | Why | Ends when |
   |---|---|---|
   | `llm_forecasts` | `.com` (1.7.0, manifest 2.1.1) predates the dataType: it would store the file unchecked and never write `latest_<persona>.json` | `.com` reports manifest **2.2.0** or later |
   | `aircraft` | Same: the dataType is new in 1.7.3 | Same |
   | `forecast_rrfs_surface_layers_*` (in `forecasts`) | A hand-run draft, not a product: one RRFS run (init 2026-11-21 00Z) sent on 21 Nov with `--server-url https://www.basinwx.dev`. Same schema as the HRRR surface layers with `"model": "rrfs"`. Nothing reads it, no cron sends it, the manifest does not list it | The manifest gains an RRFS product and a page draws it; until then nobody should schedule it |

   Pin with `BASINWX_API_URLS="https://www.basinwx.dev"` in that job's wrapper
   (`docs/DEPLOYMENT.md` §7a) and unpin in the PR after the promotion. Check first:

   ```bash
   curl -fsS https://www.basinwx.com/api/health | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['version'], d['manifestVersion'])"
   ```

2. **Target `www.`**: `https://www.basinwx.com`, `https://www.basinwx.dev`. (The shared
   `~/.config/ubair-website/website_urls` on notchpeak1 still reads the bare domains, which work
   today; see §5.)
3. **A new file family needs a manifest entry first**, in a website PR. A changed field or unit
   is a manifest MAJOR and needs a producer release before the website promotes.
4. **Check the payload, not the name.** Three fields in this file meant something other than
   their names said (§4).

## 2. The asks, by repo

Status as of 2026-11-21 06:30Z. "PR" means open and waiting for John's merge. A brc-tools fix
is live only after the merge **and** a `git pull --ff-only` in `~/gits/brc-tools` on notchpeak1,
which is the tree the crons run from. **"Live" below means both happened**: brc-tools #76–#79,
#83 and #75 are merged and the cron tree is at `460d5c6`.

### 2a. `brc-tools`: HRRR and observation crons

| # | Ask | Status |
|---|---|---|
| **P8** | Wind gust and visibility in the observation feed | **Live (#76).** 38 stations send gusts, 28 visibility |
| **P9** | `road-forecast` `precip_1hr` was the run total | **Live (#77).** Root cause and evidence in §4 |
| **P10** | Surface-layers `snowfall_1h_mm` was a total with dropouts | **Live (#77)**, as a clean total. A true hourly field is a later rename (manifest MAJOR) |
| **P15** | Four waypoint stations missing from the obs feed | **Live (#76).** Three added, Duchesne re-paired to KU69 |
| **P16 / R1** | Station metadata on change, not every 5 min | **Live (#76)** (every 6 h at most) |
| **P17** | Are `wind_u/v` relative to north or the grid? | **The grid.** **Live (#78)**: rotated to east/north before they leave CHPC. #83 takes the angle from the grid each GRIB declares, so no other model can be given HRRR's |
| **P11 / R2** | Surface layers **every hour**, newest run only, landing as soon after the run as `road-forecast` does (about 1 h 25 min) | Open, S: `--run-count 1` and an hourly cron in `run_hrrr_surface_push.sh` |
| **P12** | More map fields in the surface layers, names and units pinned in manifest 2.3.0: `wind_gust_10m_ms`, `snow_depth_mm`, `cloud_cover_pct`, `rh_2m_pct` (drawn on arrival); reserved, each needing a website layer first: `precip_type`, `visibility_km`, `pbl_height_m`, `temperature_700hpa_c`, `terrain_m` (once) | Open, M |
| **P5 / P13** | **One point product** in place of waypoints and `road-forecast` (they overlap at nine towns with different stations and heights): one station per place, the road fields at every place, **48 h on 00/06/12/18Z** | Open, M. P15's KU69 re-pairing removes one of the differences |
| **P14** | Fresher points: waypoints and the KVEL crosswind land about 2 h 55 min after the run; `road-forecast` manages 1 h 23 min | Open, S |
| **P18** | Cold-pool fields: 700 hPa temperature and boundary-layer height on the grid (P12 names), and a model sounding at Vernal or Ouray | Open, M |
| **P19** | Aviation, §7 | Open, S to M |
| **P21** | Add Fruitland (`QFL`, DEQ ozone) to the observation request (§9) | Open, S |
| **P22** | Send NO and NO2 where reported, not only NOx (§9) | Open, S |
| **P23** | Drop never-reporting stations from the metadata file (§9) | Open, S |
| **P24** | UB-AIR monitors back into the feed, never as a second `map_obs_*` producer (§9) | Open, S to M; waits on UB-AIR reaching Synoptic |

`brc-tools` calls itself a method library, not an operations repo. John expects the cron
wiring for these products to move to the ops repo in §2c in time. Until then, keep changes on
branches and keep the operational tree clean.

**Producer facts, read on notchpeak1 on 21 Nov** (detail: `brc-tools/docs/CHPC-REFERENCE.md`
and `brc-tools/docs/BRC-DATA-OPS-HANDOFF.md`):

- **The crontab runs in Mountain time.** It sets no `CRON_TZ`. The six lines: obs `*/5`; road
  forecast `20 * * * *`; waypoints `50 * * * *`; KVEL crosswind `55 * * * *`; surface layers
  `45 0,6,12,18`; Clyfar `15 3,9,15,21`. The two four-a-day jobs therefore land an hour
  earlier in UTC in summer than in winter (surface bundles about 01:47, 07:47, 13:47 and
  19:47 UTC now). This is the answer to open ask A4.
- **Nothing RRFS is sent.** All four model jobs are HRRR. RRFS v1 is operational and
  brc-tools can now fetch it (it needs Herbie 2026.10.0, in a new env `brc-tools-2026-11`).
  Its CONUS grid is HRRR's grid exactly. Its hourly files exist only for the 00/03/…/21Z
  runs (to 84 h at 00/06/12/18Z, 18 h otherwise); the other cycles publish 15-minute files
  alone. That bears on P11 and P14 if RRFS is ever the source.
- **NAM was retired on 3 Nov**; HRRR still publishes.
- The surface-layers job runs on `brc-tools-2026-11` since 21 Nov as a pilot. Its payload was
  identical to the old env's for the same run apart from the timestamp.

### 2b. `clyfar`: the winter ozone job (maintenance-frozen)

| # | Ask | Status |
|---|---|---|
| **P1** (half) | `llm_outlooks` to **both** hosts. `.dev` has never had one (open ask A5) | Fixed in code by clyfar#21 (31 Aug), never exercised because the job was off. **The job is back on from 20 Nov 21:15 MST**; the first cycle's outlook on `.dev` closes A5 |
| **P4** (winter) | `forecast_gefs_weather_percentiles_*` to both hosts | Comes with the Clyfar job (the upload-disabled smoke on 20 Nov built it). Same file family and dataType (`forecasts`) as last winter |
| **P4** (year-round) | The same file outside the ozone season | Open, M. The exporter needs Clyfar's per-member DataFrames, which only the full job builds; the plots-only job would need a loader from its saved GEFS parquet. Clyfar is frozen, so this is new work for the ops repo or a sanctioned clyfar change. Needed before the season ends (about March) |
| **R3 / P20** | Retire the five meteogram PNGs per cycle | After P4 flows and the website draws its own GEFS bands |

**Cron, 20 Nov:** `submit_clyfar.sh` re-enabled at `15 3,9,15,21` (MST) after an upload-disabled
smoke (Slurm 17347513, 20 Nov 12Z, 2 members). The plots-only `submit_gefs_plots.sh` is
commented out for the winter, because the Clyfar job pushes the same meteograms; re-enable it
when the season ends. Backup: `~/crontab.bak.20261120`.

### 2c. New repos: `brc-ffion`, `brc-rhiannon` and an ops repo (P2, P3)

John's decision on 20 Nov: the persona repos are the **brains** (prompts, bundles, validation,
LLM calls, no cron, no uploads). A **third, new ops repo** quarterbacks the operations: cron
jobs, schedules, pushes to both hosts. `clyfar` is not the home for new LLM work. The ops repo
is to be **`brc-data-ops`** (John, 20 Nov); on 21 Nov it is an empty folder on CHPC with no git
history and no GitHub repo.

| # | Ask | Repo | State |
|---|---|---|---|
| **P2** | **Ffion weather run**, 4×/day on the GEFS cycles, one `llm_forecast/1` file per run (§3) | Brain: `brc-ffion` (exists: Ffion's ozone-outlook tooling extracted from clyfar v1.0.7, `ffion-v1.1.4`). Ops repo runs it and uploads | Nothing yet. A weather bundle is new work |
| **P3** | **Rhiannon run**, 8×/day (every 3 h), expert tiers only | Brain: `brc-rhiannon` (new) | Nothing exists. The name is only a persona in `brc-ffrwd/PERSONAE.md` (folded into the "analyst" bundle there). Needs a spec: inputs (observed trends), voice, the two placements it owns |

Before building P2, settle two things with John:

- the LLM and its cost at 4 runs a day (the Clyfar LLM stage uses the `claude` CLI from
  `~/.local/bin`);
- which inputs the prompt reads. Those that exist are GEFS percentiles (in season, §2b), HRRR
  waypoints and surface layers, and the obs feed.

### 2d. `brc-adsb-buffer` (the hub)

| # | Ask | State |
|---|---|---|
| **P6** | The hub pushes its best aircraft products to `aircraft` (§6) | Open, M |
| **P7** | Fused inversion product (HRRR + aircraft + pseudo-profile) | Open, L; likely after 2.0.0 |

## 3. The `llm_forecast/1` file (P2, P3)

One JSON file per run per persona, uploaded to `/api/upload/llm_forecasts` (dev-only until
`.com` reports manifest 2.2.0, §1).

```json
{
  "schema": "llm_forecast/1",
  "persona": "ffion",
  "issued": "2026-12-03T12:10:00Z",
  "valid_until": "2026-12-04T00:10:00Z",
  "describes": { "gefs": "2026-12-03T06:00Z", "hrrr": "2026-12-03T09:00Z", "obs_through": "2026-12-03T11:50Z" },
  "generator": { "prompt_version": "ffion-wx 1.0.0", "model": "<llm id>" },
  "placements": {
    "home.summary":           { "public": "…", "industry": "…", "expert": "…" },
    "weather.discussion":     { "public": "…", "industry": "…", "expert": "…" },
    "outlook.model_guidance": { "expert": "…" }
  },
  "sources": ["GEFS 06Z percentiles", "HRRR 09Z waypoints", "Synoptic obs to 11:50Z"]
}
```

**Filename:** `llm_forecast_<persona>_YYYYMMDD_HHMMZ.json`, where the stamp is `issued` to the
minute in UTC. The example above is `llm_forecast_ffion_20261203_1210Z.json`.

### Placements, writers and word budgets

| Placement | Where it shows | public | industry | expert |
|---|---|---|---|---|
| `home.summary` | Homepage panel | Ffion, ~35 w | Ffion, ~60 w | Ffion, ~60 w |
| `weather.discussion` | Top of the weather page | Ffion, ~40 w | Ffion, ~150 w | Ffion, ~400 w |
| `clyfar.summary` | Clyfar page, in season | Ffion, ~35 w | Ffion, ~90 w | Ffion, ~120 w |
| `aviation.summary` | Aviation page | Ffion, ~35 w | Ffion, ~90 w | **Rhiannon**, ~120 w |
| `outlook.model_guidance` | Under each ozone outlook | — | — | Ffion, ~150 w |
| `outlook.observed_trends` | Under the current ozone outlook | — | — | **Rhiannon**, ~150 w |

The machine-readable copy of this table is `dataTypes.llm_forecasts.placements` in
`DATA_MANIFEST.json`; build prompts from that, not from this page. Two sample files are in
`public/js/__tests__/fixtures/llm_forecasts/`; the rules as code are `public/js/llmForecast.js`.

### Rules the server enforces (a broken file gets `400` and is not stored)

1. Every field in the example is required. `describes` needs at least one input; its values
   are UTC times (`…Z`, seconds optional).
2. **Each tier belongs to one persona.** Ffion's file never carries `outlook.observed_trends`
   or the `expert` tier of `aviation.summary`; Rhiannon's file never carries a `public` or
   `industry` tier.
3. **A text over 1.5× its budget is refused** (a 35-word budget allows 53). The site never
   truncates, so write to length.
4. `issued` is not more than 15 minutes in the future; `valid_until` is later than `issued`.
5. The filename matches `persona` and `issued`.
6. A file may carry any subset of its persona's placements, and at least one. Leave a
   placement out rather than pad it: out of season, no `clyfar.summary`.
7. Unknown placements and tiers are refused. A new one is added on the website side first
   (`PLACEMENTS` in `public/js/llmForecast.js` and the manifest together).

The `400` body lists every reason at once (the first 25; `errorCount` is the total):

```json
{ "success": false,
  "message": "The file does not meet the llm_forecast/1 contract",
  "errors": ["\"home.summary\" public is 60 words; the budget is about 35 and the limit is 53."],
  "errorCount": 1 }
```

### Writing guidance for the prompts

- **The text is plain text.** No Markdown, no HTML, no headings, no bullet marks. A blank line
  is a paragraph break. The site shows the text exactly as written.
- **Never name the persona or call the text a chat.** The site labels every block
  "LLM forecast" and adds its own "generated by an LLM, verify with official forecasts" line;
  do not write a disclaimer into the text.
- **Public:** plain words, what it means for the day. °F, mph, inches, Mountain time, place
  names people use (Vernal, Roosevelt, Daniels Summit).
- **Industry:** operations and timing: ranges, when it starts and ends, how sure, what to plan
  around. Same units as Public.
- **Expert:** the reasoning: model runs by cycle, ensemble spread, drivers. SI units are fine;
  UTC is fine.
- **Only numbers that are in the inputs.** If an input is missing or stale, say less. The
  website hides a whole block rather than show a guess, and the text should hold itself to the
  same rule.
- **Do not issue or restate warnings as your own.** Refer the reader to the National Weather
  Service for watches and warnings.
- `sources` is shown to readers as the Expert tab's "Built from" list, so write it for them:
  "GEFS 06Z percentiles", not a file path.

### What the site does with a file

- Copies a valid upload to `latest_ffion.json` or `latest_rhiannon.json` beside it, unless the
  copy already there was issued later. Pages read those two files, through
  `GET /api/llm-forecasts/latest`. Do not upload them.
- Hides a block when its file is missing, past `valid_until`, older than **12 h** (Ffion) or
  **6 h** (Rhiannon), or describes an older GEFS cycle than the chart beside it. A missed run
  is therefore invisible for one cycle and blank after two.
- "Model guidance" under an ozone outlook is the Ffion run nearest that outlook's issue time
  and stays with it. "Observed trends" is always Rhiannon's latest and appears only under the
  current outlook.

### Check your work

```bash
# 1. Structure, offline, against the manifest's JSON Schema:
python3 - <<'EOF'
import json, jsonschema
manifest = json.load(open("DATA_MANIFEST.json"))
doc = json.load(open("llm_forecast_ffion_20261203_1210Z.json"))
jsonschema.validate(doc, manifest["dataTypes"]["llm_forecasts"]["schema"])
print("structure ok")
EOF

# 2. Everything else: upload to .dev. The server applies the persona, budget and filename
#    rules and answers 400 with the reasons, or 200.
curl -sS -X POST https://www.basinwx.dev/api/upload/llm_forecasts \
  -H "x-api-key: $BASINWX_API_KEY" -H "x-client-hostname: $(hostname -f)" \
  -F "file=@llm_forecast_ffion_20261203_1210Z.json"

# 3. Did it land, and is it the newest?
curl -fsS https://www.basinwx.dev/api/static/llm_forecasts/latest_ffion.json | head -c 300

# 4. Why was the last one refused? (needs the key)
curl -fsS -H "x-api-key: $BASINWX_API_KEY" https://www.basinwx.dev/api/monitoring/uploads
```

Nothing on `.dev` shows the text until the page that reads it is merged, so uploading real
runs to `.dev` early is safe and is the rehearsal.

## 4. Answers found on 20 Nov

Each was measured on notchpeak1 against live data; the brc-tools PRs carry the full evidence.

- **P9, `precip_1hr`.**
  - `ROAD_FORECAST_QUERY_MAP` in `brc_tools/download/hrrr_config.py` asked for a bare
    `APCP:surface`.
  - From f02 on, HRRR carries two APCP messages: the run total (`0-N hour acc`) and the hourly
    bucket (`N-1-N hour acc`). Herbie returned the total. On the 20 Nov 18Z run at f05 that was
    6.72 mm against an hourly 1.31 mm.
  - `lookups.toml` already had the anchored search; #77 uses it.
- **P10, `snowfall_1h_mm`.**
  - The field is HRRR `ASNOW`, whose only message is the run total. It is **snow depth, not
    liquid**.
  - The dropouts came from brc-tools multiplying that total by the hour's categorical-snow
    flag. #77 removes the mask, so the field is a clean total, which is what
    `runningTotalForHour` already expects.
  - For an hourly amount, difference the total. For hourly liquid equivalent, HRRR has
    `WEASD:surface:N-1-N hour acc`.
- **P17, wind frame: grid-relative.**
  - A live `wrfsfcf06` message reads `gridType lambert`, `LoV 262.5`,
    `Latin1 = Latin2 = 38.5`, `uvRelativeToGrid 1`.
  - The grid's y axis lies `sin 38.5° × (lon + 97.5°)` from true north: 7.48° west of it at
    KVEL, 8.57° at Daniels Summit.
  - Nothing rotated the winds, yet the KVEL and waypoint files labelled direction `deg_true`.
    So every forecast direction read 7.5–8.6° too high, and runway components were off by up
    to speed × sin 7.5° (about 2.6 kt in a 20 kt wind).
  - #78 rotates the winds at fetch. The website draws arrows straight from u/v and needs no
    change.
- **P15, stations.**
  - `COOPDSNU1` was already requested. It is a COOP station and sent nothing in 25 h.
  - KU69 (Duchesne airport: 3 km NE, about 90 m higher, reports hourly) is also
    `road-forecast`'s Duchesne station.
  - LRFU1, SPMU1 and UTELP were simply not requested. All three report hourly.
- **Obs cadence.** Observations and metadata go **every 5 minutes** (cron `*/5`), not every 10
  as the manifest says (`*/10`). R1 was therefore 288 identical metadata files a day per host;
  `.dev` held 59,955 by the evening.
- **A failure the asks missed.** `get_map_obs.py` sent metadata first and raised on a primary
  failure, so that run's observations were never sent. `~/logs/obs.log` shows this a few times
  a day, mostly DNS errors resolving `basinwx.com`. #76 sends each file on its own.

## 5. Website follow-ups now the brc-tools PRs are live

None is needed for the fixes to work; these use them or tidy up after them.

- **Precip amount (P9):** the homepage precip tile can show an amount, and the roads page's
  "heavy precipitation" thresholds become right. Update the `precip_1hr` notes in `CLAUDE.md`
  and `server/statusLights.js`.
- **Snowfall (P10):** the dropout note in `public/js/hrrrFields.js` becomes history, and the
  max-so-far logic stays harmless. Renaming the field to say "total" is a manifest MAJOR, for
  later.
- **Gusts and visibility (P8):**
  - The Weather light can read gusts from the obs feed.
  - A gust row can be hours older than the station's other rows, because stations report a
    gust only while gusting. Read the row's own `date_time`.
  - **Visibility arrives in statute miles**, not SI. Add that unit to `public/js/met.js`
    before a page reads it.
  - The map gains three stations.
- **Manifest:** declare observations and metadata at their real `*/5`, together with A11
  (which asks the same for `road-forecast`).
- **`website_urls` on notchpeak1** lists `https://basinwx.com,https://basinwx.dev`, but the
  contract says `www.`. It is a one-line change on CHPC, and John's call.

## 6. The hub and the `aircraft` dataType (P6)

- **Endpoint** `POST /api/upload/aircraft`, `.json` or `.png`, filenames
  `aircraft_<product>_YYYYMMDD_HHMMZ.json`. Dev-only until `.com` reports manifest 2.2.0 (§1).
- **Hostname.** The hub is not on CHPC, so its uploads need its name on each box's allowlist.
  Send a fixed, agreed `x-client-hostname` (not `socket.gethostname()`, which may be
  `localhost` on a Linode), and ask John to add it to `UPLOAD_ALLOWED_HOSTS` in each box's
  `.env`, keeping `.chpc.utah.edu` in the list:
  `UPLOAD_ALLOWED_HOSTS=.chpc.utah.edu,<agreed hub name>`. The app reads `.env` at start, so
  the change needs a restart.
- **Key.** The hub uses the same upload key as CHPC. The hostname is a filter against
  mistakes, not a second lock.
- **Schema.** None is pinned yet and no page reads the dataType. Propose each product's shape
  as a manifest entry in a website PR before relying on it being displayed.

## 7. Aviation: what would be handy (P19)

In order of value for the effort:

1. **The crosswind file to 18 h, and sooner.** It covers 6 h and lands about 3 h after the run,
   so a pilot sees 3 h ahead at best. If HRRR's sub-hourly output runs to 18 h (check), send
   all of it; if not, hourly steps beyond hour 6 are still worth having.
2. **Ceiling, visibility and flight category at KVEL** in that same file (`ceiling_ft_agl`,
   `visibility_sm`, and `flight_category` as `VFR | MVFR | IFR | LIFR`). Winter cold-pool fog
   is the Basin's main aviation hazard, but see the fog question in §8.
3. **Roosevelt (`K74V`) and Duchesne (`KU69`)** as further airports, each with its own runway
   headings, in one file per airport or one file with an `airports` list. The page is written
   around one airport today and would need a picker.
4. **Winds and temperature aloft over KVEL** at 9,000 and 12,000 ft MSL, and the freezing
   level. Light surface wind under a strong wind aloft is the cold-pool signature, and it is
   wind shear on the climb out. (Upper-level HRRR winds are grid-relative too: use #78's
   helper.)
5. **Surface pressure at KVEL** (or the altimeter setting) in the forecast, so that the
   website can work out density altitude for summer afternoons.
6. **The observed flight category.** In the observation feed KVEL already sends `ceiling` and
   `altimeter`, and with #76 `visibility` too, so the "Now" card could show the observed
   category beside the forecast one.

## 8. What arrives, what the site reads, and the open questions

Measured on `.dev` on 2026-11-20 over the newest 24 files of each family. "Lands" is the time
from a model run's start to its file reaching the box.

| Family | Lands | The site reads | Sent but unread, or under-used |
|---|---|---|---|
| `forecast_hrrr_surface_layers_*` (36 × 38 grid, 19 h) | Three runs together every 6 h, 2.8 to 4.8 h after each starts | All five fields; since 1.7.7 the map also derives wind speed, wind chill, the coldest and warmest hour and a rain total | The two older runs of each batch are never compared with the newest (R2) |
| `forecast_hrrr_waypoints_us40_dense_*` (14 places, 19 h) | Hourly, 2 h 51 min | Temperature, wind, humidity, precipitation; `reference_stid` since 1.7.7 | `dewpoint_2m_c`, `mslp_hpa` |
| `road-forecast` (17 points, 12 h) | Hourly, 1 h 23 min | `/roads`; precipitation type (homepage tile, snow line); gust, temperature, wind and snow depth (homepage forecast tile) | `visibility`, `cloud_cover`, `rh_2m` are read only by `/roads` |
| `forecast_hrrr_kvel_crosswind_*` (6 h at 15 min) | Hourly, 2 h 58 min | Aviation page | Three of its six hours are past when it lands |
| `meteogram_UB-repr_*_GEFS.png` (5 variables) | Four times a day, 10.6 h after the cycle | Expert drawer, fire, air quality | Pictures: no numbers for the site to build on (R3) |
| `map_obs_*` (53 stations; 56 with #76) | **Every 5 min** | Temperature, wind, dew point, ozone, PM2.5, snow depth | `solar_radiation` (22 stations), `altimeter` (17), `outgoing_radiation_sw` (1) are read by nothing; `soil_temp`, `ceiling`, `pressure` by one file each |
| `map_obs_meta_*` | Every 5 min (#76: on change, or 6 h) | Station names, positions, heights | R1 |

Never received on `.dev` by 20 Nov: `llm_forecasts`, `llm_outlooks`, `aircraft`, GEFS
percentiles. The Clyfar job should deliver `llm_outlooks` and the GEFS percentiles.

**Four cuts John agreed on 20 Nov:**

| # | Cut | Status |
|---|---|---|
| **R1** | Station metadata on change, or every 6 h | Live (#76) |
| **R2** | Once surface layers come hourly (P11), send the newest run only, not three (4.4 MB every 6 h) | With P11 |
| **R3** | Stop the meteogram PNGs once P4 flows and the page draws its own bands | Waits on P4 and a website page |
| **R4** | Prune old files on both boxes: about 30 days of forecasts, road forecasts and observations (`.dev` holds 5.6 GB of uploads, 47% of its disk) | A website job, later PR; nothing deleted yet |

**Questions, not asks:**

- **HRRR visibility looks too foggy.** In `road-forecast`, visibility fell under one mile at a
  floor point in 347 of the last 720 runs. 1,990 of those point-hours had no precipitation,
  and 371 read exactly zero. With #76 the obs feed carries visibility at 28 stations, so this
  can now be checked against measurements before the homepage tile or the aviation page use
  it.
- **Daniels Summit's snow depth rose 8.6 inches in 12 h** in the 05Z run on 20 Nov, with
  18.6 mm of liquid (a run total, per P9). That is believable for a pass, and the homepage
  forecast tile reads the rise in `snow_depth` as new snow. Keep `snow_depth` a depth: if it
  ever became water equivalent, the tile's inch thresholds would be wrong.

## 9. Air-quality stations (P21 to P24), found 21 Nov

An audit of the observation feed against Synoptic's own metadata on 21 Nov. The feed has
carried the same 11 ozone monitors every day since April. Since #423 the website keys every
reading by station ID, so a station added to the request appears on the Live AQ map with no
website change. All four asks belong to `brc-tools` (the observation cron).

| # | Ask | Unlocks on the website | Size |
|---|---|---|---|
| **P21** | Add **`QFL` (Fruitland, Utah DEQ: ozone, NO, NO2, CO)** to the observation request. It is active on Synoptic and the only working Basin monitor the feed lacks | Western Basin ozone on both maps; it is already listed for the homepage and appears there once it arrives | S |
| **P22** | Send **`NO_concentration` and `NO2_concentration`** wherever they are reported: `A1386`, `A1388`, `A1622`, `A1633`, `QRS`, `QV4` (and `QFL`). Today only `NOx` comes, and only from the four Ute sites | NO and NO2 rows in the station popups (already wired) | S |
| **P23** | **Drop stations that never report** from the metadata file: `UFD04`, `UFD05`, `UFD06` (Dec 2011 downslope-event sites), `COOPROSU1` (inactive since Feb 2025), `COOPFTDU1` (inactive since May 2025), `K40U` (no data since 22 Aug 2026) | Fewer permanent grey dots on Live AQ | S |
| **P24** | The **UB-AIR monitors** (`UBHSP` Horsepool, `UBCSP` Castle Peak, `UB7ST` Seven Sisters; network 209) have had no data on Synoptic since Sep, Nov and Dec 2025. When they are back, add them to the request. If instead a third server sends them from storage, it must not upload its own `map_obs_*` file: the website shows only the newest observations file, so two producers would take turns. Merge into CHPC's file, or agree a separate prefix first | The three grey "not reporting since" markers turn into readings with no website change | S to M |

Not asks, but worth knowing:

- **The website's Synoptic token is Utah-only.** Every request for Colorado or Wyoming (Rangely,
  the Dinosaur CO side, south-west Wyoming) answers "your account does not have access". John
  is asking Synoptic for the edge states. Check whether the CHPC token has the same limit, and
  whether a restricted network would hide the UB-AIR sites even once they report. Keyless
  stand-ins (Rangely AWOS `K4V0` and others) are in `NEXT-SESSION-HANDOFF-nov21.md` §4.
- **Co-op snow depth is once a day.** The maps show it up to 30 h old (every other reading,
  3 h). The feed drops a co-op row after about a day, which suits that.

<sub>Drafted with Claude Code on 2026-11-20 from `docs/NWP-DASHBOARD-PLAN-nov20.md` and John's
answers that day; regrouped by repo the same evening from the notchpeak1 session that opened
brc-tools #76–#78 and resumed Clyfar. §9 added on 21 Nov from the air-quality map audit (#423).</sub>
