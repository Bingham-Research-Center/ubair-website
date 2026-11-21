# Weather Page Contenders — Nov 13

**Status:** proposal for JRL. Nothing here is scheduled. Measurements taken 2026-11-13 00:40Z
against both hosts. Delete this file, or fold its decisions into issues, once the open decisions
at the end are answered.

**Scope:** `/forecast_weather`, the weather part of the homepage, and how Ffion's three-tier
explanations could run through both. Each contender gets pros, cons, where its data comes from
and a verdict.

---

## 1. The short version

1. **The page leads with its most expert product.** First comes a 31-member GEFS spaghetti PNG in
   °C on UTC, then a Basin-wide HRRR map, then four panes. Two of those panes compute things that
   mislead. Someone asking "will it snow in Roosevelt tomorrow?" gets no answer above the fold.
2. **Some useful data already reaches both boxes and nobody reads it.**
   `forecast_hrrr_waypoints_us40_dense_*` is hourly HRRR for 14 named towns and passes, with an
   observing station attached to each. On `dev`, nothing reads it; only the parked roads stack
   does. A town strip built on it needs no CHPC work.
3. **Ffion already writes the three-tier format the page needs.** Each ozone outlook has
   (a) Public, (b) Stakeholder and (c) Expert text for each 5-day block, plus a machine-readable
   alert block, FAQ and data log. A weather run in the same template gives the page its top
   pane. One CHPC ask (GEFS percentiles JSON, year-round) unlocks most of the rest.
4. **The homepage has no weather forecast.** The section is titled "Air Quality and Weather
   Overview", but it holds a live map and an *air-quality* outlook. A "Weather Outlook" panel
   beside the AQ one is the obvious slot.

**Proposed page order (top to bottom):**
Ffion outlook (tiered) → town forecasts for the next 18 h → hazards strip (NWS + rule-based) →
GEFS days 1–15 as bands → HRRR map → expert drawer (spaghetti PNGs, provenance, verification).
Contenders that need data we don't have yet stay off the page until the data flows. CLAUDE.md
rules out "Coming soon", and `removedPages.test.js` already guards the last tiered pane, which
nothing filled.

---

## 2. The page today

| Pane | What it does | Problem |
|---|---|---|
| Model Forecast Data | GEFS meteogram PNGs (temp, wind, MSLP, snow, solar), run dropdown | 1300×600 spaghetti in °C with °F gridline labels, UTC, forecast hours on the top axis: expert-only reading. The run dropdown lists every init on disk (~250 on `.dev`, ~690 on `.com`). |
| HRRR control panel + map | 18 h of T / rain / snow at stride 2 (36×38 points), wind arrows, kiosk mode | Each run is **1.5 MB, served uncompressed** (no `Content-Encoding`), and it loads before anything else renders. Runs arrive **12/day in 3-on/3-off blocks** (03–05, 09–11, 15–17, 21–23Z), each about 2¾ h after its init, so the newest run can be 3–6 h old. |
| Current Summary | "Basin Average", range and trend at the selected hour | It describes a *forecast hour*, not the current state. A Basin-wide average mixes the floor (~5,000 ft) with the Uinta crest (12,000 ft+), so it describes no place. |
| Forecast Snapshots | Grid averages at F+0/6/12 | Same averaging problem. |
| Special Conditions | Rule-based flags: freezing, snow ≥1 mm/h, rain, wind ≥10 m/s | Honest and useful, but buried at the bottom. |
| Model Information | Last/next update | **"Next update" is computed as init + 1 h.** The cadence and latency make that wrong most of the time, which breaks the "never invent data" rule. "HRRR 3km" is shown while the map is at stride 2 (~6 km). |

Also open: mobile overflow (#101). The parked Winter tab (#278) waits on a data decision. Every
time on the page is UTC.

---

## 3. What data we have

| Product | dataType / file | Cadence, size | `.com` | `.dev` | Read by |
|---|---|---|---|---|---|
| GEFS meteogram PNGs, 5 vars, ~16 days | `images` `meteogram_UB-repr_*_GEFS.png` | 6-hourly, ~330 KB each | yes | yes | weather page |
| HRRR surface layers: T, u, v, rain, snow; 18 h | `forecasts` `forecast_hrrr_surface_layers_*` | 12/day, 1.5 MB | yes | yes | weather page |
| **HRRR town/pass points: T, Td, RH, wind, MSLP, rain; 18 h; 14 sites with `reference_stid`** | `forecasts` `forecast_hrrr_waypoints_us40_dense_*` | hourly, 38 KB | yes | yes | **nothing on `dev`** (parked roads stack only) |
| HRRR road points: T, wind, **gust, visibility, precip type, snow depth, cloud**, RH; 12 h; 17 sites | `road-forecast` `latest.json` | hourly, 119 KB | yes | yes | roads page |
| HRRR sub-hourly KVEL crosswind, 6 h at 15 min | `forecasts` `forecast_hrrr_kvel_crosswind_*` | hourly, 4 KB | yes | yes | aviation |
| GEFS weather percentiles: p10/50/90 of temp, wind, MSLP, snow depth, solar; 105 steps to day 16 | `forecasts` `forecast_gefs_weather_percentiles_*` | **stopped 2026-03-30** (Clyfar season), 25 KB | old only | never | nothing (Ffion reads it on CHPC) |
| Clyfar exceedance / clustering / possibilities | `forecasts` | stopped 2026-03-30 | old only | never | Clyfar page |
| **Ffion ozone outlook, `.md` + `.pdf`** | `llm_outlooks` `LLM-OUTLOOK-*` | 6-hourly in season, last 2026-03-30 | yes (462 files) | **never (A5)** | Clyfar page button (PDF only) |
| Observations: 53 stations (T, wind, Td, pressure, solar, snow depth at 13, O₃, PM2.5) | `observations` | 10 min | yes | yes | many |
| `gefs_snow_summary.json` | `forecasts` | **never produced** | no | no | homepage tile, hidden until it exists |
| NWS gridpoint forecasts and alerts | fetched server-side (`server/nwsHelpers.js`) | on demand | — | — | roads, fire |

Note that `forecast_air_quality.js` sorts all `.pdf`s in `llm_outlooks` and links the last one.
A weather PDF named `LLM-WX-…` would sort after `LLM-OUTLOOK-…` and take over the ozone button.

---

## 4. Ffion and the three tiers

### What Ffion produces today

From `LLM-OUTLOOK-20260330_0600Z.md` (Ffion v1.1.3, Clyfar v1.0.5):

- A disclaimer banner ("EXPERIMENTAL AI-GENERATED FORECAST … verify with official sources").
- A run-to-run comparison.
- For each of **Days 1–5 / 6–10 / 11–15**: **(a) Public**, two or three sentences in °F with
  plain advice; **(b) Stakeholder**, ensemble agreement, ppb ranges and run-to-run persistence;
  **(c) Expert**, possibility memberships, cluster IDs, GEFS drivers in SI with conversions.
- The full outlook: pattern, dRisk/dt, drivers and monitoring guidance.
- A **machine-readable block** (`AlertLevel_D1_5: BACKGROUND`, `Confidence_D1_5: HIGH`, …).
- An FAQ and a **data logger** listing every file read.

That is close to the full design of the three-tier system. What's missing is a weather run and a
way to render it.

### The tiers have six names in five places

| Where | Labels |
|---|---|
| Ffion's output (what ships) | Public / Stakeholder / Expert |
| Weather pane removed in a64dc50 | Plain / Extended / Detailed |
| brc-knowledge FEATURES §6 (LLM summaries) | Short / Full / Extended |
| brc-knowledge FEATURES §2 (Clyfar UI) | Simplified / Standard / Technical |
| Pitch spine; Discussion #342 Clyfar tabs | public / industry / technical; Public / Industry / Researchers |
| Ffion's confidence vs. `CONFIDENCE_TAXONOMY.md` | HIGH/MEDIUM/LOW vs. Possible/Likely/Confirmed (different axis; don't conflate) |

**Recommendation:** adopt **Public / Stakeholder / Expert** everywhere, because that is what Ffion
already writes. Map Ffion's confidence words onto the existing `--confidence-*` tokens.

### Ways to weave the tiers through the page

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| **W1. One page-level tier switch** (Public · Stakeholder · Expert) that changes both the text *and* which panes show; Public hides the spaghetti, Expert opens the drawer | One control and one mental model; the page is simple by default and deep on demand; matches the parked Clyfar tabs (#296–298), so the same switch can later serve Clyfar, roads and aviation; the choice can live in `localStorage` as a per-viewer convenience | Hidden panes are easy to miss, so the switch must be prominent; every tier needs real content on day one ("nothing unfinished"); three layouts to test at 375 px | **Yes**, once each tier has content |
| **W2. "Explain" disclosure under each pane** (three-level accordion) | Explanation sits beside the thing it explains; no global state | Clutter; if the text is per run, the LLM writes N panes × 3 tiers every run | Only for static text (W3) |
| **W3. Static three-tier glossary**: inversion, ensemble, p10–p90, HRRR vs GEFS, possibility, ventilation. Ffion drafts it once, a human reviews it, it is versioned in the repo; the ⓘ icons show the Public line and a click opens all three | No runtime LLM cost or hallucination; reviewed; reusable on every page; replaces today's one-line tooltips | Not specific to a run; needs an owner when wording drifts | **Yes, first.** Cheapest real use of Ffion, and it can ship before any producer work |
| **W4. Per-run Ffion captions per chart** ("most members keep Vernal below freezing from Wed night; spread widens after day 7") | Explains *this* spaghetti, the hardest thing on the page for a non-expert | More generated numbers to fact-check each run; the caption has to follow the run dropdown or hide itself | Later, if W1 lands well |
| **W5. Ffion weather outlook as the top pane** (Next 48 h / Days 3–7 / Days 8–15, each a/b/c, plus a hazard/confidence block) | Answers the visitor's question in words before any chart; same template and disclaimer as the ozone outlook, so the two read as one product; it can explain the *link* between weather and ozone (snow + calm + high pressure) that phone apps never will | Needs a producer (§7, C3); LLM cost year-round, where the ozone Ffion runs only in season; `.dev` has never received `llm_outlooks` (A5), so there is no rehearsal until that is fixed; text must hide when stale or when it describes a different run than the chart beside it | **Yes, the centrepiece**, second wave |

### Guardrails any Ffion pane needs

- **Parse a JSON sidecar, not prose.** Today the homepage regexes the human outlook for
  `NO|LOW|…|HIGH RISK`, which is brittle. Ask for `{issued, model_versions, describes_run,
  blocks:[{id, label, public, stakeholder, expert, level, confidence}], faq, sources}` next to
  the `.md`, and pin it in `DATA_MANIFEST.json`.
- **Use its own dataType or filename family**, so it cannot take over the ozone PDF button (§3).
- **Stamp it** with "Issued … · describes GEFS 12Z / HRRR 15Z". Hide it past N hours, and show
  "Past season" the way `outlookSeasons.js` already does.
- **Keep the experimental label and the "verify with official sources" line on every tier**,
  styled differently from the human-written `outlooks` so nobody mistakes AI text for a
  forecaster's.
- **Expert tier shows provenance:** Ffion's data logger becomes a "Built from" list.
- **Nothing renders until a file loads.** `removedPages.test.js` forbids
  `weather-summaries-section` and `Loading (plain|extended|detailed)`, so a new pane uses new names
  and stays hidden until data arrives.

---

## 5. Contenders for the forecast page

Verdicts: **Now** (website only, data already flows) · **After ask** (needs one CHPC change) ·
**Park** (Discussion #342) · **Fix** / **Cut** (existing panes).

### 5.1 Ffion weather outlook, tiered (W5) — *After ask (C3)*
Covered in §4. The top of the page, using the same template as the ozone outlook.

### 5.2 Town forecasts, next 18 h — *Now*
Hourly strip for Vernal, Roosevelt, Duchesne and Myton (selectable), plus passes (Daniels
Summit, Strawberry), from `forecast_hrrr_waypoints_us40_dense_*`, in °F and Mountain time via
`met.js`.
- **Pros:** already on both boxes hourly and unread; 38 KB against 1.5 MB; answers the question
  most visitors arrive with; each point carries `reference_stid`, so an "observed so far today"
  line can be overlaid as aviation already does for KVEL; it is the natural home for the Public
  tier.
- **Cons:** deterministic HRRR only, 18 h at most, which may not reach "tomorrow afternoon" from
  some inits; no gust, precip type or visibility (`road-forecast` has those but stops at 12 h);
  it shares a producer with the parked roads stack, so a roads change can break it, which needs
  a contract line; the two products tie the same town to different stations (Vernal → `QV4` vs
  `KVEL`, Roosevelt → `QRS` vs `K74V`), so pick one and match the homepage's KVEL.

### 5.3 Hazards strip: NWS alerts + "watch for" rules — *Now*
Active NWS watches and warnings for the Basin zones (server-side, as the fire page already does),
followed by today's Special Conditions rules moved up from the bottom.
- **Pros:** authoritative hazards (winter storm, wind, Red Flag); serves the "verify with
  official sources" line Ffion prints; `nwsHelpers.js` exists; the rule flags are honest and
  only need moving.
- **Cons:** zone mapping to settle once; the empty state may say "No NWS alerts for the Basin"
  only when the fetch succeeded, and must show nothing on failure; it adds an outside dependency
  to the page.

### 5.4 GEFS days 1–15 as bands (interactive) — *After ask (C1)*
Plotly p10–p50–p90 bands for temperature, wind, snow depth and pressure, in °F/mph/in on local
time with day/night shading, drawn from `forecast_gefs_weather_percentiles_*`.
- **Pros:** a band ("likely range") is readable at the Public and Stakeholder tiers where
  spaghetti is not; it hovers, scales to phones and converts units at display; 25 KB per run;
  the same file feeds the homepage snow tile (5.8), the ingredients strip (5.5) and Ffion;
  Plotly already loads on four pages.
- **Cons:** needs the CHPC export to run year-round and reach `.dev`; p10/p90 hide the
  bimodality the spaghetti shows, so the PNG must stay in the Expert drawer; one
  "representative" Basin point, not a town; snow is *depth*, not snowfall, so the label must
  say so.

### 5.5 "Ozone ingredients" strip (in season only) — *After ask (C1)*
Four chips per day for days 1–10: snow on the ground, light winds, high pressure, cold. Each is
lit from GEFS p50, with today's snow depth from the 13 observing stations, and links to Clyfar.
- **Pros:** the one thing only BasinWx can say, and it ties the weather page to the site's
  reason to exist; it is how Ffion's FAQ already explains risk ("fresh snow, calm winds, cold,
  clear skies"); each tier gets a natural layer (chips → counts → member spread).
- **Cons:** it can read as a second ozone forecast that contradicts Clyfar, so it must be framed
  as *ingredients*, not *risk*, and the thresholds need JRL's sign-off; it is noise from April to
  November, so hide it out of season with `outlookSeasons.js`.

### 5.6 HRRR map — *Fix*
- **Keep because:** it is the only spatial forecast on the site, the wind arrows earn their
  place, and kiosk mode may have a lobby user.
- **Fix:** load it lazily below the fold; gzip JSON (express `compression` or nginx `gzip_types
  application/json`; one root step on prod); state the real cadence instead of "next update";
  replace the circle-marker dots with a canvas image overlay on the greyed basemap; take the
  colour scales from tokens rather than the hex in `VARIABLE_CONFIG`.
- **Cons of investing:** it is still T/rain/snow only until C4. On a phone it is the heaviest
  thing on the site.

### 5.7 Analysis grid (Current Summary, Snapshots, Model Info) — *Cut / merge*
- **Pros of keeping:** it fills space under the map and changes with the slider.
- **Cons:** Basin averages describe no place; "Current" isn't current; "Next update" is invented.
- **Instead:** Special Conditions moves to 5.3; Model Info becomes a one-line provenance footer
  ("HRRR 15Z, ~6 km display grid, received 17:46Z").

### 5.8 Snow outlook — *After ask (C1/C6)*
The chance of ≥1″ / ≥3″ / ≥6″ in the next 5 days from GEFS members, or snow-depth change if that
is all we get.
- **Pros:** the most-asked winter question; the same numbers fill the hidden homepage tile.
- **Cons:** GEFS resolves Basin snowfall poorly; snowfall needs APCP or categorical snow added
  to the export, because depth change undercounts melt-and-refill.

### 5.9 "How did yesterday's forecast do?" — *Now (needs retention)*
HRRR from 24 h ago against what the reference stations observed, at 4–6 towns, as a tiny table
with a Public-tier sentence.
- **Pros:** answers the Energy Summit complaint about bad phone-app forecasts directly; builds
  trust; Expert users want it; website-only, and `reference_stid` is already in the payload.
- **Cons:** grid-versus-station elevation mismatch needs care; KVEL has no gusts and the feed
  has no RH; retention (#168) may delete the old runs it needs; a bad day shows publicly, which
  is the point but needs JRL's comfort.

### 5.10 Precip type, Winter tab (#278) — *After ask (C4)*
`road-forecast` has `precip_type` at 17 points for 12 h. A Basin-wide map needs ptype in the
surface layers.
- **Pros:** decides the parked Winter tab's data question.
- **Cons:** a seasonal tab is more structure to maintain; it overlaps 5.2 and 5.8.

### 5.11 NWS Area Forecast Discussion excerpts — *Feed Ffion, don't display*
- **Pros:** free, human forecaster reasoning from SLC and GJT.
- **Cons:** the Basin is rarely named; the jargon is Expert-only; keyword extraction is brittle.
  Better as Ffion input that surfaces as a cited sentence.

### 5.12 HRRR sounding / inversion depth at Vernal; lagged-HRRR probabilities; NBM — *Park*
Expert gold, and the aviation thread already wants the first two, but each is a new producer
and a new visualisation. Revisit after v2.0.0.

---

## 6. Contenders for the homepage weather preview

Today: the Alerts tab (ozone "Next 5 Days", Live Map, and a hidden "Snow Likely?" tile waiting
on a file that has never existed) and the Current tab (KVEL temperature, RH, wind). The dashboard
grid holds the map and the **Air Quality** outlook, with no weather panel. #295 asks what feeds
a weather slot; #166 asks for the AI summary.

| # | Contender | Data | Pros | Cons | Verdict |
|---|---|---|---|---|---|
| H1 | **"Weather Outlook" panel** beside the AQ outlook in the dashboard grid | holds H2 now, H3 later | Fills the gap the section title promises; mirrors the AQ panel, so the page reads as weather + air; one link to `/forecast_weather` | Another panel to keep honest on mobile | **Yes, it is the slot** |
| H2 | Next 18 h at Vernal: temperature line, precip bars, wind | waypoints (flowing) | Data on both boxes now; pairs with the Current tab; local time, °F | 18 h horizon; must use KVEL to match Current (5.2) | **Now** |
| H3 | Ffion Public line(s): weather + ozone, with "Read more" opening the tiers | C3 sidecar | Plain words first; one voice across weather and ozone; answers #166 and #295 together | Producer, cost, A5; stale gating; experimental label must stay visible at this size | **After ask** — replaces H2's caption, not H2 |
| H4 | "Snow Likely?" tile (coded, hidden) | `gefs_snow_summary.json` or derived from C1 | Already coded and guarded by `homepage.test.js`; one ask away | Must define snowfall vs depth in the contract; GEFS coarse | **After ask** — derive from C1 instead of a new file |
| H5 | NWS hazard chip in Alerts ("Winter Storm Warning until 5 PM") | server fetch | Highest value per pixel; website-only | Zone mapping; on fetch failure, show nothing, never "no alerts" | **Now** |
| H6 | 5-day Basin strip: daily high/low ranges + snow chance | C1 | The look people expect, with honest ranges | Invites a head-to-head with phone apps on a coarse model; repeats H2/H4 | Park until 5.9 shows we win |
| H7 | Ozone-ingredients chip (in season) | C1 | Ties the homepage's two halves | Can be read as an ozone call; season-gated | Later, with 5.5 |

---

## 7. What to ask CHPC (brc-tools) to push

Ranked by what each one unlocks per unit of effort. Fix A5 first, so that everything new reaches
`.dev` for rehearsal.

| # | Ask | Unlocks | Effort | Notes |
|---|---|---|---|---|
| C1 | Export `forecast_gefs_weather_percentiles_*` **year-round** to both hosts, decoupled from the Clyfar season | 5.4, 5.5, 5.8, H4, H6, H7 | S (already written) | 25 KB × 4/day |
| C2 | Add **APCP and categorical snow** (or snowfall) to those percentiles, plus P(≥ thresholds) | 5.8, H4, precip chance in 5.4 | S–M | Settles snowfall vs depth |
| C3 | **Ffion weather run:** Next 48 h (HRRR) / Days 3–7 / 8–15 (GEFS), a/b/c tiers, JSON sidecar, own dataType or filename family | 5.1, H3, W4 later | M + LLM cost | Year-round or season-only is a JRL call; 4×/day on GEFS cycles, not hourly |
| C4 | Surface-layer fields: Td/RH, gust, cloud, visibility, **ptype**, PBL height (ventilation) | 5.6, 5.10, inversion context | M | About 300 KB per field per run uncompressed; consider one file per variable. Settle A4 (cadence) at the same time |
| C5 | Waypoints to **48 h** on the 00/06/12/18Z HRRR cycles | 5.2 reaches tomorrow evening | S | HRRR already runs 48 h on those cycles |
| C6 | Ffion drafts the **W3 glossary** once (offline, human-reviewed) | W3 | S | No runtime cost |
| C7 | Later: HRRR sounding at KVEL, lagged-HRRR probabilities, NBM points, satellite snow cover | 5.12 | L | Park |

---

## 8. Suggested sequencing

- **Wave 0, website only (could fit v2.0.0):** remove the invented "next update" and the
  Basin-average panes (5.7); local time and °F throughout; town strip (5.2); hazards strip (5.3);
  homepage Weather Outlook panel with H2 and the H5 chip; gzip; lazy map; move the PNGs into an
  Expert drawer; W3 glossary if C6 is quick. Add the tier switch (W1) only once every tier has
  something real behind it.
- **Wave 1, after C1/C2:** GEFS bands (5.4), snow outlook (5.8) and the H4 tile; ingredients
  strip (5.5) when the season opens.
- **Wave 2, after C3:** Ffion top pane (5.1), homepage Public line (H3), the tier switch with
  real text in each tier.
- **Wave 3, park:** verification (5.9) once retention is settled, soundings, lagged ensembles,
  local WRF.

---

## 9. Decisions for JRL

1. **Tier labels:** adopt Ffion's Public / Stakeholder / Expert across the site?
2. **Ffion weather:** year-round or ozone-season only? This sets the LLM budget and the review
   load.
3. **NWS on the page:** alerts only, or also the official point forecast text for comparison?
4. **Home station:** KVEL for both the Current tab and the town forecast (5.2 picks `QV4`)?
5. **Kiosk mode:** does a lobby screen use it? If not, hide it behind `?kiosk=1`.
6. **Homepage:** third dashboard panel (H1), or a third tab in the header?
7. **Verification in public (5.9):** comfortable showing our misses?

## 10. Constraints to keep in view

- Observations and payloads arrive in SI; convert at display with `public/js/met.js`.
- Never invent data: a failed fetch shows nothing or says the data is unavailable.
- Colours come from `tokens.css` semantic tokens; hazard and confidence colours use their own
  tokens, never the page palette; `styleRatchet.test.js` ceilings only fall.
- Nothing unfinished on `dev` (`removedPages.test.js`, `homepage.test.js`); a pane that waits on
  a producer lives on a branch or a preview (`theme.basinwx.dev` :3003).
- New dataTypes or filename families go in `DATA_MANIFEST.json` and
  `docs/WEBSITE-BRCTOOLS-CONTRACT.md` before the website reads them.

<sub>Drafted with Claude Code from a read of `views/forecast_weather.html`,
`public/js/forecast_weather.js`, `views/index.html`, the live file lists on both hosts and
Ffion's outlook `LLM-OUTLOOK-20260330_0600Z.md`.</sub>
