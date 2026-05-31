# REVIEW-DOCS-apr27.md
# Status: TEMPORARY (snapshot for consolidation work; delete or supersede after the listed TODOs land)
# Compiled: 2026-04-27 by Claude Opus 4.7 in the ubair-website dev branch
# Audience: AI agents + human devs working on docs hygiene

## TL;DR
- `docs/` contains 50 markdown files (~13.2k lines, 24 files >250 lines).
- Several confirmed duplicate / overlapping pairs and triplets — list below.
- `docs/AGENT-INDEX.md` was 5 months stale; refreshed in this PR but the underlying docs it points to still need consolidation.
- Five overlapping TODO/improvement docs (`IMPROVEMENTS.md`, `TODO-DEFERRED.md`, `WISHLIST-TODOS.md`, `DEPLOYMENT-SPECS-TODO.md`, `PYTHON-DEVELOPER-TODO.md`) — single-source these.
- README.md trimmed in this PR (248 → ~110 lines).
- This document is a **snapshot, not authority**. Verify each item before acting.

---

## Audience question (decided 2026-04-27 with JRL)
The same `docs/` folder serves both AI agents and human devs. We agree this is fine *if*:
1. There is a single canonical index per audience: `docs/AGENT-INDEX.md` (agents) and `docs/README.md` (humans, currently a stub — TODO to expand).
2. Each file states its audience in the first 2 lines (date + audience tag).
3. SOPs (`SOP-*.md`) are authoritative for both — they describe the procedure regardless of who runs it.

If the workflow ever splits (e.g. SOPs migrate to GitHub Wiki per `docs/README.md`'s TODO), revisit.

---

## Categorisation (for navigation, not consolidation)

### Architecture & data pipeline
- `DATA-PIPELINE-OVERVIEW.md` (438 lines) — keep, primary
- `DATA-SCHEMA.md` — keep
- `HOW_IT_WORKS.md` (524 lines) — overlaps `FRONTEND-ARCHITECTURE.md`; **TODO** check overlap
- `FRONTEND-ARCHITECTURE.md` (415) — keep, primary
- `JAVASCRIPT-PATTERNS.md` (414) — keep
- `MANIFEST-GUIDE.md` (360) + `MANIFEST-CHANGELOG.md` — keep both (guide + append-only log)
- `PIPELINE-STATUS.md` + `PIPELINE-SUMMARY.md` + `README-PIPELINE.md` — **TODO** triplet to consolidate; pick one
- `python-side-CLAUDE.md` — meant to be **copied to the brc-tools repo**, not used in-place. **TODO** rename or relocate to clarify (e.g. `templates/BRCTOOLS-CLAUDE-TEMPLATE.md`)

### Deployment & ops
- `DEPLOYMENT.md` (256) — keep, primary
- `CHPC-DEPLOYMENT.md` (531) + `CHPC-IMPLEMENTATION.md` (722) — **TODO** confirmed overlap; merge
- `SSL-SETUP.md` — keep
- `DEPLOYMENT-SPECS-TODO.md` — **TODO** absorb into `IMPROVEMENTS.md` or close out
- `STORAGE-TRIAGE-URGENT.md` — referenced from README but not present at top-level; **TODO** locate (likely in `archive/`) and remove dangling reference

### Branching, PRs, workflow
- `BRANCHING-WORKFLOW.md` (282) — keep, primary
- `BRANCHING-STRATEGY-IMPLEMENTATION.md` (699) — **TODO** confirmed overlap; merge or archive
- `PR-REVIEW-PROMPT-TEMPLATE.md` — keep

### Cron & scheduling
- `CRONJOB-ADVICE.md` (481) — keep, primary
- `CRON_SCHEDULE_ANALYSIS.md` — **TODO** check overlap with `CRONJOB-ADVICE.md`
- `CRON-SETUP-27NOV2025.md` — date-stamped from Nov 2025; **TODO** move to `archive/`
- `API_RATE_CALCULATIONS.md` + `API_RATE_CALCULATIONS_HYBRID.md` — pair; one is "current" + one is "proposed". **TODO** decide which is now reality, archive the other

### Camera / road weather
- `CAMERA_ANALYSIS_SCHEDULER.md` (240) — keep
- `CAMERA_CLUSTERING_IMPLEMENTATION.md` (778) — keep but **TODO** check whether superseded by post-#177 modular code
- `CONFIDENCE_TAXONOMY.md` (257) — keep
- `ROADS_AUDIT.md` — keep
- `ROAD_WEATHER_IMPROVEMENTS.md` (578) — **TODO** scan for done items; consolidate remaining into `IMPROVEMENTS.md`

### API & secrets
- `API-KEY-SETUP.md` — keep, primary
- `API_FIX_SUMMARY.md` (331) — looks like a transient session artefact; **TODO** move to `archive/` or extract permanent learnings into `API-KEY-SETUP.md`
- `SECRET-SHARING-GUIDE.md` — keep

### Python side (brc-tools cross-repo)
- `python-developer-guide.md` (382) — keep, primary
- `PYTHON-PACKAGING-DEPLOYMENT.md` (774) — keep
- `PYTHON-DEVELOPER-TODO.md` — **TODO** merge into `IMPROVEMENTS.md` or relocate to brc-tools repo

### SOPs & howtos
- `SOP-outlook-upload.md` — keep, primary
- `howto/preview-a-branch.md` — keep
- `howto/avoiding-dev-domain-block.md` — keep
- `howto/quinten-handoff.md` — RA-onboarding pattern; consider promoting to `ONBOARDING.md` if it generalises

### Reference / context
- `WINTER-OZONE-SCIENCE.md` (274) — keep
- `EASTER-EGGS.md` (453) — keep
- `synoptic_api_var_docs.pdf` — keep (binary, fine)
- `TEST-DATA.md` + `TESTING-PLAN.md` — keep both

### Outstanding-work indices (the pile)
- `IMPROVEMENTS.md` — refreshed 2026-04-27 in this PR (was flagged "half done")
- `TODO-DEFERRED.md` — Clyfar Nov-2025 carry-over; partly stale
- `WISHLIST-TODOS.md` — long-tail
- `DEPLOYMENT-SPECS-TODO.md` — deployment-specific
- `PYTHON-DEVELOPER-TODO.md` — brc-tools-specific
- `ROAD_WEATHER_IMPROVEMENTS.md` — feature-area-specific
- **TODO** — collapse to one of: (a) `IMPROVEMENTS.md` as single source with sections per feature, or (b) GitHub Issues with labels. Five overlapping lists is the worst possible state.

### Quick reference
- `AGENT-INDEX.md` — refreshed in this PR
- `QUICK-START.md` (257) — **TODO** verify currency; may have drifted with the recent merges
- `README.md` (in `docs/`) — currently a 17-line stub; **TODO** expand into the human-side counterpart of `AGENT-INDEX.md`

### Archive
- `archive/` — 10 files of historical session handoffs and superseded plans. Do not read unless tracing history.

---

## Naming-convention violations (cosmetic; rename in a follow-up PR)
Per the `CLAUDE.md` rule (ALL-CAPS, hyphens, 3–4 words for LLM-produced markdown):
- Underscores instead of hyphens: `HOW_IT_WORKS.md`, `API_FIX_SUMMARY.md`, `API_RATE_CALCULATIONS*.md`, `CAMERA_ANALYSIS_SCHEDULER.md`, `CAMERA_CLUSTERING_IMPLEMENTATION.md`, `CONFIDENCE_TAXONOMY.md`, `CRON_SCHEDULE_ANALYSIS.md`, `ROAD_WEATHER_IMPROVEMENTS.md`
- Mixed case: `python-developer-guide.md`, `python-side-CLAUDE.md` (these may be grandfathered; check author intent)
- Date suffix wrong format: `CRON-SETUP-27NOV2025.md` should be archived or renamed to `CRON-SETUP-nov27.md` per the new convention

A bulk rename would land cleanly as a single chore PR; defer until the consolidation TODOs above are resolved so we don't rename twice.

---

## Recommended order of operations
1. **Now (this PR):** rename + push `WEBSITE-BRCTOOLS-HANDOFF-apr27.md`, trim `CLAUDE.md`, refresh `AGENT-INDEX.md`, refresh `IMPROVEMENTS.md`, write this review.
2. **Next chore PR:** merge the BRANCHING pair, merge the CHPC pair, decide on the API_RATE pair, expand `docs/README.md`.
3. **Following chore PR:** collapse the five TODO docs into one (or one + GH Issues).
4. **Cosmetic PR:** bulk-rename underscored filenames; relocate `python-side-CLAUDE.md`.
5. **Archive sweep:** move `CRON-SETUP-27NOV2025.md`, `API_FIX_SUMMARY.md` (if transient), and any other date-stamped session artefact into `archive/`.

Each of 2–5 is small enough for a single agent session. None should affect the running website.

---

## Done
- 2026-04-27 — review compiled, AGENT-INDEX refreshed, README trimmed (248→~110), IMPROVEMENTS refreshed.
