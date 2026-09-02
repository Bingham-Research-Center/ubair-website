# Improvements & Outstanding Work

**Last refreshed:** 2026-04-27 (was flagged "half done — JRL needs to renew" — full reset).
**Source:** ground-truth grep against `dev` HEAD a14fd93 + this session's review.

This list is for medium-leverage cleanups and low-risk improvements. For larger product
work, use GitHub Issues. For temporary handoffs, use a dated `*-apr27.md` doc.

Statuses: 🔜 pending · 🔄 in-progress · ✅ done · ⏸️ deferred (decision blocked)

---

## Operational health (highest priority)

| ✓ | Item | Notes |
|---|---|---|
| 🔜 | **Promote `dev` → `ops`** to land 21 commits on `.com` | PRs #142, #178–#188 plus 7 fixes; needs a deliberate `dev→ops` PR + `pm2 restart basinwx-ops` |
| 🔜 | **Fix three dark dataTypes** (road-forecast, kvel_crosswind, hrrr_surface_layers) | brc-tools side; contract in `docs/WEBSITE-BRCTOOLS-CONTRACT.md`, open items in `WEBSITE-BRCTOOLS-OPEN-ASKS.md` |
| 🔜 | **Fan-out gap for `forecasts/` to `.dev`** | `.com` has 100s of clustering files, `.dev` has zero. brc-tools uploader inconsistency. |
| 🔜 | **Operational health page** (`/admin/health`) | per-dataType last-upload time + expected cadence + pm2 uptime + git HEAD; tier-3 of the apr26 plan |
| 🔜 | **Upload-freshness alarm** | cron walks `public/api/static/`, emails via `reportEmailService` if any dataType exceeds expected cadence |

## Code quality

| ✓ | Item | Notes |
|---|---|---|
| ✅ | **Fix 4 failing tests** in `server/__tests__/cameraAnalysisScheduler.test.js` | Done 2026-08-25 — suite is now **155/155 green**. Was drift: `intervalSeconds` default moved 25→30, `jitterSeconds`/`cachePaddingFactor` were removed from the config entirely (with their `CAMERA_JITTER_SECONDS`/`CAMERA_CACHE_PADDING` env vars), and `analysisTimeout` is a property the scheduler never had — the real handle is `analysisInterval`. That last one also made *'should not start if already running'* silently vacuous: it compared `undefined` to `undefined` and passed while asserting nothing. Rate assertions now derive from config so a default change reddens only the one test that pins defaults. |
| 🔧 | **Security deps — partly done** | Done: `@github/copilot` **removed** (never imported; it is a CLI, not a library — 2 high advisories cleared for free) and `nodemailer ^6→^9.0.5` (clears 8; inert here, no SMTP configured; API surface `createTransport`/`verify`/`sendMail` smoke-tested on 9.0.5). Remaining, and **not** low-risk: `npm audit` reports **19** vulns (12 high), not the 5 recorded here. `node-cron ^3→^4` drives `backgroundRefresh.js` and changes task lifecycle — bump only with a watch that jobs still fire. `express`, `multer`, `form-data`, `ws`, `socket.io` are all on the ingest path; bump them deliberately with upload tests, not in a sweep. |
| 🔜 | **Pick a logger and burn down 178 `console.log`s** | Recommend `pino`. One file at a time, lowest-risk first (`scripts/`, then `server/`). |
| 🔜 | **Standardise error boundaries on fetch calls** | API failures still cascade in places. Try/catch + user-visible loading/error state. |
| 🔜 | **Data validation on incoming JSON** | server doesn't enforce `DATA_MANIFEST.json` schemas; malformed brc-tools uploads can crash visualisations. Tier 3 contract test would catch this. |

## Frontend

| ✓ | Item | Notes |
|---|---|---|
| 🔜 | **CSS consolidation** | 30 files (was 13 when this list was first written). Aim for `core/` (variables, base, layout) + `pages/` ≤12 files total. The `fire.css↔fire.html` 1:1 mapping is fine for page-specific styles. |
| 🔜 | **Favicon** | `/favicon.ico` at root still missing → browser 404 on every load. Multiple files exist in `/public/images/favicons/`; pick one and copy to root. |
| 🔜 | **ARIA labels on map controls** | screen readers can't navigate the Leaflet maps |
| 🔜 | **Loading states on every map** | "Loading…" indicator while initial fetch runs |
| 🔜 | **Print-friendly styles** | `@media print` rules; low priority |
| ✅ | **Last-updated timestamps in UI** | partly done — visible in `DataCache.js`, `uiManager.js`, road weather panels. Audit other pages for parity. |
| ✅ | **Remove `forecast_weather_old.js`** | no longer present in `public/js/` |
| ✅ | **Hardcoded localhost** | only remaining instance is the server boot log message (`server.js:194`), which is correct for stdout |

## Data pipeline & schema

| ✓ | Item | Notes |
|---|---|---|
| 🔜 | **Add `road-forecast` schema to `DATA_MANIFEST.json`** | currently undocumented dataType; brc-tools is the contract-holder but website-side manifest is where consumers look |
| ✅ | **Add `forecast_hrrr_kvel_crosswind_*` schema to `DATA_MANIFEST.json`** | done in manifest 2.0.0 (2026-08-14), KVEL 17/35 contract. Do **not** copy-pin the deleted apr27 §DATATYPE 2 schema — its `crosswind_kt_rwy16`-style keys were wrong and render an empty table |
| 🔜 | **CHPC↔website contract test** | small CI/cron job that POSTs synthetic JSON for every dataType, verifies it lands; would have caught the dark-dataTypes regression |

## Documentation hygiene (see `REVIEW-DOCS-apr27.md`)

| ✓ | Item | Notes |
|---|---|---|
| 🔜 | **Merge `BRANCHING-WORKFLOW.md` + `BRANCHING-STRATEGY-IMPLEMENTATION.md`** | confirmed overlap; pick one |
| 🔜 | **Merge `CHPC-DEPLOYMENT.md` + `CHPC-IMPLEMENTATION.md`** | confirmed overlap |
| 🔜 | **Resolve `API_RATE_CALCULATIONS*.md` pair** | one is "current", one is "proposed hybrid"; archive the one that's not reality |
| 🔜 | **Collapse 5 TODO docs into one** | `IMPROVEMENTS.md` (this file) + `TODO-DEFERRED.md` + `WISHLIST-TODOS.md` + `DEPLOYMENT-SPECS-TODO.md` + `PYTHON-DEVELOPER-TODO.md` |
| 🔜 | **Bulk-rename underscored filenames to hyphens** | per the new naming convention; cosmetic chore PR |
| 🔜 | **Move `CRON-SETUP-27NOV2025.md` to `archive/`** | date-stamped, superseded |
| 🔜 | **Expand `docs/README.md`** | currently a 17-line stub; should be the human-side counterpart of `docs/AGENT-INDEX.md` |
| ✅ | **Refresh `docs/AGENT-INDEX.md`** | was 5 months stale; rewritten 2026-04-27 |
| ✅ | **Trim `CLAUDE.md` for AI-context efficiency** | 101 → 67 lines; this PR |
| ✅ | **Trim `README.md` for human reader** | 248 → ~110 lines; this PR |

## Deferred / decision-blocked

| ✓ | Item | Notes |
|---|---|---|
| ⏸️ | **Service worker for offline viewing** | nice-to-have; not blocking anything; defer until product priorities clearer |
| ⏸️ | **Bundle-size optimisation / tree-shaking** | vanilla JS, mostly fine; revisit if a perf complaint surfaces |
| ⏸️ | **API retry with exponential backoff** | UX-mediocre on flaky networks but no incident yet; defer |
| ⏸️ | **Migration of SOPs to GitHub Wiki** | per `docs/README.md`'s standing TODO; revisit when team size justifies |

---

## How to use this list
- Pick an item. Verify it's still real (run the probe in the notes column or grep). Open a PR.
- When done, change 🔜 to ✅ and commit the status update with the work.
- If you find an item is no longer relevant, change to ✅ with a one-line note ("not reproducible 2026-mm-dd") and move on.
- Don't grow this list past ~30 active items — past that, file GitHub Issues.
