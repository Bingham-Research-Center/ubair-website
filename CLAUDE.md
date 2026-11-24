# Uintah Basin Air Quality Website — Claude Context

Live air-quality observations and forecasts for the Uintah Basin. Node/Express +
Leaflet/Plotly, vanilla JS frontend.

## Start here
This file holds the rules that last. **Where things stand** (versions, open PRs, parked work,
the test count, what to do next) is in the newest `docs/NEXT-SESSION-HANDOFF-*.md`. Read it
before acting, and check it against `scripts/probe.py` and `gh pr list`.

| Where the session runs | What it can do | Read first |
|---|---|---|
| **Dev box**: `/srv/ubair-website` as `deploy` | worktrees, PRs, deploy `.dev`, previews; no sudo, no route to prod | the newest `docs/NEXT-SESSION-HANDOFF-*.md` |
| **CHPC** (notchpeak1, `brc-tools`) | build and upload producer files; no shell on either box: verify from outside (`probe.py`) and hand over the one-liner | `docs/CHPC-INGEST-HANDOFF-nov21.md` (asks P25–P28), then `docs/NWP-PRODUCER-HANDOFF-nov20.md` (P1–P24) |
| Prod box (root) | JRL only: prod deploys | "Deploying" below |
| Any laptop or VM copy | read and draft; never the source of truth | this file |

## The two boxes
| Role | Branch | Domain | pm2 app | Repo path | User |
|---|---|---|---|---|---|
| Production | `ops` | `www.basinwx.com` | `ubair-site` (port 3000) | `/var/www/ubair-website` | `root` |
| Rehearsal mirror | `dev` | `www.basinwx.dev` | `basinwx-dev` (port 3001) | `/srv/ubair-website` | `deploy` |

- **A fact about one box is not a fact about the other:** app name, port, path and user all
  differ. `docs/DEPLOYMENT.md` §1a is what is deployed; §1b is a target only dev matches.
- **`.dev` is not a toy.** It takes the same CHPC fan-out as `.com` and hosts stakeholder
  demos, so merging into `dev` is a real dry-run before promoting to `ops`.
- **The app serves `public/` and `views/` off the working tree, but loads routes at start.**
  A `git checkout` or `git pull` in a live repo changes what traffic sees at once, and a new
  route 404s until the restart. Never check out a branch there (use `git worktree add`), and
  pull only as a whole deploy. To read `dev`, use `git show origin/dev:<path>`.
- **Ingest is public HTTPS from notchpeak1 to `www.` on both boxes** (no SSH tunnel): if
  uploads stop, DNS, cert, nginx body limit and the app are the whole path. nginx passes
  `X-Forwarded-For`, so upload logs show notchpeak1.
- **Before provisioning anything, read `docs/DEPLOYMENT.md`** (firewall default-Drop, certbot
  `--manual` trap, `.dev` SNI filtering, pm2 systemd unit).

## Checking a box
Start with **`scripts/probe.py [host]`** (python3 only, runs anywhere; both boxes by default):
DNS, cert days left, served version against the newest tag, commit and start time, whether
`npm install` ran, freshness per dataType and product and, with `DATA_UPLOAD_API_KEY` set, the
last upload attempts and the refused ones.

| Endpoint | What it tells you |
|---|---|
| `GET /api/health` | `version`, `manifestVersion`, `commit`, `branch`, `startedAt`, `vendorAssets`, `ingest.ready` (key loaded, upload dirs writable). Always 200: brc-tools requests it before every upload and skips the host only if the request itself fails |
| `GET /api/health/ingest` | 503 when ingest is not ready or nothing was accepted for 30 min: the one for an uptime monitor |
| `GET /api/monitoring/uploads` | with `x-api-key`: the last 2,000 attempts (about two days) with source IP and `x-client-hostname`, the refused ones also in `rejected`; kept across restarts, so compare `ts` with `startedAt` |
| `GET /api/monitoring/freshness` | age of the newest file per dataType and, in `forecasts`, per product, on the schedule the manifest declares. `unscheduled` (ad-hoc), `dormant` (Clyfar out of season) and `no_data` are not "late"; `undeclared` names files the manifest does not list |
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
- Never pipe a deploy step: the pipe masks its exit code (a failed pull once passed as a deploy).

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
The recipe is README "Branch previews". **`theme.basinwx.dev` → `127.0.0.1:3003` is the spare
slot** (certificate and vhost in place, 502 while idle): start any branch there with no root
work, and tear it down when its PR merges. Ports: 3000 prod, 3001 dev, 3002 a second preview
reachable only from the box, 3003 the slot. Any other name needs root: DNS is a wildcard, the
certificate is not (`certbot certonly --nginx -d <name>.basinwx.dev`, then a vhost:
`docs/howto/preview-a-branch.md`). `PREVIEW_MODE=true` in a preview's `.env` keeps background jobs off (no
double-burned quotas); `scripts/manage-previews.sh` starts scrubbed and never saves.

## Data pipeline
CHPC `brc-tools` POSTs to `/api/upload/:dataType` with `x-api-key` from an allowed host
(`UPLOAD_ALLOWED_HOSTS`, CHPC by default), fanned out to every URL in `BASINWX_API_URLS` (first
primary, the rest best-effort mirrors); files are served at `/api/static/*`.

- Accepted dataTypes (`server/uploadPolicy.js`; any other name is a 400): `observations |
  metadata | outlooks | llm_outlooks | images | forecasts | road-forecast | llm_forecasts |
  aircraft`. Only `llm_forecasts` is checked against a contract at upload
  (`public/js/llmForecast.js`).
- `DATA_MANIFEST.json` pins the forecast schemas and is the canonical contract, but the server
  does not enforce it, and brc-tools logs only the status of its `/api/health` request, so a
  `manifestVersion` bump never blocks an upload.
- **Observations arrive as raw SI and stay that way:** °C, m/s, Pa. `processObservationData`
  in `public/js/api.js` deliberately does not convert (its commented-out `convertUnits` call is
  on purpose); each page converts at its display layer
  from the units the feed states, with `public/js/met.js` (pure converters that return null for
  a unit they do not know, plus RH from dew point). Only the roads unit switch
  (`roads/UnitsSystem.js`) still has its own, and `met.test.js` fails if another script grows
  one. A page that misses this prints Celsius labelled °F: the sports page once showed a 19 °F
  wind chill on a 77 °F day.
- **Observations are keyed by station ID, never by display name.** Name-keyed merging once
  showed a 14-hour-old co-op temperature as Vernal's current reading and lent the DEQ monitor's
  ozone to the airport marker. `public/js/config.js` names and places the stations the AQ maps
  show (homepage set, co-located `companions`, monitors `notReportingSince`); a reading older
  than 3 h is not shown, except co-op snow depth (30 h), as `mapShared.js` sets.
- **The maps read only the newest `map_obs_*` file.** A second observations producer must merge
  into CHPC's file or agree its own prefix first, or the two take turns on the map (ask P24).
- **Neither Synoptic token sees outside Utah**, and no page uses the site's own: everything
  shown comes from CHPC's files. CHPC already requests Rangely `K4V0` and the Colorado Dinosaur
  stations `DNOC2` and `SURC2`; `config.js` names them and they appear by themselves once the
  feed carries them. Wyoming is not requested. Keyless sources for the edges are in the
  handoff; none is wired, by JRL's choice.
- **Check the payload, not the manifest, before relying on a variable.** The manifest declares
  `relative_humidity`, yet no observation file has it: derive it with `met.js`. Checked against
  the files after brc-tools #76–#78 (21 Nov 2026; `docs/CHPC-INGEST-HANDOFF-nov21.md` §1):
  - `visibility` is **in statute miles**, the one variable not in SI. A `wind_gust` row can be
    hours older than the station's other rows (sent only while gusting): read its `date_time`.
  - HRRR `wind_u/v` and the waypoint directions are relative to true north. Older runs are
    relative to the model grid, about 7.5° off, and no file says which.
  - Surface layers: `snowfall_1h_mm` is a running total of snow depth since the run began
    (`runningTotalForHour` in `public/js/hrrrFields.js` guards older runs); `rainfall_1h_mm`
    is hourly.
  - **Unconfirmed:** `road-forecast` `precip_1hr` should now be hourly, but no wet run has
    shown it. Until one does, use `precip_type` for "is it snowing" and show no amount. The
    KVEL crosswind rotation is unconfirmed too.
- **Derive in the browser only by a standard formula, from fields whose units the file
  states**, and say so on the page (`public/js/mapLayers.js`: wind chill, totals, extremes).
  Anything that needs a field we are not sent belongs at CHPC. JRL asks what a feature costs
  the box before agreeing to it: measure, and put the numbers in the feature page.
- **Two HRRR point files overlap and are not blended:** waypoints (14 towns, 18 h, lands 2.9 h
  after the run) feed the town views; `road-forecast` (17 points, 12 h, lands 1.4 h after)
  feeds `/roads`, the snow line and the homepage tiles. Nine towns are in both, with different
  stations and heights (one merged product is ask P13).
- **Never invent data.** A failed or missing fetch shows nothing, or says it is unavailable; it
  never falls back to a plausible value. That includes "none": an alerts fetch that failed is
  `unavailable`, not an empty list (`server/nwsAlerts.js`). The homepage once said "No
  significant snow expected" for months from a file never uploaded (`homepage.test.js` guards
  it now).

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
  draft in the tokens (`html[data-mode="dark"]`), not switched on (#355).
- **A colour that carries meaning never rides on a page's decorative palette.** Status, AQI,
  confidence and fire-restriction colours have their own tokens (`--status-*`, `--epa-*`,
  `--confidence-*`, `--restriction-*`); borrowing `--fire-accent` once turned Stage 1 fire
  restrictions teal (#353). Map and chart data have theirs too: `--scale-*` (one hue in five
  steps; temperature diverges about freezing) and `--precip-*`. A script that must draw in one
  reads the token through `public/js/themeColours.js`; no script holds a hex.
- **Nothing unfinished on `dev`:** no "Coming Soon" overlays, badges, disabled links or
  placeholder text (`removedPages.test.js`, `homepage.test.js`); a page that is not ready lives
  on a branch. Agriculture and water are parked at tag `parked/pre-cleanup-2026-11-11`.
- One icon and one wordmark (`docs/FAVICON-INSTALL-STEPS.md`); `localAssets.test.js` fails if a
  page links a missing `/public` file. Compare candidate looks on a preview with
  `html[data-theme]` blocks and a switcher, which `styleRatchet.test.js` keeps off `dev`.

## Protected branches
**Never push directly to `dev`, `ops`, or `main`.** All changes go through PRs. If a
direct push seems warranted, confirm with the user — then ask a **second time** before
proceeding. Applies to merges, reverts, version bumps, every commit.

GitHub rulesets on all three branches require one approving review; self-approval is
impossible, so every merge is `gh pr merge <N> --admin`. Claude **may** run these, but only
with JRL confirming **each merge individually** before it happens — never as a batch, and
never inferred from earlier approval. Absent that, stage the PRs and hand over the one-liners.
Merge commits carry both of us as `Co-Authored-By` trailers, and each admin merge gets a terse
PR comment saying what was verified (CI, `merge-tree`, tests). Run each merge as its own
command, and post the comment after it.

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
- `docs/AGENT-INDEX.md` — map of everything in `docs/`
- `docs/DEPLOYMENT.md` — bring-up runbook and chronic gotchas
- `DATA_MANIFEST.json` — forecast schemas
- Issue #253 (pinned) — ops follow-ups that need a box, an account or a decision
- Outstanding work: GitHub Issues on the open release milestone; unmilestoned ideas go in
  Discussions #342, not new issues
- `git log --oneline -30` — recent merges; do not duplicate them here

## Testing
- `npm test` — Jest. **The suite on `dev` is green; any failure is new breakage.** Never
  tolerate a red suite. First rule out staleness: run the same suite on `dev` before blaming a
  change.
- **On the dev box** (2 GB, one CPU): one heavy job at a time, Jest with `--runInBand`. In a
  worktree, borrow the live packages without creating anything:
  `NODE_OPTIONS=--experimental-vm-modules node /srv/ubair-website/node_modules/jest/bin/jest.js --modulePaths=/srv/ubair-website/node_modules --runInBand`.
  Only `iconNames.test.js` then fails; it needs a temporary `node_modules` symlink, removed
  after (never `git add -A` with it present).
- `npm run dev` — nodemon server. `npm run test-api` — loopback POST against the upload route.
