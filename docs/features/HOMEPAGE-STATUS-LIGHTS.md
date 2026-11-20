# Homepage Status Lights

**What it is.** Four small tiles at the top of the homepage that answer, at a glance, "is
anything going on in the Basin right now?" Three are lights (red, amber, green or grey) and one
is a short forecast:

| Tile | Question it answers | Where the answer comes from |
|---|---|---|
| **Weather now** | Is there a weather alert where people live? | National Weather Service alerts, plus wind measured at stations on the Basin floor |
| **Ozone** | What do the forecasters expect for ozone over the next ten days? | The forecasters' own ozone outlook, and nothing else |
| **Roads now** | Are the main highways in trouble? | Utah Department of Transportation (UDOT) road reports |
| **Precip next 6 h** | Will it rain or snow, and how high up? | The HRRR weather model, at points along the highways |

Under them sits a plain row of current conditions at Vernal airport: temperature, humidity
and wind.

**Since:** version 1.7.5 (issue #403). **Live at:** the homepage, `/`.

## How to read a tile

- **The words matter more than the colour.** Each tile says what it found ("Snow covered:
  US-191 north of Vernal"). The colour repeats it for a glance from across the room.
- **Grey means "we do not know".** A source is down, late or missing. Grey is never a quiet
  day in disguise: a tile only turns green when its sources answered and found nothing.
- **"Why" opens the reason:** what the tile is based on and when that was checked.
- **Click the line** to go to the page with the detail (weather, outlooks or roads).

## What turns each light each colour

These thresholds were agreed with John Lawson on 20 Nov 2026. To change one, change the
constant named in the last column and its test.

### Weather now

| Colour | When | In the code (`server/statusLights.js`) |
|---|---|---|
| Red | The NWS has a **warning** out for the Basin floor | `weatherLight` |
| Amber | Any other NWS alert for the floor (watch, advisory, statement), **or** a floor station gusting 40 mph, **or** a floor station with a steady wind of 30 mph | `GUST_MPH`, `SUSTAINED_MPH` |
| Green | None of those, the NWS answered, and our observations are under 30 minutes old | `OBS_MAX_AGE_MS` |
| Grey | The NWS could not be asked, or our observations are old, and nothing above is known | |

- **"The floor" means where people live.** For NWS alerts it is the two valley zones (Eastern
  and Western Uinta Basin) and the two counties. Alerts for the Uinta Mountains and the passes
  do **not** colour this light: the roads light covers the high ground.
- **Wind can turn it amber on its own**, with no NWS alert, so a local windstorm still shows.
  The tile then says the wind was observed and that the NWS has no wind alert out.
- **A wind reading must be fresh and believable:** under 30 minutes old from our own feed
  (45 from UDOT's road stations, which report less often), and not an impossible number.
- Our own observation feed carries no gusts yet, which is why UDOT's road stations are used
  for gusts and our feed for steady wind.

### Ozone

| Colour | When |
|---|---|
| Red | The outlook says **HIGH** risk for days 1–5 or days 6–10 |
| Amber | **SOME** or **MODERATE** |
| Green | **NO** or **LOW** |
| Grey | No outlook from this season in the last 5 days, or the outlook has no risk line |

- It reads only the two risk lines the forecasters write under "Day 1–5" and "Day 6–10". It
  never reads a model, Clyfar, or any generated text.
- An outlook lights the tile for **5 days** (`OUTLOOK_CURRENT_DAYS`), then the tile goes grey
  until the next outlook.
- The outlook pages show five risk colours; this tile folds them into three so that all the
  lights speak one colour language.

### Roads now

Only the Basin's main routes count: **US-40** from Heber to Colorado, **US-191** from Helper to
Wyoming, and **SR-87**. Roads on the Wasatch Back or in Carbon County are on the roads page,
not here.

| Colour | When |
|---|---|
| Red | A main route is **closed**, **icy**, or **snow covered** |
| Amber | Slush, patchy snow, wet, snow falling, or traction devices required |
| Green | Every main route that is reporting is dry |
| Grey | UDOT's feed is down, or no main route has a report |

- **The roads page uses the same rule.** Both call `classifyUdotRoad` in
  `server/roadConditionRules.js`, so the homepage and `/roads` never disagree about a road.
- The light reads **UDOT's reports only**. The roads page also blends in a forecast and
  camera estimates; an estimate is not "now".
- On the roads page, a UDOT report of a closure, ice, or snow covering a main route now stays
  red. Before 1.7.5 a forecast and a camera could average it down to "use caution".

### Precip next 6 h

Three rows, highest ground first:

| Row | Height | Example places |
|---|---|---|
| Passes | above 7,500 ft | Daniels Summit, Strawberry, Indian Canyon |
| Benches | 5,900 to 7,500 ft | Fruitland |
| Floor | below 5,900 ft | Vernal, Roosevelt, Duchesne, Myton |

Each row says **Snow**, **Rain**, **Rain and snow** or **Dry**, with "at times" when it is
only a small part of the six hours. The snowflake and rain-cloud symbols are the only icons
on the homepage, because here the symbol is the data.

- It is a **forecast**, from the HRRR model's precipitation type at 17 points along the
  highways, and "Why" says so. It is not a measurement.
- It shows the **kind** of precipitation, not how much. The amount field in that file is a
  running total since the model run began, so it is not used.
- If the newest forecast is too old to cover the next six hours, the tile says the forecast is
  unavailable.

## For developers

**The split:** the server decides, the browser draws.

| Piece | File | Job |
|---|---|---|
| Rules | `server/statusLights.js` | Pure functions: data in, `{ level, line, detail }` out. Every threshold is a named constant here |
| Road rule | `server/roadConditionRules.js` | `classifyUdotRoad`, `isMajorBasinRoute`; shared with `server/roadWeatherService.js` |
| Gathering | `server/routes/statusLights.js` | `GET /api/status-lights`. Reads each source on its own, so one failure greys one tile. Answer cached 60 s |
| NWS alerts | `server/nwsAlerts.js` | `ok` with a list, or `unavailable` with `alerts: null`; never an empty list on failure |
| Drawing | `public/js/homepage-lights.js` | Fetches the endpoint every 5 minutes; holds no thresholds; text goes in as text |
| Markup, styles | `views/index.html`, `public/css/status-lights.css` | Tiles start `data-level="grey"`. Colours are the `--status-*` tokens |

**Try it:**

```bash
curl -s https://www.basinwx.dev/api/status-lights | python3 -m json.tool
npm test -- --runInBand statusLights homepage roadMajorRoutes
```

**Tests** (`npm test`):

- `server/__tests__/statusLights.test.js`: every light, every colour, grey included. The road
  and forecast fixtures in `server/__tests__/fixtures/` are real, from the first snow of the
  2026–27 season.
- `server/__tests__/statusLightsRoute.test.js`: one broken source greys one tile.
- `server/__tests__/roadMajorRoutes.test.js`: the roads page matches the light.
- `server/__tests__/homepage.test.js` and `public/js/__tests__/homepageLights.test.js`: the
  page starts grey, the browser adds no rule of its own, and the only icons are the
  precipitation types.

**To add a light:** write a pure rule in `server/statusLights.js` that returns grey when its
source is missing, add its tests first, add it to `buildStatusLights`, then add a tile to
`views/index.html`.

## Related issues

- #403 the status lights (this feature) · #404 the NWS alerts helper it reads
- #413 next-3-days and inversion lights (waiting on producer data)
- #336 the roads work that made UDOT failures honest
- Producer asks that would improve it: gusts in our own observation feed (P8), and an hourly
  precipitation amount in the road forecast (`docs/NWP-PRODUCER-HANDOFF-nov20.md`)
