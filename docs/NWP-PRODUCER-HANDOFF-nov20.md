# NWP Producer Handoff — Nov 20

**Status:** temporary. Written 2026-11-20 for whoever builds the producer side of the NWP
dashboard: John, or an AI agent working in `brc-tools` on CHPC or in `brc-adsb-buffer` on the
hub. Delete this file once P1–P5 are flowing and their rows have moved into
`WEBSITE-BRCTOOLS-OPEN-ASKS.md` or closed. The permanent rules are in
[`WEBSITE-BRCTOOLS-CONTRACT.md`](WEBSITE-BRCTOOLS-CONTRACT.md) §2 and §5d–5e; this file is the
to-do list and the worked example.

**The one-paragraph version.** The website is ready to receive tiered LLM forecast text and
aircraft products. It will not generate any text itself. Seven things are asked of the
producers (P1–P7 below, plus P8, P9 and P10 found on 20 Nov). The website's version 1.8.0 is held until
P2 delivers live text, so P1 and P2 are the critical path. A later session the same day
measured what arrives against what the site reads (§6), agreed four cuts (§7), and added the
asks for the map, the point forecasts and aviation (P11 to P20, §8 and §9).

---

## 1. What the website has ready

| Thing | Where | Since |
|---|---|---|
| dataType `llm_forecasts`, validated at upload | `.dev` | 1.7.3-dev |
| dataType `aircraft` | `.dev` | 1.7.3-dev |
| Host allowlist from `.env` (`UPLOAD_ALLOWED_HOSTS`) | `.dev` | 1.7.3-dev |
| The `llm_forecast/1` contract as code | `public/js/llmForecast.js` | 1.7.3-dev |
| JSON Schema and placement table | `DATA_MANIFEST.json` → `dataTypes.llm_forecasts` (manifest 2.2.0) | 1.7.3-dev |
| Two sample files | `public/js/__tests__/fixtures/llm_forecasts/` | 1.7.3-dev |

**`.com` does not have these yet.** Check before you send:

```bash
curl -fsS https://www.basinwx.com/api/health | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['version'], d['manifestVersion'])"
```

Until `.com` reports manifest **2.2.0** or later, pin the new dataTypes to `.dev`
(`BASINWX_API_URLS="https://www.basinwx.dev"` in that job's wrapper), as
`docs/DEPLOYMENT.md` §7a describes. An older `.com` would store the files unchecked and
without `latest_<persona>.json`.

## 2. The asks

| # | Ask | Unlocks on the website | Size |
|---|---|---|---|
| **P1** | Send `llm_outlooks` and the new `llm_forecasts` to **both** hosts. `.dev` has never received `llm_outlooks` (open ask A5) | Rehearsal on `.dev` | S |
| **P2** | **Ffion weather run**, 4×/day on the GEFS cycles, writing one `llm_forecast/1` file (§3) | Homepage summary, weather discussion, outlook "Model guidance", Clyfar and aviation summaries | M + LLM cost |
| **P3** | **Rhiannon run**, 8×/day (every 3 h), expert tiers only | Outlook "Observed trends", aviation expert tab | M |
| **P4** | `forecast_gefs_weather_percentiles_*` **year-round**, to both hosts (it stopped on 30 Mar with the Clyfar season) | GEFS day 1–15 bands, the next-3-days light | S (already written) |
| **P5** | HRRR waypoints (`forecast_hrrr_waypoints_us40_dense_*`) to **48 h** on the 00/06/12/18Z cycles | Town forecasts reach tomorrow evening | S |
| **P6** | The hub pushes its best aircraft products to dataType `aircraft` (§5) | Expert page | M |
| **P7** | Fused inversion product (HRRR + aircraft + pseudo-profile) | Inversion light | L; likely after 2.0.0 |
| **P8** | Add **wind gust** (and visibility where a station reports it) to the observation feed. As of 20 Nov no station in `map_obs_*.json` carries either | Weather light from our own feed (it uses UDOT road-station gusts meanwhile) | S |
| **P9** | In `road-forecast`, `precip_1hr` is a **running total since the model run began**, not an hourly amount: across the last five files on 20 Nov all 85 point series only ever rise (Daniels Summit 2.8 → 18.6 mm over 12 h, flat in the one hour typed `none`). Either send true hourly amounts, or rename the field and say so in the manifest | An amount on the homepage precip tile (it shows the type only, meanwhile); the roads page's "heavy precipitation" thresholds read this field as hourly today | S |

Each new file family needs a manifest entry before the website reads it. For P4 and P5 the
families already exist; say so in the PR if the shape changes.

**P10, found the same day.** In `forecast_hrrr_surface_layers_*`, `snowfall_1h_mm` is not an
hourly amount either. At a snowy grid point it reads `0, 0.1, 0.3, 1.9, 10.0 … 91.9, 0, 98.4,
98.6, 0`: a total since the run began (509 mm at one point within 18 h in the 21Z run on
19 Nov) that drops to exactly zero in some hours, 1,615 times in one run, and then carries on.
The weather page labelled it in/hr until 1.7.6; it now takes the largest value so far and shows
a total. Please send either a true hourly snowfall or a clean total under a name that says so,
and say whether it is snow depth or liquid. `rainfall_1h_mm` in the same file is truly hourly.

## 3. The `llm_forecast/1` file (P2, P3)

One JSON file per run per persona, uploaded to `/api/upload/llm_forecasts`.

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

The machine-readable copy of this table is `dataTypes.llm_forecasts.placements` in the
manifest; build prompts from that, not from this page.

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
# 1. Structure, offline, against the manifest's JSON Schema (jsonschema is already a
#    chpc_uploader.py dependency):
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

## 4. Order of work

1. **P1** first: it is small, and it proves the `.dev` path for everything after it.
2. **P2** next: the homepage summary and the weather discussion are the first two placements
   the website will merge. `home.summary` and `weather.discussion` alone are enough to start;
   add the other placements to the same file as they are ready.
3. **P4** and **P5** are independent of the LLM work and small.
4. **P3**, then **P6**. **P8** whenever the observation job is next touched.

## 5. The hub and the `aircraft` dataType (P6)

- **Endpoint** `POST /api/upload/aircraft`, `.json` or `.png`, filenames
  `aircraft_<product>_YYYYMMDD_HHMMZ.json`.
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

## 6. What arrives, and what the site does with it

Measured on `.dev` on 2026-11-20 over the newest 24 files of each family. "Lands" is the time
from a model run's start to its file reaching the box.

| Family | Lands | The site reads | Sent but unread, or under-used |
|---|---|---|---|
| `forecast_hrrr_surface_layers_*` (36 × 38 grid, 19 h) | Three runs together every 6 h, 2.8 to 4.8 h after each starts | All five fields. Since 1.7.7 the map also works out wind speed, wind chill, the coldest and warmest hour and a rain total from them | The two older runs of each batch are never compared with the newest |
| `forecast_hrrr_waypoints_us40_dense_*` (14 places, 19 h) | Hourly, 2 h 51 min | Temperature, wind, humidity, precipitation; `reference_stid` since 1.7.7 | `dewpoint_2m_c`, `mslp_hpa` |
| `road-forecast` (17 points, 12 h) | Hourly, 1 h 23 min | `/roads`; precipitation type (homepage tile, snow line); gust, temperature, wind and snow depth (homepage forecast tile, 1.7.7) | `visibility`, `cloud_cover`, `rh_2m` are read only by `/roads` |
| `forecast_hrrr_kvel_crosswind_*` (6 h at 15 min) | Hourly, 2 h 58 min | Aviation page | Three of its six hours are past when it lands |
| `meteogram_UB-repr_*_GEFS.png` (5 variables) | Four times a day, 10.6 h after the cycle | Expert drawer, fire, air quality | Pictures: no numbers for the site to build on |
| `map_obs_*` (52 stations) | Every 10 min | Temperature, wind, dew point, ozone, PM2.5, snow depth | `solar_radiation` (22 stations), `altimeter` (17) and `outgoing_radiation_sw` (1) are read by nothing; `soil_temp`, `ceiling` and `pressure` by one file each |
| `map_obs_meta_*` | Every 10 min | Station names, positions, heights | See R1 |

Never received on `.dev`: `llm_forecasts`, `llm_outlooks`, `aircraft`, GEFS percentiles.

## 7. Agreed on 20 Nov: four cuts

John agreed these in the session that built 1.7.7. They are his to make on CHPC; the website
needs no change for any of them.

| # | Cut | Why |
|---|---|---|
| **R1** | Send station metadata when it changes, or every 6 h as the manifest already says, not every 10 min | The newest 1,000 files are byte for byte the same. `.dev` holds 59,705 of them (703 MB) |
| **R2** | Once surface layers come hourly (P11), send the newest run only, not three | The page reads one. Three runs are 4.4 MB every 6 h |
| **R3** | Stop the five GEFS meteogram PNGs per cycle once the percentiles JSON (P4) flows and the page draws its own bands | Until then they stay: the expert drawer has nothing else |
| **R4** | Prune old files on both boxes (a website job, in a later PR; nothing is deleted yet) | `.dev` holds 5.6 GB of uploads, 47% of its disk. About 30 days of forecasts, road forecasts and observations is the proposal |

## 8. The next asks (P11 to P20)

John expects to work through these in his CHPC sessions, in roughly this order. Names and
units in **P12** are pinned in `DATA_MANIFEST.json` (manifest 2.3.0), so that the two sides
agree before either writes code.

| # | Ask | Unlocks on the website | Size |
|---|---|---|---|
| **P11** | Surface layers **every hour**, the newest run only, landing as soon after the run as `road-forecast` does | A map that is one or two hours old, not three to nine | S |
| **P12** | **More map fields** in the surface layers. Drawn on arrival, with no website release: `wind_gust_10m_ms` (m/s), `snow_depth_mm` (Millimeters), `cloud_cover_pct` (percent), `rh_2m_pct` (percent). Names reserved, each needing a layer on the website first: `precip_type`, `visibility_km`, `pbl_height_m`, `temperature_700hpa_c`, and `terrain_m` (the model's terrain, sent once: it gives a snow level and elevation bands from the grid itself) | Gusts and snow on the ground on the map; snow cover is the ozone ingredient | M |
| **P13** | **One point product** in place of waypoints and `road-forecast`, which overlap at nine towns with different stations and heights (Vernal is `QV4` in one and `KVEL` in the other; Dinosaur is 4,800 ft in one and 6,001 ft in the other). One station per place; the road fields (gust, visibility, precipitation type, snow depth, cloud) at every place; **48 h on the 00/06/12/18Z cycles**. This takes in P5 | "Tomorrow" on the homepage forecast tile and the town views; one source for the town table and `/roads` | M |
| **P14** | **Fresher points:** waypoints and the KVEL crosswind land almost 3 h after the run; `road-forecast` manages 1 h 23 min | Three more usable hours on the town views and the runway forecast | S |
| **P15** | Four waypoint `reference_stid`s are **not in the observation feed**: `COOPDSNU1` (Duchesne), `LRFU1` (Little Red Fox), `UTELP` (East Lapoint), `SPMU1` (Split Mountain). Add them to the feed, or pair those points with stations that are in it | Measured dots on the forecast chart for all 14 places (10 today) | S |
| **P16** | See **R1**: station metadata on change | Less disk, nothing else | S |
| **P17** | Say whether `wind_u_10m_ms` and `wind_v_10m_ms` are relative to **north or to the model grid**. The grid is turned about 8° from north over the Basin (the website measured this to place the map), so the answer moves every arrow by that much | Wind arrows that can be trusted to the degree | S |
| **P18** | **Cold-pool fields:** 700 hPa temperature and boundary-layer height on the grid (names in P12), and a model sounding at Vernal or Ouray | An inversion-strength map; a first input to the inversion light (P7) | M |
| **P19** | **Aviation** (§9) | The aviation page beyond runway winds | S to M |
| **P20** | See **R3**: retire the meteogram PNGs after P4 | — | S |

Two things found while building 1.7.7 that are questions, not asks:

- **HRRR visibility looks too foggy.** In `road-forecast`, visibility fell under one mile at
  a floor point in 347 of the last 720 runs, 1,990 point-hours of it with no precipitation
  and 371 at exactly zero. The observation feed has no visibility to hold it against (P8), so
  the homepage forecast tile leaves fog out. Is the field what the model gives, or is
  something lost in the reduction to points?
- **Daniels Summit's snow depth rose 8.6 inches in 12 h** in the 05Z run on 20 Nov
  (10.4 to 19.0 in) with 18.6 mm of liquid over the same hours. That is believable for a
  pass, and the homepage forecast tile now reads the rise in `snow_depth` as new snow (on the
  floor only). If `snow_depth` is ever changed to water equivalent, that tile's inch
  thresholds become wrong: please keep it a depth, and say so in the file.

## 9. Aviation: what would be handy (P19)

John asked what else the aviation page could use. In order of value for the effort:

1. **The crosswind file to 18 h, and sooner.** It covers 6 h and lands 3 h in, so a pilot
   sees 3 h ahead at best and 2 h just before the next file. If HRRR's sub-hourly output runs
   to 18 h (check), send all of it; if not, hourly steps beyond hour 6 are still worth having.
2. **Ceiling, visibility and flight category at KVEL** in that same file (`ceiling_ft_agl`,
   `visibility_sm`, and `flight_category` as `VFR | MVFR | IFR | LIFR`). This is where fog
   belongs: winter cold-pool fog is the Basin's main aviation hazard, and a pilot reads it as
   a category, with the caveat above about how foggy the model runs.
3. **Roosevelt (`K74V`) and Duchesne (`KU69`)** as further airports, each with its own runway
   headings, in one file per airport or one file with an `airports` list. The page is written
   around one airport today and would need a picker.
4. **Winds and temperature aloft over KVEL** at 9,000 and 12,000 ft MSL, and the freezing
   level. Light surface wind under a strong wind aloft is the cold-pool signature, and it is
   wind shear on the climb out.
5. **Surface pressure at KVEL** (or the altimeter setting) in the forecast, so that the
   website can work out density altitude for summer afternoons. The formula is standard and
   the website can compute it; it needs the pressure.
6. In the observation feed, KVEL already sends `ceiling` and `altimeter`, which no page
   reads. With visibility added (P8) the "Now" card could show the observed flight category
   beside the forecast one.

<sub>Drafted with Claude Code on 2026-11-20 from `docs/NWP-DASHBOARD-PLAN-nov20.md` (branch
`preview/nwp`) and John's answers that day. §6 to §9 were added the same day from the session
that built 1.7.7.</sub>
