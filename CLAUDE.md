# Uintah Basin Air Quality Website — Claude Context

Live air-quality observations and forecasts for the Uintah Basin. Node/Express +
Leaflet/Plotly, vanilla JS frontend.

## Topology
| Role | Branch | Domain | pm2 app | Repo path | User |
|---|---|---|---|---|---|
| Production | `ops` | `www.basinwx.com` | `ubair-site` | `/var/www/ubair-website` | `root` |
| Rehearsal mirror | `dev` | `www.basinwx.dev` | `basinwx-dev` (port 3001) | `/srv/ubair-website` | `deploy` |

`docs/DEPLOYMENT.md` §1a records what is actually deployed on each box (verified by direct
inspection 2026-08-13); §1b is a *target* layout that dev already matches but production does
not. Don't assume a fact from one box holds on the other — they differ in app name, port, path
and user. Bringing prod in line with dev is issue #253, item 4.

**Ingest is the same on both boxes: public HTTPS from notchpeak1**, through nginx, into the
app. Prod's upload log shows `::ffff:127.0.0.1` only because its proxy does not pass
`X-Forwarded-For`; dev's nginx does, so dev logs `155.101.26.78`. There is no SSH tunnel, and
notchpeak1 holds no SSH keys for either box (the docs claimed a tunnel until 2026-09-23). If
uploads stop, the public path — DNS, cert, nginx body limit, the app — is the whole path.
Producers should target `www.`: the bare `basinwx.com` also resolves to a Namecheap forwarding
host that does not serve HTTPS (`docs/DEPLOYMENT.md` §8).

`.dev` receives the same CHPC fan-out as `.com` and is where stakeholder demos happen —
merging into `dev` is a real-world dry-run before promoting to `ops`.

**The app serves `public/` off the working tree**, so `git checkout` changes what live traffic
sees immediately, before any pm2 restart. Never check out a branch in a live repo to inspect or
stage it — use `git worktree add /tmp/staging <branch>`.

Feature-branch previews live at `<name>.basinwx.dev` (Namecheap wildcard A record),
managed via `scripts/manage-previews.sh` + `preview-apps.json`. Background jobs are
gated on `PREVIEW_MODE=true` so previews don't double-burn upstream quotas.

A third dev laptop/VM may also run this repo: **not operational, never the source of truth.**

Bring-up runbook, nginx template, cert renewal, and chronic gotchas (Linode firewall
default-Drop, certbot `--manual` trap, `.dev` TLD SNI filtering, pm2 systemd unit) are
in `docs/DEPLOYMENT.md`. Read it before any provisioning work.

## Checking and deploying the boxes
- **Start with `scripts/probe.py`** (python3 only, runs from anywhere). Per box: DNS, cert
  days left, served version vs newest tag, commit and start time, whether `npm install` ran,
  per-dataType freshness, and with `DATA_UPLOAD_API_KEY` in the environment the last upload
  attempts. Its first run found prod a release behind.
- `GET /api/health` → `version`, `manifestVersion` and, since 1.5.5, `commit`, `branch`,
  `startedAt`, `vendorAssets`. `GET /api/monitoring/uploads` with the key in `x-api-key` → the
  last 200 attempts the app saw, rejected ones included, with source IP and `x-client-hostname`.
  `GET /api/monitoring/freshness` → age of the newest file per dataType.
- **Claude cannot reach either box.** notchpeak1 has no SSH keys; deploys are JRL's, from
  elsewhere. Verify from outside and hand over the one-liner.
- **`npm install` is part of every deploy.** `package-lock.json` is gitignored and the roads
  page serves Leaflet, markercluster and Font Awesome out of `node_modules`; a pull without it
  404s those routes and `/api/health` reports `vendorAssets.ok: false`.
  Prod, as root: `cd /var/www/ubair-website && git pull --ff-only origin ops && npm install && pm2 restart ubair-site`.
  Dev, as deploy: `cd /srv/ubair-website && git pull --ff-only origin dev && npm install && pm2 restart basinwx-dev`.
  Then re-run `probe.py`: `release matches newest tag` on prod, the new commit on dev.

## Data pipeline
CHPC `brc-tools` (Synoptic + HRRR/herbie via polars/pandas) → POST `/api/upload/:dataType`
with `x-api-key` + CHPC-hostname validation → fanned out to every URL in
`BASINWX_API_URLS` (first = primary, rest = best-effort mirrors) → served at
`/api/static/*` and `/api/filelist/:dataType`.

Accepted dataTypes (`server/routes/dataUpload.js`):
`observations | metadata | outlooks | llm_outlooks | images | forecasts | road-forecast`.

Forecast schemas are pinned in `DATA_MANIFEST.json` (canonical contract; brc-tools is
the contract-holder for new dataTypes — server doesn't enforce schema). Producers call
`GET /api/health` before every upload to compatibility-check `manifestVersion`.

**Observations arrive as raw SI and stay that way.** `air_temp`/`dew_point_temperature` are
Celsius, `wind_speed` is m/s, pressures are Pascals. `processObservationData` in
`public/js/api.js` deliberately does **not** convert (the `convertUnits` call is commented out
on purpose) — every page converts at its own display layer, reading `observations._units`.
No shared conversion helper exists — `mapUtils.js` converts inline inside `createPopupContent`
rather than exporting anything reusable — and eight files carry their own copy. A page that
misses this silently prints Celsius labelled °F, which is how the sports page came to report a
19 °F wind chill on a 77 °F day.

Watch the gap between contract and reality: `DATA_MANIFEST.json` declares `relative_humidity`,
but **no current production observation file contains it**. That is a producer-side gap, not a
contract that never had the field — derive RH from temperature and dew point meanwhile, and
check the actual payload rather than the manifest before relying on any variable.

## Protected branches
**Never push directly to `dev`, `ops`, or `main`.** All changes go through PRs. If a
direct push seems warranted, confirm with the user — then ask a **second time** before
proceeding. Applies to merges, reverts, version bumps, every commit.

GitHub rulesets on all three branches require one approving review; self-approval is
impossible, so every merge is `gh pr merge <N> --admin`. Claude **may** run these, but only
with JRL confirming **each merge individually** before it happens — never as a batch, and
never inferred from earlier approval. Absent that, stage the PRs and hand over the one-liners.
Merge commits should carry both of us as `Co-Authored-By` trailers.

## Versioning & release train
`dev` always carries the next version as `X.Y.Z-dev`; `ops` ships clean `X.Y.Z` with a
lightweight `vX.Y.Z` tag on its tip, so the two boxes never report the same version.
Release order: strip-`-dev` PR into `dev` → promotion PR (head `dev`, base `ops`, merge
commit `Merge dev into ops: vX.Y.Z`) → tag `ops` → `Merge ops into main: vX.Y.Z release`
→ reopen `dev` at the next `-dev`. Rationale + ceremony: `docs/DEPLOYMENT.md` §7a.

**Stacking trap.** Release-train chore PRs land into `dev` as *squashes*, so their original
commits never become ancestors of `dev`; feature PRs land as merge commits. Either way, branch
from `dev`, never from another PR's head — a branch stacked on a squashed PR conflicts the
moment the one below it merges (this bit the v1.5.0 train twice). Rebase a stacked branch with
`git checkout -B <branch> origin/dev && git cherry-pick <sha>` + force-push. Check cleanliness
with the *exit code* of `git merge-tree --write-tree HEAD origin/dev` — grepping for conflict
markers gives false positives on docs that quote them. Several PRs open at once? Check them
pairwise the same way so they can merge in any order.

## Secrets
Loaded from `.env` (gitignored). Required: `DATA_UPLOAD_API_KEY`, `UDOT_API_KEY`,
`SYNOPTIC_API_TOKEN`. Never commit, never echo values to logs or chat. Share via
password manager.

## Doc naming (LLM-produced markdown)
- ALL-CAPS, **3–4 hyphen-separated words** (e.g. `DEPLOYMENT-RUNBOOK.md`,
  `WEBSITE-BRCTOOLS-HANDOFF.md`). Avoid sentences-as-filenames.
- Temporary/handoff docs: append `-mmmDD` before the extension (e.g.
  `WEBSITE-BRCTOOLS-HANDOFF-apr27.md`) so future agents can spot expiry.
- Markdown only. Python and other code files follow the language's convention
  (lowercase, snake_case where applicable).

## Reference docs (read on demand, not by default)
- `docs/AGENT-INDEX.md` — map of everything in `docs/`; start there before opening others
- `docs/DEPLOYMENT.md` — bring-up runbook + chronic gotchas
- Issue #253 (pinned) — ops follow-ups that need a box, an account or a decision
- Outstanding work is GitHub Issues (`student-ready`, `copilot-ok` labels) on the "BasinWx
  Winter 2026/27" Project; humans read the wiki, agents read `docs/`
- `DATA_MANIFEST.json` — forecast schemas
- `git log --oneline -30` — recent merges; do not duplicate here

## Testing
- `npm run dev` — nodemon server
- `npm test` — Jest. **The suite is green (230/230 as of 2026-09-28); any failure is new
  breakage.** Never tolerate a red suite — a tolerated one once let a vacuous test survive
  unnoticed.
- **First rule out staleness.** "Any failure is new breakage" holds only once the branch is
  current with `dev`. Run the same suite on `dev` and compare before blaming the change. PR #128
  failed 4 tests in `cameraAnalysisScheduler.test.js` that passed 26/26 on `dev`; merging
  `origin/dev` in cleared them.
- `npm run test-api` — loopback POST against the upload route
