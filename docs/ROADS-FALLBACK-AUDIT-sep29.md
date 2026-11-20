# Roads fallback audit (Sept 29, 2026)

> **Status 2026-11-03.** Written by Michael on a local `fix/road-fallback` branch cut from
> `ops` v1.5.4, and first published inside PR #330. Rebased onto `dev` as batch A of the roads
> work. Moved here from `FALLBACK_FIX.md` at the repo root; the direct-to-production deploy
> steps were removed. Everything below is the original record as of Sept 29–30.

The Roads fallback fix is on `fix/road-fallback`, based on production's `ops` release lineage at `c3e5525023e6f66c37a0da1a1e162be216e043fa`. No merge to `ops`, tag, push, or deployment was performed.

The map now keeps its last successfully loaded road snapshot when the road feed fails or returns no segments. It shows an unavailable notice and the snapshot's age. Without a previous snapshot it draws no road-condition segments. Camera, station, traffic, pass, plow, and rest-area layers have independent lifecycles. Retained roads are held in the current page's memory, not persisted across a page reload.

The branch comparison was made on September 29, 2026 Mountain time, after fetching the current remote refs:

| Reference | Commit | Compared with the live `RoadWeatherMap.js` |
| --- | --- | --- |
| `origin/ops` | `c3e5525023e6f66c37a0da1a1e162be216e043fa` | Exact byte match |
| `origin/dev` | `1a63b44040e11c97c12a5252201195828095eeac` | Exact byte match |
| Original checkout, `main` | `17544df9e9ba82236b8e4fd35a1aacd3351a0df2` | Different |
| Old local `dev` | `13b530688cfa2ff85ecd7ebab30e225b78220942` | Different and behind the remote |

The [live map file](https://basinwx.com/public/js/roads/RoadWeatherMap.js) was 80,672 bytes, with SHA-256 `4bfb2fff02927b4e3bcd70cb362fd755c68189ce434212df8076b21d3e8e9642`. Both current branches contain the shared data cache and the same broken fallback. The file alone cannot distinguish them.

The [production health endpoint](https://basinwx.com/api/health) reported `1.5.4`, matching `origin/ops`. `origin/dev` reports `1.5.5-dev` in its package file. [The deployment runbook](docs/DEPLOYMENT.md) identifies production as `ops`, at `/var/www/ubair-website`, running as `root` under the PM2 name `ubair-site`. These agree on the production lineage. A read-only SSH attempt on September 30 stopped at host-key verification, so the current server checkout's branch name and HEAD were not independently read over SSH.

The audit covered `public/js/roads/`, its Roads and kiosk consumers, `server/roadWeatherService.js`, traffic-event services and routes, and background refresh. These are the fallback paths found:

| Path | Finding and result |
| --- | --- |
| `RoadWeatherMap.loadRoadWeatherData`, `loadStaticRoadData`, and `renderRoadSegments` | Failed requests and empty segment lists drew three invented Clear/Caution roads and three default stations with invented temperatures. Removed the entire static loader. There is no demo data or demo switch. The old test mock was updated; no development code needed the loader. |
| `RoadWeatherMap.renderRoadSegment` | Missing `type`, and the unhandled `hrrr_estimated` type, became “Real-time UDOT data.” Source now starts as unavailable. Real-time requires explicit UDOT provenance from the current uncached response. Cached roads, estimates, camera analysis, and HRRR are named and dated. Popups also identify contributors to blended conditions. |
| `RoadWeatherMap.clearLayers` during road refresh | Cleared stations, cameras, and rest areas along with roads. Road refresh now clears each affected layer separately. A failed road request preserves the road snapshot and does not wipe other layers. Full cleanup remains for map destruction. |
| `DataCache.roadWeatherDataCache` | Shared memory responses had no cache marker. Reused responses now carry `cached: true`; response timestamps are preserved. Invalid response objects throw. HTTP/network failures still throw, allowing the map to show its unavailable state. The five-minute lifetime is unchanged. |
| `DataCache.routeDataCache` | Failed updates already return `null`; route consumers show an error. Kept this behavior. No default station objects are created. |
| `fetchUDOTRoadConditions`, `fetchUDOTCameras`, `fetchUDOTWeatherStations` | Fetch errors were swallowed as empty successes. They now throw. Successful cache reads are marked cached. Unknown source timestamps remain `null`. |
| `getCompleteRoadData` and `/api/road-weather` | Added road availability and individual source status. Independent requests settle separately, preserving successful layers. Empty roads count as unavailable. `lastUpdated` is the source timestamp or the last known road timestamp, never the time an error response was generated. Unexpected assembly failures return HTTP 503 with `status: "unavailable"`, `lastUpdated`, and empty arrays. |
| `BackgroundRefreshService.refreshEssentialData` | After making UDOT errors explicit, one rejection could prevent a successful camera refresh. The method now keeps successful camera/station results and still records the failed refresh. Scheduler logic and polling intervals are unchanged. |
| `mapUDOTConditionToColor` | Unknown or absent road conditions defaulted to green/Normal. Now gray/No Data unless a recognized report supports a condition. |
| Backend `determineStationCondition`, legacy `determineRoadCondition`, and frontend legacy `determineStationCondition` | Missing surface reports defaulted to Clear, Passable, or good. They now remain unknown. Real dry, wet, snow, ice, and hazard reports still drive the existing condition rules. |
| `getCurrentWeatherCondition` | When HRRR and Open-Meteo failed, returned invented 10-degree temperature, zero precipitation/snow, wind 5, and visibility 10,000. Now returns `null`. No current caller was found, but the dangerous default is removed. |
| `getHRRRConditionAtPoint` and `estimateRoadCondition` | Missing forecast values became zero wind/precipitation or 10 km visibility. Missing values now remain unavailable; incomplete estimates return No Data. Actual zero visibility is preserved. |
| `buildAdditionalRoadSegmentsFromHRRR` | Fixed road geometry is paired with real model estimates. Added explicit HRRR provenance and retained the model initialization time. Removed the fabricated “now” timestamp when initialization is absent. These roads no longer fill an unavailable observed-road response. The separate HRRR forecast layer still operates independently. |
| `getRoadSegments` | Contains unused static route geometry and empty nearest-station lists. No condition measurements and no current caller. Left unchanged because it does not provide a failed-fetch fallback or render invented conditions. |
| `cameraSnowLevelToCondition` | An unknown camera result became Clear. Unknown now maps to gray/No Data. A reported `none` remains distinct from unknown. Confidence scores, thresholds, and ensemble weights were not changed. |
| `ConditionCards.updateCardsWithFallback` | Already clears old station values and uses only actual Open-Meteo wind, labeled as backup data with update time unavailable. Kept and regression-tested. Both providers failing leaves “Not reported.” |
| Condition-card precipitation summaries and location clicks | Unknown surface text could become Dry, and a failed location-weather fetch could substitute the road's Clear condition for precipitation. Dry now requires a dry/no-precipitation report; the road condition is no longer a precipitation fallback. |
| `utils.displayRouteConditions` and `RouteConditions.createRoadSlideContent` | Missing station temperatures became zero in route averages. Both now average only reported finite readings, preserve actual zero, and show unavailable when none are reported. |
| Mountain-pass status in service and map | Missing data defaulted to Open. The backend now returns unknown without a reported open status or dry surface, and the map shows “NOT REPORTED.” |
| Rest-area capacities in service and map | Missing parking counts became zero and could create an incorrect total. Counts now remain `null`; a partial capacity report has no invented total. The popup says “Not reported.” |
| `TrafficEventsService` memory, disk, and rate-limit fallbacks | These use actual cached records or empty lists. Kept those fallbacks and existing cache lifetimes. Cached records now preserve cache provenance and original report/retrieval timestamps; cards, route summaries, and map popups show their age. The summary no longer stamps old data with the current time. |
| `TrafficEventsManager` empty lists and failed HTTP responses | An empty list could display “All clear.” Empty lists now say no events/alerts were reported. Failed HTTP event requests display an error. Route incident counters also say “None reported,” not “Clear.” |
| Alert closure coordinate approximation | Derives approximate geometry from an actual UDOT alert and milepoints. The popup now explicitly says the location is approximate and shows the report's source and age. No closure is invented when the fetch fails. |
| `fetchNWSData`, `fetchOpenMeteoData`, `analyzeCamerasForSnow` | Errors return `null` or an empty list. Kept. Road/camera click handlers use actual supplemental weather when it loads and leave missing fields unavailable. |
| Plow, pass, and rest-area fetch/load methods | Failures return empty lists or skip rendering, without sample objects. Kept. Existing plow observation times remain visible. Missing names/images have Unknown/unavailable labels. Zero defaults used only for pass sorting or icon rotation are not displayed as measurements. |
| HRRR file loader, `HRRRRoadForecast.load`/`renderUnavailable`, and freshness model | Existing missing/stale/unavailable behavior is retained. Failed updates preserve a previously loaded model run, while a first failure leaves forecast guidance unavailable. The observed-road map now follows the same pattern. Neither HRRR frontend module changed. |
| `snowDetectionService.js` error/default records and HRRR temperature fallback | Inspected but left untouched as requested, along with confidence code. `getDefaultResult` and `buildDefaultViewDetection` produce unknown/error records with zero confidence. `mapSnowLevelToDisplayState` and the legacy camera-segment builder still have default Clear branches in this protected file. The separate road-service mapping of unknown to Clear was corrected above; no camera-segment builder is used by `getCompleteRoadData`. |
| HRRR forecast metric formatting and hazard classification | Missing precipitation fields can default to zero/Dry within an otherwise loaded model run. These are existing model calculations and presentation, explicitly labeled HRRR, not a replacement run on fetch failure. Left unchanged; missing whole runs still use the HRRR unavailable state. |
| Shared kiosk map and other sample-data search hits | The kiosk uses the same fixed map class and now has the visible notice. Its historical-statistics “sample data” comment belongs to the air-quality view, not roads; missing historical data already displays N/A/No Data. Sanitizer defaults and generic display labels do not invent observations. |

The API's top-level `status` describes the observed road feed: `available`, `cached`, or `unavailable`. `sources.roads`, `sources.cameras`, and `sources.stations` each expose `status`, `lastUpdated`, and an explanatory message when unavailable. HTTP 200 can carry `status: "unavailable"` with successfully loaded cameras or stations. HTTP 503 means the complete response could not be assembled. A `null` timestamp means no valid update time is known.

To install and test from the repository root:

```sh
npm install

npm test -- --runInBand

# Focused fallback coverage:
npm test -- --runInBand \
  server/__tests__/roadWeatherFallback.test.js \
  server/__tests__/trafficCacheProvenance.test.js \
  public/js/__tests__/roadWeatherMap.fallback.test.js \
  public/js/__tests__/roadWeatherDataCache.test.js \
  public/js/__tests__/roadMissingData.test.js \
  public/js/__tests__/conditionCards.fallback.test.js \
  public/js/__tests__/trafficEvents.fallback.test.js
```

The existing Jest setup was used. No new test dependency was added. Neither dependency file changed. The final full run passed 21 suites and 252 tests, including existing confidence, snow-detection, scheduler, and HRRR tests.

To reproduce the browser check:

```sh
# Fails only the UDOT road-condition fetch. Open http://localhost:3100/roads.
node scripts/dev-road-fallback.js

# Stop the first server with Ctrl+C before starting another mode on the same port.
ROAD_FALLBACK_TEST_MODE=empty node scripts/dev-road-fallback.js

# Load one real road response, then fail subsequent road requests.
# This mode needs working UDOT credentials/connectivity in the normal local environment.
ROAD_FALLBACK_TEST_MODE=after-first node scripts/dev-road-fallback.js
```

The harness sets `PREVIEW_MODE=true` and disables report email. It refuses to run with `NODE_ENV=production`. Ordinary `npm start` and `npm run dev` do not import it. It contains no sample roads or stations. Other feeds use their normal behavior. Tests of the empty first-load case do not need a successful road feed.

For the `after-first` mode, wait for the roads to appear and run this in browser DevTools to bypass the existing client cache for one check:

```js
roadWeatherDataCache.lastUpdated = 0;
await window.roadWeatherMap.loadRoadWeatherData();
```

Browser verification was performed in a real local Edge browser through its debugging protocol, with screenshots inspected directly:

| Scenario | Observed result |
| --- | --- |
| Server-side UDOT road fetch stubbed to fail | Visible yellow unavailable notice; zero road-condition segments; 149 camera markers, 38 station records, and five rest areas loaded. Stations retain the existing off-by-default visibility toggle. |
| HTTP 200 with an empty segment list, injected in the browser | Same notice and zero roads; successful cameras and stations still rendered. |
| One successful real UDOT response, then a server-side road failure | All 30 road segment IDs and the original timestamp were retained. Notice showed “Road conditions last updated 7 min ago.” Popup showed “Cached UDOT data; condition blended with station; last updated 7 min ago.” |
| 390-pixel viewport | Notice remained readable; legend source text wrapped and the expanded legend could scroll. |

Screenshots from this session were saved outside the repository at `/private/tmp/road-fallback-failed.png`, `/private/tmp/road-fallback-empty.png`, `/private/tmp/road-fallback-retained.png`, and `/private/tmp/road-fallback-mobile.png`.

Deployment: this work ships through the normal release train, as batch A of the roads
rebase (PR into `dev`, then promotion to `ops`; `docs/DEPLOYMENT.md` §7a). An earlier draft of
this file proposed a direct `ops` hotfix tagged `v1.5.4-road-fallback`. It was never run and
has been removed: `ops` takes changes only by promotion from `dev`.

The changed files are listed below. `server/snowDetectionService.js`, `server/confidenceThresholds.js`, the confidence presentation/calculation code, ensemble weights, the HRRR frontend modules, and all polling intervals are unchanged. Existing unrelated untracked files were left alone.

- `public/css/roads.css`
- `public/js/roads/RoadWeatherMap.js`
- `public/js/roads/DataCache.js`
- `public/js/roads/ConditionCards.js`
- `public/js/roads/RouteConditions.js`
- `public/js/roads/TrafficEventsManager.js`
- `public/js/roads/utils.js`
- `views/roads.html`
- `views/kiosk.html`
- `server/roadWeatherService.js`
- `server/backgroundRefresh.js`
- `server/routes/roadWeather.js`
- `server/trafficEventsService.js`
- `server/routes/trafficEvents.js`
- `scripts/dev-road-fallback.js`
- `server/__tests__/roadWeatherFallback.test.js`
- `server/__tests__/trafficCacheProvenance.test.js`
- `public/js/__tests__/roadWeatherMap.fallback.test.js`
- `public/js/__tests__/roadWeatherDataCache.test.js`
- `public/js/__tests__/roadMissingData.test.js`
- `public/js/__tests__/conditionCards.fallback.test.js`
- `public/js/__tests__/trafficEvents.fallback.test.js`
- `docs/ROADS-FALLBACK-AUDIT-sep29.md` (was `FALLBACK_FIX.md` at the repo root)
