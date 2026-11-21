# NWS Weather Alerts

**What it is.** One small piece of the server that asks the National Weather Service (NWS)
which watches, warnings and advisories are in force for the Uinta Basin, and hands the answer
to any page that needs it. The homepage's "Weather now" tile, the weather page's hazards pane
and the fire page all read it.

**Since:** version 1.7.4 (issue #404).

## The one rule

> **A failed check is never "no alerts".**

"There are no alerts" is a statement about the weather, and only the NWS can make it. If the
NWS cannot be reached, the honest answer is "we could not check". So the helper gives one of
two answers, and pages must treat them differently:

| Answer | Means | A page shows |
|---|---|---|
| `ok`, with a list (possibly empty) | The NWS answered | The alerts, or "no alerts, checked 10:21 PM" |
| `unavailable`, with no list at all | We could not find out | "Alerts could not be checked just now" |

Before 1.7.4 the fire page turned a failed request into an empty list, so an NWS outage read
as "no Red Flag Warning".

## Which places count

The NWS divides the map into numbered zones. The Basin is split between two NWS offices:
Salt Lake City looks after the west (Roosevelt, Duchesne) and Grand Junction the east (Vernal).

| Group | Zones | Used for |
|---|---|---|
| **Floor** (where people live) | Eastern Uinta Basin `UTZ024`, Western Uinta Basin `UTZ114`, their two fire-weather zones, and Uintah and Duchesne counties | Colours the homepage "Weather now" tile |
| **Nearby** (the high ground) | Eastern and Western Uinta Mountains, Wasatch Plateau/Book Cliffs (Daniels Summit, Indian Canyon), Tavaputs Plateau, and their fire-weather zones | Listed on the weather page, labelled "Nearby high ground". Does **not** colour the homepage tile |

John Lawson decided on 20 Nov 2026 that mountain and pass alerts should not colour the
homepage tile: the roads tile covers the high ground.

**A trap:** if a zone code is mistyped, the NWS answers "no alerts" rather than an error. The
list is pinned by a test for that reason.

## How it behaves

- It asks the NWS **at most once every five minutes**, however many people load the site.
- Each request gives up after ten seconds, so a slow NWS cannot slow a page.
- If the NWS stops answering, the last good answer stands in for up to **30 minutes**, marked
  with the time it was fetched. After that the answer is `unavailable`.
- After a failure it waits a minute before trying again.
- An alert that ends between two checks is dropped, not shown late.

## For developers

| Piece | File |
|---|---|
| The helper | `server/nwsAlerts.js`: `getNwsAlertsService().getBasinAlerts()`, `BASIN_ZONES`, `alertLevel`, `alertScope` |
| The route | `server/routes/weatherAlerts.js`: `GET /api/weather-alerts` (200 with a list, 503 with `alerts: null`) |
| The fire page's use | `server/fireWeatherService.js` `fetchRedFlagAlerts` returns `null` on failure; `public/js/fire/AlertsBanner.js` says so |
| Tests | `server/__tests__/nwsAlerts.test.js`, `public/js/__tests__/fireAlertsBanner.test.js` |

```bash
curl -s https://www.basinwx.dev/api/weather-alerts | python3 -m json.tool | head -30
```

Each alert carries `event`, `level` (`warning`, `watch`, `advisory` or `statement`, taken from
the last word of the event's name), `scope` (`floor` or `nearby`), `areaDesc`, `onset`, `ends`,
and the NWS's own `description` and `instruction`.

**To use it on a new page:** call the route, check `status` first, and write the
"could not be checked" case before the "no alerts" case.

## Related issues

#404 this helper · #403 the homepage tile · #407 the weather page's hazards pane
