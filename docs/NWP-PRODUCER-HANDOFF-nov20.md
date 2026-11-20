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
P2 delivers live text, so P1 and P2 are the critical path.

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
  copy already there was issued later. Pages read those two files. Do not upload them.
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

<sub>Drafted with Claude Code on 2026-11-20 from `docs/NWP-DASHBOARD-PLAN-nov20.md` (branch
`preview/nwp`) and John's answers that day.</sub>
