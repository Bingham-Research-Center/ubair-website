# NWP Dashboard Plan — Nov 20

**Status:** plan agreed with JRL on 2026-11-20 in a question-and-answer session; nothing is built
yet. It lives on branch `preview/nwp` (worktree `/srv/ubair-website-nwp`), and its slices become
issues on milestone `v2.0.0 Ozone season open` (#402–#413; S0 is #336). It supersedes the decisions list (§9) of
[`WEATHER-PAGE-CONTENDERS-nov13.md`](WEATHER-PAGE-CONTENDERS-nov13.md), which stays as the
reference for measurements, data inventory and contender pros and cons. Delete both files, or
fold what is left into issues, once 1.8.0 ships.

> ## Third session, 20 Nov (late): the branch goes to `dev` as 1.7.7-dev
>
> JRL lifted the "no PR yet" hold and, over three rounds of questions, set what this branch
> carries to `dev` in **one PR**, the LLM renderer included and dormant:
>
> | Built | Where |
> |---|---|
> | A fifth homepage tile, a **forecast light titled by the part of the day** ("Tonight", "Tomorrow morning"): gusts 40/58 mph, new snow on the floor 1/4 in, wind chill 0/-20 °F; fog left for aviation | `server/statusLights.js` `forecastLight` |
> | The LLM summary **beside the AQ outlook**, in the right-hand column (settles the open point below) | `views/index.html` `.dashboard-stack` |
> | The forecast map as **colour bands with a time slider**, and layers derived in the browser | `public/js/mapLayers.js` |
> | **Forecast and measured** dots, **Across the Basin** (US-40 in profile), **Where rain turns to snow** | `townChart.js`, `basinProfile.js`, `snowLine.js` |
> | Manifest 2.3.0: the waypoints entry, and the names of the map fields to come | `DATA_MANIFEST.json` |
> | What arrives against what is read, four agreed cuts, asks **P11 to P20** with aviation | `docs/NWP-PRODUCER-HANDOFF-nov20.md` §6 to §9 |
>
> Not chosen, and so not built: places on the map, town-by-hour stripes, floor-against-pass
> lines, a temperature ladder, a drive-time forecast, a film strip, a sunshine meter, a
> barometer. Model against measured is a time series only, by JRL's choice.
>
> What this changes below: S4 #405 is on `dev` (dormant); S5 and S7 are wired in and need only
> a real file (P2); the "next 3 days" light of S12 has its first step, in hours not days,
> until the 48-hour point forecast (P13) flows. The order of producer work is now the
> handoff's §8.
>
> ## Where this stood (20 Nov, evening)
>
> A second session on 20 Nov critiqued this plan against the code and the live data, asked
> JRL twelve questions, and built the website-only slices. **Where this box and the text below
> disagree, this box is right.**
>
> **Merged to `dev` and live on `.dev`** (`dev` is 1.7.6-dev):
>
> | Slice | PR | What |
> |---|---|---|
> | S0 #336 | #336 | Roads batch A: honest UDOT failure (1.7.2-dev) |
> | S1 #402 | #414 | Upload path: dataType list, host allowlist, `llm_forecast/1` checked at upload (1.7.3-dev) |
> | S3 #404 | #415 | NWS alerts helper, `GET /api/weather-alerts` (1.7.4-dev) |
> | S2 #403 | #416 | Homepage status lights and the precip tile (1.7.5-dev) |
> | S6 #407 | #417 | Weather page rework, gzip; closed #101 (1.7.6-dev) |
> | docs | #418 | `docs/features/` pages, glossary, README index |
>
> **On this branch, not on `dev`, and with no PR open (JRL, 20 Nov):** S4 #405, the LLM text
> renderer (`public/js/llmText.js`, guards in `public/js/llmForecast.js`), wired to the homepage
> (`home.summary`) and the weather page (`weather.discussion`). JRL has more work to do on the
> dashboard and the use of NWP data before any of it is version-bumped, so nothing here is
> harvested into a PR until he says so. `dev` stays at 1.7.6-dev meanwhile.
>
> **To pick this branch up:**
> - It is level with `dev` at `a25d634`. Merge `origin/dev` in before adding to it.
> - Tests: from the worktree,
>   `NODE_OPTIONS='--experimental-vm-modules' /srv/ubair-website/node_modules/.bin/jest --modulePaths=/srv/ubair-website/node_modules --runInBand`.
>   Everything passes except `iconNames.test.js`, which needs the repo's own `node_modules`.
> - Preview on `theme.basinwx.dev` (:3003): the README recipe, except that `public/api/static`
>   must be a **real folder** of links to each live dataType folder, with its own
>   `llm_forecasts/` filled by `node scripts/preview-llm-samples.mjs <that folder>`. Never link
>   the whole live `static` folder: the samples would then be written onto `.dev`. (The script
>   refuses a live destination, also through a link.) Samples go stale after 6 to 12 hours,
>   and the blocks then hide; run the script again to bring them back.
> - **Not yet agreed with JRL:** where the homepage summary sits. It is a full-width pane above
>   the map and outlook; this plan said "beside the AQ outlook".
>
> **Decisions (JRL, second session):**
> - **Nothing goes to `ops` until the LLM text is done**, so that the dashboard does not reach
>   prod as a placeholder (JRL, 20 Nov, replacing the earlier "one 1.7.x train of website-only
>   slices"). `ops` and prod stay at v1.7.0. The next promotion is 1.8.0, with live LLM text.
>   Until then prod keeps two faults that `dev` has fixed: the upload route accepts a dataType
>   that climbs out of the upload folder (key holders only), and the weather map shows a
>   snowfall total as inches per hour.
> - **Homepage:** no tabs. Four tiles, two by two (four across did not fit the header column):
>   Weather now, Ozone, Roads now, and a new **Precip next 6 h** by elevation band (floor below
>   5,900 ft, benches, passes above 7,500 ft), with a fuller version on the weather page.
>   Icons only where they are data (precipitation type).
> - **Weather light:** only the two floor zones colour it (UTZ024, UTZ114, their fire zones and
>   the two counties); mountains and passes are the roads light's job. Station wind turns it
>   amber on its own: a 40 mph gust at a UDOT road station on the floor, or a sustained 30 mph
>   in our feed, fresh and plausible, saying "observed; no NWS wind alert".
> - **Roads light:** snow covered or icy on US-40, US-191 or SR-87 is red, and `/roads` matches
>   (one rule, `server/roadConditionRules.js`). It reads UDOT's report, never the blended colour.
> - **Ozone light:** lit for 5 days after an outlook, in three colours.
> - **dataTypes:** `llm_forecasts` and **`aircraft`** (not `adsb`). **Shared key plus a host
>   allowlist** from `.env`; no per-producer keys.
> - **Outlook AI section:** Model guidance (Ffion) is frozen at the run nearest the outlook's
>   issue; Observed trends (Rhiannon) is live, latest only, under the current outlook only.
>
> **Corrections to the text below (found against code and data):**
> - §5.3 mismatch guard: it compares **GEFS cycles only**. HRRR is hourly and Ffion writes four
>   times a day, so an HRRR comparison would hide the text almost always.
> - §5.4 thresholds: the observation feed has **no gusts or visibility at any station**, so the
>   gust rule reads UDOT road stations and there is no visibility rule (producer ask P8).
> - §5.5: the map's "special conditions" stay under the map (they need its 1.5 MB run); the
>   hazards pane carries NWS alerts and the precipitation bands instead.
> - §5.8: the upload route had **no** dataType list and a name such as `../..` escaped the
>   upload root. Fixed in S1; **prod still runs the old route until the next `ops` train**.
> - Two precipitation fields are running totals with hourly names: `precip_1hr` in
>   `road-forecast` (P9) and `snowfall_1h_mm` in the surface layers (P10). Prod's map shows the
>   second as in/hr.
> - Kiosk mode on the weather page now needs `?kiosk=1`; NWS point-forecast text and public
>   verification stay parked (Claude's defaults for §8 item 8; JRL may reverse).
>
> **Still to do:** JRL's further work on the dashboard and NWP data use (his to define); S5, S7,
> S9, S10 (need P2/P3), S8 (P4), S11 (P6), S12 (P4, P5, P7); the 1.8.0 promotion to `ops`;
> remove the test outlook from both boxes by 30 Nov; Quinten's
> #401 rebase; roads batches #337–#339 (each now needs `dev` merged in). Producer asks are
> P1–P10 in `docs/NWP-PRODUCER-HANDOFF-nov20.md` on `dev`.

**Goal:** real weather data, observed and modelled, flows into a homepage dashboard, the weather
forecast page, and LLM forecast text. Each block of LLM text offers Public · Industry · Expert
tabs and opens on Public. It is on `dev`, then `ops`, before 1 Dec 2026.

---

## 1. Dates and versions

| Version | What | Target |
|---|---|---|
| 1.7.x | One patch per finished slice merged to `dev` | from 20 Nov |
| **1.8.0** | The NWP dashboard is whole: homepage lights + LLM summary, weather page rework, LLM text in its placements | 26–28 Nov |
| 1.9.0 | Stretch: roads batches B–D (#337–#339), maps, aviation, expert page if not in 1.8.0 | if time allows |
| **2.0.0** | "Ozone season open", tagged on 1 Dec by definition; ships what is finished | 1 Dec |

**Version rule (JRL, 2026-11-20):**
- Every finished slice merged to `dev` bumps the patch as its PR's last commit: one line in
  `package.json`, 1.7.1-dev → 1.7.2-dev → … When two slices are open, rebase the second after
  the first merges.
- The strip PR picks the number at each promotion to `ops`: a patch for housekeeping, a minor
  when a whole feature landed. `ops` skipping from v1.7.0 to v1.8.0 is fine.
- `ops` always stays behind `dev`; only `ops` is tagged. The train itself is
  `docs/DEPLOYMENT.md` §7a.

Calendar: Fri 20 Nov to Tue 1 Dec is 11 days, with Thanksgiving on Thu 26 Nov. The test outlook
`outlook_20261112_0337.md` must come off both boxes by **30 Nov** (#253).

## 2. How the work flows

- **Slices plus a preview.** Each website PR branches from `origin/dev` and ships one finished
  piece. Work that waits on producer data (LLM text, GEFS bands) lives on `preview/nwp`, served on
  the spare slot `theme.basinwx.dev` → `127.0.0.1:3003` (README "Branch previews",
  `PREVIEW_MODE=true`). It runs against sample files there, and is harvested into a PR off
  `origin/dev` (`git checkout -B <slice> origin/dev && git cherry-pick <sha>`) once real files
  land on `.dev`.
- **Nothing unfinished on `dev`:** a pane merges only with live data behind it.
- **Check cleanliness** by the exit code of `git merge-tree --write-tree`, pairwise when several
  slices are open.
- **Quinten's draft #401 rebases after us** (JRL's call). It touches `views/index.html` and
  `views/forecast_weather.html`, and already conflicts with `dev`. Tell him early and gently, and
  keep his authorship.

## 3. Decisions (JRL, 2026-11-20)

| Topic | Decision |
|---|---|
| Tier labels, site-wide and in both prompts | **Public · Industry · Expert** (replaces Ffion's Public / Stakeholder / Expert and the five other sets listed in the contenders doc §4) |
| Tabs | Small three-tab row **per block, independent**; every load opens on Public. No site-wide sync, no remembered tier |
| Look | Flat, square, minimal: the homepage Current tab (KVEL) is the model. The tier row reuses the `.dashboard-tabs` / `.tab-button` pattern in `main.css`; no new control style |
| Naming in the UI | Show **"LLM forecast"** (or "AI" in prose), not "Ffion" or "Rhiannon", so readers keep in mind that no human wrote it. Persona names stay in producer code and logs |
| Where text is generated | **Producers generate and push; the site only renders.** No LLM key or spend on the Linodes |
| Ffion | Communicator and weather/ozone expert. Writes every Public and Industry tab, and the Expert tab of forecast blocks |
| Rhiannon | Flight-data specialist and nowcaster, **for nerds and operational forecasters only.** Writes Expert-level text: "Observed trends", the aviation Expert tab and expert-page notes. Never a Public tab |
| Homepage current conditions | **Plain numbers, no LLM, no fanfare** (as the Current tab does today) |
| Cadence | Ffion **4×/day** (GEFS cycles), Rhiannon **8×/day** (every 3 h) |
| Text sizing | **Producer writes each placement to a word budget** (§5.2); the site never truncates |
| Producers | CHPC (brc-tools) writes Ffion and Rhiannon's operational text; the ADS-B hub (`brc-linode-dev`, brc-adsb-buffer) pushes aircraft products to their own dataType |
| Third data source | Grow brc-tools for now; a Synoptic + NWP buffer repo is still at the brainstorming stage. **The upload path must accept a third producer** without a code rewrite (§5.8) |
| Expert page | **Public on `.com`, labelled experimental**; it shows only products that are live |
| Ozone outlook AI section | Two subsections, **Model guidance** (Ffion) and **Observed trends** (Rhiannon), under the heading "AI technical discussion". **The site attaches it when it renders**; the human outlook file is untouched. Never called a "chat" |
| Homepage lights | A row of flat square status lights (§5.4); colours come from **rules in the repo**, never from the LLM |
| Ozone light | From the **human ozone outlook** risk lines only, not Ffion or NWP |
| Inversion light | From an upcoming **fused product** (HRRR + aircraft + pseudo-profile) made on CHPC or the dev Linode; the site renders the value |
| Forecast charts | On the weather page, not the homepage; the homepage gets the LLM summary |
| Roads | Land **#336** (honest UDOT failure) first, then build a homepage roads light that links through to `/roads`. One major pass snowed in is enough to light it |
| Review gate | LLM text goes to **both boxes from day one**; the site-side guards (§5.3) are always on |
| Producer build | **JRL** (or a Claude session on notchpeak1 or `brc-linode-dev`) from a handoff this repo writes (§7) |
| Planning | This doc plus one issue per slice on the v2.0.0 milestone; no epic |

## 4. Current state (2026-11-20)

- `dev` = `origin/dev` = `22e86a1` (1.7.1-dev); `ops` = tag v1.7.0, and prod serves it; `main`'s
  tree is the same as `ops`'s. The suite is green on `dev` at 508/508 across 42 suites
  (`npm test`; it needs `NODE_OPTIONS=--experimental-vm-modules`).
- **Flowing to both boxes:** observations (10 min), HRRR surface layers, HRRR waypoints (14 towns
  and passes, 18 h, read by nothing on `dev`), the KVEL crosswind file, GEFS meteogram PNGs and
  `road-forecast`.
- **Not flowing:** `llm_outlooks` has never reached `.dev` (the directory doesn't exist), and
  `.com`'s newest is 30 Mar. GEFS weather percentiles stopped on 30 Mar and never reached `.dev`.
  No aircraft data reaches either box. `gefs_snow_summary.json` was never produced.
- **Code traps found today:**
  - The upload route accepts only `x-client-hostname` / reverse DNS ending in `chpc.utah.edu`
    (`server/routes/dataUpload.js` `validateCHPCOrigin`).
  - `server/fireWeatherService.js` turns a failed NWS alerts fetch into `{features: []}`, so a
    failure reads as "no alerts". The hazard chip must not copy that pattern.
  - The outlook risk pills (`.risk-no` … `.risk-high` in `outlooks.css` and `main.css`) are
    raw-hex gradients, neither flat nor tokenised.
  - On `dev`, `roadWeatherService` still draws invented Clear/Caution roads when UDOT fails,
    which is what #336 fixes.
  - `forecast_air_quality.js` links the newest `.pdf` in `llm_outlooks`, so a new PDF family
    there would take over the ozone button.

## 5. Design

### 5.1 Text blocks and tiers
- One renderer (`public/js/llmText.js`, name TBD) draws a block: the label **LLM forecast**, an
  issued time in Mountain time, the run it describes, the tier row (Public · Industry · Expert,
  Public active) and the text.
- Experimental labelling stays on every tier: "Generated by an LLM from model and observation
  data; verify with official forecasts." It is styled apart from human `outlooks` text.
- The Expert tab ends with a **"Built from"** list (the sidecar's `sources`), and links to the
  expert page once it exists.
- Markup is semantic (`role="tablist"`, `aria-selected`) and flat; the CSS uses `var(--…)` only,
  and new stylesheets start at a ratchet ceiling of zero.
- **Nothing renders until a file loads.** A block that is missing, stale or mismatched is not
  drawn at all; no placeholder text. Avoid the names `removedPages.test.js` forbids
  (`weather-summaries-section`, `Loading (plain|extended|detailed)`).

### 5.2 Placements and word budgets
These are approximate. The producer enforces them, and the budgets are pinned in
`DATA_MANIFEST.json`.

| Placement key | Where | Writer | Public | Industry | Expert |
|---|---|---|---|---|---|
| `home.summary` | Homepage LLM forecast panel, beside the AQ outlook | Ffion | 2 sentences, ~35 w | 2–3 sentences, ~60 w | 2–3 terse sentences, ~60 w |
| `weather.discussion` | Top of `/forecast_weather` | Ffion | 2 sentences, ~40 w | 1 paragraph, ~150 w | extended discussion, ~300–400 w |
| `clyfar.summary` | Clyfar page, in season | Ffion | 2 sentences, ~35 w | ~4 sentences, ~90 w | 1 paragraph, ~120 w |
| `aviation.summary` | Aviation page, by the KVEL runway winds | Ffion (Public, Industry), Rhiannon (Expert) | 2 sentences | ~4 sentences | 1 paragraph, ~120 w |
| `outlook.model_guidance` | AI technical discussion under each human outlook | Ffion | — | — | ~100–150 w |
| `outlook.observed_trends` | same | Rhiannon | — | — | ~100–150 w |

The writers on aviation and the Rhiannon line on the weather page are my reading of "Rhiannon
is only for nerds"; confirm them (§8).

### 5.3 Guards (site side, always on)
- **Stale:** Ffion's text hides after 12 h and Rhiannon's after 6 h (two cycles each), or at the
  sidecar's `valid_until` if that comes sooner.
- **Mismatch:** a block hides if it describes an older model run than the chart beside it.
- **Outlook pairing:** the AI technical discussion attaches only if its sidecar was issued within
  N h of the human outlook's issue time (N = 6, to confirm). Otherwise it is not shown.
- **Off season:** Clyfar-related blocks hide out of season via `outlookSeasons.js`.
- **Tests:** each guard has a Jest test that uses fixture sidecars.

### 5.4 Homepage
The homepage stays flat and minimal, with no forecast charts.
1. **Status lights row.** Square tiles in line with `.headline-item` / `.pane`. Each one shows a
   colour block, an icon and a terse line, links to its page, and offers a hover or tap reason.
   It replaces today's Alerts-tab headline items.
   - **Weather now:** NWS alerts for the Basin zones plus obs rules.
   - **Next 3 days:** the worst hazard in days 1–3, with an icon for its type (snow, wind, cold,
     fog). It needs 48 h waypoints (P5) and GEFS percentiles (P4); until then it is HRRR 18 h
     plus NWS watches, or it waits (§8).
   - **Ozone, next 10 days:** the higher of the human outlook's Day 1–5 and Day 6–10 risk lines.
     Grey when no in-season outlook is current.
   - **Roads now:** the worst UDOT condition and where it is ("Snow covered: US-191 Indian
     Canyon"), linking to `/roads`. It needs #336.
   - **Inversion:** hidden until the fused product exists (P7).
2. **Current conditions:** today's Current tab, plain numbers.
3. **LLM forecast summary:** `home.summary`, in the dashboard grid beside the AQ outlook panel.
   This closes #295 and #166.
4. **NWS hazard chip:** active watches and warnings, either inside "Weather now" or as a chip under
   the row. It shows nothing when the fetch fails, never "no alerts".

**Light rules** live in a pure module (`public/js/statusLights.js` or a server route if it needs
NWS) with tests. JRL signs off the thresholds once. Grey (`--status-nodata`) means a source
missing or stale; a failure never shows green. These are starting proposals:

| Light | Red | Amber | Green | Grey |
|---|---|---|---|---|
| Weather now | Any NWS warning for the Basin zones | Advisory or watch; observed gust ≥ 40 mph; visibility < 1 mi where reported | None of those, with obs < 30 min old and the NWS fetch OK | Obs stale or NWS fetch failed |
| Next 3 days | NWS warning or watch in the window; HRRR/GEFS p50 gust ≥ 50 mph or snow ≥ 6 in/24 h | p90 crosses those thresholds, or p50 crosses half of them | Nothing forecast | Model files stale |
| Ozone 10 d | HIGH | SOME or MODERATE | NO or LOW | No current in-season outlook |
| Roads now | Closure, or snow-covered or icy on a major route (US-40, US-191, SR-87, Daniels Summit, Indian Canyon) | Wet, slush, spotty snow, chain law | All reporting dry | UDOT failed (honest path after #336) |

**Colour tokens:** weather and roads use `--status-*`. The ozone light needs a new 5-level
`--risk-*` scale in `tokens.css`, with the outlook risk pills moved onto it and flattened in the
same PR. Inversion needs a new `--inversion-*` scale later. Meaningful colours never ride on a
page palette.

### 5.5 Weather forecast page (`/forecast_weather`)
This takes the order proposed in the contenders doc §1, from top to bottom:
1. **LLM forecast discussion:** `weather.discussion`, tiered.
2. **Town forecasts:** Vernal, Roosevelt, Duchesne, Myton and the passes, from the waypoints
   file, 18 h now and 48 h after P5. Mountain time and °F via `public/js/met.js`. Use KVEL as
   Vernal's station, to match the homepage.
3. **Hazards strip:** the NWS alerts from the shared helper, plus today's Special Conditions rules
   moved up from the bottom.
4. **GEFS days 1–15 as p10/p50/p90 bands** after P4, labelled snow *depth*, not snowfall.
5. **HRRR map:** lazy-loaded, gzip JSON (express `compression`, or an nginx root step on prod),
   with the real cadence stated.
6. **Expert drawer:** the spaghetti PNGs and provenance.

Cut the Basin-average panes and the invented "next update" (contenders doc §5.7).

### 5.6 Other placements
- **`/forecast_outlooks`:** the AI technical discussion block under each human outlook (§5.3
  pairing).
- **Clyfar page:** `clyfar.summary` in season.
- **Aviation:** `aviation.summary` by the KVEL runway winds.

### 5.7 Expert page
- A public page (route name TBD: `/expert`, `/lab` or `/research`) with an experimental banner.
- It shows the best-performing ADS-B products from the hub (profiles, cold-pool index), and
  Rhiannon's Expert notes when they are fresh.
- It is linked from every Expert tab, and lists only products that are flowing.
- It can be 1.8.0 or 1.9.0, depending on P6.

### 5.8 Data contract changes (website side)
- **New dataType `llm_forecasts`** (name to confirm): JSON only, one file per run per persona,
  e.g. `llm_forecast_ffion_20261203_1210Z.json`. It is kept separate from `llm_outlooks` so it
  can't take over the ozone PDF button. A draft schema:

```json
{
  "schema": "llm_forecast/1",
  "persona": "ffion",
  "issued": "2026-12-03T12:10:00Z",
  "valid_until": "2026-12-04T00:10:00Z",
  "describes": { "gefs": "2026-12-03T06:00Z", "hrrr": "2026-12-03T09:00Z", "obs_through": "2026-12-03T11:50Z" },
  "generator": { "prompt_version": "ffion-wx 1.0.0", "model": "<llm id>" },
  "placements": {
    "home.summary":          { "public": "…", "industry": "…", "expert": "…" },
    "weather.discussion":    { "public": "…", "industry": "…", "expert": "…" },
    "outlook.model_guidance": { "expert": "…" }
  },
  "sources": ["GEFS 06Z percentiles", "HRRR 09Z waypoints", "Synoptic obs to 11:50Z"]
}
```

- **New dataType for aircraft products** (`adsb`, to confirm), and later one for the fused
  inversion product (name TBD).
- **Accept a third producer.** Replace the hardcoded `endsWith('chpc.utah.edu')` with an
  allowlist read from `.env` (e.g. `UPLOAD_ALLOWED_HOSTS`, defaulting to the CHPC suffix), plus
  exact hostnames for the hub and any future buffer server.
  - The hostname header is a filter, not authentication; the API key is the authentication.
  - Consider a per-producer key, so the hub's key can be revoked on its own (§8).
  - Record each dataType's allowed producers in `DATA_MANIFEST.json`.
- Add a manifest entry and a `docs/WEBSITE-BRCTOOLS-CONTRACT.md` section for each new dataType
  before the website reads it, and bump `manifestVersion`.

## 6. Website slices (one issue and one PR each, one patch bump each)

| # | Slice | Depends on | Notes |
|---|---|---|---|
| S0 #336 | **Roads batch A** (honest UDOT failure) | Michael's open items (§8) | This session if possible; merge commit; #337–#339 stay parked for 1.9.0 |
| S1 #402 | Upload allowlist plus new dataTypes accepted (`llm_forecasts`, `adsb`), manifest and contract entries | — | Unblocks every producer; nothing visible |
| S2 #403 | Status lights row: weather now, ozone, roads (+ `--risk-*` tokens, flat risk pills) | S0 for roads, S3 | Rules and tests; JRL signs off thresholds |
| S3 #404 | Shared NWS alerts helper for the Basin zones, with honest failure | — | Used by S2, S6 and the chip; also fixes the fire-page pattern, or files an issue for it |
| S4 #405 | LLM text renderer, tier tabs and guards, with fixture sidecars and tests | S1 | Merges with S5, its first real placement |
| S5 #406 | Homepage LLM forecast summary panel | S4, P1+P2 on `.dev` | Closes #295 and #166 |
| S6 #407 | Weather page rework without the LLM: cut the averages, local time and °F, town strip, hazards strip, lazy map and gzip, expert drawer | S3 | #101 (mobile overflow) rides along |
| S7 #408 | Weather page LLM discussion | S4, P2 | |
| S8 #409 | GEFS bands, days 1–15 | P4 | Also the snow tile H4 and the next-3-days light upgrade |
| S9 #410 | AI technical discussion on `/forecast_outlooks` | S4, P2+P3 | |
| S10 #411 | Clyfar and aviation summaries | S4, P2+P3 | |
| S11 #412 | Expert page | P6 | 1.8.0 if P6 lands, else 1.9.0 |
| S12 #413 | Next-3-days light, inversion light | P4+P5, P7 | The inversion light is likely 2.x |

**Proposed order:**
- **20–22 Nov:** S0, S1 and the producer handoff.
- **23–25 Nov:** S3, S2, S6; producers land on `.dev`.
- **25–27 Nov:** S4+S5, S7, S9, S10.
- **27–28 Nov:** strip to 1.8.0, promote, tag; JRL deploys prod.
- **30 Nov:** remove the test outlook from both boxes.
- **1 Dec:** 2.0.0.

## 7. Producer handoff (brc-tools and brc-adsb-buffer)

| # | Ask | Unlocks | Size |
|---|---|---|---|
| P1 | Send `llm_outlooks` **and** the new `llm_forecasts` to **both** hosts (`BASINWX_API_URLS`) | Rehearsal on `.dev` | S |
| P2 | Ffion weather run, 4×/day on GEFS cycles, writing the §5.8 sidecar per placement to the §5.2 budgets with Public · Industry · Expert labels | S5, S7, S9, S10 | M + LLM cost |
| P3 | Rhiannon run, 8×/day, writing Expert-only placements (`outlook.observed_trends`, aviation Expert, expert notes) from obs and trends | S9, S10, S11 | M |
| P4 | `forecast_gefs_weather_percentiles_*` **year-round** to both hosts | S8, next-3-days light | S (already written) |
| P5 | Waypoints to **48 h** on the 00/06/12/18Z HRRR cycles | Town strip to tomorrow evening, next-3-days light | S |
| P6 | Hub on `brc-linode-dev` pushes its best aircraft products to the aircraft dataType | S11 | M; needs S1 |
| P7 | Fused inversion product (HRRR + aircraft + pseudo-profile), from CHPC or the Linode | Inversion light | L; likely 2.x |

Each new file family needs a manifest entry before the website reads it.

## 8. Open questions (my assumptions until JRL says otherwise)

1. **#336 open items.** Michael said on 13 Nov that he would finish four items on A after the
   15th: snow-covered with cloudy in finding 8, the HRRR case in 9, the station side of 7, and a
   JSDoc nit. Nothing has been pushed since. Wait for him, or finish them for him with his
   authorship kept on his commits?
2. Light thresholds (§5.4): sign off, or adjust.
3. The next-3-days light before P4/P5 land: ship it on HRRR 18 h plus NWS watches, or hold it?
4. Writers: Ffion on the aviation Public and Industry tabs, and Rhiannon only in Expert tabs and
   the outlook's Observed trends?
5. Stale times of 12 h (Ffion) and 6 h (Rhiannon), and the 6 h outlook pairing window.
6. Names: the `llm_forecasts` and `adsb` dataTypes, and the expert page route.
7. A per-producer API key for the hub (revocable alone), or the shared key plus a hostname?
8. Still open from the contenders doc §9:
   - NWS point-forecast text on the weather page, or alerts only?
   - Kiosk mode behind `?kiosk=1`?
   - Public verification ("How did yesterday's forecast do?"), parked for now?

## 9. Constraints to keep in view

- Observations and payloads arrive in SI; convert at display with `public/js/met.js`.
- Never invent data: a failed fetch shows nothing or says it is unavailable, and a light goes
  grey, never green.
- Colours come from tokens; meaningful colours have their own tokens; `styleRatchet.test.js`
  ceilings only fall.
- Lengths in `rem`, never CSS `zoom`; hover changes colour, never position; hard edges.
- Nothing unfinished on `dev`; WIP lives on `preview/nwp`.
- Never `pm2 start` or `pm2 restart` from a Claude shell: delete and start scrubbed, and no
  `pm2 save`.
- Every merge into a protected branch is a separate `gh pr merge --admin` that JRL confirms on
  its own, with a terse audit comment.

<sub>Drafted with Claude Code from JRL's answers on 2026-11-20 and a read of `dev` at `22e86a1`.</sub>
