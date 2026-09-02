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
not. Don't assume a fact from one box holds on the other — they differ in app name, port,
path, user, and ingest path.

**Ingest reaches the two boxes differently.** Prod's uploads arrive on loopback over an SSH
tunnel (`::ffff:127.0.0.1`, `x-client-hostname: notchpeak1.int.chpc.utah.edu`); **dev's arrive
as ordinary public HTTPS** from notchpeak1 (`155.101.26.78`) through nginx → 3001. So on prod
a green public `/api/health` says nothing about ingest — if uploads stop, check the SSH path
first (`docs/DEPLOYMENT.md` §1a) — while on dev the public path *is* the ingest path: if
`.dev` is unreachable, ingest is down with it.

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

## Data pipeline
CHPC `brc-tools` (Synoptic + HRRR/herbie via polars/pandas) → POST `/api/upload/:dataType`
with `x-api-key` + CHPC-hostname validation → fanned out to every URL in
`BASINWX_API_URLS` (first = primary, rest = best-effort mirrors) → served at
`/api/static/*` and `/api/filelist/:dataType`.

Accepted dataTypes (`server/routes/dataUpload.js`):
`observations | metadata | outlooks | llm_outlooks | images | forecasts | road-forecast`.

Forecast schemas are pinned in `DATA_MANIFEST.json` (canonical contract; brc-tools is
the contract-holder for new dataTypes — server doesn't enforce schema).
`GET /api/health` reports `version` + `manifestVersion` so producers can
compatibility-check before uploading.

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

**Squash-merge trap.** Chore PRs land into `dev` as *squashes*, so their original commits never
become ancestors of `dev`. Any branch stacked on another chore branch will therefore conflict
the moment the one below it merges (this bit the v1.5.0 train twice). Branch from `dev`, never
from another PR's head; rebase a stacked branch with `git checkout -B <branch> origin/dev &&
git cherry-pick <sha>` + force-push. Check cleanliness with the *exit code* of
`git merge-tree --write-tree HEAD origin/dev` — grepping for conflict markers gives false
positives on docs that quote them.

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
- `docs/IMPROVEMENTS.md` — outstanding work (flagged stale by JRL; renew before reuse)
- `DATA_MANIFEST.json` — forecast schemas
- `git log --oneline -30` — recent merges; do not duplicate here

## Testing
- `npm run dev` — nodemon server
- `npm test` — Jest. **The suite is green (169/169 as of 2026-09-02); any failure is new
  breakage.** Never tolerate a red suite — a tolerated one once let a vacuous test survive
  unnoticed.
- `npm run test-api` — loopback POST against the upload route
