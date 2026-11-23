# Next Session Handoff — Nov 23

Where things stand at the end of 23 Nov 2026, and what comes next, for John and for an agent
starting cold. Rules that last are in `CLAUDE.md`; this file goes stale and is replaced by the
next `*-HANDOFF-*.md`. Check every line against `scripts/probe.py` and `gh` before acting.

## 1. Where things stand

| | Version | Commit | Notes |
|---|---|---|---|
| `dev` → www.basinwx.dev | **1.8.1-dev** | `14897f0` (#436) | Deployed and probed 23 Nov 23:15Z |
| `ops` | **v1.8.0** | `872c493` = tag `v1.8.0` | Promotion #434; GitHub release published |
| www.basinwx.com | 1.7.0 when this was written | `5a845d5` | **Deploy pending** (root, §3). `probe.py` says so until it is done |
| `main` | v1.7.0 | | Follows `ops` after the prod deploy: #435 is staged |

- **v1.8.0 went out without the LLM forecast text.** On 23 Nov John lifted the hold he set on
  20 Nov: no `llm_forecasts` file has ever been uploaded, the renderer draws nothing and asks
  for nothing that fails until one is, and prod was still serving three faults `dev` had fixed
  (stations merged by name on both AQ maps, an upload `dataType` that could leave the upload
  directory, snowfall totals labelled in/hr).
- **Open PRs:** #435 (`ops` into `main`: only after the prod deploy, on John's OK); #437 (the
  Colorado stations, §4: John's OK); #401, Quinten's draft (16 files, conflicts, 311 commits
  behind `dev`: rebase onto `rebased/quinten-changes`, never his branch).
- **On the dev box:** no extra worktree and no preview running; `theme.basinwx.dev` (:3003) is
  free. Local-only branches kept on purpose: `preview/theme` (the look switcher, #355) and
  `rebased/feature/braxton-sports` (Quinten's early sports work).
- **Remote branches whose PRs are merged**, safe to delete once someone says so:
  `rebased/roads-{a-fallback,b-layout,c-corridor,d-alerts}`, Michael's
  `codex/roads-{b,c,d}-review-fixes` (his to delete), `chore/prune-static-uploads`,
  `docs/chpc-ingest-handoff-nov21`, `docs/chpc-reply-nov21`, `docs/producer-status-nov21`,
  `feat/manifest-2.5.0`, `fix/ingest-upload-index`. Quinten's (`pr/128`, `quinten-changes`) stay.

## 2. What happened on 23 Nov

- **Release 1.8.0.** #432 (dead files, closes #307), strip #433, promotion #434, tag and
  release, reopen #436, each merged on John's own OK. Before the strip: 1,227 tests green on
  `dev`; every page on `.dev` loaded at 1366 px and 390 px with no console error and no failed
  request; `ops`'s merged tree was byte-identical to `dev`'s; prod already held the HRRR and
  road files the new pages read. The suite is 1,224 tests in 83 suites since #432 (a removed
  view was counted by four per-file tests).
- **The roads stack B to D had merged on 21 Nov** (#337 to #339, 1.7.10 to 1.7.12-dev), after
  the last handoff was written. It shipped in 1.8.0, not 1.9.0.
- **#311 is not done.** Adding `test` as a required check through the API failed: the ruleset
  comes back from GitHub with a second, empty `copilot_code_review` rule that the API will not
  take back (422), and the session was not allowed to send the list without it. The ruleset is
  unchanged. It is a two-minute job in the UI (§3).
- **The Colorado stations are wired** (#437, §4).

## 3. Next steps

**John**
1. **Deploy prod**, as root:
   `cd /var/www/ubair-website && git pull --ff-only origin ops && npm install && pm2 restart ubair-site`
   (fast-forwards to `872c493`; `npm install` adds `compression`). Then
   `ss -ltnp 'sport = :3000'` and `scripts/probe.py www.basinwx.com`: `release matches newest
   tag v1.8.0`. Then #435.
2. **#437**: merge, and say whether Rangely goes on the homepage map (it zooms that map out a
   level; `home: true` on `K4V0` in `public/js/config.js`).
3. **#311** in the UI: Settings → Rules → Rulesets → "Protecting dev" → add "Require status
   checks to pass" → check `test` (GitHub Actions), "require branches to be up to date" off.
   A retargeted PR fires no CI, so close and reopen it. Admins still bypass.
4. **The November test outlook goes by 30 Nov** (#253), on both boxes:
   `rm public/api/static/outlooks/outlook_20261112_0337.md` under `/srv/ubair-website` (an
   agent on the dev box may, once John says) and under `/var/www/ubair-website` (root). The
   list rebuilds within five minutes.
5. Decisions still his: the keep-window for Clyfar's files and whether to run the pruner
   (#168); dark mode (#355); the funders list for `/about` (#291); the Seth and Michael colour
   proposal on #337 (red for closed only), which reverses his 20 Nov rule; Derek's name on #317
   and #291.

**On the dev box**
1. After the prod deploy: probe, load every page on `.com` and list failed requests, check
   `/api/health/ingest` answers 200 within ten minutes, then merge #435 on John's OK.
2. **When a real LLM file lands:** check the homepage and weather placements on `.dev`.
3. Ready to pick up: #306 (`sports.js` keeps its own `toFahrenheit` and `toMph`; the roads
   `UnitsSystem.js` and `HRRRRoadForecast.js` can go now the stack has merged); #291 (a link
   and a line per provider on `/about`, the station networks by name); #419 (still true on
   23 Nov: a camera near Heber carries `temperatureOverride: true, temperature: 79` from a
   June reading; the page always says "Cached road data"; the "Basin summary" said "Snow"
   from Bald Mountain Pass on a dry day in the Basin); the #401 rebase.
4. Two pages are wider than a 390 px phone: `/forecast_outlooks` (434 px, on prod too) and
   `/roads` (394 px).
5. `GET /api/synoptic/timeseries` and `/api/synoptic/stations` are served, and no page calls
   them (`fetchTimeSeriesData` and `fetchAvailableStations` in `public/js/api.js` have no
   importer). They spend the site's Synoptic token for anyone who asks. Remove them or put
   them behind the key.
6. **v2.0.0 is 1 Dec** (#317): the same train as 1.8.0, each merge on John's OK.

**On CHPC** (brc-tools). Full text in [`NWP-PRODUCER-HANDOFF-nov20.md`](NWP-PRODUCER-HANDOFF-nov20.md)
and [`CHPC-INGEST-HANDOFF-nov21.md`](CHPC-INGEST-HANDOFF-nov21.md):
1. **P1, P2: the LLM forecast text.** Still the critical path. Prod accepts `llm_forecasts`
   and `aircraft` once it serves 1.8.0, so any wrapper pinned to `.dev` for them can be
   unpinned then.
2. P21 (Fruitland `QFL`), P22, P23, P11 to P20, P24 before a second observations producer.
3. **New, P29: the Wyoming edge.** `obs_map_stids` names no Wyoming station. If John wants
   that edge, add the stations (Rock Springs `KRKS` is the obvious first) once Synoptic allows
   them. `K33U` (Dutch John) is requested and never arrives: check whether it still reports.

## 4. The Colorado and Wyoming edges

Checked on 23 Nov, in the brc-tools code and the files:

- **CHPC already asks Synoptic for the Colorado stations.** `obs_map_stids` names `K4V0`
  (Rangely airport), `DNOC2` (the climate station at Dinosaur, Colorado) and `SURC2` (Dinosaur
  NM, Success). The feed carries none of them and no other Colorado station, so the CHPC token
  is refused Colorado just as the site's token is. That settles the question the last handoff
  left open.
- **All three report.** api.weather.gov had a reading from each within the hour.
- **No page uses the site's own token.** Every map and chart reads CHPC's files, so what
  matters is that the stations reach `map_obs_*`, whichever token Synoptic changes.
- **So when Synoptic says yes, nothing has to be done anywhere for Colorado** (#437): Live AQ
  draws the three by themselves, under the names in `config.js`; the Dinosaur town forecast
  changes from the Monument's quarry monitor (35 km away, 1,250 ft lower) to `DNOC2`, 0.4 km
  from its model point, in the first run `DNOC2` reports in. Rangely is off the homepage map
  until John says (§3).
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

22 open on `v2.0.0 Ozone season open` (#307 closed by #432):

| Kind | Issues |
|---|---|
| Waits on producer data | #406, #408, #409, #410, #411, #412, #413, #241 |
| Website work, ready to pick up | #306, #291, #311 (UI, John), #168 (choose a keep-window first) |
| Roads | #419, #303, #302, #301, #238, #144, #71 |
| Ops and release | #253 (test outlook off both boxes by 30 Nov), #317 (v2.0.0 press assets), #355 (theme leftovers) |
