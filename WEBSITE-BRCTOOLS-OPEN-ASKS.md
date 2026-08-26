# WEBSITE ↔ BRC-TOOLS — OPEN ASKS

**Status: LIVING.** Updated in place, not superseded — hence no `-mmmDD` suffix, a deliberate
exception to the naming rule in `CLAUDE.md` (that rule targets dated snapshots; this file is a
ledger). Delete it only when every ask is `CLOSED`.

**This is a two-way document.** Each ask has an ID, an owner and a reply slot. Answer in the
slot, in this repo, via PR — do not answer in a chat window that nobody can grep six months
from now. Website-side answers go in the same slots.

**Contract, schemas and traps are NOT here** — they are in `docs/WEBSITE-BRCTOOLS-CONTRACT.md`
(permanent). The 2026-04→08 silent-413 incident is in `docs/DEPLOYMENT.md` §8. This file
carries only what is still unanswered.

**Supersedes** the open-ask halves of `WEBSITE-BRCTOOLS-HANDOFF-aug13.md` and
`WEBSITE-BRCTOOLS-HANDOFF-aug25.md`, both deleted 2026-08-26.

---

## Measured state — 2026-08-26 18:50Z

Re-measure before trusting; this block is the only mutable thing in the file.

| | `.com` | `.dev` |
|---|---|---|
| version / manifest | 1.5.2 / 2.0.0 | 1.5.3-dev / 2.0.0 |
| observations, metadata | fresh (4 min) | fresh (4 min) |
| forecasts | fresh | fresh — **recovered**, 22 run files + index |
| road-forecast | fresh | fresh — hourly at `:22` |
| outlooks | stale ~13 d | stale ~4 mo |
| llm_outlooks, images | stale ~5 mo | **never uploaded** (no directory) |
| timeseries | never uploaded | never uploaded |

Latest forecast bundle observed on `.dev`: run files at 18:47:50 / 18:48:22 / 18:48:33Z, then
the index at 18:49:14Z — **run files first, index last, ordering already correct.**

---

## Ledger

| ID | Owner | Status | Ask |
|---|---|---|---|
| A1 | brc-tools | **OPEN — blocks A2** | Which uploader runs the forecasts producer, and where does its cron output go? |
| A2 | brc-tools | **OPEN** | Gate index publication on all run files returning 200 |
| A3 | brc-tools | **OPEN** | Never retry a 413 |
| A4 | brc-tools | **OPEN** | Reconcile declared vs. actual forecasts cadence |
| A5 | brc-tools | **OPEN** | `llm_outlooks` + `images` have never reached `.dev` — find the hardcoded `.com` path |
| A6 | brc-tools | **OPEN** | Prove failure is loud: the regression test for the whole incident |
| A7 | brc-tools | **OPEN** | Are single missed cycles detected upstream? |
| A8 | JRL | **OPEN** | Install the `55 * * * *` KVEL cron on notchpeak1 |
| A9 | JRL + brc-tools | **OPEN** | Retention policy for `.com`'s 39 k+ files |
| A10 | website | **OPEN** | Decide whether `timeseries` stays in `DATA_MANIFEST.json` |
| A11 | website | **OPEN** | Declare road-forecast's real cadence in the manifest |

---

## A1 — Which uploader, and where does its output go? · brc-tools · OPEN

**This is the first question, and it was never asked.** `scripts/chpc_uploader.py` in this repo
*already* does everything the "detect failures" ask demands: it checks `response.status_code`
(~:270), logs non-2xx, and exits non-zero on primary failure (`sys.exit(0 if primary_ok else 1)`,
:456). If the forecasts producer used it, four months of 413s would have produced **45 non-zero
exits and 45 cron mails.** None were noticed.

So one of these is true, and we need to know which:

1. The forecasts producer uses a **different** uploader that swallows status. → Fix that one, or
   switch it to the shared helper.
2. It uses ours, and the **cron discards output** (`>/dev/null 2>&1`, or no `MAILTO`). → Then
   A2/A3 are cosmetic: an exit code nothing reads changes nothing.
3. Something else — tell us what.

```bash
# In brc-tools/ and on notchpeak1
crontab -l | grep -iE "brc|basin|clyfar|hrrr|herbie"    # look for >/dev/null, MAILTO, 2>&1
grep -rln "x-api-key\|/api/upload/" --include='*.py' .  # how many upload paths exist?
```

**Reply:**
> _(brc-tools: answer here)_

---

## A2 — Gate the index on its payloads · brc-tools · OPEN

Ordering is **already correct** (see the measured bundle above) — run files go first. What is
missing is the gate. Do not reorder; add step 2:

```
1. upload every run file
2. verify all returned 200      ← this is the whole ask
3. ONLY THEN upload <product>_index.json
```

If step 2 fails, publish nothing. Rationale and the "stale-but-honest" rule:
`docs/WEBSITE-BRCTOOLS-CONTRACT.md` §4.

Evidence this was real, measured 2026-08-25 — the index advertised three runs, none of which
existed on `.dev`:

```
forecast_hrrr_surface_layers_20260824_2200Z.json   .dev 404   .com 200 (1520035 bytes)
forecast_hrrr_surface_layers_20260824_2100Z.json   .dev 404   .com 200
forecast_hrrr_surface_layers_20260824_2000Z.json   .dev 404   .com 200
```

**Reply:**
> _(brc-tools: answer here)_

---

## A3 — Never retry a 413 · brc-tools · OPEN

A 413 means the body will never fit. Retrying burns the window and buries the signal.

**We had this bug too.** `scripts/chpc_uploader.py` skipped retries only for 401/403, so a 413
retried three times with exponential backoff. Fixed in the same PR as this file — if you
vendored or copied that uploader before 2026-08-26, you have the old behaviour.

**Reply:**
> _(brc-tools: answer here)_

---

## A4 — Declared cadence ≠ actual cadence · brc-tools · OPEN

`DATA_MANIFEST.json` declares for `forecasts`:

```
"frequency": "30 3,9,15,21 * * *"    →  03:30, 09:30, 15:30, 21:30 UTC
```

Measured, and re-confirmed 2026-08-26 (bundles at 12:47Z and 18:47Z):

```
~00:48, ~06:48, ~12:48, ~18:48 UTC
```

Same 4×/day interval, offset ~3 h 15 m. Our staleness window is derived from the declared
expression, so the two must agree. **brc-tools is the contract-holder** — move the cron, or
send us the correct expression and we will update the manifest.

**Reply:**
> _(brc-tools: answer here)_

---

## A5 — Fan-out gap: `llm_outlooks` and `images` · brc-tools · OPEN

Neither has **ever** created a directory on `.dev` — not stale, never present. Both are healthy
on `.com`. Confirmed again 2026-08-26 via `/api/monitoring/freshness` (`missing` on dev,
`stale` on com). Fan-out is per-dataType, so at least two upload code paths exist and one
hardcodes `www.basinwx.com`.

This must be fixed **before ozone season (~Nov)** or `.dev` runs blind all winter and stops
being a usable rehearsal mirror. Audit commands: `docs/WEBSITE-BRCTOOLS-CONTRACT.md` §3.

**Reply:**
> _(brc-tools: answer here)_

---

## A6 — Prove that failure is loud · brc-tools · OPEN

**The regression test for the entire incident.** Everything else here is unexercised until this
passes. The symptom cleared when nginx was fixed; the producer's failure-detection was never
tested, and the same silence recurs on the next size change, cert problem, full disk or blip.

```
Point the uploader at a host with a low body limit (or temporarily lower one) and confirm:
  - a NON-ZERO exit code, and
  - NO index publication, and
  - that something a human reads actually received it (see A1)
```

**Reply:**
> _(brc-tools: answer here)_

---

## A7 — Are single missed cycles detected? · brc-tools · OPEN

`road-forecast` uploaded 18 files on 2026-08-26 — hourly at `:22` from 00:21 to 18:22, with
**16:22Z missing.** One silent gap, no alert on either side. That is the same failure class as
the four-month outage, just shorter. Does anything upstream notice a skipped cycle, or does it
only notice when the job errors?

**Reply:**
> _(brc-tools: answer here)_

---

## A8 — KVEL cron on notchpeak1 · JRL · OPEN

Zero `forecast_hrrr_kvel_crosswind_*` files have ever been uploaded to either host. The website
side is merged and waiting (#210, manifest 2.0.0, `Rwy17`/`Rwy35` labels), so the aviation
table cannot be verified visually until the first file lands. The `55 * * * *` cron is JRL's to
install. Schema: `docs/WEBSITE-BRCTOOLS-CONTRACT.md` §5c.

**Reply:**
> _(JRL: answer here)_

---

## A9 — Retention policy · JRL + brc-tools · OPEN

`.com` carries 39,236 files under `forecasts` alone, with no pruning policy. Agree one before
the Clyfar producers restart in November. Note `.dev` has 23 — the two will never have equal
counts, so any "do the hosts agree?" check must compare **recent filenames**, not totals.

**Reply:**
> _(answer here)_

---

## A10 — Should `timeseries` stay in the manifest? · website (JRL) · OPEN

**Not a CHPC ask** — this was previously pointed at brc-tools in error. `timeseries` is declared
with `"frequency": "0 * * * *"` and has never been uploaded to either host. It has **no
consumer**: the only reader is `public/js/api.js` hitting `/api/synoptic/timeseries`, the live
Synoptic proxy, which does not touch `/api/static/timeseries/*`.

So the dataType is declared, unimplemented, unconsumed, and shows a permanent `missing` in
monitoring. Options: drop it from `DATA_MANIFEST.json` (a manifest MAJOR bump), or keep it as a
reserved slot and suppress it in monitoring. **JRL's call; no producer work either way.**

**Reply:**
> _(JRL: answer here)_

---

## A11 — Declare road-forecast's real cadence · website · OPEN

`DATA_MANIFEST.json` declares `road-forecast` frequency as the literal string
`"ad-hoc (proof-of-concept)"`. `parseCronIntervalMinutes` sees fewer than five fields and
silently falls back to **60 minutes**, which happens to match the observed `:22` hourly cadence
— so the monitor is right by accident. It is a proof-of-concept no longer. Declare
`22 * * * *` so the window is explicit rather than lucky.

**Reply:**
> _(website: answer here)_

---

## Closed

| ID | Closed | How |
|---|---|---|
| road-forecast producer (aug13 TARGET 1) | 2026-08-25 | Live and fresh on both hosts |
| Forecast run files reaching `.dev` | 2026-08-25 | nginx `client_max_body_size` 32m; 22 run files present |
| Index names a real run file, not itself | 2026-08-25 | #215 excluded `*_index.json` from freshness |
| `filelist` 500 → 404 for a missing dir | 2026-08-25 | #215 — "never uploaded" now distinguishable from "server broke" |
| Cron interval parsing (360 min, not 60) | 2026-08-25 | #216 |
| Oversized/malformed JSON → 413/400, not 500 | 2026-08-25 | #216 |
| KVEL runway headings | 2026-08-13 | FAA chart: 17/35, true `[179, 359]`; brc-tools #59 / v0.1.1 |
| road-forecast cadence: hourly or 3-hourly? | 2026-08-26 | Answered by observation — hourly at `:22`, inside the 3 h gate |
| Prod on manifest 1.2.0, rejects the KVEL contract | 2026-08-26 | `.com` deployed v1.5.2 / manifest 2.0.0 |
| Mar-30 stop across forecasts/images/llm_outlooks | 2026-08-13 | Seasonal wind-down, not a fault |

---

## Acceptance criteria

Criterion 1 and 3 **pass** as of 2026-08-26. Criterion 2 was previously written as "counts
should track each other" — unsatisfiable, since `.com` carries years of Clyfar history that
`.dev` will never have. Restated below.

```bash
# 1. PASSING — a bundle lands COMPLETE: every file the index names returns 200.
#    (command in docs/WEBSITE-BRCTOOLS-CONTRACT.md §7)

# 2. Both hosts have the SAME RECENT RUNS — compare filenames, never totals.
for d in com dev; do
  printf "%s: " "$d"
  curl -fsS "https://www.basinwx.${d}/api/filelist/forecasts" \
    | python3 -c 'import sys,json; f=[x for x in json.load(sys.stdin) if x.startswith("forecast_hrrr_surface_layers_2")]; print(sorted(f)[-3:])'
done
# The two lists must be identical from the next bundle onward.

# 3. PASSING — freshness names a RUN file, not an index.
curl -fsS https://www.basinwx.dev/api/monitoring/freshness \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["freshness"]["forecasts"])'

# 4. STILL UNTESTED — an upload failure actually fails. This is A6, and it is the one
#    that matters. Until it passes, nothing here is fixed — only unexercised.

# 5. .dev has directories for llm_outlooks and images at all. (A5)
for t in llm_outlooks images; do
  printf "%s: " "$t"
  curl -s -o /dev/null -w '%{http_code}\n' "https://www.basinwx.dev/api/filelist/$t"
done
# 404 = never uploaded here. Want 200.
```

---

## When an ask closes

Move its row to **Closed** with a date and a one-line "how", and delete its section. When the
ledger is empty, delete this file — the contract in `docs/WEBSITE-BRCTOOLS-CONTRACT.md` stays.
