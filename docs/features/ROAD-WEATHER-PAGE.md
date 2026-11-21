# Road Weather Page

**What it is.** The page at `/roads`: a map of the Basin's highways coloured by how they are
driving, with road weather stations, traffic cameras, incidents, and a 12-hour forecast along
the main routes. It is **advisory only**: for a real travel decision, use
[udottraffic.utah.gov](https://udottraffic.utah.gov).

This page is older than the others in this folder. What follows is how it stands on
20 Nov 2026, what changed that month, and what is known to be unfinished.

## Where the colours come from

Each stretch of road is coloured from up to four sources, blended:

| Source | What it is | Weight |
|---|---|---|
| **UDOT road report** | What UDOT's crews report: dry, wet, slushy, snow covered, icy, closed, traction devices required | half |
| **HRRR forecast** | A weather model's estimate at the middle of the stretch | a quarter |
| **Cameras** | A program's guess at snow in UDOT camera images | less |
| **Road weather stations** | Sensors in and beside the pavement | least |

| Colour | Means |
|---|---|
| Red | Dangerous: closed, icy, or (on a main route) snow covered |
| Yellow | Use caution: slush, patchy snow, wet, snow falling, traction devices |
| Green | Clear and dry |
| Grey | No data. Grey is honest: it is never filled in with a guess |

## What changed in November 2026

- **It stopped inventing roads (#336, v1.7.2).** When UDOT's feed failed, the page used to draw
  made-up "clear" and "caution" roads. It now says the feed is unavailable and draws nothing
  it was not told.
- **Snow covering a main route is red (#403, v1.7.5).** A main route is US-40, US-191 or SR-87
  inside the Basin. John Lawson chose this so the page agrees with the homepage's "Roads now"
  tile; both use one rule, `classifyUdotRoad` in `server/roadConditionRules.js`.
- **UDOT's own report of danger now stands (#403).** A red UDOT report beside a clear forecast
  and a clear camera used to average out to yellow. What a crew saw on the road is no longer
  outvoted by estimates.

## Known problems (not yet fixed)

- **"Cached road data" shows even when the feed is healthy.** The label was meant for an outage.
- **Two road weather stations report months-old readings as current** (US-189 at Charleston
  was still showing a June reading in November). One of them feeds the camera snow check.
- **The 12-hour forecast reads a running total as an hourly amount.** In the road-forecast
  file, `precip_1hr` grows through the run; "heavy precipitation" flags late in a run are
  overstated. This is with the producers (ask P9).
- **It is a long page on a phone** (#238), and the legend is awkward there (#71).

## What is parked

Three more batches of roads work by Michael Davies are waiting to be reviewed and merged:
a flatter layout with a bigger map (#337), a corridor summary table (#338), and one combined
list of alerts and advisories (#339). They are planned for version 1.9.0. Because #403 touched
the same files, each needs `dev` merged into it first.

## For developers

| Piece | File |
|---|---|
| Server: UDOT feeds, the blend, cameras | `server/roadWeatherService.js` (`getCompleteRoadData`, `computeEnsembleCondition`) |
| The rule for one UDOT report | `server/roadConditionRules.js` |
| Background refresh (the only place that calls UDOT) | `server/backgroundRefresh.js` |
| Traffic events and alerts | `server/trafficEventsService.js` |
| The page | `views/roads.html`, `public/js/roads/` (the map is `RoadWeatherMap.js`) |
| How confidence levels work | `docs/HOW_IT_WORKS.md`, `docs/CONFIDENCE_TAXONOMY.md` |
| Every fallback path and why it stays or went | `docs/ROADS-FALLBACK-AUDIT-sep29.md` |
| Tests | `server/__tests__/roadWeatherFallback.test.js`, `roadMajorRoutes.test.js`, and `public/js/__tests__/road*.test.js` |

```bash
curl -s https://www.basinwx.dev/api/road-weather | python3 -c "
import json,sys
d=json.load(sys.stdin)
print(d['status'], d['sources']['roads'])
for s in d['segments'][:8]: print(s['name'], '|', s['roadCondition'], '|', s['overallCondition']['condition'])"
```

**UDOT allows 600 requests an hour.** Page views never call UDOT: they read what the
background refresh fetched. Keep it that way when adding anything.

## Related issues

#336 honest failure · #403 the main-route rule · #337, #338, #339 parked batches · #238, #71
phone layout · #302, #303, #146 smaller fixes · `gh issue list --label area:roads`
