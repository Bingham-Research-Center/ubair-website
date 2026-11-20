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

1. It is saved under `public/api/static/<dataType>/` with the name the producer gave it.
2. Web pages read it from `/api/static/<dataType>/<filename>`.
3. The attempt, accepted or refused, is noted in a short log that an operator can read at
   `/api/monitoring/uploads` (with the key).

Two dataTypes get extra care:

- **`llm_forecasts`** (text written by a language model) is the one kind the server reads and
  checks before keeping. A file that breaks the rules is refused with every reason listed.
  See [LLM-FORECAST-TEXT.md](LLM-FORECAST-TEXT.md).
- **`road-forecast`** is also copied to `latest.json`, so pages need not hunt for the newest.

## For developers

| Piece | File |
|---|---|
| The rules, as pure functions | `server/uploadPolicy.js` (`UPLOAD_DATA_TYPES`, `isAllowedHost`, `allowedExtensions`) |
| The route | `server/routes/dataUpload.js` (`validateApiKey`, `validateOrigin`, `validateDataType`) |
| The written contract with producers | `docs/WEBSITE-BRCTOOLS-CONTRACT.md`; file shapes in `DATA_MANIFEST.json` |
| "Can this server accept uploads at all?" | `server/ingestReadiness.js`, shown at `GET /api/health` |
| Tests | `server/__tests__/uploadPolicy.test.js`, `ingestReadiness.test.js` |

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
- **Fresh is not the same as right.** The monitoring page can say a dataType is "fresh" from an
  index file alone. Trust the upload log over the freshness light.
- The server does not check most files against the manifest. Only `llm_forecasts` is checked.

## Related issues

#402 this work · #253 operations follow-ups · the producers' to-do list:
`docs/NWP-PRODUCER-HANDOFF-nov20.md`
