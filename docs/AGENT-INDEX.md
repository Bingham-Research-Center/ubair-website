# Agent Index — ubair-website

Entry point for AI agents working in this repo. **Last refreshed:** 2026-08-13.

This file lists what's in `docs/` so you can pick the right reference without grepping the
whole tree. Read on demand; do not auto-load.

## Always-on context (already in your prompt)
- `CLAUDE.md` (repo root) — topology, pipeline, dataTypes, protected branches + release train, secrets policy, naming convention
- `MEMORY.md` (per-user, if present) — durable user-specific facts

## Read first when…
| Goal | File |
|---|---|
| Deploy a fresh box / chase a cert problem | `docs/DEPLOYMENT.md` |
| Understand the data pipeline end-to-end | `docs/DATA-PIPELINE-OVERVIEW.md` + `DATA_MANIFEST.json` |
| Work the CHPC/producer side | `chpc-deployment/README.md` (+ `DEPLOYMENT_GUIDE.md`, `MONITORING_GUIDE.md` there) |
| Author a new ozone outlook | `docs/SOP-outlook-upload.md` |
| Add a per-user preview branch | `docs/howto/preview-a-branch.md` |
| Onboard a new RA | `chpc-deployment/README.md` then `docs/howto/quinten-handoff.md` |
| Plumb a new forecast dataType from brc-tools | `WEBSITE-BRCTOOLS-HANDOFF-aug25.md` first (root, temporary — silent upload failures + dark dataTypes), then `WEBSITE-BRCTOOLS-HANDOFF-aug13.md` for the per-target schemas |
| Add or change a frontend page | `docs/JAVASCRIPT-PATTERNS.md` |
| Touch the camera scheduler | `docs/CAMERA_ANALYSIS_SCHEDULER.md` + `docs/CONFIDENCE_TAXONOMY.md` |
| Fix a road weather bug | `docs/ROADS_AUDIT.md` + `docs/HOW_IT_WORKS.md` |

## Reference docs (cite, don't reread)
| Topic | File | Notes |
|---|---|---|
| Forecast JSON schemas | `DATA_MANIFEST.json` | canonical contract; brc-tools is contract-holder |
| Manifest evolution | `docs/MANIFEST-CHANGELOG.md` + `docs/MANIFEST-GUIDE.md` | append-only changelog + how-to |
| On-the-wire JSON formats | `docs/DATA-SCHEMA.md` | |
| API rate budget | `docs/API_RATE_CALCULATIONS_HYBRID.md` | matches the shipped staggered schedule |
| API key + auth | `docs/API-KEY-SETUP.md` | sole doc for `scripts/generate-api-key.js`; systemd-era paths partially stale — refresh at next key rotation |
| Secret sharing | `docs/SECRET-SHARING-GUIDE.md` | password-manager workflow |
| Branching (day-to-day) | `docs/BRANCHING-WORKFLOW.md` | the release train itself: `CLAUDE.md` + `DEPLOYMENT.md` §7a |
| PR review template | `docs/PR-REVIEW-PROMPT-TEMPLATE.md` | use with `/code-review` |
| Winter ozone science | `docs/WINTER-OZONE-SCIENCE.md` | why the site exists |
| Easter eggs / 90s mode | `docs/EASTER-EGGS.md` | Konami code, kiosk, etc. |

## Outstanding-work indices
- `docs/IMPROVEMENTS.md` — top-level list (last verified 2026-04-27 — check items before trusting)
- `docs/ROADS_AUDIT.md` — road-weather findings, some still open

## Howto/ subdir
| File | When |
|---|---|
| `docs/howto/preview-a-branch.md` | spinning up `<name>.basinwx.dev` |
| `docs/howto/avoiding-dev-domain-block.md` | when `.dev` is SNI-filtered on a network |
| `docs/howto/quinten-handoff.md` | RA onboarding pattern |

## Archive/
`docs/archive/` holds superseded plans, dated snapshots, and session handoffs, pending
migration to the brc-sop wiki (see its README). 25 docs moved there in the 2026-08-13
housekeeping sweep — all pre-launch pipeline/testing plans, the Python-side developer docs
(owned by the brc-tools repo now), and older generations of the cron/API-rate/CHPC
deployment analyses. Do not read unless tracing decision history.

## Doc-naming convention (also in `CLAUDE.md`)
- LLM-produced markdown: ALL-CAPS, 3–4 hyphen-separated words.
- Temporary/handoff docs: append `-mmmDD` before the extension (e.g. `-aug13`).
- Markdown only — Python and other code follow the language's convention.

## Known gaps (as of 2026-08-13)
- `docs/API-KEY-SETUP.md` predates pm2 (systemd drop-in bits stale); refresh when the key rotates.
- `public/api/static/metadata/map_obs_meta_20250731_0228Z.json` is the de-facto local-dev
  metadata seed — `api.js`/`fireWeatherService.js` prefix-match `map_obs_meta_`, so it cannot
  take a `test_*` name without widening that match.
- `/test-viz` (route in `server.js` + `views/test-viz.html` + 51 KB JS) ships to prod, unlinked from nav.
