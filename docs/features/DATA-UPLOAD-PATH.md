# Data Upload Path

**What it is.** The website makes none of its own weather or air-quality data. Other computers
("producers") work the numbers out and **send** finished files to the website, which stores
them and shows them. This page is about that front door: who may send, what they may send, and
what happens to a file that is wrong.

```
   producers                         the two website servers
   ─────────                         ───────────────────────
   CHPC (university computer)  ──┐
   runs brc-tools                ├──►  www.basinwx.com   (the public site, "prod")
                                 │
   ADS-B hub (aircraft data)   ──┴──►  www.basinwx.dev   (the rehearsal copy, "dev")
```

A producer is meant to send each file to **both** servers. The servers never fetch these files
themselves; if a producer stops sending, the site goes stale and says so.

**Since:** the door has existed from the start; the rules below are version 1.7.3 (issue #402).

## The three checks on every upload

A file is sent to `/api/upload/<dataType>`, where the dataType says what kind of file it is.

| Check | What it asks | If it fails |
|---|---|---|
| **1. The key** | Does the sender know the secret upload key? | `401`. This is the real lock |
| **2. The host list** | Does the sender give a computer name we expect? | `403` |
| **3. The dataType** | Is this a kind of file we know? | `400`, and nothing is written |

- **The key is the lock; the host list is a filter.** The computer name is just a label the
  sender writes on the envelope, so it cannot stop a determined stranger. It stops a
  misconfigured producer sending to the wrong place.
- **The host list lives in each server's settings file** (`UPLOAD_ALLOWED_HOSTS` in `.env`).
  Left unset it means "any computer at CHPC". To let a new producer in, add its agreed name
  there and restart the app; no code changes.
- **Only nine dataTypes exist:**
  `observations`, `metadata`, `outlooks`, `llm_outlooks`, `images`, `forecasts`,
  `road-forecast`, `llm_forecasts`, `aircraft`.

## Why check 3 matters

Before 1.7.3 the site used whatever dataType it was given as a folder name, without looking.
A typo made a new folder nobody read. Worse, a name such as `../..` climbed out of the upload
folder, so a sender holding the key could have overwritten the site's own files. Any name not
on the list is now refused before anything touches the disk.

## What happens to a good file

1. It is saved under `public/api/static/<dataType>/` with the name the producer gave it. It is
   written under a temporary name first and renamed once it has passed every check, so a page
   never reads half a file and a refused file never replaces a good one of the same name.
2. Web pages read it from `/api/static/<dataType>/<filename>`.
3. The server notes it as the newest file of its kind (see "Finding the newest file" below).
4. The attempt, accepted or refused, is noted in a log that an operator can read at
   `/api/monitoring/uploads` (with the key). The log holds about two days, keeps refused
   attempts in a list of their own, and survives a restart (1.7.9).

Two dataTypes get extra care:

- **`llm_forecasts`** (text written by a language model) is the one kind the server reads and
  checks before keeping. A file that breaks the rules is refused with every reason listed.
  See [LLM-FORECAST-TEXT.md](LLM-FORECAST-TEXT.md).
- **`road-forecast`** is also copied to `latest.json`, so pages need not hunt for the newest.

## Finding the newest file

Most pages want one file: the newest observations, the newest runway forecast. The server
keeps a small table in memory, **the upload index**: for each kind of file ("product"), the
name of the newest one and when it arrived. A page asks `/api/latest/<dataType>?prefix=map_obs_`
and gets one name back.

- A product is a family of files that differ only in their time stamp:
  `map_obs_20261121_0755Z.json` is one of `map_obs_*.json`.
- The folders are still the truth. The index is built from them when the app starts and again
  when it is more than an hour old, so a file copied in by hand is found within the hour.
  Nothing is written to disk for it.
- `/api/monitoring/freshness` reads the same table, product by product, each on the schedule
  the manifest gives it.

### What it costs the box

Before 1.7.9 each of these listed a whole folder. Measured on the dev box on 2026-11-21, old
code and new against the same 60,800 observation files (`.com` holds 99,000):

| | Before | After |
|---|---|---|
| `/api/monitoring/freshness` | 1.2 to 1.9 s, with every other request waiting (3.1 s on `.com`) | 0.004 s |
| One observation upload | 0.08 to 0.10 s | 0.003 to 0.015 s |
| 142 uploads one after another (a Clyfar run is 165) | 14.0 s | 3.5 s |
| What another visitor waits while those arrive | 70 ms typical, 96 ms slow | 3 ms typical, 7 ms slow |
| The app's memory afterwards | 292 MB | 132 MB |
| "Which observation file is newest?", sent to the browser | 43 KB gzipped (255 KB on `.com`), twice per map | 88 bytes |
| Starting the app | 0.7 s | 0.8 s, plus 0.35 s in the background to read the folders |

The air-quality forecast page also fetched every clustering summary ever uploaded (341 files
on `.com`) to show one; it now fetches the one for the run on screen.

## For developers

| Piece | File |
|---|---|
| The rules, as pure functions | `server/uploadPolicy.js` (`UPLOAD_DATA_TYPES`, `isAllowedHost`, `allowedExtensions`) |
| The route | `server/routes/dataUpload.js` (`validateApiKey`, `validateOrigin`, `validateDataType`) |
| The written contract with producers | `docs/WEBSITE-BRCTOOLS-CONTRACT.md`; file shapes in `DATA_MANIFEST.json` |
| "Can this server accept uploads at all?" | `server/ingestReadiness.js`, shown at `GET /api/health` |
| The upload index, `/api/latest`, `/api/filelist` | `server/uploadIndex.js`; the two routes are in `server/server.js` |
| Freshness, product by product | `server/monitoring/dataMonitor.js`; schedules in `DATA_MANIFEST.json` |
| The log of attempts | `server/monitoring/uploadAttempts.js`, kept in `logs/analytics/upload_attempts.log` |
| Tests | `server/__tests__/uploadPolicy.test.js`, `ingestReadiness.test.js`, `uploadIndex.test.js`, `uploadRouteIndex.test.js`, `dataMonitorFreshness.test.js`, `uploadAttempts.test.js` |

**Check a server from anywhere** (needs only Python 3):

```bash
python3 scripts/probe.py     # both servers: version, upload readiness, how fresh each dataType is
```

**To add a dataType:** add it to `UPLOAD_DATA_TYPES`, give it an entry in `DATA_MANIFEST.json`
and a section in the contract, then bump the manifest's version. The tests name the list, so
they will tell you what else to update.

## Things to know

- **`.dev` is a rehearsal, not a toy.** It receives the same files as the public site, so a new
  kind of file can be tried there first. A dataType can exist on `.dev` and not yet on `.com`.
- **Fresh is not the same as right.** Freshness says a file of that kind arrived on time, not
  that its contents are good. Until 1.7.9 it also judged a whole folder at once, so a dead
  six-hourly job hid behind an hourly one; each product is now judged on its own schedule.
- **Three words that are not "late":** `unscheduled` (nobody promised a time, such as a
  written outlook), `dormant` (a winter-only product out of season) and `no_data` (this
  server has never been sent one).
- The server does not check most files against the manifest. Only `llm_forecasts` is checked.

## Related issues

#402 this work · #253 operations follow-ups · the producers' to-do list:
`docs/NWP-PRODUCER-HANDOFF-nov20.md`
