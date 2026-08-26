# BASINWX → BRC-TOOLS HANDOFF
# Status: TEMPORARY (expires when the acceptance criteria below pass — then delete)
# From: Bingham-Research-Center/ubair-website, branch `dev`, HEAD 3c03e65 (v1.5.2-dev, manifest 2.0.0)
#       Production `ops` = v1.5.1 (tag v1.5.1, 6b84f21), manifest 1.2.0, live on basinwx.com.
# To:   brc-tools repo on CHPC
# Compiled: 2026-08-25
# Supplements (does NOT replace): WEBSITE-BRCTOOLS-HANDOFF-aug13.md — its TARGET 1
#       (road-forecast) is DONE; TARGETs 2 and 3 and acceptance criteria 2–4 are still open.
# Audience: AI agent + human working in brc-tools/ on CHPC. Code-first, minimal prose.

---

## OUTCOME UPDATE — 2026-08-26 02:20Z (the symptom is gone; the defect is NOT)

Run files started landing on `.dev` with the **very first bundle after the nginx fix**:

```
first run file through: 2026-08-25T06:47:19Z   (the 06:48Z bundle)
most recent:            2026-08-26T00:48:04Z
13 files present, ~1.52 MB each
freshness: status "fresh", ageMinutes 92, expectedFreqMinutes 360, latestFile a real run file
```

Acceptance criterion 1 now **passes** — all three runs the index advertises return 200.
TARGET 3 (`forecast_hrrr_surface_layers`) is unblocked.

**Do not read that as P0-1 and P0-2 being fixed.** They are not. brc-tools still does not check
upload status and still publishes the index independently of its payloads — it simply is not
failing at the moment, because the server stopped rejecting it. The exact same four-month
silence will recur the next time any upload fails for any reason: a size change, a cert
problem, a full disk, a network blip.

**Criterion 4 is the one that still matters and is still untested.** Point the uploader at a
host with a low body limit and confirm a non-zero exit code and no index publication. Until
that passes, nothing in this document is actually fixed — only unexercised.

---

## YOUR JOB IN ONE SENTENCE

**brc-tools reported success for 45 consecutive forecast uploads in which every single data
file was rejected by the server and only a 3 KB index landed.** The website side of that
failure is fixed. The producer side — not noticing — is not, and that is the whole job here.

---

## WHAT HAPPENED (read this before touching anything)

`.dev` served no HRRR forecast run file between **2026-04-27** and **2026-08-25**. Four months.

Root cause on our side: nginx on the dev box had no `client_max_body_size`, so it used the
1 MB default. HRRR run files are ~1.5 MB, so nginx returned **413 before Express ever saw
them**. Fixed 2026-08-25 (`/etc/nginx/conf.d/upload-body-size.conf`, 32m).

**But that is not why it went unnoticed for four months.** It went unnoticed because:

1. The ~3 KB companion `forecast_hrrr_surface_layers_index.json` is *under* 1 MB, so it
   uploaded successfully every cycle.
2. brc-tools published that index **advertising three runs it had not successfully
   uploaded**, and reported the bundle as a success.
3. So every downstream signal looked alive: the filelist returned entries, the index
   refreshed hourly, and our pipeline log recorded `forecasts: success`.

Evidence from `logs/analytics/pipeline.log` on the dev box:

```
total forecasts uploads logged: 45
distinct filenames: {'forecast_hrrr_surface_layers_index.json': 45}
distinct sizes:     {3164: 45}
```

45 uploads. One filename. One size. **Zero run files, ever.** And nothing on the CHPC side
raised a hand.

---

## THE THREE DEFECTS THAT ARE YOURS

### P0-1 — Upload failures are not detected

`scripts/chpc_uploader.py` (and whatever brc-tools uses in its place) must check the HTTP
status of every POST and fail loudly. A 413 is not a warning; it means the data does not exist
on the server.

```python
# The shape this needs. Do not swallow non-2xx.
resp = self.session.post(url, files=files, headers=headers, timeout=120)
if resp.status_code != 200:
    raise UploadFailed(f"{dataType}/{filename}: HTTP {resp.status_code} {resp.text[:200]}")
```

Minimum bar: a non-2xx on any file in a bundle must produce a non-zero exit code, so the cron
mails it. Four months of silence is the thing to design against.

### P0-2 — The index is published even when its run files failed

This is the defect that turned an outage into an *invisible* outage. The index is a promise
about files that exist. Publishing it before, or independently of, its payloads means the
website serves an index pointing at 404s.

Required order, with a gate between:

```
1. upload every run file
2. verify all returned 200
3. ONLY THEN upload <product>_index.json
```

If step 2 fails, do not upload the index at all. A stale-but-honest index beats a fresh lie.

Verified 2026-08-25 — the index on `.dev` advertised three runs, none of which existed:

```
forecast_hrrr_surface_layers_20260824_2200Z.json   .dev 404   .com 200 (1520035 bytes)
forecast_hrrr_surface_layers_20260824_2100Z.json   .dev 404   .com 200
forecast_hrrr_surface_layers_20260824_2000Z.json   .dev 404   .com 200
```

### P1-3 — Declared schedule does not match actual cadence

`DATA_MANIFEST.json` declares for `forecasts`:

```
"frequency": "30 3,9,15,21 * * *"   →  03:30, 09:30, 15:30, 21:30 UTC
```

Measured from 45 logged uploads, the producer actually runs at:

```
~00:48, ~06:48, ~12:48, ~18:48 UTC
```

Same 4×/day interval, offset by ~3h15m. Our freshness monitor derives its staleness window
from the declared cron, so the two must agree. **brc-tools is the contract-holder** — either
move the cron or send us the correct expression and we will update the manifest. Do not leave
them disagreeing.

---

## DARK DATATYPES — measured 2026-08-25, both hosts

`NO-DIR` = the directory has never been created, i.e. that dataType has never been uploaded
to that host even once.

| dataType | .dev newest | .com newest | verdict |
|---|---|---|---|
| observations | 20260825_0520 | 20260825_0520 | healthy, fanning out correctly |
| metadata | 20260825_0520 | 20260825_0520 | healthy |
| road-forecast | 20260825_0422 | 20260825_0422 | healthy — aug13 TARGET 1 is **done** |
| forecasts | 20260427_2100 | 20260824_2200 | `.dev` dark 4 months (nginx, now fixed) |
| outlooks | 20241230_1430 | 20260306_1300 | stale on both; `.dev` by ~20 months |
| llm_outlooks | **NO-DIR** | 20260330_0600 | never reached `.dev`; stale ~5 months on `.com` |
| images | **NO-DIR** | 20260330_0600 | never reached `.dev`; stale ~5 months on `.com` |
| timeseries | **NO-DIR** | **NO-DIR** | never uploaded **anywhere**, ever |

Two conclusions:

- **Fan-out is per-dataType, not global.** observations/metadata/road-forecast reach both
  hosts; llm_outlooks/images reach only `.com`. The aug13 handoff hypothesised this; it is now
  confirmed. Find the producers that hardcode `www.basinwx.com` instead of iterating
  `BASINWX_API_URLS`.
- **`timeseries` has never existed.** It is declared in the manifest with
  `"frequency": "0 * * * *"` and has produced nothing, on any host, ever. Either wire it up or
  tell us to drop it from the manifest — a declared dataType that never ships is a permanently
  false "missing" in our monitoring.

---

## WHAT THE WEBSITE SIDE ALREADY FIXED (do not chase these)

| Fix | PR | Effect |
|---|---|---|
| nginx `client_max_body_size` 32m on `.dev` | ops, not a PR | 1.5 MB uploads now reach Express. Verified: multipart 1.5 MB → 401, not 413 |
| Freshness no longer masked by an index | #215 | `*_index.json` / `*_list.json` excluded from freshness whoever wrote them |
| `filelist` 500 → 404 for a missing dir | #215 | "never uploaded" is now distinguishable from "server broke" |
| Cron interval parsing | #216 | `30 3,9,15,21 * * *` now reads as 360 min, not 60 |
| Client body errors | #216 | oversized/malformed JSON → 413/400, not 500 |
| KVEL 17/35 schema | #210 | manifest **2.0.0** on `.dev`; `hrrr_kvel_crosswind` declared |

`.com` is still on manifest 1.2.0 and picks 2.0.0 up at the next promotion. **Check
`/api/health` `manifestVersion` before assuming a host accepts the KVEL contract.**

---

## STILL OPEN FROM THE AUG13 HANDOFF

- **TARGET 2 — `forecast_hrrr_kvel_crosswind`.** Website side is done and merged (#210,
  manifest 2.0.0, `Math.floor` runway labels → Rwy17/Rwy35). **Zero KVEL files have ever been
  uploaded**, so the aviation table cannot be verified visually. The `55 * * * *` cron on
  notchpeak1 is JRL's to install.
- **TARGET 3 — `forecast_hrrr_surface_layers`.** Blocked by P0-1/P0-2 above on `.dev`.
- Acceptance criteria 2, 3 and 4 in that document are all still open. Criterion 1 passes.

---

## ACCEPTANCE CRITERIA

```bash
# 1. A forecast bundle lands COMPLETE on .dev — index and run files agree.
curl -fsS https://www.basinwx.dev/api/static/forecasts/forecast_hrrr_surface_layers_index.json \
  | python3 -c 'import json,sys; [print(r["filename"]) for r in json.load(sys.stdin)["runs"]]' \
  | while read f; do
      echo "$(curl -s -o /dev/null -w '%{http_code}' "https://www.basinwx.dev/api/static/forecasts/$f") $f"
    done
# EVERY line must be 200. A single 404 means the index is lying again.

# 2. Counts track each other from here on.
for d in com dev; do
  printf "%s forecasts: " "$d"
  curl -fsS "https://www.basinwx.${d}/api/filelist/forecasts" | python3 -c 'import sys,json; print(len(json.load(sys.stdin)))'
done
# 2026-08-25 baseline: dev=2, com=39215.

# 3. Freshness agrees, and names a RUN file — not an index.
curl -fsS https://www.basinwx.dev/api/monitoring/freshness \
  | python3 -c 'import json,sys; f=json.load(sys.stdin)["freshness"]["forecasts"]; print(f)'
# want status "fresh", ageMinutes in minutes, latestFile matching forecast_*_<stamp>Z.json

# 4. An upload failure actually fails.
#    On CHPC, point the uploader at a host with a 1 MB limit (or temporarily lower one) and
#    confirm a NON-ZERO exit code and NO index publication. This is the regression test for
#    the whole incident — if it passes silently, nothing here is fixed.
```

---

## ANTI-GOALS

- **Do not change the website-side endpoint contract.** `POST /api/upload/:dataType`,
  multipart `file=@...`, `x-api-key` + CHPC hostname. It works; it is not the problem.
- **Do not raise limits to make a symptom go away.** multer's ceiling is 10 MB and nginx is
  now 32 MB on `.dev`. If a file exceeds those, that is a conversation, not a config bump.
- **Do not retry a 413 in a loop.** It will never succeed. Fail and exit non-zero.
- Do not add a website-side "is the index consistent?" check as the primary fix. We may add one
  as a backstop, but a producer that publishes a truthful index is the actual fix.

---

## WHEN DONE

Reply on the brc-tools PR with the output of all four acceptance blocks, then delete this file
and — if TARGETs 2 and 3 are also closed — `WEBSITE-BRCTOOLS-HANDOFF-aug13.md` with it.
