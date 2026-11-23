# Agent Index — ubair-website

Entry point for AI agents working in this repo. **Last refreshed:** 2026-11-21.

This file lists what's in `docs/` so you can pick the right reference without grepping the
whole tree. Read on demand; do not auto-load. Humans start at the
[project wiki](https://github.com/Bingham-Research-Center/ubair-website/wiki) instead.

## Always-on context (already in your prompt)
- `CLAUDE.md` (repo root) — topology, pipeline, dataTypes, protected branches + release train, secrets policy, naming convention
- `MEMORY.md` (per-user, if present) — durable user-specific facts

## Read first when…
| Goal | File |
|---|---|
| **Pick up outstanding work** | `gh issue list --label student-ready` (sized, verifiable) or `gh issue list --label copilot-ok` (chores with tests). Every open issue sits on an open release milestone: now `v2.0.0 Ozone season open` (1 Dec 2026) |
| Deploy a fresh box / chase a cert problem | `docs/DEPLOYMENT.md` |
| **Check both live boxes from outside, no shell needed** | `scripts/probe.py` (python3 only; see `docs/DEPLOYMENT.md` §6 step 0) |
| Change the site icon (favicon) or the BasinWx wordmark | `docs/FAVICON-INSTALL-STEPS.md` + `scripts/make_favicon.py`, `scripts/make_wordmark.py` |
| Understand the data pipeline end-to-end | `docs/DATA-PIPELINE-OVERVIEW.md` + `DATA_MANIFEST.json` |
| Work the CHPC/producer side | The [brc-tools](https://github.com/Bingham-Research-Center/brc-tools) repo: `docs/CHPC-REFERENCE.md` (cron, env, pitfalls), `docs/WEBSITE-INTEGRATION.md` (upload contract), `docs/walkthroughs/upload.md` |
| Author a new ozone outlook | `docs/SOP-outlook-upload.md` |
| Add a per-user preview branch | `docs/howto/preview-a-branch.md` |
| Onboard a new RA | Wiki [Home](https://github.com/Bingham-Research-Center/ubair-website/wiki/Home) (the wiki's only page); then `docs/howto/preview-a-branch.md` |
| **Pick up where the last session stopped** | `docs/NEXT-SESSION-HANDOFF-nov23.md`: versions, open PRs, parked work, next steps on the dev box and on CHPC |
| **See what both sites were actually receiving, and what to ask CHPC for** | `docs/CHPC-INGEST-HANDOFF-nov21.md`: the 21 Nov brc-tools fixes checked against the files, delivery times and missed cycles for a week, asks P25–P28 (retry a failed send, state the wind frame and the producer commit in the file, confirm two fixes, declare three file families), what website 1.7.9 changes for a producer, one-liners to check from CHPC |
| **Read CHPC's answers to that handoff** | `docs/CHPC-INGEST-REPLY-nov21.md`: every §2 miss matched to notchpeak1 (one-box = a DNS blip, now retried; both-box = a hung S3 fetch, now time-limited), P25–P28 answered, P11/P14 status, `brc-data-ops` created |
| **Build the producer side of the NWP dashboard** (LLM forecast text, aircraft products) | `docs/NWP-PRODUCER-HANDOFF-nov20.md` — asks P1–P24 grouped by repo (brc-tools, clyfar, the new brc-ffion/brc-rhiannon/ops repos, the hub; §9: air-quality stations, found 21 Nov), the dev-only exceptions, the `llm_forecast/1` file with a worked example, how to check an upload. Rules as code: `public/js/llmForecast.js`; permanent contract: `docs/WEBSITE-BRCTOOLS-CONTRACT.md` §5d–5e |
| **Explain a feature to someone new** (or find its code map) | `docs/features/`: one page per feature, plain language first. Index table in `README.md` ("New here?"); terms in `docs/features/PLAIN-WORDS-GLOSSARY.md` |
| **Understand or change the homepage status lights** (colours, thresholds, a new light) | `docs/features/HOMEPAGE-STATUS-LIGHTS.md` — plain-language rules first, then the code map. Rules: `server/statusLights.js`; road rule shared with the roads page: `server/roadConditionRules.js` |
| Show National Weather Service alerts anywhere on the site | `server/nwsAlerts.js` (`getNwsAlertsService().getBasinAlerts()`, the Basin zone list, floor vs nearby) and `GET /api/weather-alerts`. It answers `ok` with a list or `unavailable` with `alerts: null`; never treat a failure as an empty list |
| Change who may upload, or add a dataType | `server/uploadPolicy.js` (the dataType list, per-dataType file types, host allowlist rules) + `UPLOAD_ALLOWED_HOSTS` in `.env.example` |
| Plumb a new forecast dataType from brc-tools | `docs/WEBSITE-BRCTOOLS-CONTRACT.md` — endpoint, schemas, unit traps (permanent); then `WEBSITE-BRCTOOLS-OPEN-ASKS.md` (root) for what is still unanswered and who owns it |
| Add or change a frontend page | `docs/JAVASCRIPT-PATTERNS.md` |
| Touch the camera scheduler | `docs/CAMERA_ANALYSIS_SCHEDULER.md` + `docs/CONFIDENCE_TAXONOMY.md` |
| **Understand or change the weather forecast page** (hazards, town forecasts and their measured dots, the Basin in profile, the snow line, the banded map, the expert drawer) | `docs/features/WEATHER-FORECAST-PAGE.md` — what each part shows and why, what it costs the box, then the code map and the traps (two precipitation fields are running totals; the model grid is turned from north) |
| Change the weather-forecast maps (HRRR surface layers), or add a map layer | `public/js/mapLayers.js` (scales, layers, the grid fit, the raster), `public/js/forecast_weather.js` (the Leaflet side), `public/js/hrrrFields.js` + `DATA_MANIFEST.json` `forecasts` (`optionalFields` names the fields the map draws on arrival); the old cold-start handoff is in History |
| Convert observation units or derive RH | `public/js/met.js` (pure; null for an unknown unit); the feed is raw SI by design (`CLAUDE.md` §Data pipeline) |
| Restyle a page, cards, the UI scale | `docs/STYLE-TOKEN-GUIDE.md` §Panes and §Scale; `public/css/theme/panes.css` |
| Build the NWP dashboard, LLM forecast text or homepage status lights (1.8.0) | `docs/NWP-DASHBOARD-PLAN-nov20.md` (decisions, slices, producer asks); `docs/WEATHER-PAGE-CONTENDERS-nov13.md` for measurements and contender pros/cons |
| Work on the aviation page (KVEL crosswind) | `public/js/aviation.js` + `docs/WEBSITE-BRCTOOLS-CONTRACT.md` §5c |
| Take screenshots on the dev box | no browser is installed and there is no sudo; Playwright's Chromium runs once its missing libraries are unpacked from `apt-get download` into `LD_LIBRARY_PATH` |
| Count visitors / change a bot-vs-human rule | `server/middleware/visitorCounts.js` (definitions in its header and `TIERS`); bump `DEFINITIONS_VERSION`, then replay old logs with `node scripts/count-visitors.js` |
| Fix a road weather bug | `docs/HOW_IT_WORKS.md` + `gh issue list --label area:roads` (the former `ROADS_AUDIT.md` findings live there) |
| Touch roads missing-data / feed-outage behaviour | `docs/ROADS-FALLBACK-AUDIT-sep29.md` — Michael's audit of every fallback path in `public/js/roads/` and the road/traffic services (what was removed, kept, and why), plus the local UDOT failure harness `scripts/dev-road-fallback.js` |

## Reference docs (cite, don't reread)
| Topic | File | Notes |
|---|---|---|
| Forecast JSON schemas | `DATA_MANIFEST.json` | canonical contract; brc-tools is contract-holder |
| Manifest evolution | `docs/MANIFEST-CHANGELOG.md` + `docs/MANIFEST-GUIDE.md` | append-only changelog + how-to |
| On-the-wire JSON formats | `docs/DATA-SCHEMA.md` | |
| API rate budget | `docs/API_RATE_CALCULATIONS_HYBRID.md` | matches the shipped staggered schedule |
| API key + auth | `docs/API-KEY-SETUP.md` | sole doc for `scripts/generate-api-key.js`; systemd-era paths partially stale — refresh at next key rotation |
| Secret sharing | `docs/SECRET-SHARING-GUIDE.md` | password-manager workflow |
| Styling, theme, colours, fonts | `docs/STYLE-TOKEN-GUIDE.md` | raw values live only in `public/css/theme/tokens.css`; ratchet test enforces it |
| Branching (day-to-day) | `CLAUDE.md` §Protected branches + wiki [Home](https://github.com/Bingham-Research-Center/ubair-website/wiki/Home) | the release train itself: `CLAUDE.md` + `DEPLOYMENT.md` §7a |
| PR review template | `docs/PR-REVIEW-PROMPT-TEMPLATE.md` | use with `/code-review` |
| Winter ozone science | `docs/WINTER-OZONE-SCIENCE.md` | why the site exists |

## Outstanding-work indices
Outstanding work is **GitHub Issues on two milestones**, not files in this tree. The backlog was
cut to 32 issues on 2026-11-09: no epics, no per-area Ideas threads, no UX-review workflow.
`student-ready` = ≤ 8 h with success criteria a reviewer can verify; `copilot-ok` = chores
with tests an agent may take unprompted. Wishlists go to one thread, Discussions #342 ("Ideas
parking lot"), and become issues only when milestoned; issues closed with the `swept` label
were parked, not rejected. The former `IMPROVEMENTS.md`, `AGENT-WORK-QUEUE-aug26.md`,
`ROADS_AUDIT.md` and `SPORTS-PAGE-ROADMAP.md` were converted and deleted (see History).

## Howto/ subdir
| File | When |
|---|---|
| `docs/howto/preview-a-branch.md` | spinning up `<name>.basinwx.dev` |
| `docs/howto/avoiding-dev-domain-block.md` | when `.dev` is SNI-filtered on a network |

## History
Deleted from the tree on 2026-09-28: `docs/archive/` (49 session handoffs and superseded
plans), `chpc-deployment/` (superseded by brc-tools), `references/`. Last commit containing
them: `b6dbddf` — `git show b6dbddf:docs/archive/<file>`.

Deleted on 2026-11-12: `docs/HRRR-NWP-HANDOFF-apr16.md`, the cold-start handoff for the HRRR
weather-map integration; its commit `b051513` has long been on `dev`. Read it with
`git show c798a46:docs/HRRR-NWP-HANDOFF-apr16.md`.

## Doc-naming convention (also in `CLAUDE.md`)
- LLM-produced markdown: ALL-CAPS, 3–4 hyphen-separated words.
- Temporary/handoff docs: append `-mmmDD` before the extension (e.g. `-aug13`).
- Markdown only — Python and other code follow the language's convention.

## Known gaps (as of 2026-09-28)
- `docs/API-KEY-SETUP.md` predates pm2 (systemd drop-in bits stale); refresh when the key rotates.
- `public/api/static/metadata/map_obs_meta_20250731_0228Z.json` is the de-facto local-dev
  metadata seed — `api.js`/`fireWeatherService.js` prefix-match `map_obs_meta_`, so it cannot
  take a `test_*` name without widening that match.
