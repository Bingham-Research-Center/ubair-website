# Next Session Handoff — Nov 24

Where things stand after the v1.8.1 release of 24 Nov 2026, and what comes next, for John and
for an agent starting cold. Rules that last are in `CLAUDE.md`; this file goes stale and is
replaced by the next `*-HANDOFF-*.md`. Check every line against `scripts/probe.py` and `gh`
before acting.

## 1. Where things stand

| | Version | Commit | Notes |
|---|---|---|---|
| `dev` → www.basinwx.dev | **1.8.1** until #446, then 1.8.2-dev | `0d92188` (strip #443) | Deployed 22:21Z 24 Nov with a clean pm2 restart (a route was removed); probe ok; the 88c1972 build accepted CHPC's 22:21:06Z upload |
| `ops` | **v1.8.1** | `e181086` = tag `v1.8.1` | Promotion #444; tree identical to `dev`'s (`f243292`); GitHub release published |
| www.basinwx.com | **1.8.1** | `e181086` | Deployed by John, started 05:33:16Z 25 Nov; probe `release matches newest tag v1.8.1`; checks in §2 |
| `main` | v1.8.0 | `6212a90` | Follows `ops`: #445 is staged and the deploy it waited on is done |

- **The suite is 1,235 tests in 83 suites** at `88c1972` and after (one new test in #441).
- **Open PRs:** #445 (`ops` into `main`), #446 (reopen `dev` at 1.8.2-dev, squash; until it
  merges both boxes report 1.8.1), this docs PR, and #401, Quinten's draft (conflicts, far behind `dev`:
  rebase onto `rebased/quinten-changes`, never his branch). Each merge on John's OK by number.
- **On the dev box:** no preview running; `theme.basinwx.dev` (:3003) is free. Local-only
  branches kept on purpose: `preview/theme` (the look switcher, #355) and
  `rebased/feature/braxton-sports` (Quinten's early sports work). The merged branches the last
  handoff listed are gone from GitHub; Michael's `codex/roads-{b,c,d}-review-fixes` are his to
  delete; Quinten's stay.

## 2. What happened on 24 Nov

- **v1.8.0 finished.** John deployed prod at 18:58Z (`872c493`) and merged #435
  (`ops` into `main`) himself.
- **Merged into `dev`, each on John's OK:** #437 (Colorado stations, §4), #439 (four scripts
  on the shared unit converters, part of #306), #438 (the last handoff), then:
  - #440: `CLAUDE.md` and the README tightened. Every rule kept; volatile detail (handoff
    file name, test count, dates) left to the handoff.
  - #441: **the unused Synoptic proxy is gone.** `GET /api/synoptic/timeseries` and
    `/stations` were unauthenticated and spent the site's Synoptic token for any caller; no
    page had called them since the maps moved to CHPC's files. `removedPages.test.js` keeps
    them out. The app no longer reads `SYNOPTIC_API_TOKEN` (the key can stay in `.env`).
  - #442: `/forecast_outlooks` (434 px) and `/roads` (394 px) fit a 390 px phone. Both were
    content-box elements at `width: 100%` plus padding; the roads footer is in the flow, so it
    widened the page.
- **Release 1.8.1:** strip #443, promotion #444, tag and release. Before the strip: suite
  green on `dev`; `.dev` deployed and probed; all 11 pages loaded at 1366 px and 390 px with
  no overflow, console error or failed request. Prod gains no package and no `.env` key.
- **Prod deployed** (John, started 05:33:16Z on 25 Nov). Checked after: probe `release matches
  newest tag v1.8.1`; `/api/synoptic/*` 404; `/api/health/ingest` 200; all 11 pages at 1366 px
  and 390 px with no overflow, console error or failed request; notchpeak1's first upload after
  the restart accepted at 05:35:37Z, none refused.

## 3. Next steps

**John**
1. **OK #445, #446 and this PR by number.** Prod is deployed and checked (§2).
2. **Rangely on the homepage map, yes or no.** It is off: adding it zooms that map out a level
   (`home: true` on `K4V0` in `public/js/config.js`).
3. **#311** in the UI: Settings → Rules → Rulesets → "Protecting dev" → add "Require status
   checks to pass" → check `test` (GitHub Actions), "require branches to be up to date" off.
   The API cannot do it (the ruleset comes back with an empty `copilot_code_review` rule it
   will not take back, 422). Admins still bypass.
4. **The November test outlook goes by 30 Nov** (#253), on both boxes:
   `rm public/api/static/outlooks/outlook_20261112_0337.md` under `/srv/ubair-website` (an
   agent on the dev box may, once John says) and under `/var/www/ubair-website` (root). The
   list rebuilds within five minutes.
5. Decisions still his: the keep-window for Clyfar's files and whether to run the pruner
   (#168); dark mode (#355); the funders list for `/about` (#291); the Seth and Michael colour
   proposal on #337 (red for closed only), which reverses his 20 Nov rule; Derek's name on #317
   and #291.

**On the dev box**
1. #445 and #446 on John's OK, then redeploy `.dev` (it then reports 1.8.2-dev; package.json
   only, but `/api/health` reads the version at start, so restart it clean).
2. **When a real LLM file lands:** check the homepage and weather placements on `.dev`.
3. Ready to pick up: #306 (only the roads page's unit switch, `roads/UnitsSystem.js`, still
   converts by itself; it is a classic script and needs the `window` shim the issue describes;
   take it off the list in `met.test.js` when it moves); #291 (a link and a line per provider
   on `/about`, the station networks by name); #419 (a camera near Heber carries
   `temperatureOverride: true, temperature: 79` from a June reading; the page always says
   "Cached road data"; the "Basin summary" said "Snow" from Bald Mountain Pass on a dry day in
   the Basin); the #401 rebase.
4. **v2.0.0 is 1 Dec** (#317): the same train, each merge on John's OK. Its strip PR sets
   `2.0.0` rather than `1.8.2`.

**On CHPC** (brc-tools). Full text in [`NWP-PRODUCER-HANDOFF-nov20.md`](NWP-PRODUCER-HANDOFF-nov20.md)
and [`CHPC-INGEST-HANDOFF-nov21.md`](CHPC-INGEST-HANDOFF-nov21.md). Seen in the 24 and 25 Nov probes
of both boxes:
1. **P1, P2: the LLM forecast text.** Still the critical path: no `llm_forecasts` file has
   reached either box. The prose outlook (`llm_outlooks`) skipped three cycles: after the
   23 Nov 18Z outlook the next was 24 Nov 18Z, which arrived about 04:50Z on 25 Nov, 11 h after
   its cycle. `aircraft` has never been sent.
2. `hrrr_surface_layers` arrives about every six hours, not hourly as the manifest declares:
   either the producer or the manifest is wrong.
3. **Undeclared files:** `.dev` holds one `forecast_rrfs_surface_layers_20261121_0000Z.json`
   and its index (not on `.com`); `.com` holds an undated `clustering_summary.json`. Neither
   is in the manifest (P28 asks for the declarations).
4. P21 (Fruitland `QFL`), P22, P23, P11 to P20, P24 before a second observations producer.
5. **P29: the Wyoming edge.** `obs_map_stids` names no Wyoming station. If John wants that
   edge, add the stations (Rock Springs `KRKS` is the obvious first) once Synoptic allows them.
   `K33U` (Dutch John) is requested and never arrives: check whether it still reports.

## 4. The Colorado and Wyoming edges

Checked on 23 Nov, in the brc-tools code and the files:

- **CHPC already asks Synoptic for the Colorado stations.** `obs_map_stids` names `K4V0`
  (Rangely airport), `DNOC2` (the climate station at Dinosaur, Colorado) and `SURC2` (Dinosaur
  NM, Success). The feed carries none of them and no other Colorado station, so the CHPC token
  is refused Colorado just as the site's token is.
- **All three report.** api.weather.gov had a reading from each within the hour.
- **No page uses the site's own token** (and since 1.8.1 the app does not read it). Every map
  and chart reads CHPC's files, so what matters is that the stations reach `map_obs_*`,
  whichever token Synoptic changes.
- **So when Synoptic says yes, nothing has to be done anywhere for Colorado** (#437, in 1.8.1):
  Live AQ draws the three by themselves, under the names in `config.js`; the Dinosaur town
  forecast changes from the Monument's quarry monitor (35 km away, 1,250 ft lower) to `DNOC2`,
  0.4 km from its model point, in the first run `DNOC2` reports in. Rangely is off the
  homepage map until John says (§3).
- Ask Synoptic also whether the UB-AIR network will be restricted when it returns. The maps
  drop "Not reporting since" by themselves the moment a newer report arrives.

If Synoptic says no, these need no key (each checked live on 21 Nov; none is wired, by John's
choice on 23 Nov):

| Source | What it has near the edge | Notes |
|---|---|---|
| aviationweather.gov `/api/data/metar` | Rangely `K4V0`, Meeker `KEEO`, Craig `KCAG`, Rock Springs `KRKS` | METAR every 20 min |
| api.weather.gov `/stations/{id}/observations/latest` | The same airports, RAWS (`DRAC2`), Douglas Pass RWIS `CO098`, `DNOC2`, `SURC2` | SI with unit codes; needs a User-Agent |
| Iowa Environmental Mesonet JSON | Colorado and Wyoming RWIS, RAWS | Its RWIS is Synoptic's data by another road |
| RCC-ACIS, CoCoRaHS export | Daily snow depth and precipitation: Rangely, Dinosaur | A day behind |

**No live air-quality monitor remains in the Colorado or Wyoming box.** The nearest live ozone
outside Utah is Rifle, through AirNow (free API key).

## 5. Issues

22 open on `v2.0.0 Ozone season open`:

| Kind | Issues |
|---|---|
| Waits on producer data | #406, #408, #409, #410, #411, #412, #413, #241 |
| Website work, ready to pick up | #306 (roads unit switch only), #291, #311 (UI, John), #168 (choose a keep-window first) |
| Roads | #419, #303, #302, #301, #238, #144, #71 |
| Ops and release | #253 (test outlook off both boxes by 30 Nov), #317 (v2.0.0 press assets), #355 (theme leftovers) |
