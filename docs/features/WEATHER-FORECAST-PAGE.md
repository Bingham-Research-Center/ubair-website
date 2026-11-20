# Weather Forecast Page

**What it is.** The page at `/forecast_weather`. It answers, in this order, the questions a
visitor arrives with:

| Part of the page | Question | Where the answer comes from |
|---|---|---|
| **Hazards** | Is there an official weather alert? Will it rain or snow, and how high up? | National Weather Service alerts; the HRRR model's precipitation type along the highways |
| **Town forecasts** | What will it be like in my town over the next 15 hours or so? | The HRRR model at 14 towns and passes along US-40 |
| **Forecast map** | What does the whole Basin look like at a given hour? | The HRRR model on a grid |
| **For forecasters** (closed drawer) | What do all 31 ensemble runs say for two weeks? | GEFS ensemble charts |

**Since:** version 1.7.6 (issue #407; the phone-width overflow in #101 was fixed with it).

## How to read it

- **Everything except the alerts is a model forecast, not a measurement.** Each part says which
  model run it shows and how old that run is. HRRR is a weather model that is re-run every
  hour; a run reaches this page two to six hours after it starts.
- **Times are Mountain time.** A model run is also labelled with its UTC hour, "Thu 8 PM (03Z)",
  for readers who think in model time.
- **Units are °F, mph and inches.**
- **If a part cannot load, it says so.** It never shows a stand-in number, and a failed alerts
  check reads "could not be checked", never "no alerts".

### Hazards

- **Alerts** are grouped: the **Basin floor** first (where people live), then **Nearby high
  ground** (the Uinta Mountains, the passes, the Tavaputs). A warning has a red rule, anything
  else amber. "What the NWS says" opens the forecasters' own text.
- **Rain or snow, by elevation** is a small table: one row each for the passes (above 7,500
  ft), the benches and the floor (below 5,900 ft), one column per hour. A snowflake is snow, a
  rain cloud is rain, both together is a mix, a dash is dry. It is the same forecast as the
  "Precip next 6 h" tile on the homepage, hour by hour.

### Town forecasts

- Pick a town or pass from the list. Vernal shows first.
- The sentence above the table sums the hours up: the low and high, the strongest wind, and how
  many hours have precipitation.
- **Precip** is liquid equivalent: what the snow or rain would measure as water. An inch of
  water is very roughly ten inches of snow.
- A value the model file does not carry shows as `--`.

### Forecast map

- The map opens on **the current hour**, not on the run's first hour (which is already hours
  in the past when the run arrives).
- Choose temperature, rainfall or snow, and step through the hours. The arrows are wind.
- **Snow is a total since the run began**, in inches, not a rate. (See "Things to know" below.)
- "Across the map at this hour" notes what stands out, as a count or a peak over the map. The
  page no longer shows a "Basin average": an average over a grid that runs from the valley
  floor to the crest of the Uintas describes nowhere.
- The line under the map says which run it is and how old. There is no "next update" time:
  runs arrive in blocks through the day, so a promised time would usually be wrong.

### For forecasters

The drawer at the bottom holds the GEFS charts (temperature, wind, pressure, snow, solar):
every one of 31 model runs drawn as a line, about 16 days ahead, in °C and UTC. It is closed
by default because it is the hardest thing on the page to read. Click a chart to enlarge it.

## For developers

| Piece | File | Job |
|---|---|---|
| Hazards pane | `public/js/weatherHazards.js` | `alertsView`, `precipTable` (pure, tested) and the drawing |
| Town forecasts | `public/js/townForecast.js` | `townList`, `townHours`, `townSummary` (pure, tested) and the drawing. Converts with `public/js/met.js` |
| Map and charts | `public/js/forecast_weather.js` | The Leaflet map, lazy loading, the expert drawer, kiosk mode |
| Reading the map file | `public/js/hrrrFields.js` | `sliceFieldForHour`, `runningTotalForHour` (pure, tested) |
| Mountain time | `public/js/mountainTime.js` | Shared with the server's status lights |
| Town data | `server/routes/weatherForecast.js` | `GET /api/weather-forecast/towns` (newest waypoints run), `GET /api/weather-forecast/precip` |
| Alerts | `server/nwsAlerts.js` | `GET /api/weather-alerts` |
| Styles | `public/css/weather-panes.css` (tokens only), `public/css/forecast_weather.css` (older) | |

**Nothing loads before it is wanted.** The map's model run is 1.5 MB (about 150 kB gzipped
since 1.7.6): it is fetched when the reader scrolls near the map (`whenNear`, an
`IntersectionObserver`). The ensemble charts are fetched when the drawer is opened.

**Kiosk mode** (the map stepping through the hours for a wall screen) is off the page unless
the address ends in `?kiosk=1`.

**Try it:**

```bash
curl -s https://www.basinwx.dev/api/weather-forecast/towns | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['filename'], [s['name'] for s in d['forecast']['stations']])"
curl -s https://www.basinwx.dev/api/weather-forecast/precip | python3 -m json.tool | head -30
npm test -- --runInBand weatherPage townForecast weatherHazards hrrrFields weatherForecast
```

## Things to know before changing it

- **Check the file, not its field names.** Two precipitation fields are not what they are
  called. In the map file, `snowfall_1h_mm` is a running total since the run began that drops
  to zero in some hours; `runningTotalForHour` repairs that and the page shows it as a total.
  In the road forecast, `precip_1hr` is also a running total, so the elevation table uses the
  precipitation **type** only. Both are with the producers as P9 and P10
  (`docs/NWP-PRODUCER-HANDOFF-nov20.md`). `rainfall_1h_mm` in both the map file and the town
  file is a true hourly amount.
- **The town file ends 18 hours after its run starts**, and arrives about three hours in, so
  the table has about 15 hours. Producer ask P5 would extend it to 48.
- **No Basin averages, no invented times.** `server/__tests__/weatherPage.test.js` fails if
  either comes back.
- The tables scroll inside their own box. That box must stay `position: relative`, or the
  screen-reader labels in its cells widen the whole page on a phone (this was #101).

## Not here yet

- **LLM forecast discussion** at the top of the page (#408): waits on the producer's text.
- **GEFS days 1–15 as bands** (#409): waits on the GEFS percentiles file (producer ask P4).
- **Precipitation type on the map** and a winter tab: needs more fields in the map file.

## Related issues

#407 this rework · #101 phone overflow · #404 the alerts helper · #403 the homepage tiles that
share the precipitation bands · #408, #409 what comes next
