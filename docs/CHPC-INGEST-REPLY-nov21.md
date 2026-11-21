# CHPC Ingest Reply — Nov 21

**Status:** temporary. Written on notchpeak1 on 2026-11-21, about 11:00Z, by the producer-side
session (brc-tools and the new `brc-data-ops`). It answers
[`CHPC-INGEST-HANDOFF-nov21.md`](CHPC-INGEST-HANDOFF-nov21.md) §2 and §3 point by point. Fold
what is still open into `NWP-PRODUCER-HANDOFF-nov20.md` and delete this file.

**The short version.**

- **Every file missing from one box** in your §2 failed a single DNS lookup at CHPC and was never
  tried again. `push_data` now retries: brc-tools #90, live in the cron tree since 10:16Z.
- **Every file missing from both boxes was never made.** The HRRR fetch from S3 hung, because
  Herbie opens its index requests with no timeout. Some of those runs were later killed; four sat
  for 2–3 days until they were stopped at 10:23Z today. Each job now has a 40-minute limit
  (live 10:31Z), and brc-tools PR #92 gives Herbie's requests a timeout.
- **P27 is confirmed** for both fixes, from archive runs.
- **P28:** the three Clyfar schemas are in §3.
- **P26 needs a manifest MINOR from you first.** The exact keys are proposed in §2.
- **P11 and P14 are both ready on the code side.** The S3 timing behind P14 is measured.
- **`brc-data-ops` exists.** It is private and has run the four HRRR crons since 10:31Z, and its
  `docs/OPS-BACKLOG.md` now holds the ops asks.

---

## 1. Your §2 misses, matched to notchpeak1

From `~/logs/basinwx/push_receipts.jsonl` (one line per upload attempt) and the four cron logs.

| Missed (your §2) | On | What happened at CHPC |
|---|---|---|
| waypoints 15 Nov 09Z | `.dev` | 11:50:59Z health check: `Failed to resolve 'basinwx.dev' ([Errno -2] Name or service not known)`; no retry |
| waypoints 19 Nov 14Z | `.dev` | 16:51:10Z, the same DNS failure |
| crosswind 17 Nov 19Z | `.dev` | 21:57:13Z, the same |
| crosswind 15 Nov 13Z | `.com` | 15:57:14Z, the same, for `basinwx.com` |
| road 18 Nov 03:22 | `.com` | 03:22:35Z, the same |
| road 21 Nov 06:22 | `.com` | 06:22:16Z, the same |
| waypoints 18 Nov 12Z, 14Z | both | Run started, S3 reads timed out, the process was later `Killed` (SIGKILL); nothing sent |
| crosswind 18 Nov 12Z, 14Z | both | Run hung on one dead S3 socket for 67 h and 65 h; stopped 21 Nov 10:23Z |
| crosswind 18 Nov 17Z | both | Run `Killed`; nothing sent |
| road 18 Nov 14:22 | both | Run hung for 68 h; stopped 21 Nov |
| road 18 Nov 16:22 | both | No log record at all: the wrapper itself was killed |
| road 18 Nov 19:22 | both | Run `Killed` |
| surface bundle due 18 Nov 19:47 | both | Run `Killed` |
| waypoints 19 Nov 09Z | both | Run hung for 47 h; stopped 21 Nov |

**Why the one-box misses happen.** The CHPC resolvers fail a lookup a few
times a day. Because notchpeak1 has seven search domains, a transient failure comes back as
`Name or service not known`. The median failure takes 51 ms. Both apex names and both `www.`
names now have a single A record at the authoritative servers, so the old Namecheap redirect
record is gone and is not the cause. Since receipts began (28 Sep), 421 of the 822 failed
attempts were DNS failures, 393 were `.com`'s "API key not configured" outage on 26–27 Oct, and
8 were timeouts.

**Why the kills.** notchpeak1 is a login node. All of the producer account's processes share one
cgroup there: 8 GiB of memory and 8 cores. The four hung runs held 2.3 GB of it for days, and
when it filled, the kernel killed whichever process tipped it over. The 18 Nov kills fit that
pattern. So does one this morning: the 09:55Z crosswind run (init 07Z) was killed while the
producer session was running tests on the same node, so that file was never sent.

## 2. The asks

| # | Answer |
|---|---|
| **P25** (first half) | **Done.** brc-tools #90 (merged and pulled 10:16Z). Each file, for each host, gets up to 3 attempts (`BASINWX_UPLOAD_ATTEMPTS`), 5 s and then 20 s apart, after a DNS failure, a refused or timed-out connection, or a `502`/`503`/`504`. Any other status is final: a `400`/`401`/`403`/`413`/`500` would be refused again. A host that uses up its attempts gets one attempt per later file in that run, so an outage cannot stall Clyfar's 165 files. Each receipt now carries `attempt`, so "failed, then sent on attempt 2" is visible. |
| **P25** (second half: re-send a missed run next cycle) | **Moved to `brc-data-ops`** (backlog O4). The plan is to ask your `GET /api/latest/:dataType?prefix=` what each host has, and send the newest run it lacks while that run is still in its window. |
| **P26** | **Agreed; your MINOR first.** Proposal, additive only: (a) in the surface layers, `variables.wind_u_10m_ms.label` becomes `"Eastward wind (10 m, earth-relative)"` and `wind_v_10m_ms.label` becomes `"Northward wind (10 m, earth-relative)"`, and each gains `"frame": "earth"`; (b) every JSON product gains a top-level `"producer": {"repo": "brc-tools", "commit": "<short sha of the tree that built it>", "ops": "brc-data-ops@<short sha>"}`, with `ops` `null` for a hand run. The crontab jobs already log both commits on every run (`env=… brc-tools=6573fad brc-data-ops=4b82a67`). Say the manifest version that declares these, and the brc-tools PR follows. |
| **P27** | **Both confirmed** (method under the table). |
| **P28** | **The three schemas are in §3.** Recommendation: declare `forecast_gefs_weather_percentiles_*` and `forecast_clustering_summary_*`, which pages read, and mark the 31 member files as sent but not drawn. Stopping them would need a Clyfar change, and Clyfar is frozen: John's call. |
| **P11 / R2** | **Code ready, waiting on the manifest.** The exporter already has `--run-count 1`. Once the manifest declares the surface layers hourly, the cron change is one line in `brc-data-ops` (O2, John approves each crontab change). It would land about 165 min after the run with today's init rule, and about 105 min after P14's change. |
| **P14** | **Checked.** HRRR `wrfsfcf18` reaches S3 84–87 min after its run starts (73 min at 00/06/12/18Z; the slowest of the 22 runs checked, 20 Nov 23Z, took 117). `wrfsubhf18` arrives at the same time. So at `:50` the run that began 1 h 50 min earlier is complete out to 18 h. The change in brc-tools is to pick the newest run whose last needed lead is on S3, and fall back one cycle if it is not; it is next in line. Waypoints and the crosswind would then land about 110–120 min after their run instead of 171–177. It would also make P19 item 1 cheap: the 18-hour `subh` crosswind arrives at the same time as the 6-hour one. |

**P27, how.** With today's code, two archived runs were rebuilt without uploading and compared
with the files your boxes received.

- **`precip_1hr`, init 20 Nov 05Z** (the wet run in your §8; all 17 points wet): the delivered
  file rises monotonically at all 17 points, so it was the run total. The rebuilt file falls as
  well as rises at all 17. Summing the rebuilt hourly values reproduces the delivered totals to
  within 0.2 mm over 204 point-hours. At Daniels Summit the delivered series reads
  2.0, 4.5, 7.7, 13.1, 14.5, 15.5 … and the rebuilt one 2.0, 2.5, 3.2, 5.4, 1.4, 1.0 …. Init
  20 Nov 23Z, your last wet run, is nearly dry: two points, each under 1 mm, and both rebuilt
  series fall.
- **KVEL crosswind, init 18 Nov 03Z** (the windiest pre-fix run on `.dev`, up to 19.2 kt): speeds
  are identical. The direction differs by −7.47° on average (−7.0° to −8.0° after 1° rounding),
  against the grid's −7.48° at KVEL. Crosswinds change by up to 0.9 kt and headwinds by up to
  2.5 kt.

## 3. The three Clyfar families (P28)

Read from the 20 Nov 18Z files on `.dev`. Clyfar builds them in `export/to_basinwx.py`, and
their values are Clyfar's Basin-representative reductions of GEFS ("UB-repr").

**`forecast_gefs_weather_clyfar<NNN>_<YYYYMMDD_HHMM>Z.json`**, one per member: `clyfar000` to
`clyfar030`, 31 files, about 10 KB each.

```jsonc
{ "metadata": { "init_datetime": "2026-11-20T18:00:00Z", "member": "clyfar000",
                "product_type": "gefs_weather", "num_timesteps": 105,
                "data_source": "GEFS via Clyfar v1.0.7",
                "variables": { "snow":  {"units": "mm",   "description": "Snow depth"},
                               "mslp":  {"units": "hPa",  "description": "Mean sea level pressure"},
                               "wind":  {"units": "m/s",  "description": "Wind speed"},
                               "solar": {"units": "W/m²", "description": "Solar radiation"},
                               "temp":  {"units": "°C",   "description": "Temperature"} } },
  "forecast_times": ["2026-11-20T18:00:00Z", "2026-11-20T21:00:00Z", "…"],   // 105
  "weather": { "snow": [null, 60, 55, …], "mslp": [null, 1010.2, …], "wind": […], "solar": […], "temp": […] } }
```

**`forecast_gefs_weather_percentiles_<stamp>.json`**, one per run, about 25 KB. It has the same
`metadata` with `product_type: "gefs_weather_percentiles"`, `num_members: 31`, and
`percentiles: [10, 50, 90]`, and then:

```jsonc
  "forecast_times": [ … 105 … ],
  "weather_percentiles": { "snow": {"p10": […], "p50": […], "p90": […]}, "mslp": {…}, "wind": {…}, "solar": {…}, "temp": {…} }
```

**Both of the GEFS families:**

- They are 3-hourly to +240 h, then 6-hourly to +384 h.
- The init step is `null` in every series.
- `snow` is a depth in millimetres, not liquid.
- `wind` is a speed, with no direction.

**`forecast_clustering_summary_<stamp>.json`**, one per run, about 10 KB, `schema_version`
`"1.3"`. It is built by Clyfar's `utils/scenario_clustering.build_clustering_summary`:

```jsonc
{ "schema_version": "1.3", "init": "20261120_1800Z",
  "method": { "stage_1": {…}, "stage_2": {"selected_k": …, "silhouette_scores": {…}, …}, "time_blocks": {"names": ["days_1_5", …], "weights": […]} },
  "n_members": 31, "n_clusters": 3,
  "clusters": [ { "id": 0, "kind": "null", "members": ["clyfar000", …], "fraction": 0.77, "medoid": "clyfar000",
                  "clyfar_ozone": {"dominant_category": "background", "risk_level": "low"},
                  "risk_profile": {"weighted_non_background": …, "block_means": {…}, …},
                  "gefs_weather": {"snow_tendency": "low (<1 inch)", "wind_tendency": "calm (<5 mph)", "pattern": "variable"},
                  "evidence": {…}, "display": {"status": "primary", "warning_code": null} } ],
  "representative_members": ["clyfar000", …], "member_assignment": {"clyfar000": 0, …},
  "linkage_note": "…", "spread_summary": "…", "quality_flags": {…} }
```

Sample files are in the producer session's scratch and can be attached to a PR on request. Your
`.dev` holds the same files.

## 4. Changed on notchpeak1 today

- **Cron tree:** `~/gits/brc-tools` is at `6573fad`. It now includes brc-tools #86 (integration
  tests and six defects fixed), #87 (GEFS pressure-level file), #88 (funnel fails clearly after
  NAM), #89 (the 15-min `subh` axis; KVEL reads through it, payload checked identical) and #90
  (retries). None of these changes a field you read. Your §5 check of "which commit the crons run"
  now reads `6573fad`.
- **`brc-data-ops`** (`Bingham-Research-Center/brc-data-ops`, private) was created. The four HRRR
  wrappers moved into its `cron/` with no change to schedules or products. Each now has a
  40-minute time limit, and each run logs its env and both commits. The crontab was repointed at
  10:31Z, with a backup and one approval per change. Its `docs/OPS-BACKLOG.md` carries P2, P3,
  P4-year-round, P11, P14, P25b, `CRON_TZ`, log rotation and `website_urls` as rows O1–O16.
  Please change `NWP-PRODUCER-HANDOFF-nov20.md` §2c "an empty folder … no GitHub repo" to say so;
  this PR makes that one-line edit.
- **The four hung runs were stopped.** That freed 2.3 GB of the 8 GiB cap.

## 5. Still John's call

- **Clyfar's 165 files a run**: unchanged.
- **`website_urls` to `www.`**: tracked as `brc-data-ops` O7. It is contract hygiene only, because
  the DNS failures in §1 are in the CHPC resolver, and `www.` would not avoid them.

## 6. The website's answer: manifest 2.5.0

Added on the dev box the same day; `docs/MANIFEST-CHANGELOG.md` has the details.

- **P26: as proposed, with one exception.** `frame: "earth"` and the two labels on the
  surface-layer winds, and a top-level `producer` {repo, commit, ops}, `ops` null for a hand
  run. Both are optional. The exception: **not in `observations` or `metadata`.** Those files
  are bare lists, so a top-level key would turn them into objects, which is a MAJOR change. Your
  crontab log and receipts already date them. The brc-tools PR can follow once 2.5.0 is on
  `dev`.
- **P11: hourly, newest only, declared** as `45 * * * *`; the minute is yours to choose. Until
  O2 changes the crontab, `.dev`'s monitor shows the surface layers stale for about four hours
  in six. That is a monitoring line only, so make the crontab change soon after.
- **P28: all three declared**, as you recommended: the members as `sentButUnread`, matched by
  `forecast_gefs_weather_clyfar{NNN}_` so they do not claim the percentiles. Small correction:
  no page reads the percentiles yet (P4 will). The clustering summary is the one read today.

<sub>Written with Claude Code on notchpeak1, 2026-11-21, from the receipts, the cron logs, S3
listings and two archive rebuilds; brc-tools PRs #90 and #91, brc-data-ops `4b82a67`.</sub>
