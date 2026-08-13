# WEBSITE → DEVBOX HANDOFF
# Status: TEMPORARY (delete once §3 passes and §8 is reported back)
# From: linode-prod (www.basinwx.com), branch `ops` @ v1.5.0
# To:   linode-dev (www.basinwx.dev)
# Compiled: 2026-08-13

Compiled **from prod**. The dev box was never inspected — every path, port, and app name below
is a question, not an instruction. Verify, don't assume.

## Goal

Get `.dev` onto the same v1.5.x contract as prod so it is a real rehearsal mirror again.

## 0. Read this first — the working tree IS the served site

The app serves `public/` straight off the working tree. `git checkout` changes what live traffic
sees **immediately**, before any pm2 restart. This bit prod during this very deployment: a
checkout of `dev` in the live repo served dev's frontend against ops's in-memory server for
~4 minutes.

To inspect or stage a branch without touching the served tree:
```bash
git worktree add /tmp/staging <branch>
```

## 1. Update

```bash
cd <repo>          # DEPLOYMENT.md §1b guesses /srv/ubair-website — CONFIRM, prod is /var/www
git fetch origin --prune
git checkout dev   # only if dev is already the deployed branch; otherwise see §0
git merge --ff-only origin/dev
```

`dev` tip carries: pipeline unblockers, v1.5.0 bump, housekeeping (25 docs archived, dead files
pruned), and topology corrections.

**Expected version: `1.5.0`.** It becomes `1.5.1-dev` once `chore/open-v1.5.1-dev` is merged —
a pending follow-up, not part of this handoff. Prod stays pinned at a release version; that
difference is intentional and is how you tell the boxes apart at a glance.

**No `npm ci`.** No dependency changed between the old and new state; `package-lock.json` is
untracked in this repo.

## 2. Restart

```bash
pm2 restart <app> && pm2 save
```

App name is whatever that box already runs — **do not rename it as part of this update.**
`ecosystem.config.cjs` derives the name from the branch (`basinwx-dev`) but now honours a
`PM2_APP_NAME` override, so a pre-existing app can adopt the config without a rename:
`PM2_APP_NAME=<existing> pm2 start ecosystem.config.cjs`. Prod does not use the config file at
all — it runs a hand-started `ubair-site`. Don't copy prod's layout; just record dev's.

## 3. Verify

```bash
curl -s http://127.0.0.1:<port>/api/health | jq
# expect: version "1.5.0" (or "1.5.1-dev"), manifestVersion "1.2.0"

for r in status freshness uploads alerts; do
  curl -s -o /dev/null -w "$r %{http_code}\n" http://127.0.0.1:<port>/api/monitoring/$r
done
# newly mounted this release — 404 means the merge didn't land

curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:<port>/api/filelist/observations   # 200
```

Load `/fire`, `/roads`, `/aviation`, `/forecast_air_quality`; check the browser console.

## 4. What changed that dev must match

- **`DATA_MANIFEST.json` → v1.2.0.** Documents `llm_outlooks` (accepted since launch, never
  written down). The manifest version is now reported by `/api/health` so brc-tools can check
  contract compatibility for free — **both boxes must report the same value.**
- **`/api/monitoring/*` mounted** in `server.js`. `POST /api/monitoring/alerts/clear` requires
  `x-api-key`; the other four are open reads.
- **`/api/health` returns `version` + `manifestVersion`.** One curl now answers "which box and
  which contract am I talking to?"
- **`scripts/chpc_uploader.py`** — the hardcoded `--data-type` allowlist is gone; valid types
  now come from the manifest. That allowlist was silently blocking `forecasts`,
  `road-forecast`, and `llm_outlooks`.
- **`server/keys/data_upload.key` deleted.** It was read by no code and held a dead key. The
  live key lives only in `.env`.

## 5. Known breakage — same on both boxes, don't re-diagnose

`public/api/static/filelist.json` was deleted, but `GET /api/filelist.json`
(`server/server.js:131`) still reads it. That endpoint now errors. Nothing consumes it — every
page uses `/api/filelist/:dataType` — and `scripts/test-api.js` was already moved off it. The
route is slated for removal.

## 6. `.env` trap — check before debugging any 401

On prod, `BASINWX_API_KEY` ≠ `DATA_UPLOAD_API_KEY`, despite the comment in `.env` claiming they
match. Ingest is unaffected: the server only ever validates `DATA_UPLOAD_API_KEY`. But
`chpc_uploader.py` reads `BASINWX_API_KEY`, so running it *from the box* to self-test returns
401 and reads like an auth regression when nothing is actually wrong.

**Check dev for the same drift.** The only requirement that matters: dev's
`DATA_UPLOAD_API_KEY` must equal the key CHPC fans out to `.dev`.

## 7. Still broken — and NOT a dev-box problem

Per `WEBSITE-BRCTOOLS-HANDOFF-aug13.md`, fan-out delivers only `observations` + `metadata` to
`.dev`. `forecasts` / `images` / `llm_outlooks` reach `.com` only, because brc-tools has **≥2
upload code paths** — one honours `BASINWX_API_URLS`, one hardcodes `.com`. That is brc-tools'
fix, on CHPC. Receivers never pull; nothing you do on the dev box will fix it.

Must be resolved **before ozone season (~Nov)** or `.dev` runs blind all winter and stops being
a usable rehearsal mirror.

Also dark on both boxes, awaiting producers — website side is already complete:
`road-forecast` (start here), `forecast_hrrr_kvel_crosswind`, `forecast_hrrr_surface_layers`.

Separately: `forecasts` / `images` / `llm_outlooks` all stop at exactly `2026-03-30 0600Z` on
prod. That is the **expected** winter-ozone season wind-down, confirmed by JRL 2026-08-13 — not
a bug, and not something to chase.

## 8. Report back

So `docs/DEPLOYMENT.md` §1a and `CLAUDE.md` can be corrected for dev the way they were just
corrected for prod:

- repo path, pm2 app name, port, service user
- `/api/health` output
- whether the §6 `.env` drift exists
- whether `/etc/nginx/sites-enabled/` is populated (on prod it is **empty**, so how traffic
  reaches port 3000 there is currently undocumented)
