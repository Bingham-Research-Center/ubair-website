# /roads Stack Audit

**Date**: 2026-04-17
**Scope**: `public/js/roads/` (frontend modules), `server/roadWeatherService.js`, `server/snowDetectionService.js`, `server/cameraAnalysisScheduler.js`, `server/backgroundRefresh.js`, `server/routes/roadWeather.js`, `server/trafficEventsService.js`, `views/roads.html`, `views/kiosk.html`.
**Purpose**: Capture the current state of the `/roads` refactor, identify debt, and split cleanup into one-concern PRs per `CLAUDE.md` PR rules.

---

## TL;DR

The monolith split (3100-line `roads.js` → eight modules under `public/js/roads/`) landed without cleanup. Dead backups remain, the backend has four copies of the US-40/US-191 route-filter lookup, basin bounds disagree across services, the scheduler test has been stale since the last refactor, and one of the new frontend modules (`RoadWeatherMap.js`) is itself a 1790-line god-class with 14 prototype extensions re-opening it.

Ship correctness (stale test, divergent bounds, silent failures) before readability (helper extraction, god-class split).

---

## Findings

Findings are tagged **[H]** high (bug or behavior risk), **[M]** medium (maintenance pain), **[L]** low (cosmetic).

### Backend

1. **[H] Stale scheduler test.** `server/cameraAnalysisScheduler.test.js` references `jitterSeconds` and `cachePaddingFactor` — neither field exists on the scheduler. Default interval is asserted at 25; code default is 30 (`cameraAnalysisScheduler.js:52`). The suite has been silently wrong since the last refactor.

2. **[H] Divergent Uintah Basin bounds.** `roadWeatherService.js:43-48` and `trafficEventsService.js:22-27` define different bounding boxes for the same region. Either is wrong, or both are — they must agree. A third, smaller set of coords is inlined in `fetchMountainPasses`.

3. **[M] Duplicate `SnowDetectionService` instance.** Instantiated at module scope in both `roadWeatherService.js:41` and `cameraAnalysisScheduler.js:33`. Caches, history state, and memory footprint double.

4. **[M] Scheduler-path fallback hides config bugs.** `roadWeatherService.getCompleteRoadData` has a fallback at `:377-382` that runs the scheduler's work inline when the scheduler isn't registered. If the scheduler is misconfigured in prod, this silently covers for it — no alert, slow requests.

5. **[M] `cachedFetch` pattern is copy-pasted nine times.** Every `fetchX` in `roadWeatherService.js` does: check cache, on miss fetch, on success store, on failure log-and-return-stale. Extract once.

6. **[M] Cache TTLs are magic numbers.** Nine different TTLs across the service with no comments. Some are obviously right (road conditions: 2 min), others aren't (mountain passes: 10 min — why?).

7. **[L] Inconsistent API envelope.** `routes/roadWeather.js` returns `{success, timestamp, ...}`, `routes/trafficEvents.js` returns a bare array. Pick one.

8. **[L] Detection history never evicts.** `snowDetectionService.updateDetectionHistory` appends forever. Not a leak today (cameras finite, history bounded per-camera), but no hard cap is set.

9. **[L] Commented-out stub routes.** `routes/roadWeather.js:59-62,90` contain `// TODO` route stubs. Delete.

10. **[L] Dead `generateRoadSegmentFromCamera_DEPRECATED`.** `snowDetectionService.js:1219` — ~216 lines of unreferenced hand-drawn road geometry. (Removed in PR1.)

### Frontend

11. **[H] `RoadWeatherMap.js` is a 1790-line god-class.** Holds map init, layer registration, camera clustering, station rendering, popup HTML, icon factory, filter state, *and* 14 late-bound `RoadWeatherMap.prototype.X = function...` attachments at module tail. Any change to one concern requires loading the whole surface.

12. **[H] Euclidean distance used on lat/lng.** `RoadWeatherMap.js:627-630` ranks "nearest station to camera" with `Math.sqrt((dLat)² + (dLng)²)`. `utils.js` already exports a Haversine `calculateDistance` helper — use it. At basin latitudes a degree of longitude ≈ 0.76 × a degree of latitude, so the east-west axis is underweighted by ~25%.

13. **[H] Silent fetch failures.** Multiple catch blocks `console.error` and return `null`/`[]`, leaving the UI in a partially-populated state with no user-visible signal. No toast, no retry, no status chip.

14. **[M] Route filter duplicated.** The US-40 and US-191 camera filters live in both `RouteConditions.js:36-48,80-91` and `initialization.js:167-179,210-221`. Same regex set, same camera name rules. Extract a `routeConfig.js`.

15. **[M] Marker factory duplicated.** Traffic events, plow trucks, mountain passes, and rest areas each inline their own Leaflet `divIcon` + popup HTML in `RoadWeatherMap.js`. The shape is identical; only the color, glyph, and popup fields differ. Extract `markerFactory.js`.

16. **[M] Unit-toggle refetches everything.** `initialization.js:152` — flipping °F↔°C triggers a full mountain-pass API reload. Units are client-side; no refetch needed.

17. **[M] `setTimeout` races for DOM readiness.** Multiple `setTimeout(..., 0 | 100 | 500)` calls assume elements are mounted. Replace with `ResizeObserver`, `img.onload`, or a CSS transition end.

18. **[M] Script-order coupling.** `views/roads.html` and `views/kiosk.html` load seven files in strict order, and `utils.js` / `DataCache.js` register onto `window`. Move to ES modules.

19. **[L] `RoadWeatherMap.prototype.X = ...` pattern at module tail.** 14 prototype assignments after the `class` declaration. These are methods — put them on the class.

20. **[L] No frontend tests.** `public/js/roads/` has zero test coverage. At minimum, cover `UnitsSystem`, `DataCache`, and `utils`.

### Dead code & refactor residue

21. **[L] `public/js/roads.legacy.js`.** 3014-line pre-refactor backup. No runtime references. (Removed in PR1.)

22. **[L] `public/js/roads.js`.** 24-line JSDoc-only shim left behind by the refactor. Still loaded via `<script>` on two pages for no effect. (Removed in PR1.)

23. **[L] Historical design docs reference pre-refactor file layout.** `docs/CAMERA_CLUSTERING_IMPLEMENTATION.md`, `docs/ROAD_WEATHER_IMPROVEMENTS.md`. Leave alone — these document what was built, not what is.

---

## Follow-up checklist

One PR per line. Severity tag in brackets. Order is a suggestion (correctness first, then maintainability).

```
[x] PR1: remove dead code (roads.legacy.js, roads.js shim, _DEPRECATED method)
[ ] [H] server: fix stale cameraAnalysisScheduler.test.js (jitterSeconds/cachePaddingFactor/interval=25 all wrong)
[ ] [H] server: unify Uintah Basin bounds (roadWeatherService + trafficEventsService + fetchMountainPasses)
[ ] [H] server: remove getCompleteRoadData scheduler fallback at roadWeatherService.js:377-382
[ ] [H] frontend: use utils.calculateDistance (Haversine) at RoadWeatherMap.js:627
[ ] [H] frontend: add notify() surface, replace silent console.error/return-null catches
[ ] [M] server: collapse duplicate SnowDetectionService instance (roadWeatherService:41 + scheduler:33)
[ ] [M] server: extract cachedFetch(key, fn, ttl) helper from 9 fetch methods in roadWeatherService
[ ] [M] server: document cache TTL rationale
[ ] [M] frontend: extract routeConfig.js — unify US-40 / US-191 filters (RouteConditions + initialization)
[ ] [M] frontend: extract markerFactory.js — icon + popup for traffic/plow/pass/rest-area
[ ] [M] frontend: fix unit-toggle over-fetch (initialization.js:152 reloads mountain passes)
[ ] [M] frontend: replace setTimeout races with ResizeObserver / img.onload / CSS transitions
[ ] [L] server: standardize API envelope ({success, timestamp, data}) across road-weather + traffic-events routes
[ ] [L] server: add detection-history eviction in snowDetectionService.updateDetectionHistory
[ ] [L] server: delete commented-out stub routes in routes/roadWeather.js:59-62,90
[ ] [L] frontend: unify RoadWeatherMap class body (drop 14 prototype.* attachments)
[ ] [L] frontend: unit tests for UnitsSystem, DataCache, utils
[ ] [L] frontend: ES modules — drop 5 window globals + <script>-order coupling
[ ] [L] frontend: break RoadWeatherMap into per-layer modules under public/js/roads/layers/
```
