# Sports Page Roadmap

Feature backlog for `/sports`, recovered from Braxton Wilcken-Pond's original idea list
(commit `84e94e9`, April 2026). That file lived at `Ideas For Projects/Ideas For Sports
Page/Sports ideas` — spaces in the path, no extension — and was deleted in `437d7dd`
before it reached `dev`. The content is worth keeping, so it is restored here under the
naming convention in `CLAUDE.md`.

## Shipped

- Current temperature
- Felt temperature (NWS wind chill / heat index, with relative humidity derived from
  dew point via Magnus, since the observation feed carries no `relative_humidity`)
- Wind speed and direction
- Dew point
- Crosswind drift on ball flight, baseball and football — drag-limited model using the
  station's own air density

## Core weather data

- Wind gusts
- Barometric pressure
- UV index
- Visibility
- Air density index (useful across many sports; already computed internally for drift)

## Precipitation and storms

- Chance of rain, rain intensity
- Chance of snow, snow accumulation
- Thunderstorm risk, lightning proximity alerts, hail probability
- Severe weather warnings
- Radar map and future radar projection

## Timing and forecasting

- Hourly forecast
- Game-time forecast summary — a tailored at-a-glance view for a specific event
- Extended 7–14 day forecast
- Sunrise and sunset times
- Heat index and wind chill forecasts
- Historical weather for comparison, seasonal climate averages
- Probability of weather delays
- Field-specific microclimate notes

## Sport-specific insights

- Impact of wind on passing and kicking (football)
- Ball-flight impact for baseball
- Track surface temperature
- Turf vs. grass condition indicators
- Wet-bulb globe temperature — the safety metric that matters most for heat
- Heat-stress and cold-stress risk levels
- Wind-adjusted difficulty ratings
- Sport-specific safety recommendations

## Location and venue detail

- Stadium orientation (affects both sun and wind; the drift model already takes a throw
  bearing, so real field orientations would slot straight in)
- Shaded vs. sun-exposed seating zones
- Altitude and local microclimate quirks
- Parking-lot conditions, tailgating tips, travel weather for fans
- Air quality index, pollen levels, road condition alerts

## User experience and alerts

- Customisable alerts (rain, lightning, wind)
- Mobile-friendly layout, real-time updates, push notifications
- Interactive charts, shareable forecast links
- Event-specific weather summaries, emergency shelter info
- Clear colour-coded risk indicators

## Prediction game — phase 2

The game currently on the page is a coin-flip trainer: it demonstrates the logarithmic
score against fair odds, but the outcome is `Math.random()`, so nothing is being
forecast. Turning it into a real forecasting exercise needs:

- a resolvable basin event ("Will Vernal exceed 90 °F tomorrow?")
- a house probability `q` quoted from CLYFAR or from climatology
- persistence across sessions, settled when the observation lands

At that point a player's bank is the exponentiated log-score advantage over the house
model — a genuine, properly-scored measure of forecasting skill.

## Ranked shortlist

Braxton's original file carried a ranking exercise: an AI-suggested top ten, plus blank
lists for Braxton and Quinten to fill in. Those two lists were never completed and are
worth doing as a team.

Suggested top ten, from the original file:

1. Current temperature — the anchor metric everyone checks first
2. Felt temperature — athlete safety and fan comfort
3. Wind speed and direction — one of the biggest performance-shaping factors
4. Chance of precipitation — affects gameplay, delays, and field conditions
5. Radar map — the fastest way to see incoming weather
6. Hourly forecast — game-time planning and event operations
7. Severe weather alerts — lightning, storms, extreme heat, front and centre
8. Game-time forecast summary — at-a-glance for a specific event
9. Wind gusts — critical for kicking, passing, throwing, ball flight
10. Air quality index — athlete health and fan safety
