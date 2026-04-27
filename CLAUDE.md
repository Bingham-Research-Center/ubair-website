# Uintah Basin Air Quality Website — Claude Context

Live air-quality observations and forecasts for the Uintah Basin. Node/Express +
Leaflet/Plotly, vanilla JS frontend.

## Topology
| Role | Branch | Domain | pm2 app |
|---|---|---|---|
| Production | `ops` | `www.basinwx.com` | `basinwx-ops` |
| Rehearsal mirror | `dev` | `www.basinwx.dev` | `basinwx-dev` |

Both: Linode, repo at `/srv/ubair-website` as `deploy`, nginx + Let's Encrypt.
The pm2 app name is derived from the checked-out branch (`ecosystem.config.cjs`),
so the branch on disk dictates the running app identity. `.dev` receives the same
CHPC fan-out as `.com` and is where stakeholder demos happen — merging into `dev` is
a real-world dry-run before promoting to `ops`.

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

## Protected branches
**Never push directly to `dev`, `ops`, or `main`.** All changes go through PRs. If a
direct push seems warranted, confirm with the user — then ask a **second time** before
proceeding. Applies to merges, reverts, version bumps, every commit.

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
- `docs/DEPLOYMENT.md` — bring-up runbook + chronic gotchas
- `docs/IMPROVEMENTS.md` — outstanding work (flagged stale by JRL; renew before reuse)
- `DATA_MANIFEST.json` — forecast schemas
- `git log --oneline -30` — recent merges; do not duplicate here

## Testing
- `npm run dev` — nodemon server
- `npm test` — Jest (currently has known failures in `cameraAnalysisScheduler.test.js`)
- `npm run test-api` — loopback POST against the upload route
