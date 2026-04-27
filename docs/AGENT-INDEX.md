# Agent Index — ubair-website

Entry point for AI agents working in this repo. **Last refreshed:** 2026-04-27.

This file lists what's in `docs/` so you can pick the right reference without grepping the
whole tree (~13k lines). Read on demand; do not auto-load.

## Always-on context (already in your prompt)
- `CLAUDE.md` (repo root) — topology, pipeline, dataTypes, protected branches, secrets policy, naming convention
- `MEMORY.md` (per-user, if present) — durable user-specific facts

## Read first when…
| Goal | File |
|---|---|
| Deploy a fresh box / chase a cert problem | `docs/DEPLOYMENT.md` |
| Understand the data pipeline end-to-end | `docs/DATA-PIPELINE-OVERVIEW.md` + `DATA_MANIFEST.json` |
| Author a new ozone outlook | `docs/SOP-outlook-upload.md` |
| Add a per-user preview branch | `docs/howto/preview-a-branch.md` |
| Onboard a new RA | `docs/QUICK-START.md` then `docs/howto/quinten-handoff.md` |
| Plumb new forecast dataType from brc-tools | `WEBSITE-BRCTOOLS-HANDOFF-apr27.md` (root, temporary) |
| Add or change a frontend page | `docs/FRONTEND-ARCHITECTURE.md` + `docs/JAVASCRIPT-PATTERNS.md` |
| Touch the camera scheduler | `docs/CAMERA_ANALYSIS_SCHEDULER.md` + `docs/CONFIDENCE_TAXONOMY.md` |
| Fix a road weather bug | `docs/ROADS_AUDIT.md` + `docs/ROAD_WEATHER_IMPROVEMENTS.md` |

## Reference docs (cite, don't reread)
| Topic | File | Notes |
|---|---|---|
| Forecast JSON schemas | `DATA_MANIFEST.json` | canonical contract; brc-tools is contract-holder |
| Manifest evolution | `docs/MANIFEST-CHANGELOG.md` + `docs/MANIFEST-GUIDE.md` | append-only changelog + how-to |
| API key + auth | `docs/API-KEY-SETUP.md` | upload route's `x-api-key` |
| Secret sharing | `docs/SECRET-SHARING-GUIDE.md` | password-manager workflow |
| SSL / TLS | `docs/SSL-SETUP.md` | Let's Encrypt setup; renewal lives in `DEPLOYMENT.md` |
| Branching | `docs/BRANCHING-WORKFLOW.md` | (overlaps `BRANCHING-STRATEGY-IMPLEMENTATION.md` — see review) |
| PR review template | `docs/PR-REVIEW-PROMPT-TEMPLATE.md` | use with the `/ultrareview` flow |
| Test data | `docs/TEST-DATA.md` + `docs/TESTING-PLAN.md` | seed JSON for local dev |
| Winter ozone science | `docs/WINTER-OZONE-SCIENCE.md` | for context on why the site exists |
| Easter eggs / 90s mode | `docs/EASTER-EGGS.md` | Konami code, kiosk, etc. |
| CHPC/Python side | `docs/python-side-CLAUDE.md` | meant to be **copied** to brc-tools repo as its `CLAUDE.md` |
| CHPC deployment | `docs/CHPC-DEPLOYMENT.md` + `docs/CHPC-IMPLEMENTATION.md` | (overlapping pair — see review) |
| Python packaging | `docs/PYTHON-PACKAGING-DEPLOYMENT.md` | brc-tools install/upgrade flow |

## Outstanding-work indices (don't trust dates blindly — verify each item)
- `docs/IMPROVEMENTS.md` — top-level "20 low-hanging fruit" list (refreshed 2026-04-27)
- `docs/TODO-DEFERRED.md` — Clyfar-integration carry-over from Nov 2025
- `docs/WISHLIST-TODOS.md` — long-tail aspirations
- `docs/DEPLOYMENT-SPECS-TODO.md` — deployment-specific
- `docs/PYTHON-DEVELOPER-TODO.md` — brc-tools-side gaps
- `docs/ROAD_WEATHER_IMPROVEMENTS.md` — feature-area-specific (older, partly done)
- `REVIEW-DOCS-apr27.md` (root, temporary) — meta-doc consolidating which of the above to merge

## Howto/ subdir
| File | When |
|---|---|
| `docs/howto/preview-a-branch.md` | spinning up `<name>.basinwx.dev` |
| `docs/howto/avoiding-dev-domain-block.md` | when `.dev` is SNI-filtered on a network |
| `docs/howto/quinten-handoff.md` | RA onboarding pattern |

## Archive/
`docs/archive/` holds session handoffs and superseded plans from Nov–Dec 2025. Do not read
unless tracing decision history.

## Doc-naming convention (also in `CLAUDE.md`)
- LLM-produced markdown: ALL-CAPS, 3–4 hyphen-separated words.
- Temporary/handoff docs: append `-mmmDD` before the extension (e.g. `-apr27`).
- Markdown only — Python and other code follow the language's convention.

## Known gaps (as of 2026-04-27)
- `docs/AGENT-INDEX.md` was 5 months stale before this refresh; treat the rest of `docs/` with
  the same caution and verify dates before trusting content.
- See `REVIEW-DOCS-apr27.md` for the consolidation backlog.
