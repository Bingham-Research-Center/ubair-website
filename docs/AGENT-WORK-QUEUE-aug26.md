# AGENT WORK QUEUE — compiled 2026-08-26

**Audience:** an AI agent picking up this repo cold, one chunk per session.
**Status:** TEMPORARY. Delete when the queue empties or goes stale (renew before reuse).

Each chunk is sized for a single focused session. They are ordered by value, not difficulty.
**Take one at a time.** Chunks 2 and 3 in particular are where a well-meaning sweep does damage.

Read `CLAUDE.md` first — protected branches, the squash-merge trap, and the worktree rule
(never `git checkout` in a live repo; the app serves `public/` off the working tree).

---

## STATE AS OF 2026-08-26 02:20Z

| | |
|---|---|
| `dev` | v1.5.3-dev, manifest 2.0.0 |
| `ops` | `ffd0bfb`, v1.5.2, manifest 2.0.0, tagged `v1.5.2` |
| prod box | **deployed** — `www.basinwx.com` verified serving 1.5.2 / manifest 2.0.0 on 2026-08-26 |
| Test suite | **155/155 green.** Any failure is new breakage — the old 4-failure baseline is retired |
| `.dev` ingest | healthy; forecasts recovered 2026-08-25 after a four-month outage |
| Open PRs | #128 (Quinten's sports page) — #220 merged |

The 2026-08-25 incident and its causes are recorded in `docs/DEPLOYMENT.md` §8. The producer
contract lives in `docs/WEBSITE-BRCTOOLS-CONTRACT.md` and everything still unanswered in
`WEBSITE-BRCTOOLS-OPEN-ASKS.md`. Do not re-derive them.

---

## CHUNK 1 — Promote v1.5.2 to production ← ✅ DONE 2026-08-26

> **Closed 2026-08-26.** The release train ran — `dev` stripped to 1.5.2 (#222), promoted to
> `ops` (#223, merge `ffd0bfb`), tagged **v1.5.2**, merged to `main` (#224), `dev` reopened at
> 1.5.3-dev — and the prod box has since been deployed. Verified live 2026-08-26:
> `www.basinwx.com` reports **1.5.2 / manifest 2.0.0** and `/api/filelist/timeseries` returns
> **404**, not 500. The steps below are kept only as the reference procedure for the next
> promotion. Nothing here is outstanding.

**Why it mattered:** prod carried defects already fixed on `dev` — `/api/filelist/timeseries`
returned 500 instead of 404, an oversized JSON body returned 500 instead of 413, and prod sat
on manifest 1.2.0 and so would not accept the KVEL contract. All three resolved by the deploy.

**Steps** (ceremony is `docs/DEPLOYMENT.md` §7a; every step is a PR — never push to a
protected branch):

```
1. strip -dev:      package.json 1.5.2-dev -> 1.5.2, PR into dev
2. promotion PR:    head dev, base ops, merge commit "Merge dev into ops: v1.5.2"
3. tag ops tip:     v1.5.2  (lightweight)
4. main:            "Merge ops into main: v1.5.2 release"
5. reopen dev at    1.5.3-dev
```

Then on the **prod** box as `root` (different path, user and app name from dev):

```bash
cd /var/www/ubair-website && git pull --ff-only
npm install --no-audit --no-fund      # REQUIRED — the dep changes are inert without it
pm2 restart ubair-site --update-env
curl -s https://www.basinwx.com/api/health          # expect 1.5.2 / manifest 2.0.0
curl -s -o /dev/null -w '%{http_code}\n' https://www.basinwx.com/api/filelist/timeseries  # 404
```

**Do NOT** run `scripts/fix-nginx-body-size.sh` on prod. Prod's uploads arrive on loopback over
the SSH tunnel and bypass nginx entirely; its nginx already passes 1.5 MB (measured: 401).

**Verify:** version 1.5.2, manifest 2.0.0, `timeseries` 404 not 500, and prod's own
`/api/monitoring/freshness` naming run files rather than `*_index.json`.

---

## CHUNK 2 — `node-cron` ^3 → ^4

**Why:** moderate advisory, and it transitively fixes `uuid`.

**Why it is not a one-line bump:** node-cron drives `server/backgroundRefresh.js`, the job that
keeps site data flowing, and v4 changes scheduled-task lifecycle semantics. A silent scheduler
regression is the exact failure mode this repo spent 2026-08-25 eliminating.

Usage is small — `cron.validate()` and `cron.schedule(expr, fn)` in
`server/reportEmailService.js` and `server/backgroundRefresh.js` (schedules `*/1 * * * *`,
`2,7,...,57 * * * *`, `5,20,35,50 * * * *`).

**Method:**
1. Read the v4 migration notes for `schedule()` return value, auto-start, and `.stop()`.
2. Bump, `npm install`, restart `.dev`.
3. **Watch that jobs actually fire** — this is the whole point, not an afterthought:
   ```bash
   pm2 logs basinwx-dev --lines 200 --nostream | grep -c 'Refreshing essential data'
   # must keep increasing every minute; check again after 10 minutes
   ```
4. Confirm observations/metadata keep landing (`logs/analytics/pipeline_summary.json`).

**Do not** merge this on a green test suite alone — no test covers whether the timer fires.

---

## CHUNK 3 — Ingest-path dependency bumps (10 high advisories)

`npm audit` reports 17 vulns, 10 high. Direct: `form-data`, `multer`, `ws`. Transitive:
`brace-expansion`, `engine.io`, `fast-uri`, `js-yaml`, `nanoid`, `postcss`, `socket.io-parser`.

**Why it is deferred:** `express`, `multer` and `form-data` are all on the upload path that was
only just unblocked. Bumping them blind days after a four-month silent outage is the wrong
instinct.

**Method — one package per PR, in this order** (least to most coupled):
1. transitive-only fixes (`npm audit fix` without `--force`; verify nothing else moved)
2. `ws` / socket.io chain
3. `form-data`
4. `multer` — **highest risk**, it is the upload route's body parser
5. `express` — last

**After each**, prove the real upload path still works, not just that tests pass:
```bash
python3 -c "import json; open('/tmp/big.json','w').write(json.dumps({'pad':'a'*1500000}))"
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://www.basinwx.dev/api/upload/forecasts \
     -F 'file=@/tmp/big.json;filename=probe.json'      # want 401 — reached the app
npm test                                                # 155/155
```
Then wait one producer cycle (~6 h) and confirm run files still land.

---

## CHUNK 4 — Website-side index-consistency backstop

**Why:** `WEBSITE-BRCTOOLS-OPEN-ASKS.md` A2 names a producer that publishes an index for files
it did not upload. The proper fix is producer-side and this must not substitute for
it — but a backstop would have caught the outage in a day rather than four months.

**Shape:** extend `server/monitoring/dataMonitor.js` so that for any dataType holding a
`*_index.json`, it parses the index and reports how many advertised files are missing from disk.
Surface as a distinct status (e.g. `index_inconsistent`) on `/api/monitoring/freshness`.

**Test with the real shape:** an index listing three runs, none present, in a temp dir — mirror
`server/__tests__/dataMonitorFreshness.test.js`.

**Anti-goal:** do not make this paper over a lying producer. It reports; it does not repair.

---

## CHUNK 5 — Review and land PR #128 (Quinten's sports page)

51 commits, `MERGEABLE`, dev already merged into it. Needs a **human review** — it is a
teammate's feature work, not automation.

Per `CLAUDE.md` and prior agreement: **never force-update a teammate's branch.** If a rebase is
needed, push to `rebased/<branch>` and let them bless it. `rebased/feature/braxton-sports`
already exists from a previous round and Quinten has since absorbed it; do not delete his
branches.

---

## CHUNK 6 — Dark dataTypes (BLOCKED on brc-tools)

`llm_outlooks` and `images` reach `.com` but have never created a directory on `.dev` — fan-out
is per-dataType, not global (`WEBSITE-BRCTOOLS-OPEN-ASKS.md` A5, brc-tools' to fix). `outlooks`
is stale on both.

`timeseries` is **not** blocked on brc-tools — it has no consumer at all. The only reader is
`public/js/api.js` calling `/api/synoptic/timeseries`, the live Synoptic proxy, which never
touches `/api/static/timeseries/*`. So the sole action is a website-side decision on whether it
stays in `DATA_MANIFEST.json` (A10) — JRL's call, no producer work either way.

---

## CHUNK 7 — Small cleanups (one session for all of them)

- **`fireRestrictionsSummaries.json` ENOENT** logs on every startup. It degrades cleanly
  ("proceeding without"), so this is noise reduction only — either ship a default file or drop
  the log to debug level.
- **`gh` CLI is outdated.** `gh pr edit` and `gh pr merge` hit a Projects-classic GraphQL
  deprecation; the REST API works as a fallback (`gh api -X PATCH .../pulls/N --input f.json`).
  Fix: `sudo apt update && sudo apt install --only-upgrade gh`.
- **`DATA_MANIFEST.json` forecasts schedule** declares `30 3,9,15,21 * * *` but the producer
  runs at ~00:48/06:48/12:48/18:48 UTC. The interval is right so staleness is correct; only the
  phase is wrong. brc-tools is the contract-holder — do not unilaterally edit it (A4).
- **`road-forecast` declares `"ad-hoc (proof-of-concept)"`** as its frequency.
  `parseCronIntervalMinutes` sees <5 fields and silently defaults to 60 min, which happens to
  match the real `:22` hourly cadence — correct by accident. Declare `22 * * * *` (A11). This
  one *is* ours; the producer cadence is already what we want.

---

## NOT OURS

- brc-tools P0-1 (upload failures undetected) and P0-2 (index published without payloads).
  Handed off; **still open** — the symptom cleared when nginx was fixed, the defect did not.
- The `55 * * * *` KVEL cron on notchpeak1 — JRL's to install. Until then #210's runway labels
  (Rwy17/Rwy35) cannot be verified visually; zero KVEL files have ever been uploaded.
