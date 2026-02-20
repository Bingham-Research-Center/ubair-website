# Uintah Basin Air Quality Website – Road Weather AI Handoff Plan

## Context
- **Date:** 2026-02-20
- **Prepared for:** AI/engineering handoff
- **Prepared by:** Copilot CLI

## Project Overview
- **Goal:** Improve stability, security, and performance of road weather (webcam/snow detection) features.
- **Recent focus:** Camera analysis scheduler, cache TTL, spatial queueing, API efficiency, and user experience.
- **Key files:**
  - `server/cameraAnalysisScheduler.js` (scheduler logic)
  - `server/roadWeatherService.js` (API, cache, rest area fetch)
  - `public/js/roads/RoadWeatherMap.js` (frontend rendering)

## Recent Work Summary
- Merged and sanitized road weather code, fixed sanitizer bugs.
- Deployed and tested on dev and ops, all tests passing.
- Refactored scheduler: dynamic TTL, spatial sort, jitter, improved cache.
- All changes committed and pushed to both ops and dev.
- Pending: Reduce detection staleness timeout, implement category-based deprioritization.

## Technical Details
- **Scheduler TTL:** Dynamic, sized to full rotation of all cameras with configurable padding.
  - Defaults: 25s interval, 1.05x padding → 100 cams ≈ 44 min TTL, 150 cams ≈ 66 min TTL.
  - Previous (30s interval, 1.2x padding) produced 60–90 min TTL — the earlier "10–20 min typical" claim was incorrect.
- **Env-var tunables:** `CAMERA_INTERVAL_SECONDS`, `CAMERA_CACHE_PADDING`, `CAMERA_JITTER_SECONDS` (see `.env.example`).
- **Rest areas:** Not included in scheduler queue; fetched and rendered separately.
- **Deprioritization:** Rest areas already excluded from scheduler; further deprioritization not needed unless requirements change.
- **Marker clustering:** Frontend now uses Leaflet marker clustering instead of random camera filtering.
- **Sanitizer fixes:** Input sanitization bugs in road weather service have been fixed.

## Outstanding Questions/Actions
- Specify new TTL or padding factor for detection staleness.
- Confirm if any additional camera categories need deprioritization.
- Update `plan.md` to reflect current progress and next steps.

## Next Steps
1. Reduce scheduler TTL/staleness threshold as specified.
2. Confirm/implement any further category-based deprioritization if required.
3. Test, commit, and push to both ops and dev.
4. Update documentation and handoff notes as needed.

## Reference: Conversation Summary
- See session context and prior checkpoints for detailed technical and decision history.
- All code and logic changes are backward compatible and do not increase UDOT API or image CDN load.

---
**End of handoff plan.**
