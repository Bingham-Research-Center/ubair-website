# CHPC Ingest Handoff — Nov 21

**Status:** temporary. Written on the dev box on 2026-11-21, about 08:30Z, after a survey of
what both websites were receiving. It is for whoever works the producer side next: John, or an
agent on notchpeak1 in `brc-tools`. It adds to
[`NWP-PRODUCER-HANDOFF-nov20.md`](NWP-PRODUCER-HANDOFF-nov20.md) and continues its numbering
(P25 to P28). Delete it once §3 is done or has moved there.

**The short version.** Ingest is healthy on both boxes: every upload in the logs was accepted
and nothing was refused. The fixes in brc-tools #76 to #78 took effect at **04:46Z on 21 Nov**,
and four of the six can be seen in the files. The expensive part of ingest turned out to be the
website, which is fixed in website PRs #427 and #428 and needs nothing from CHPC. What only
CHPC can do is below: two existing asks that now have numbers (P11, P14), four new ones, and
two questions.

---

## 1. What the website can see of the 21 Nov fixes

Each was checked against the delivered files on `.dev`, not against the PR descriptions.

| Claim | Seen from outside | How |
|---|---|---|
| **P8** gusts and visibility in the obs feed (#76) | **Yes**, from `map_obs_20261121_0446Z.json` | `wind_gust` on 38 stations, `visibility` on 28, in `Statute miles` |
| **P15** stations added (#76) | **Yes** | `LRFU1`, `SPMU1`, `UTELP` are new; 56 stations, none dropped |
| **P16 / R1** metadata on change (#76) | **So far** | Every 5 min until 04:46Z, none since. The next is due by 10:46Z |
| **P17** winds rotated to true north (#78) | **Yes** for waypoints and surface layers | Comparing each waypoint run with the one before, at the same valid times: the mean direction change is within ±1.5° for every run except the one generated at 04:51Z, which steps **−7.8°** (162 pairs). Surface-layer u/v give the same direction as the waypoints within 0.5°, before and after |
| **P10** snowfall a clean total (#77) | **Yes** | Grid cells whose total ever falls: 270 to 560 per run before, 0 to 2 after. The label now reads "Snowfall since run start (depth)" |
| **P9** `road-forecast` `precip_1hr` hourly (#77) | **Not yet** | Every run since the fix is dry at all 17 points. The last wet run (init 20 Nov 23Z) still rose monotonically |
| KVEL crosswind rotated (#78) | **Not yet** | Too calm at KVEL: one usable pair since the fix |

Also seen:

- **Clyfar is back.** The 20 Nov 18Z run landed at 04:37Z on both boxes: 165 files (96 JSON,
  67 PNG, 2 outlook files), 163 of them inside a minute, sent from
  `notch309.ipoib.int.chpc.utah.edu` (it passes the `.chpc.utah.edu` allowlist). `.dev` now
  has its first `llm_outlooks` file, which closes A5.
- **The RRFS draft** (`forecast_rrfs_surface_layers_20261121_0000Z.json` and its index) is on
  `.dev` only and nothing reads it: the weather page asks for the HRRR index by name.
- **Rows can be old.** In `map_obs_20261121_0800Z.json`, 10 of the 38 gust rows are more than
  3 hours old (a station reports a gust only while gusting), and `KENV` and `KMS` rows are 17
  hours old. The website shows nothing older than 3 hours, so this needs no change.

## 2. Delivery over the last 7 days

From file names and arrival times on `.dev`'s disk, and `.com`'s file list.

| Product | Run start to arrival | Missing |
|---|---|---|
| `road-forecast` | 83 min (82 to 86) | 3 hours on both boxes, 2 more on `.com` only |
| Waypoints | 171 min (171 to 172) | 3 runs on both, 2 more on `.dev` only |
| KVEL crosswind | 177 min (177 to 179) | 3 runs on both, 1 more on each box alone |
| Surface layers | 167 min for the newest run of a bundle; it is then the newest on the map for six hours, so typically **527 min** old before the next bundle and **887 min** at worst | 1 bundle of 28, on both |
| Observations | every 5 min | 25 cycles on both boxes (1.2%), 13 more on `.dev` only |

**What was missed, so it can be matched to `~/logs`** (UTC):

- On both boxes: waypoints init 18 Nov 12Z and 14Z, 19 Nov 09Z; crosswind init 18 Nov 12Z, 14Z,
  17Z; `road-forecast` 18 Nov 14:22, 16:22, 19:22; the surface bundle due 18 Nov 19:47 (runs
  15Z to 17Z), which left the 11Z run as the newest on the map until 01:47 on the 19th.
- On one box only: waypoints 15 Nov 09Z and 19 Nov 14Z (`.dev`); crosswind 17 Nov 19Z (`.dev`)
  and 15 Nov 13Z (`.com`); `road-forecast` 18 Nov 03:22 and **21 Nov 06:22** (`.com`), the
  last one after #76 to #78 were live.
- No refusal is on record for any of them, on either box. A file missing from both was never
  made or never sent; a file missing from one never reached that box's app.

## 3. The asks

### Two existing asks, now with numbers

| # | Ask | Measured |
|---|---|---|
| **P11 / R2** | Surface layers every hour, newest run only | See the table above: the map's newest run is 2.8 h old at best and usually 8.8 h old before it is replaced. One missed bundle made it 14.8 h |
| **P14** | Fresher points | Waypoints (171 min) and the crosswind (177 min) arrive an hour and a half behind `road-forecast` (83 min) from the same model. At `:50` the waypoints job sends the run that began 2 h 50 min earlier, although `road-forecast` at `:20` already holds the run after it, out to 12 h. Whether hours 13 to 18 of that newer run are published by `:50` is the thing to check |

### New

| # | Ask | Why | Size |
|---|---|---|---|
| **P25** | **Notice a failed send and try again.** For each file and each host: on a DNS or connection error, retry a few times inside the cycle; write one line per file per host saying sent or failed and why. For the hourly HRRR products, send the missed run on the next cycle if it is still inside its forecast window | The misses in §2. They come one box at a time as often as both together, which points at the send, and nothing on either side says so (open ask A7, from August). Observations lose about 1 cycle in 80 before they leave CHPC | S to M |
| **P26** | **Say in the file which frame the wind is in, and which code made the file.** In the surface layers, `variables.wind_u_10m_ms` and `wind_v_10m_ms` are still labelled "Wind U" and "Wind V"; label them as the eastward and northward components, or add a `frame` key. In every JSON product, add a top-level `producer` with the repo and the commit of the cron tree | The rotation had to be inferred from 162 pairs of forecasts; the snowfall fix could be read off one label. A commit in the file dates any later change from one `curl`. Both are additive: a manifest MINOR, in a website PR first (rule 3 of the producer handoff) | S |
| **P27** | **Confirm the two fixes the weather has hidden**: that `precip_1hr` in `road-forecast` is the hourly bucket, and that the KVEL crosswind file is rotated. A run from the archive with precipitation and wind would do | §1. The website still treats `precip_1hr` as a total and shows no amount; it will switch once a wet run shows a series that falls as well as rises | S |
| **P28** | **Manifest entries for three families that arrive without one**: `forecast_gefs_weather_clyfar<NN>_*` (31 per run), `forecast_gefs_weather_percentiles_*` and `forecast_clustering_summary_*`. Send the schema of each, or say which are not meant for the website | From 1.7.9 `/api/monitoring/freshness` lists them as `undeclared`. The air-quality forecast page already reads the clustering summary, and P4 depends on the percentiles | S |

### Two questions

1. **Does anything at CHPC read `https://www.basinwx.*/api/static/observations/filelist.json`?**
   Website 1.7.9 stops writing it and removes it. `GET /api/latest/observations?prefix=map_obs_`
   names the newest file; `GET /api/filelist/observations` still lists them all.
2. **Does brc-tools compare `manifestVersion` exactly anywhere?** `.dev` will report 2.4.0 once
   #427 is deployed (2.3.0 today; `.com` stays 2.1.1 until 1.8.0). Only schedules changed.

### John's call, not an ask

- **Clyfar sends 165 files a run**: 93 JSON and 62 PNG that are one per ensemble member, and
  10 others. `.com` holds 70,400 of them back to January. One file per product, members
  inside, would be about 15 a run, but Clyfar is frozen. The other answer is a keep-window on
  the boxes: website #428 and issue #168.
- **`website_urls` on notchpeak1** still lists the bare domains. Both answer 200 with no
  redirect today, so uploads work; the contract says `www.`.

## 4. What changes on the website (PR #427, website 1.7.9)

Nothing a producer sends has to change. It is on `.dev` once merged and deployed, and on `.com`
with 1.8.0.

- **The manifest is 2.4.0**, with the schedules as your A4 reply gave them: observations
  `*/5`, `road-forecast` `20 * * * *` (A11), surface layers `45 0,6,12,18`, Clyfar
  `15 3,9,15,21`, all read as Mountain time. Each `forecasts` product has its own.
- **Freshness is per product.** `/api/monitoring/freshness` judges each product on its own
  schedule, so a missed surface bundle or Clyfar run shows as `stale` even while the hourly
  files arrive. What Clyfar sends is marked seasonal and reads `dormant` after 7 silent days.
  `outlooks` reads `unscheduled`. `probe.py` prints a line per product.
- **A file is in place whole or not at all.** An upload is written under a temporary name and
  renamed after it passes every check. A refused re-send of a fixed-name file (an index) no
  longer deletes the copy that was there. A file name that starts with a dot is refused (400).
- **The upload log is kept.** `/api/monitoring/uploads` holds about two days, lists refused
  attempts separately under `rejected`, and survives a restart. So "sent and refused" and
  "never arrived" can be told apart for the misses in §2 from now on.
- **`GET /api/latest/:dataType?prefix=`** names the newest file of a product, and
  `/api/filelist/:dataType` takes `?prefix=`.

## 5. Checking from CHPC

```bash
# Both boxes: version, readiness, freshness per product, the last uploads and any refusals
DATA_UPLOAD_API_KEY=... python3 scripts/probe.py

# The newest file of a product (website 1.7.9; .dev first)
curl -fsS 'https://www.basinwx.dev/api/latest/forecasts?prefix=forecast_hrrr_surface_layers_'

# P26, once done: the frame and the producer are in the file
curl -fsS https://www.basinwx.dev/api/static/forecasts/forecast_hrrr_surface_layers_index.json \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["runs"][0]["filename"])' \
  | xargs -I{} curl -fsS https://www.basinwx.dev/api/static/forecasts/{} \
  | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("producer"), d["variables"]["wind_u_10m_ms"])'

# P25: observation cycles missed in the last day, per box (a gap over 7.5 min is a miss)
for h in www.basinwx.com www.basinwx.dev; do
  curl -fsS --compressed "https://$h/api/filelist/observations" | python3 -c '
import json, re, sys, datetime as dt
names = [n for n in json.load(sys.stdin) if re.match(r"map_obs_\d{8}_\d{4}Z\.json$", n)]
t = sorted(dt.datetime.strptime(n[8:21], "%Y%m%d_%H%M") for n in names)
t = [x for x in t if x > t[-1] - dt.timedelta(days=1)]
print(sys.argv[1], len(t), "files;", sum(round((b - a).seconds / 300) - 1 for a, b in zip(t, t[1:]) if (b - a).seconds > 450), "cycles missed")' $h
done
```

The last one downloads the whole list from `.com` (3 MB) until 1.8.0; run it by hand, not on a
cron.

## 6. Not known

- **Why `.dev` missed 13 observation cycles that `.com` received.** `.dev`'s upload log was in
  memory and a restart at 04:55Z on 21 Nov emptied it. PR #427 keeps it on disk.
- **Whether the 21 Nov fixes reduce the misses.** #76 sends each file on its own, which should
  help; three hours of clean observations since is too short to say, and `.com` missed a road
  forecast at 06:22Z in that time.
- **`.com`'s disk.** Its file counts are visible from outside; its sizes are not.
