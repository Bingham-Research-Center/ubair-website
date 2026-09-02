import { fetchLiveObservations } from './api.js';
import { getCardinalDirection } from './mapUtils.js';

// All cards read from one pinned station so the numbers are mutually consistent.
// Observation keys are friendly display names (see mapStationName in mapShared.js).
const STATION = 'Vernal';

// The observation feed is raw SI — Celsius, m/s, Pascals. processObservationData()
// in api.js deliberately does NOT convert (see the commented-out convertUnits call
// there); every page converts at its own display layer. We do the same, and we do
// it *before* any formula runs, because the NWS formulas below are defined for
// Fahrenheit and mph and silently produce nonsense if handed Celsius and m/s.
const R_DRY_AIR = 287.05; // J kg^-1 K^-1, specific gas constant for dry air
const METRES_TO_INCHES = 39.3701;

/**
 * Ball properties for the crosswind drift model.
 *   mass            kg
 *   area            m^2, the cross-section the crosswind pushes against
 *   dragCoefficient dimensionless
 *   speedMs         typical release speed, m/s
 *   flightMetres    a realistic full flight, not an arbitrary segment
 *
 * Football area is the side-on silhouette of a prolate spheroid, pi*L*D/4 for an
 * 11 in x 6.7 in ball. Its drag coefficient is the bluff-body value: a tight
 * spiral is far more slippery nose-on than side-on, and it is the side-on number
 * that matters for crosswind.
 */
export const BALLS = {
    baseball: {
        mass: 0.145,
        area: Math.PI * 0.0365 ** 2,
        dragCoefficient: 0.35,
        speedMs: 40.23,      // 90 mph pitch
        flightMetres: 18.44, // 60.5 ft, the pitching distance
        flightLabel: 'over a 60.5 ft pitch'
    },
    football: {
        mass: 0.410,
        area: 0.037,
        dragCoefficient: 0.70,
        speedMs: 22.35,      // 50 mph throw
        flightMetres: 27.43, // 30 yd
        flightLabel: 'over a 30 yd throw'
    }
};

// Which way the ball is thrown, as a compass bearing. Crosswind depends on the
// angle between the wind and the flight path, so this cannot be left out — the
// previous version omitted it, which silently assumed every throw went due north.
const DEFAULT_THROW_BEARING = 0; // north, the common alignment for a football field
let throwBearingDeg = DEFAULT_THROW_BEARING;

/* ------------------------------------------------------------------ *
 * Reading the feed
 * ------------------------------------------------------------------ */

// Read one variable for the pinned station; null when missing or non-numeric.
function readRaw(observations, variable) {
    const value = observations[variable]?.[STATION];
    return Number.isFinite(value) ? value : null;
}

function unitOf(observations, variable) {
    return observations._units?.[variable] ?? null;
}

// Convert only from units we recognise. An unrecognised unit returns null, so a
// card shows "--" rather than a confidently wrong number — which is exactly the
// failure mode this page shipped with.
function toFahrenheit(value, unit) {
    if (value === null) return null;
    if (unit === 'Celsius') return value * 9 / 5 + 32;
    if (unit === 'Fahrenheit') return value;
    console.warn(`sports: unexpected temperature unit "${unit}" — not displaying`);
    return null;
}

function toMph(value, unit) {
    if (value === null) return null;
    if (unit === 'm/s') return value * 2.23694;
    if (unit === 'mph') return value;
    console.warn(`sports: unexpected wind speed unit "${unit}" — not displaying`);
    return null;
}

function toPascals(value, unit) {
    if (value === null) return null;
    if (unit === 'Pascals') return value;
    if (unit === 'hPa' || unit === 'Millibars') return value * 100;
    console.warn(`sports: unexpected pressure unit "${unit}" — not displaying`);
    return null;
}

/* ------------------------------------------------------------------ *
 * Meteorology
 * ------------------------------------------------------------------ */

/**
 * Relative humidity from temperature and dew point, via the Magnus formula.
 *
 * The feed carries no relative_humidity at all, but it does carry dew point —
 * the temperature you would have to cool the air to before water starts
 * condensing out, so a direct measure of the water actually present.
 *
 * `es` is the most water this air could hold at its temperature; `e` is how much
 * is really there. RH is the ratio of the two.
 */
export function relativeHumidityFromDewPoint(tempC, dewPointC) {
    if (tempC === null || dewPointC === null) return null;
    const saturationPressure = t => 6.112 * Math.exp((17.67 * t) / (t + 243.5));
    const rh = 100 * saturationPressure(dewPointC) / saturationPressure(tempC);
    return Math.min(100, Math.max(0, rh));
}

/**
 * NWS heat index (Rothfusz regression), including the two standard adjustments.
 * Valid at or above 80 F. Cooling happens by sweat evaporating; humid air is
 * already near full of water, so sweat evaporates slowly and the heat has
 * nowhere to go.
 * https://www.wpc.ncep.noaa.gov/html/heatindex_equation.shtml
 */
export function heatIndexF(T, RH) {
    let HI = 0.5 * (T + 61.0 + ((T - 68.0) * 1.2) + (RH * 0.094));
    if ((HI + T) / 2 < 80) return HI;

    HI = -42.379 + 2.04901523 * T + 10.14333127 * RH - 0.22475541 * T * RH -
         0.00683783 * T * T - 0.05481717 * RH * RH + 0.00122874 * T * T * RH +
         0.00085282 * T * RH * RH - 0.00000199 * T * T * RH * RH;

    // Dry-air adjustment. The basin is dry, so this one actually bites here.
    if (RH < 13 && T >= 80 && T <= 112) {
        HI -= ((13 - RH) / 4) * Math.sqrt((17 - Math.abs(T - 95)) / 17);
    }
    // Humid-air adjustment.
    if (RH > 85 && T >= 80 && T <= 87) {
        HI += ((RH - 85) / 10) * ((87 - T) / 5);
    }
    return HI;
}

/**
 * NWS wind chill. Valid at or below 50 F with wind of at least 3 mph.
 * Your body keeps a thin film of warmed air against your skin; wind strips it
 * away so you lose heat faster. The small 0.16 exponent is why the first few mph
 * matter enormously and each extra mph matters less.
 * https://www.weather.gov/safety/cold-wind-chill-chart
 */
export function windChillF(T, V) {
    return 35.74 + 0.6215 * T - 35.75 * Math.pow(V, 0.16) + 0.4275 * T * Math.pow(V, 0.16);
}

/**
 * Felt temperature in F. Each formula is a curve fitted to measurements over a
 * limited range, so both are guarded — outside their range they return numbers
 * that look plausible and are not. Falling through to the plain air temperature
 * is the correct answer for the mild conditions that cover most of the year.
 */
export function calculateFeltTemperature(tempF, humidityPct, windMph) {
    if (tempF === null) return null;

    if (tempF >= 80 && Number.isFinite(humidityPct)) {
        return Math.round(heatIndexF(tempF, humidityPct));
    }
    if (tempF <= 50 && Number.isFinite(windMph) && windMph >= 3) {
        return Math.round(windChillF(tempF, windMph));
    }
    return Math.round(tempF);
}

/**
 * Air density from the station's own pressure and temperature, via the ideal gas
 * law. This matters here: at ~1,600 m the basin runs near 0.98 kg/m^3 against
 * 1.225 at sea level, so roughly 20% less push on the ball than a sea-level
 * calculator would give.
 */
export function airDensity(pressurePa, tempC) {
    if (pressurePa === null || tempC === null) return null;
    return pressurePa / (R_DRY_AIR * (tempC + 273.15));
}

/**
 * Crosswind component in m/s, positive to the right of the flight path.
 * Meteorological wind direction is where the wind blows *from*, so it is turned
 * around before being compared with the throw bearing.
 */
export function crosswindComponentMs(windSpeedMs, windFromDeg, bearingDeg) {
    if (!Number.isFinite(windSpeedMs) || !Number.isFinite(windFromDeg)) return null;
    const windTowardDeg = windFromDeg + 180;
    return windSpeedMs * Math.sin((windTowardDeg - bearingDeg) * Math.PI / 180);
}

/**
 * Sideways drift in inches over a full flight.
 *
 * The old model was `crosswind speed x flight time`, which says the ball is
 * already travelling sideways at the wind's speed the instant it leaves the
 * hand. That is what a balloon does. A ball has mass, so the wind has to push it
 * sideways and that takes time — over a 60.5 ft pitch the old model overstated
 * the drift by roughly 190x.
 *
 * Drag force F = 1/2 rho Cd A v^2; sideways acceleration a = F/m; and because the
 * ball starts with no sideways motion at all the displacement is the same
 * schoolroom 1/2 a t^2 as a dropped object — except the "gravity" here is the
 * wind's shove, and it is weaker for a heavy ball than a light one.
 *
 * Assumes a constant crosswind for the whole flight, no spin and no Magnus
 * effect, and a constant drag coefficient.
 */
export function crosswindDriftInches(ball, crosswindMs, rho) {
    if (crosswindMs === null || rho === null) return null;

    const relativeSpeed = Math.abs(crosswindMs);
    const dragForce = 0.5 * rho * ball.dragCoefficient * ball.area * relativeSpeed ** 2;
    const sidewaysAccel = dragForce / ball.mass;
    const flightSeconds = ball.flightMetres / ball.speedMs;

    return 0.5 * sidewaysAccel * flightSeconds ** 2 * METRES_TO_INCHES;
}

// A wiped-out side scores log(0). Number.prototype.toFixed returns "-Infinity"
// for that rather than throwing, but it reads badly on the card.
export function formatLogScore(value) {
    if (!Number.isFinite(value)) return value < 0 ? '−∞' : '—';
    return `${value >= 0 ? '+' : ''}${value.toFixed(3)}`;
}

function formatDrift(inches, crosswindMs, ball) {
    if (inches === null) return '--';
    if (Math.abs(inches) < 0.05) return `none ${ball.flightLabel}`;
    const side = crosswindMs > 0 ? 'right' : 'left';
    return `${inches.toFixed(1)} in ${side}`;
}

/* ------------------------------------------------------------------ *
 * Dashboard
 * ------------------------------------------------------------------ */

function setCardValue(cardType, text) {
    const el = document.querySelector(`.condition-card[data-card-type="${cardType}"] .current-value`);
    if (el) el.textContent = text;
}

function setCardNote(cardType, text) {
    const el = document.querySelector(`.condition-card[data-card-type="${cardType}"] .card-note`);
    if (el) el.textContent = text;
}

let latestObservations = null;

function renderDashboard() {
    if (!latestObservations) return;
    const observations = latestObservations;

    // Raw SI, straight off the feed.
    const tempC = readRaw(observations, 'Temperature');
    const dewPointC = readRaw(observations, 'Dew Point');
    const windMs = readRaw(observations, 'Wind Speed');
    const windDegrees = readRaw(observations, 'Wind Direction');
    const pressurePa = toPascals(readRaw(observations, 'pressure'), unitOf(observations, 'pressure'));

    // Converted for display and for the NWS formulas.
    const tempF = toFahrenheit(tempC, unitOf(observations, 'Temperature'));
    const dewPointF = toFahrenheit(dewPointC, unitOf(observations, 'Dew Point'));
    const windMph = toMph(windMs, unitOf(observations, 'Wind Speed'));

    const humidity = relativeHumidityFromDewPoint(tempC, dewPointC);
    const feltTemp = calculateFeltTemperature(tempF, humidity, windMph);
    const windDir = windDegrees !== null ? getCardinalDirection(windDegrees) : 'N/A';

    const rho = airDensity(pressurePa, tempC);
    const crosswindMs = crosswindComponentMs(windMs, windDegrees, throwBearingDeg);

    setCardValue('current-temperature', tempF !== null ? `${Math.round(tempF)} °F` : '--');
    setCardValue('felt-temperature', feltTemp !== null ? `${feltTemp} °F` : '--');
    setCardValue('wind-speed-direction', windMph !== null ? `${Math.round(windMph)} mph ${windDir}` : '--');
    setCardValue('dew-point', dewPointF !== null ? `${Math.round(dewPointF)} °F` : '--');

    setCardNote('felt-temperature',
        humidity !== null ? `Relative humidity ${Math.round(humidity)}%, derived from dew point` : '');
    setCardNote('wind-speed-direction',
        windDegrees !== null ? `From ${Math.round(windDegrees)}°` : '');

    for (const [name, ball] of Object.entries(BALLS)) {
        const drift = crosswindDriftInches(ball, crosswindMs, rho);
        setCardValue(name, formatDrift(drift, crosswindMs, ball));
        setCardNote(name, rho !== null ? `${ball.flightLabel}, air density ${rho.toFixed(2)} kg/m³` : '');
    }

    const stamp = observations._timestamps?.[STATION];
    const stampEl = document.getElementById('observationTimestamp');
    if (stampEl) {
        stampEl.textContent = stamp
            ? `${STATION} — observed ${new Date(stamp).toLocaleString()}`
            : `${STATION} — no recent observation`;
    }
}

async function updateSportsDashboard() {
    try {
        // One fetch feeds every card, so the numbers stay mutually consistent.
        const { observations } = await fetchLiveObservations();
        latestObservations = observations;
        renderDashboard();
    } catch (error) {
        console.error('Error updating sports dashboard:', error);
    }
}

function initThrowBearing() {
    const select = document.getElementById('throwBearing');
    if (!select) return;
    select.value = String(DEFAULT_THROW_BEARING);
    select.addEventListener('change', () => {
        throwBearingDeg = Number(select.value);
        renderDashboard();
    });
}

/* ------------------------------------------------------------------ *
 * Prediction Game (prototype)
 *
 * A coin-flip trainer for the logarithmic score. The outcome is Math.random(),
 * not a weather event, so nothing here is a weather forecast yet — the point is
 * the scoring rule, and swapping in a real basin event is the follow-up.
 *
 * The house quotes a probability q. A winning stake pays back stake/q — fair
 * odds, so if the house says 25% then a correct 25% call pays 4x. Under those
 * odds the allocation that maximises long-run growth is exactly your honest
 * belief, and the growth rate you achieve is exactly how far your forecast beats
 * the house's, measured in log score. Match the house and you break even.
 *
 * The previous version paid winners +50% and losers -75% regardless of any
 * quote. That gave every possible allocation the same expected bank (0.875x) —
 * so the slider changed nothing but variance — and took a 12.5% rake per round,
 * which made the stated 3000-token target unreachable by playing well.
 * ------------------------------------------------------------------ */

const STARTING_TOKENS = 1000;
const TARGET_TOKENS = 3000;
const HOUSE_PROBABILITY_LEFT = 0.5;

const gameState = {
    tokens: STARTING_TOKENS,
    round: 0,
    cumulativeLogScore: 0,
    finished: false
};

/**
 * Settle one round at fair odds. Pure, so it can be unit-tested.
 *
 *   bank_after = (stake on the winning side) / (house quote for that side)
 *   log score  = ln( your probability for the winner / the house's )
 *
 * At fair odds the expected bank is unchanged whatever you choose, and the
 * allocation that maximises long-run growth is your honest belief.
 */
export function settleRound(tokens, fractionLeft, leftWins, houseProbabilityLeft) {
    const fractionOnWinner = leftWins ? fractionLeft : 1 - fractionLeft;
    const quoteOnWinner = leftWins ? houseProbabilityLeft : 1 - houseProbabilityLeft;

    return {
        tokens: (tokens * fractionOnWinner) / quoteOnWinner,
        logScore: Math.log(fractionOnWinner / quoteOnWinner),
        fractionOnWinner
    };
}

function initPredictionGame() {
    const lockInBtn = document.getElementById('gameGuessBtn');
    const resetBtn = document.getElementById('gameResetBtn');
    const slider = document.getElementById('gameSlider');
    const allocationEl = document.getElementById('gameProportion');
    const resultEl = document.getElementById('gameResult');
    const scoreEl = document.getElementById('gameScore');
    if (!lockInBtn || !slider || !allocationEl || !resultEl) return;

    const leftFraction = () => Number(slider.value) / 100;

    function renderAllocation() {
        const left = Math.round(gameState.tokens * leftFraction());
        const right = Math.round(gameState.tokens) - left;
        allocationEl.textContent = `LEFT ${left} tokens  ·  RIGHT ${right} tokens`;
    }

    function renderScore() {
        if (!scoreEl) return;
        scoreEl.textContent = gameState.round === 0
            ? `Bank ${STARTING_TOKENS} tokens · house quote ${Math.round(HOUSE_PROBABILITY_LEFT * 100)}% on LEFT`
            : `Bank ${Math.round(gameState.tokens)} tokens · round ${gameState.round} · ` +
              `cumulative log score ${formatLogScore(gameState.cumulativeLogScore)}`;
    }

    function reset() {
        gameState.tokens = STARTING_TOKENS;
        gameState.round = 0;
        gameState.cumulativeLogScore = 0;
        gameState.finished = false;
        slider.value = '50';
        slider.disabled = false;
        lockInBtn.disabled = false;
        resultEl.textContent = '';
        renderAllocation();
        renderScore();
    }

    function playRound() {
        if (gameState.finished) return;

        const leftWins = Math.random() < HOUSE_PROBABILITY_LEFT;
        const { tokens, logScore: roundLogScore, fractionOnWinner } =
            settleRound(gameState.tokens, leftFraction(), leftWins, HOUSE_PROBABILITY_LEFT);

        gameState.tokens = tokens;
        gameState.cumulativeLogScore += roundLogScore;
        gameState.round += 1;

        const winnerLabel = leftWins ? 'LEFT WINS' : 'RIGHT WINS';

        if (fractionOnWinner === 0) {
            gameState.finished = true;
            resultEl.textContent = `${winnerLabel} — and you had nothing on it. Bank wiped out. ` +
                'That is why the log-optimal bet is never everything on one side.';
        } else if (gameState.tokens < 1) {
            gameState.finished = true;
            resultEl.textContent = `${winnerLabel} — bank exhausted. Reset to try again.`;
        } else if (gameState.tokens >= TARGET_TOKENS) {
            gameState.finished = true;
            resultEl.textContent = `${winnerLabel} — you reached ${TARGET_TOKENS} tokens. ` +
                'Against a fair coin at fair odds that is luck, not skill, and that is the point.';
        } else {
            resultEl.textContent =
                `${winnerLabel} · round log score ${formatLogScore(roundLogScore)}`;
        }

        if (gameState.finished) {
            lockInBtn.disabled = true;
            slider.disabled = true;
        }

        renderAllocation();
        renderScore();
    }

    slider.addEventListener('input', renderAllocation);
    lockInBtn.addEventListener('click', playRound);
    if (resetBtn) resetBtn.addEventListener('click', reset);

    reset();
}

// Guarded so the pure formulas above can be imported and unit-tested under the
// repo's node test environment (jest.config.js sets testEnvironment: 'node').
if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        initThrowBearing();
        updateSportsDashboard();
        initPredictionGame();

        // Refresh every 10 minutes like other pages
        setInterval(updateSportsDashboard, 10 * 60 * 1000);
    });
}
