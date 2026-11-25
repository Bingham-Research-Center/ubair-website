# Weather Forecast Page

**What it is.** The page at `/forecast_weather`. It answers, in this order, the questions a
visitor arrives with:

| Part of the page | Question | Where the answer comes from |
|---|---|---|
| **Hazards** | Is there an official weather alert? Will it rain or snow, and how high up? | National Weather Service alerts; the HRRR model's precipitation type along the highways |
| **Town forecasts** | What will it be like in my town over the next 15 hours or so? Has the forecast been right so far? | The HRRR model at 14 towns and passes along US-40; the town's paired weather station |
| **Across the Basin** | How does it differ from the passes to the floor? | The same 14 places, drawn in profile along US-40 |
| **Where rain turns to snow** | At what height does it turn to snow, hour by hour? | The HRRR model's precipitation type at 15 points along the highways |
| **Forecast map** | What does the whole Basin look like at a given hour? | The HRRR model on a grid |
| **For forecasters** (closed drawer) | What do all 31 ensemble runs say for two weeks? | GEFS ensemble charts |

**Since:** version 1.7.6 (issue #407; the phone-width overflow in #101 was fixed with it). The
banded map, its slider and derived layers, and the three drawn views came in 1.7.7.

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
- **Forecast and measured** is the chart above the table: the model's temperature as a line,
  and a dot for each reading the town's paired weather station has made since the model run
  began. A run reaches the page about three hours after it starts, so its first hours can
  already be checked. The sentence under the chart says how the run has done so far and how
  many hours that rests on; "The hours already past, as a table" gives the numbers.
  - Ten of the fourteen places have a station in our feed. The other four show the line and
    say there is nothing to hold it against. No dot is ever made up.
  - Vernal is held against Vernal Regional Airport, the station the homepage shows.
  - Dinosaur's model point is in Colorado, 0.4 km from the climate station `DNOC2`. Our feed
    does not carry that station yet (Synoptic refuses the token Colorado), so the town is held
    against the monitor at the Monument's quarry, 35 km away and 1,250 ft lower. The page
    changes over by itself in the first run `DNOC2` reports in (`PREFERRED_WHEN_REPORTING` in
    `server/observedSeries.js`).

### Across the Basin

US-40 seen from the side, west to east, from Daniels Summit to Dinosaur: each place sits at
its own height and is coloured by its forecast temperature. Move the slider to step through
the hours.

- **This is where an inversion shows.** On a still winter night the cold settles on the
  Basin floor and the passes stay warmer. When the floor is at least 2 °F colder than the
  highest pass, the sentence under the drawing says so.
- Three slanted strokes over a dot mean precipitation in that hour. This file does not say
  rain or snow; the next part of the page does.
- **The ground is a sketch:** the fourteen places' own heights joined by straight lines. It is
  not a survey of the road, and the page says so.
- Not every place has room for its name. Point at a dot, or tap it, for any of them.

### Where rain turns to snow

The forecast points laid out like a hillside, highest at the top, with what falls at each one
hour by hour. The grey steps down the left are the heights, so the left edge is the slope.

- A snowflake is snow, a rain cloud is rain, both together is a mix, a dash is dry.
- **The shaded cells are where rain turns to snow** in that hour. It is always a range between
  two forecast points ("snow from about 6,700 ft up; rain at 5,750 ft and below"), never a
  single height: fifteen points cannot say more than that.
- Often snow reaches lower at one end of the Basin than rain does at the other. The page then
  says both fall between two heights, which is what the model shows.

### Forecast map

- The map opens on **the current hour**, not on the run's first hour (which is already hours
  in the past when the run arrives).
- **The colours are bands, like a contour map:** every 5 °F for temperature, with a thin line
  along each band edge. Blue is colder than freezing, red is warmer, and the pale grey band
  holds 32 °F. The model's points are about 6 km apart, so nothing narrower than that shows.
- **"Show" lists what the run can show:** temperature, feels like (wind chill), below
  freezing, the coldest and the warmest hour between now and the end of the run, wind speed,
  rain in the hour, a rain total, and snow. The note under the list says how each is worked
  out. All of it is worked out in your browser from the one file already downloaded.
- **Drag the slider or press Play** to step through the hours. The arrows are wind. A layer
  that covers the whole run (coldest, warmest, rain total) does not move with the slider, so
  the slider is switched off while one is showing.
- **Point at the map, or tap it,** to read the value there.
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
| Town forecasts | `public/js/townForecast.js` | `townList`, `townHours`, `townSummary` (pure, tested) and the drawing. Converts with `public/js/met.js`. Hands the run it loaded to the two drawings below |
| Forecast and measured | `public/js/townChart.js` | `chartSeries`, `comparisonRows`, `verdictSentence` (pure, tested) and the SVG |
| Across the Basin | `public/js/basinProfile.js` | `profilePoints`, `profileHour`, `profileSummary`, `chooseLabels` (pure, tested) and the SVG |
| Where rain turns to snow | `public/js/snowLine.js` | `hillsideView`, `snowLineSentence` (pure, tested) and the table. The range itself is the server's: `snowLineAt` in `server/statusLights.js` |
| The map's layers | `public/js/mapLayers.js` | The scales, the layer list, `fitGrid` (where the model grid sits on the map) and `rasterise` (the banded picture). Pure, tested |
| Map and charts | `public/js/forecast_weather.js` | The Leaflet map and its overlay, the slider and Play, lazy loading, the expert drawer |
| Colours from tokens | `public/js/themeColours.js` | Reads `--scale-*` from the theme for drawings a stylesheet cannot colour |
| SVG helpers | `public/js/svgKit.js` | A dozen lines: elements, a linear scale, round ticks, redraw on resize |
| Reading the map file | `public/js/hrrrFields.js` | `sliceFieldForHour`, `runningTotalForHour` (pure, tested) |
| Mountain time | `public/js/mountainTime.js` | Shared with the server's status lights |
| Town data | `server/routes/weatherForecast.js` | `GET /api/weather-forecast/towns` (newest waypoints run), `GET /api/weather-forecast/precip` (bands, places and the snow line), `GET /api/weather-forecast/observed` (station readings since the run began) |
| Station readings | `server/observedSeries.js` | Which station goes with which town, and its readings out of the ten-minute files. Pure, tested |
| Alerts | `server/nwsAlerts.js` | `GET /api/weather-alerts` |
| Styles | `public/css/weather-panes.css`, `weather-map.css`, `weather-charts.css` (tokens only), `public/css/forecast_weather.css` (older) | |

**What it costs.** John asked before agreeing to any of it, so the numbers are here.

- **The server does no more than before for the map.** Every layer, the banded picture and the
  value under the pointer are worked out in the browser from the run it already fetched. That
  run is 1.5 MB on disk and about 145 kB on the wire; gzipping it takes the box about 95 ms of
  CPU on a first load, and a repeat visit revalidates and is sent nothing.
- **In the browser** (measured on the dev box, 20 Nov 2026): parsing the run 16 ms; every
  derived layer for all 19 hours 26 ms; one picture of the field about 30 ms. That is lighter
  than the 1,368 markers the map drew before 1.7.7.
- **The readings route** (`/observed`) is the one new piece of server work. Its answer is kept
  for five minutes, and a rebuild reads only the observation files that have arrived since the
  last one (about 160 ms for a cold start over six hours of files). The answer is 2 to 3 kB.
- **The three drawn views fetch nothing of their own.** Two take the town run, one takes the
  precipitation answer the hazards pane already asked for.

**Adding a map layer.** Add one entry to `MAP_LAYERS` in `mapLayers.js`: the fields it needs
(each with the `met.js` converter that must know its unit), a scale, and a `values` function.
A layer appears only when the run carries its fields, so entries for fields CHPC has not sent
yet are safe: gusts, snow on the ground, cloud cover and humidity are already listed, under
the names pinned in `DATA_MANIFEST.json`, and will show the day the field arrives. A new
colour ramp is five `--scale-<name>-N` tokens in `theme/tokens.css`, lightest first.

**A derived layer must use a standard formula and say so** in its `note`, which the page shows
under the picker. Wind chill is the National Weather Service's and returns nothing outside its
range; a total is a plain sum of amounts that are truly hourly. Nothing is derived from the
snow field, which is a running total with gaps.

**Nothing loads before it is wanted.** The map's model run is 1.5 MB (about 150 kB gzipped
since 1.7.6): it is fetched when the reader scrolls near the map (`whenNear`, an
`IntersectionObserver`). The ensemble charts are fetched when the drawer is opened.

**For a wall screen,** `?kiosk=1` on the address starts the map playing by itself, one hour
every five seconds. The separate kiosk panel went in 1.7.7: Play does its job.

**Try it:**

```bash
curl -s https://www.basinwx.dev/api/weather-forecast/towns | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['filename'], [s['name'] for s in d['forecast']['stations']])"
curl -s https://www.basinwx.dev/api/weather-forecast/precip | python3 -m json.tool | head -30
curl -s https://www.basinwx.dev/api/weather-forecast/observed | python3 -c "import json,sys; d=json.load(sys.stdin); print({k: (v['stid'], len(v['air_temp']['points']) if v['air_temp'] else None) for k, v in d['towns'].items()})"
npm test -- --runInBand weatherPage townForecast weatherHazards hrrrFields weatherForecast mapLayers basinProfile townChart snowLine observedSeries
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
  the table has about 15 hours. Producer ask P13 would extend it to 48.
- **The model grid is turned about 8° from north**, so the map's picture is a parallelogram,
  not an upright rectangle. `fitGrid` places it from the file's own coordinates and
  `mapLayers.test.js` holds the fit to 3 km on a real grid. Whether the wind components are
  measured from north or from the grid is not stated in the file (producer ask P17).
- **Two HRRR point files overlap.** The town views read the waypoints file; the snow line and
  the homepage tiles read the road forecast. They name different stations and heights for the
  same towns, and are not blended on purpose: John's call is to keep them apart until CHPC
  sends one point product (P13).
- **Colours for the map and the drawings are tokens** (`--scale-*`, `--precip-*`). No script
  holds a hex value, and `weatherPage.test.js` fails if one appears.
- **No Basin averages, no invented times.** `server/__tests__/weatherPage.test.js` fails if
  either comes back.
- The tables scroll inside their own box. That box must stay `position: relative`, or the
  screen-reader labels in its cells widen the whole page on a phone (this was #101).

## Not here yet

- **LLM forecast discussion** at the top of the page (#408): waits on the producer's text.
- **GEFS days 1–15 as bands** (#409): waits on the GEFS percentiles file (producer ask P4).
- **Gusts, snow on the ground, cloud and humidity on the map:** the layers are written and
  wait for the fields (producer ask P12). Precipitation type on the map needs a layer too.
- **"Tomorrow"** in the town views: needs the 48-hour point forecast (P13).

## Related issues

#407 this rework · #101 phone overflow · #404 the alerts helper · #403 the homepage tiles that
share the precipitation bands · #408, #409 what comes next
