# Uintah Basin Air Quality Website — Claude Context

Live air-quality observations and forecasts for the Uintah Basin. Node/Express +
Leaflet/Plotly, vanilla JS frontend.

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
- **The app serves `public/` off the working tree:** `git checkout` changes what live traffic
  sees at once, before any restart. Never check out a branch in a live repo; use
  `git worktree add /tmp/staging <branch>`.
- **Know where the session runs.** Working directory `/srv/ubair-website` as user `deploy` is
  **the dev box**: it can pull, restart dev and run previews when JRL asks, but has no sudo and
  no route to prod. From notchpeak1 (CHPC) neither box is reachable (no SSH keys): verify from
  outside and hand over the one-liner. Any other laptop or VM copy is never the source of truth.
- **Ingest is public HTTPS from notchpeak1 on both boxes,** through nginx into the app; there
  is no SSH tunnel. If uploads stop, the public path (DNS, cert, nginx body limit, the app) is
  the whole path. Prod logs `::ffff:127.0.0.1` only because its nginx does not pass
  `X-Forwarded-For`. Producers target `www.`: bare `basinwx.com` also resolves to a Namecheap
  forwarder with no HTTPS.
- **Before provisioning anything, read `docs/DEPLOYMENT.md`:** bring-up, nginx template, cert
  renewal, and the gotchas (Linode firewall default-Drop, certbot `--manual` trap, `.dev` SNI
  filtering, pm2 systemd unit).

## Checking a box
Start with **`scripts/probe.py`** (python3 only, runs from anywhere): DNS, cert days left,
served version against the newest tag, commit and start time, whether `npm install` ran,
per-dataType freshness and, with `DATA_UPLOAD_API_KEY` set, the last upload attempts.

| Endpoint | What it tells you |
|---|---|
| `GET /api/health` | `version`, `manifestVersion`, `commit`, `branch`, `startedAt`, `vendorAssets`, `ingest.ready` (key loaded, upload dirs writable). Always 200, because producers gate uploads on it |
| `GET /api/health/ingest` | 503 when ingest is not ready or nothing was accepted for 30 min: the one for an uptime monitor |
| `GET /api/monitoring/uploads` | with `x-api-key`: the last 200 attempts, rejected ones included, with source IP and `x-client-hostname` |
| `GET /api/monitoring/freshness` | age of the newest file per dataType |
| `GET /api/analytics/visitors` | unique visitors per UTC day (#340). `clientAddress.unresolvedShare` near 1 means the vhost stopped passing `X-Forwarded-For` |

**Only pm2 may hold the app's port.** After any reboot check `ss -ltnp 'sport = :3000'` (3001
on dev) and `ingest.ready`. On 2026-10-26 a leftover systemd unit took prod's port first and
every upload 500ed for a day while `/api/health` stayed green (`docs/DEPLOYMENT.md` §8).
Since 1.5.5 a copy that cannot read `.env` exits before binding.

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

- Check for stray keys by name only; `pm2 jlist` and `pm2 env` print values:
  `pm2 jlist | python3 -c "import json,sys; [print(a['name'], [k for k in a['pm2_env'] if 'CLAUDE' in k]) for a in json.load(sys.stdin)]"`
- Do not `pm2 save` unless the reboot set is meant to change: it writes every running app,
  previews included, with the environment each holds. The saved set is `regs-alpha` +
  `basinwx-dev`, and the existing entry still starts the same app after a reboot.

## Branch previews (dev box)
One branch, its own worktree, a spare port, served at `<name>.basinwx.dev`.
- **`theme.basinwx.dev` → `127.0.0.1:3003` is provisioned and kept as a spare slot:** start any
  branch on port 3003 and it is live with no root work (502 while idle). The recipe, tested
  2026-11-12, is README "Branch previews".
- Any other name needs root: DNS is a wildcard but the certificate is not
  (`certbot certonly --nginx -d <name>.basinwx.dev`, then an nginx vhost).
- `PREVIEW_MODE=true` in the preview's `.env` gates background jobs so previews don't
  double-burn upstream quotas.
- Scrubbed-shell start and no `pm2 save`, as above. `scripts/manage-previews.sh` does a plain
  `pm2 start` and a `pm2 save`, so it is for a person's own shell, not a Claude Code session.

## Data pipeline
CHPC `brc-tools` (Synoptic + HRRR) → POST `/api/upload/:dataType` with `x-api-key` +
CHPC-hostname validation → fanned out to every URL in `BASINWX_API_URLS` (first = primary,
rest = best-effort mirrors) → served at `/api/static/*` and `/api/filelist/:dataType`.

- Accepted dataTypes (`server/routes/dataUpload.js`):
  `observations | metadata | outlooks | llm_outlooks | images | forecasts | road-forecast`.
- `DATA_MANIFEST.json` pins the forecast schemas and is the canonical contract. brc-tools holds
  it for new dataTypes; the server does not enforce it. Producers check `manifestVersion` at
  `GET /api/health` before every upload.
- **Observations arrive as raw SI and stay that way:** °C, m/s, Pa. `processObservationData`
  in `public/js/api.js` deliberately does not convert (its commented-out `convertUnits` call is
  on purpose); each page converts at its display layer, reading `observations._units`. There
  is no shared helper: eight files carry their own copy. A page that misses this prints
  Celsius labelled °F, which is how the sports page showed a 19 °F wind chill on a 77 °F day.
- **Check the payload, not the manifest, before relying on a variable.** The manifest declares
  `relative_humidity`, yet no production observation file contains it (a producer-side gap);
  derive RH from temperature and dew point meanwhile.

## Styling
Read `docs/STYLE-TOKEN-GUIDE.md` before touching CSS.
- **Raw colours, radii, shadows, gradients and fonts live only in
  `public/css/theme/tokens.css`.** Everything else uses `var(--…)` semantic tokens; a page
  restyles itself by setting knobs such as `--page-accent`, not by adding rules.
- `styleRatchet.test.js` holds a per-file ceiling of raw values that may fall but not rise
  (new stylesheets start at zero); lower it with `node scripts/style-scan.mjs --tighten`.
- The look since v1.6.0 is **Ink + Teal**: IBM Plex Sans from `public/fonts/` (no font CDN),
  flat surfaces, a greyed basemap (`--basemap-filter`), hover that changes colour and never
  moves. Since v1.6.2: hard edges, cards are `.pane` (square, hairline, short accent tab on the
  top edge), and the whole UI is scaled to 85% by `--root-font-size` (write lengths in `rem`). Dark mode is a draft in the tokens (`html[data-mode="dark"]`), not switched on.
- **A colour that carries meaning never rides on a page's decorative palette.** Status, AQI,
  confidence and fire-restriction colours have their own tokens (`--status-*`, `--epa-*`,
  `--confidence-*`, `--restriction-*`); borrowing `--fire-accent` once turned Stage 1 fire
  restrictions teal (#353).
- **Nothing unfinished on `dev`:** no "Coming Soon" overlays, badges or disabled links
  (`removedPages.test.js`); a page that is not ready lives on a branch. The pages removed in
  Nov 2026 are at tag `parked/pre-cleanup-2026-11-11` (branch `parked/unfinished-pages`).
- **One icon and one wordmark,** from `scripts/make_favicon.py` and `scripts/make_wordmark.py`
  (`docs/FAVICON-INSTALL-STEPS.md`). `localAssets.test.js` fails if a page links a `/public`
  file that does not exist.
- To compare candidate looks, run one preview with preview-only `html[data-theme]` blocks and
  a switcher; `styleRatchet.test.js` fails if the switcher reaches `dev`.
- Outstanding theme work is issue #355.

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
commit `Merge dev into ops: vX.Y.Z`) → tag `ops`, `gh release create vX.Y.Z` → deploy prod →
`Merge ops into main: vX.Y.Z release` → reopen `dev` at the next `-dev`
(`docs/DEPLOYMENT.md` §7a).

**Stacking trap.** Branch from `dev`, never from another PR's head. Release-train chore PRs
land as *squashes* (feature PRs as merge commits), so a branch stacked on one conflicts the
moment the PR below it merges. Rebase a stacked branch with
`git checkout -B <branch> origin/dev && git cherry-pick <sha>` and force-push. Check
cleanliness by the *exit code* of `git merge-tree --write-tree HEAD origin/dev`, not by
grepping for conflict markers (docs quote them), and pairwise when several PRs are open.

## Secrets
Loaded from `.env` (gitignored). Required: `DATA_UPLOAD_API_KEY`, `UDOT_API_KEY`,
`SYNOPTIC_API_TOKEN`. Never commit, never echo values to logs or chat. Share via password
manager.

## Doc naming (LLM-produced markdown)
ALL-CAPS, 3–4 hyphen-separated words (`DEPLOYMENT-RUNBOOK.md`), never a sentence. Temporary or
handoff docs append `-mmmDD` (`WEBSITE-BRCTOOLS-HANDOFF-apr27.md`) so their expiry is visible.
Markdown only; code files follow their language's convention.

## Reference (read on demand)
- `docs/AGENT-INDEX.md` — map of everything in `docs/`; start there
- `docs/DEPLOYMENT.md` — bring-up runbook and chronic gotchas
- `DATA_MANIFEST.json` — forecast schemas
- Issue #253 (pinned) — ops follow-ups that need a box, an account or a decision
- Outstanding work is GitHub Issues on two milestones (`v1.6.0 Beta relaunch`, `v2.0.0 Ozone
  season open`); ideas without a milestone go in Discussions #342, not new issues. Humans read
  the one-page wiki, agents read `docs/`
- `git log --oneline -30` — recent merges; do not duplicate them here

## Testing
- `npm test` — Jest. **The suite is green (427/427 across 33 suites as of 2026-11-12); any
  failure is new breakage.** Never tolerate a red suite.
- **First rule out staleness:** that rule holds only once the branch is current with `dev`.
  Run the same suite on `dev` and compare before blaming the change (PR #128 failed 4 tests
  that merging `origin/dev` cleared).
- `npm run dev` — nodemon server. `npm run test-api` — loopback POST against the upload route.
