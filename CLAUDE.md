# Uintah Basin Air Quality Website — Claude Context

Live air-quality observations and forecasts for the Uintah Basin. Node/Express +
Leaflet/Plotly, vanilla JS frontend.

## Topology
| Role | Branch | Domain | pm2 app | Repo path | User |
|---|---|---|---|---|---|
| Production | `ops` | `www.basinwx.com` | `ubair-site` | `/var/www/ubair-website` | `root` |
| Rehearsal mirror | `dev` | `www.basinwx.dev` | *unverified* | *unverified* | *unverified* |

Production row verified on linode-prod 2026-08-13. **The dev box has not been inspected** —
verify before trusting it. `docs/DEPLOYMENT.md` §1b describes a *target* layout
(`/srv/ubair-website` as `deploy`, pm2 `basinwx-ops` from `ecosystem.config.cjs`) that
production has **not** been migrated to; §1a records what is actually deployed. Don't quote the
target as fact.

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
`observations | metadata | outlooks | llm_outlooks | images | timeseries | forecasts | road-forecast`.

Forecast schemas are pinned in `DATA_MANIFEST.json` (canonical contract; brc-tools is
the contract-holder for new dataTypes — server doesn't enforce schema).
`GET /api/health` reports `version` + `manifestVersion` so producers can
compatibility-check before uploading.

On linode-prod, uploads land from `::ffff:127.0.0.1` with `x-client-hostname:
notchpeak1.int.chpc.utah.edu` — CHPC reaches port 3000 over **SSH**, not by POSTing to the
public domain. So a green `/api/health` from outside proves nothing about ingest; the two paths
are independent. If uploads stop, check the SSH path first (`docs/DEPLOYMENT.md` §1a).

## Protected branches
**Never push directly to `dev`, `ops`, or `main`.** All changes go through PRs. If a
direct push seems warranted, confirm with the user — then ask a **second time** before
proceeding. Applies to merges, reverts, version bumps, every commit.

GitHub rulesets on all three branches require one approving review; self-approval is
impossible, so every merge is `gh pr merge <N> --admin` — a **human** action (Claude's
permission layer blocks `--admin`). Stage the PRs, then hand JRL the merge one-liners.

## Versioning & release train
`dev` always carries the next version as `X.Y.Z-dev`; `ops` ships clean `X.Y.Z` with a
lightweight `vX.Y.Z` tag on its tip, so the two boxes never report the same version.
Release order: strip-`-dev` PR into `dev` → promotion PR (head `dev`, base `ops`, merge
commit `Merge dev into ops: vX.Y.Z`) → tag `ops` → `Merge ops into main: vX.Y.Z release`
→ reopen `dev` at the next `-dev`. Rationale + ceremony: `docs/DEPLOYMENT.md` §7a.

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
- `npm test` — Jest (known baseline: 4 failures in `cameraAnalysisScheduler.test.js`;
  anything else failing is new breakage)
- `npm run test-api` — loopback POST against the upload route
