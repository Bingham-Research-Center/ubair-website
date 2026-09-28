# Agent Index — ubair-website

Entry point for AI agents working in this repo. **Last refreshed:** 2026-09-28.

This file lists what's in `docs/` so you can pick the right reference without grepping the
whole tree. Read on demand; do not auto-load. Humans start at the
[project wiki](https://github.com/Bingham-Research-Center/ubair-website/wiki) instead.

## Always-on context (already in your prompt)
- `CLAUDE.md` (repo root) — topology, pipeline, dataTypes, protected branches + release train, secrets policy, naming convention
- `MEMORY.md` (per-user, if present) — durable user-specific facts

## Read first when…
| Goal | File |
|---|---|
| **Pick up outstanding work** | `gh issue list --label student-ready` (sized, verifiable) or `gh issue list --label copilot-ok` (chores with tests); the org Project "BasinWx Winter 2026/27" is the board. Milestones: `v1.6.0 Beta relaunch` (Nov 1), `v2.0.0 Ozone season open` (Dec 1) |
| Deploy a fresh box / chase a cert problem | `docs/DEPLOYMENT.md` |
| **Check both live boxes from outside, no shell needed** | `scripts/probe.py` (python3 only; see `docs/DEPLOYMENT.md` §6 step 0) |
| Understand the data pipeline end-to-end | `docs/DATA-PIPELINE-OVERVIEW.md` + `DATA_MANIFEST.json` |
| Work the CHPC/producer side | The [brc-tools](https://github.com/Bingham-Research-Center/brc-tools) repo: `docs/CHPC-REFERENCE.md` (cron, env, pitfalls), `docs/WEBSITE-INTEGRATION.md` (upload contract), `docs/walkthroughs/upload.md` |
| Author a new ozone outlook | `docs/SOP-outlook-upload.md` |
| Add a per-user preview branch | `docs/howto/preview-a-branch.md` |
| Onboard a new RA | Wiki [Home](https://github.com/Bingham-Research-Center/ubair-website/wiki/Home) ("what do I do today?") + [Team](https://github.com/Bingham-Research-Center/ubair-website/wiki/Team); then `docs/howto/preview-a-branch.md` |
| Plumb a new forecast dataType from brc-tools | `docs/WEBSITE-BRCTOOLS-CONTRACT.md` — endpoint, schemas, unit traps (permanent); then `WEBSITE-BRCTOOLS-OPEN-ASKS.md` (root) for what is still unanswered and who owns it |
| Add or change a frontend page | `docs/JAVASCRIPT-PATTERNS.md` |
| Touch the camera scheduler | `docs/CAMERA_ANALYSIS_SCHEDULER.md` + `docs/CONFIDENCE_TAXONOMY.md` |
| Fix a road weather bug | `docs/HOW_IT_WORKS.md` + `gh issue list --label area:roads` (the former `ROADS_AUDIT.md` findings live there) |

## Reference docs (cite, don't reread)
| Topic | File | Notes |
|---|---|---|
| Forecast JSON schemas | `DATA_MANIFEST.json` | canonical contract; brc-tools is contract-holder |
| Manifest evolution | `docs/MANIFEST-CHANGELOG.md` + `docs/MANIFEST-GUIDE.md` | append-only changelog + how-to |
| On-the-wire JSON formats | `docs/DATA-SCHEMA.md` | |
| API rate budget | `docs/API_RATE_CALCULATIONS_HYBRID.md` | matches the shipped staggered schedule |
| API key + auth | `docs/API-KEY-SETUP.md` | sole doc for `scripts/generate-api-key.js`; systemd-era paths partially stale — refresh at next key rotation |
| Secret sharing | `docs/SECRET-SHARING-GUIDE.md` | password-manager workflow |
| Branching (day-to-day) | `CLAUDE.md` §Protected branches + wiki [How-We-Work](https://github.com/Bingham-Research-Center/ubair-website/wiki/How-We-Work) | the release train itself: `CLAUDE.md` + `DEPLOYMENT.md` §7a |
| PR review template | `docs/PR-REVIEW-PROMPT-TEMPLATE.md` | use with `/code-review` |
| Winter ozone science | `docs/WINTER-OZONE-SCIENCE.md` | why the site exists |
| Easter eggs / 90s mode | `docs/EASTER-EGGS.md` | Konami code, kiosk, etc. |

## Outstanding-work indices
Outstanding work is **GitHub Issues + the "BasinWx Winter 2026/27" Project**, not files in this
tree. `student-ready` = ≤ 8 h with success criteria a reviewer can verify; `copilot-ok` = chores
with tests an agent may take unprompted. Wishlists go to Discussions › Ideas and become issues
only when milestoned. The former `IMPROVEMENTS.md`, `AGENT-WORK-QUEUE-aug26.md`,
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

## Doc-naming convention (also in `CLAUDE.md`)
- LLM-produced markdown: ALL-CAPS, 3–4 hyphen-separated words.
- Temporary/handoff docs: append `-mmmDD` before the extension (e.g. `-aug13`).
- Markdown only — Python and other code follow the language's convention.

## Known gaps (as of 2026-09-28)
- `docs/API-KEY-SETUP.md` predates pm2 (systemd drop-in bits stale); refresh when the key rotates.
- `public/api/static/metadata/map_obs_meta_20250731_0228Z.json` is the de-facto local-dev
  metadata seed — `api.js`/`fireWeatherService.js` prefix-match `map_obs_meta_`, so it cannot
  take a `test_*` name without widening that match.
- `/test-viz` (route in `server.js` + `views/test-viz.html` + 51 KB JS) ships to prod, unlinked from nav.
