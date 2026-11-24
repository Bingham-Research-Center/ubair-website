# Uintah Basin Air Quality Website — Claude Context

Live air-quality observations and forecasts for the Uintah Basin. Node/Express +
Leaflet/Plotly, vanilla JS frontend.

## Start here
This file holds the rules that last. **Where things stand** (versions, open PRs, parked work,
what to do next) is in the newest `docs/*-HANDOFF-*.md`; read it before acting.

| Where the session runs | What it can do | Read first |
|---|---|---|
| **Dev box**: `/srv/ubair-website` as `deploy` | worktrees, PRs, deploy `.dev`, previews; no sudo, no route to prod | `docs/NEXT-SESSION-HANDOFF-nov23.md` |
| **CHPC** (notchpeak1, `brc-tools`) | build and upload producer files; no shell on either box, so verify from outside (`probe.py`) and hand over the one-liner | `docs/CHPC-INGEST-HANDOFF-nov21.md` (what arrived on 21 Nov, measured; asks P25–P28), then `docs/NWP-PRODUCER-HANDOFF-nov20.md`: asks P1–P24 |
| Prod box (root) | JRL only: prod deploys | "Deploying" below |
| Any laptop or VM copy | read and draft; never the source of truth | this file |

## The two boxes
| Role | Branch | Domain | pm2 app | Repo path | User |
|---|---|---|---|---|---|
| Production | `ops` | `www.basinwx.com` | `ubair-site` (port 3000) | `/var/www/ubair-website` | `root` |
| Rehearsal mirror | `dev` | `www.basinwx.dev` | `basinwx-dev` (port 3001) | `/srv/ubair-website` | `deploy` |

- **A fact about one box is not a fact about the other:** app name, port, path and user all
  differ. `docs/DEPLOYMENT.md` §1a is what is deployed; §1b is a target only dev matches
  (issue #253, item 4).
- **`.dev` is not a toy.** It takes the same CHPC fan-out as `.com` and hosts stakeholder
  demos, so merging into `dev` is a real dry-run before promoting to `ops`.
- **The app serves `public/` and `views/` off the working tree, but loads routes at start.**
  A `git checkout` or `git pull` in a live repo changes what traffic sees at once, and a new
  route 404s until the restart. Never check out a branch there (use `git worktree add`), and
  pull only as a whole deploy (below). To read `dev`, use `git show origin/dev:<path>`.
- **Ingest is public HTTPS from notchpeak1 on both boxes** (no SSH tunnel): if uploads stop,
  DNS, cert, nginx body limit and the app are the whole path. Producers target `www.`. Both
  boxes' nginx pass `X-Forwarded-For` (prod since 2026-10-27), so upload logs show notchpeak1.
- **Before provisioning anything, read `docs/DEPLOYMENT.md`** (firewall default-Drop, certbot
  `--manual` trap, `.dev` SNI filtering, pm2 systemd unit).

## Checking a box
Start with **`scripts/probe.py`** (python3 only, runs from anywhere): DNS, cert days left,
served version against the newest tag, commit and start time, whether `npm install` ran,
freshness per dataType and per product and, with `DATA_UPLOAD_API_KEY` set, the last upload
attempts and the refused ones.

| Endpoint | What it tells you |
|---|---|
| `GET /api/health` | `version`, `manifestVersion`, `commit`, `branch`, `startedAt`, `vendorAssets`, `ingest.ready` (key loaded, upload dirs writable). Always 200: brc-tools requests it before every upload and skips the host only if the request itself fails |
| `GET /api/health/ingest` | 503 when ingest is not ready or nothing was accepted for 30 min: the one for an uptime monitor |
| `GET /api/monitoring/uploads` | with `x-api-key`: the last 2,000 attempts (about two days) with source IP and `x-client-hostname`, the refused ones also in `rejected`; kept across restarts, so compare `ts` with `startedAt` |
| `GET /api/monitoring/freshness` | age of the newest file per dataType and, in `forecasts`, per product, each on the schedule the manifest declares. `unscheduled` (ad-hoc), `dormant` (Clyfar out of season) and `no_data` are not "late"; `undeclared` names files the manifest does not list |
| `GET /api/latest/:dataType?prefix=map_obs_` | the newest file of one product, from the upload index (`server/uploadIndex.js`). Pages ask this, never the full `/api/filelist` |

**Only pm2 may hold the app's port.** After any reboot check `ss -ltnp 'sport = :3000'` (3001
on dev) and `ingest.ready`: on 2026-10-26 a leftover systemd unit took prod's port and every
upload 500ed for a day while `/api/health` stayed green (`docs/DEPLOYMENT.md` §8).

## Deploying
**`npm install` is part of every deploy:** `package-lock.json` is gitignored and the roads page
serves Leaflet, markercluster and Font Awesome from `node_modules`. Skip it and those routes
404 and `/api/health` reports `vendorAssets.ok: false`.

- Prod, as root:
  `cd /var/www/ubair-website && git pull --ff-only origin ops && npm install && pm2 restart ubair-site`
- Dev, as deploy: `cd /srv/ubair-website && git pull --ff-only origin dev && npm install`, then
  `pm2 restart basinwx-dev` from JRL's own shell, or the clean restart below from Claude Code.
- Then `probe.py`: `release matches newest tag` on prod, the new commit on dev.

**Never plain `pm2 start` or `pm2 restart` from a Claude Code shell.** pm2 copies the calling
shell's environment, session token included, into the app and into `pm2 save`. Delete the app
and start it from a scrubbed shell (about a second of downtime):

```bash
pm2 delete basinwx-dev && env -i HOME=/home/deploy USER=deploy LOGNAME=deploy SHELL=/bin/bash LANG=C.UTF-8 PATH=/usr/local/bin:/usr/bin:/bin bash -c 'cd /srv/ubair-website && pm2 start ecosystem.config.cjs'
```

- Check for stray keys by name only (`pm2 jlist` and `pm2 env` print values):
  `pm2 jlist | python3 -c "import json,sys; [print(a['name'], [k for k in a['pm2_env'] if 'CLAUDE' in k]) for a in json.load(sys.stdin)]"`
- No `pm2 save` unless the reboot set should change: it writes every running app, previews
  included, with its environment. The saved set is `regs-alpha` + `basinwx-dev`.

## Branch previews (dev box)
One branch, its own worktree, a spare port, served at `<name>.basinwx.dev`.
- **`theme.basinwx.dev` → `127.0.0.1:3003` is provisioned and kept as a spare slot:** start any
  branch on port 3003 and it is live with no root work (502 while idle). The recipe is README
  "Branch previews"; tear it down when the PR merges so the slot is free again.
- Ports: 3000 prod, 3001 dev, 3002 for a second preview (no vhost: reach it from the box),
  3003 the spare slot.
- Any other name needs root: DNS is a wildcard but the certificate is not
  (`certbot certonly --nginx -d <name>.basinwx.dev`, then an nginx vhost).
- `PREVIEW_MODE=true` in the preview's `.env` keeps background jobs off (no double-burned
  quotas). `scripts/manage-previews.sh` starts scrubbed, never saves; nginx step needs root.

## Data pipeline
CHPC `brc-tools` (Synoptic + HRRR) → POST `/api/upload/:dataType` with `x-api-key` +
a hostname allowlist (`UPLOAD_ALLOWED_HOSTS`, CHPC by default) → fanned out to every URL in `BASINWX_API_URLS` (first = primary,
rest = best-effort mirrors) → served at `/api/static/*` and `/api/filelist/:dataType`.

- Accepted dataTypes (`server/uploadPolicy.js`; any other name is a 400):
  `observations | metadata | outlooks | llm_outlooks | images | forecasts | road-forecast |
  llm_forecasts | aircraft`. `llm_forecasts` (tiered LLM text) is the one dataType the server
  checks against its contract at upload (`public/js/llmForecast.js`).
- `DATA_MANIFEST.json` pins the forecast schemas and is the canonical contract. brc-tools holds
  it for new dataTypes; the server does not enforce it. Nothing at CHPC compares `manifestVersion`: brc-tools
  (`push_data.py`) requests `/api/health` before each upload and logs only the status code, so a
  manifest bump never blocks an upload (checked in the code, 21 Nov).
- **Observations arrive as raw SI and stay that way:** °C, m/s, Pa. `processObservationData`
  in `public/js/api.js` deliberately does not convert (its commented-out `convertUnits` call is
  on purpose); each page converts at its display layer from the units the feed states. New code
  uses `public/js/met.js` (pure converters that return null for a unit they do not know, plus RH
  from dew point); only the roads unit switch (`roads/UnitsSystem.js`) still has its own, and
  `met.test.js` fails if another script grows one. A page that misses this prints
  Celsius labelled °F, which is how the sports page showed a 19 °F wind chill on a 77 °F day.
- **Observations are keyed by station ID, never by display name.** Name-keyed merging once
  showed a 14-hour-old co-op temperature as Vernal's current reading and lent the DEQ monitor's
  ozone to the airport marker. `public/js/config.js` names and places the stations the AQ maps
  show by hand (homepage set, co-located `companions`, monitors `notReportingSince`); a reading
  older than 3 h is not shown, except co-op snow depth (30 h), as `mapShared.js` sets.
- **The maps read only the newest `map_obs_*` file.** A second observations producer (such as
  a server sending the UB-AIR monitors from storage) must merge into CHPC's file or agree its
  own prefix first, or the two take turns on the map (producer ask P24).
- **Neither Synoptic token sees outside Utah.** The site's is refused Colorado and Wyoming, and
  CHPC's request already names Rangely `K4V0` and the Colorado Dinosaur stations `DNOC2` and
  `SURC2` and gets none of them. No page uses the site's token: everything shown comes from
  CHPC's files. The three are named in `config.js` and appear by themselves once the feed
  carries them (1.8.1-dev); Wyoming is not in CHPC's request. Keyless sources for the edges
  are listed in the handoff; none is wired, by JRL's choice.
- **Check the payload, not the manifest, before relying on a variable.** The manifest declares
  `relative_humidity`, yet no production observation file contains it (a producer-side gap);
  derive it with `met.js` meanwhile. brc-tools #76–#78 took effect at 04:46Z on 21 Nov 2026,
  and what follows was checked against the files (`docs/CHPC-INGEST-HANDOFF-nov21.md` §1):
  - 38 stations send `wind_gust` and 28 send `visibility`, **in statute miles**, the one
    variable not in SI. A gust row can be hours older than the station's other rows (a gust
    is reported only while gusting): read the row's own `date_time`.
  - HRRR `wind_u/v` and the waypoint directions are relative to true north. Runs made before
    then are relative to the model grid, about 7.5° off, and no file says which it is.
  - In the surface layers, `snowfall_1h_mm` is a running total of snow depth since the run
    began, no longer zeroed in some hours (`runningTotalForHour` in `public/js/hrrrFields.js`
    still guards the older runs); `rainfall_1h_mm` is truly hourly.
  - **Not confirmed yet:** in `road-forecast`, `precip_1hr` was a running total since the run
    began, and #77 makes it hourly, but every run since has been dry. Until a wet run shows a
    series that falls as well as rises, use `precip_type` for "is it snowing" and show no
    amount. The KVEL crosswind rotation is unconfirmed too (calm).
- **Derive in the browser only by a standard formula, from fields whose units the file
  states**, and say so on the page (`public/js/mapLayers.js`: wind chill, totals, extremes).
  Anything that needs a field we are not sent belongs at CHPC. JRL asks what a feature costs
  the box before agreeing to it: measure, and put the numbers in the feature page.
- **Two HRRR point files overlap and are not blended:** waypoints (14 towns, 18 h, lands 2.9 h
  after the run) feed the town views; `road-forecast` (17 points, 12 h, lands 1.4 h after)
  feeds `/roads`, the snow line and the homepage tiles. Nine towns are in both, with different
  stations and heights. One merged product is producer ask P13.
- **Never invent data.** A failed or missing fetch shows nothing, or says it is unavailable; it
  never falls back to a plausible value. That includes "none": an alerts fetch that failed is
  `unavailable`, not an empty list (`server/nwsAlerts.js`; the fire page read an NWS outage as
  "no Red Flag Warning" until 1.7.4). The homepage said "No significant snow expected" for
  months from a file that had never been uploaded (`homepage.test.js` now guards it).

## Homepage status lights
Five tiles (Weather now, a forecast tile named for the part of the day it covers, Ozone, Roads
now, Precip next 6 h): `docs/features/HOMEPAGE-STATUS-LIGHTS.md`.
- **The server decides, the browser draws.** Every rule is a pure function with a named
  threshold in `server/statusLights.js`; `GET /api/status-lights` gathers the inputs one by one
  so a broken source greys one tile; `public/js/homepage-lights.js` holds no thresholds.
- **Grey means "not known".** A failed, missing or stale source is grey, never green.
- **The roads page and the roads light share `server/roadConditionRules.js`**, so they cannot
  disagree. Snow covering a major Basin route (US-40, US-191, SR-87) is red on both, and a UDOT
  report of a closure, ice or snow cover is not averaged down by the forecast blend.
- **The forecast tile is titled by the clock** ("Tonight", "Tomorrow morning": JRL dislikes
  "next 12 h"). Fog is left out on purpose: the model's visibility cries wolf.
- The thresholds (in the feature page) are JRL's, 20 Nov 2026. Change one only with him, in the
  constant and its test.

## Styling
Read `docs/STYLE-TOKEN-GUIDE.md` before touching CSS.
- **Raw colours, radii, shadows, gradients and fonts live only in
  `public/css/theme/tokens.css`.** Everything else uses `var(--…)` semantic tokens; a page
  restyles itself by setting knobs such as `--page-accent`, not by adding rules.
- `styleRatchet.test.js` holds a per-file ceiling of raw values that may fall but not rise
  (new stylesheets start at zero); lower it with `node scripts/style-scan.mjs --tighten`.
- The look is **Ink + Teal**: IBM Plex Sans from `public/fonts/` (no font CDN), flat square
  surfaces (radius tokens 0), cards as `.pane`, a greyed basemap (`--basemap-filter`), hover
  that changes colour and never moves. The UI is scaled to 85% by `--root-font-size`: write
  lengths in `rem`, never CSS `zoom` (it breaks Leaflet and Plotly pointers). Dark mode is a
  draft in the tokens (`html[data-mode="dark"]`), not switched on.
- **A colour that carries meaning never rides on a page's decorative palette.** Status, AQI,
  confidence and fire-restriction colours have their own tokens (`--status-*`, `--epa-*`,
  `--confidence-*`, `--restriction-*`); borrowing `--fire-accent` once turned Stage 1 fire
  restrictions teal (#353). Map and chart data have theirs too: `--scale-*` (one hue in five
  steps; temperature diverges about freezing) and `--precip-*`. A script that must draw in one
  reads the token through `public/js/themeColours.js`; no script holds a hex.
- **Nothing unfinished on `dev`:** no "Coming Soon" overlays, badges, disabled links or
  placeholder text (`removedPages.test.js`, `homepage.test.js`); a page that is not ready lives
  on a branch. Agriculture and water are parked at tag `parked/pre-cleanup-2026-11-11`
  (aviation came back in 1.6.1 as KVEL runway winds).
- One icon and one wordmark (`docs/FAVICON-INSTALL-STEPS.md`); `localAssets.test.js` fails if a
  page links a missing `/public` file. Compare candidate looks on a preview with
  `html[data-theme]` blocks and a switcher, which `styleRatchet.test.js` keeps off `dev`.
  Outstanding theme work: #355.

## Protected branches
**Never push directly to `dev`, `ops`, or `main`.** All changes go through PRs. If a
direct push seems warranted, confirm with the user — then ask a **second time** before
proceeding. Applies to merges, reverts, version bumps, every commit.

GitHub rulesets on all three branches require one approving review; self-approval is
impossible, so every merge is `gh pr merge <N> --admin`. Claude **may** run these, but only
with JRL confirming **each merge individually** before it happens — never as a batch, and
never inferred from earlier approval. Absent that, stage the PRs and hand over the one-liners.
Merge commits carry both of us as `Co-Authored-By` trailers, and each admin merge gets a terse
PR comment saying what was verified (CI, `merge-tree`, tests).

## Versioning & release train
`dev` always carries the next version as `X.Y.Z-dev`; `ops` ships clean `X.Y.Z` with a
lightweight `vX.Y.Z` tag on its tip, so the two boxes never report the same version.
Release order: strip-`-dev` PR into `dev` → promotion PR (head `dev`, base `ops`, merge
commit `Merge dev into ops: vX.Y.Z`) → tag `ops`, `gh release create vX.Y.Z` → deploy prod →
`Merge ops into main: vX.Y.Z release` → reopen `dev` at the next `-dev`
(`docs/DEPLOYMENT.md` §7a). Prod deploys need root, so `ops` can run ahead of what prod serves:
`probe.py` says `deploy pending`, and the `main` merge waits for the deploy.

**Stacking trap.** Branch from `dev`, never from another PR's head: release chores land as
*squashes* (features as merge commits), so a stacked branch conflicts once the PR below merges.
Rebase with `git checkout -B <branch> origin/dev && git cherry-pick <sha>` and force-push.
Check cleanliness by the *exit code* of `git merge-tree --write-tree HEAD origin/dev` (docs quote
conflict markers, so never grep for them), pairwise when several PRs are open.

## Secrets
Loaded from `.env` (gitignored). Required: `DATA_UPLOAD_API_KEY`, `UDOT_API_KEY`. The app no
longer reads `SYNOPTIC_API_TOKEN` (its unused proxy routes went in 1.8.1); CHPC's token is the one
that feeds the site. Never commit, never echo values to logs or chat. Share via password manager.

## Doc naming (LLM-produced markdown)
ALL-CAPS, 3–4 hyphen-separated words (`DEPLOYMENT-RUNBOOK.md`), never a sentence. Temporary or
handoff docs append `-mmmDD` (`WEBSITE-BRCTOOLS-HANDOFF-apr27.md`) so their expiry is visible.
Markdown only; code files follow their language's convention.

## Reference (read on demand)
- The newest `docs/*-HANDOFF-*.md` — state of play and next steps (see "Start here")
- `docs/AGENT-INDEX.md` — map of everything in `docs/`
- `docs/DEPLOYMENT.md` — bring-up runbook and chronic gotchas
- `DATA_MANIFEST.json` — forecast schemas
- Issue #253 (pinned) — ops follow-ups that need a box, an account or a decision
- Outstanding work: GitHub Issues on an open release milestone (now `v2.0.0 Ozone season open`);
  unmilestoned ideas go in Discussions #342, not new issues
- `git log --oneline -30` — recent merges; do not duplicate them here

## Testing
- `npm test` — Jest. **The suite is green (1,234 tests across 83 suites at 1.8.1-dev,
  2026-11-24); any failure is new breakage.** Never tolerate a red suite.
- **First rule out staleness:** run the same suite on `dev` before blaming a change (PR #128
  failed 4 tests that merging `origin/dev` cleared).
- **On the dev box** (2 GB, one CPU): one heavy job at a time, Jest with `--runInBand`. In a
  worktree, borrow the live packages without creating anything:
  `NODE_OPTIONS=--experimental-vm-modules node /srv/ubair-website/node_modules/jest/bin/jest.js --modulePaths=/srv/ubair-website/node_modules --runInBand`.
  Only `iconNames.test.js` then fails; it needs a temporary `node_modules` symlink, removed
  after (never `git add -A` with it present).
- `npm run dev` — nodemon server. `npm run test-api` — loopback POST against the upload route.
