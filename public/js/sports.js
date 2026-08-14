import { fetchLiveObservations } from './api.js';

// All cards read from one pinned station so the numbers are mutually consistent.
// Observation keys are friendly display names (see mapStationName in mapShared.js).
const STATION = 'Vernal';

// Ball weights are not used yet — reserved for a future drag model that accounts
// for mass (a 14 oz football should resist wind differently than a 5 oz baseball).
const baseball_avg_weight = 5; // Ounces
const football_avg_weight = 14.2; // Ounces
const baseball_avg_speed = 132; // ft/s (90 mph pitch)
const football_avg_speed = 73.3; // ft/s (50 mph throw)

// Function to convert degrees to cardinal direction
function getCardinalDirection(degrees) {
    if (degrees === null || degrees === undefined || isNaN(degrees)) return 'N/A';

    const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    const index = Math.round(degrees / 22.5) % 16;
    return directions[index];
}

// Read one variable for the pinned station; null when missing
function getStationValue(observations, variable) {
    const value = observations[variable]?.[STATION];
    return Number.isFinite(value) ? value : null;
}

/**
 * Felt temperature in °F:
 * - Above 80°F with humidity available: NWS heat index (Rothfusz regression),
 *   using the simple formula first and the full regression when it reads >= 80.
 *   https://www.wpc.ncep.noaa.gov/html/heatindex_equation.shtml
 * - Below 50°F with wind available: NWS wind chill formula (temp °F, wind mph).
 *   https://www.weather.gov/safety/cold-wind-chill-chart
 * - Otherwise: the plain temperature.
 */
function calculateFeltTemperature(temp, humidity, windSpeed) {
    if (temp === null) return null;

    if (temp > 80 && Number.isFinite(humidity)) {
        const T = temp;
        const RH = humidity;

        let HI = 0.5 * (T + 61.0 + ((T - 68.0) * 1.2) + (RH * 0.094));

        if (HI >= 80) {
            HI = -42.379 + 2.04901523 * T + 10.14333127 * RH - 0.22475541 * T * RH -
                 0.00683783 * T * T - 0.05481717 * RH * RH + 0.00122874 * T * T * RH +
                 0.00085282 * T * RH * RH - 0.00000199 * T * T * RH * RH;
        }

        return Math.round(HI);
    }

    if (temp < 50 && Number.isFinite(windSpeed)) {
        const WC = 35.74 + 0.6215 * temp - 35.75 * Math.pow(windSpeed, 0.16) + 0.4275 * temp * Math.pow(windSpeed, 0.16);
        return Math.round(WC);
    }

    return Math.round(temp);
}

// Crosswind drift (inches) over each 6 ft of ball flight. Assumes the ball
// drifts with the full crosswind component; mass/drag refinement is a follow-up.
function getWindDriftInches(windSpeedMph, windDegrees, ballSpeedFps) {
    const segmentDistance = 6; // feet

    if (!Number.isFinite(windSpeedMph) || !Number.isFinite(windDegrees)) return null;

    // Convert wind speed to ft/s (1 mph = 1.46667 ft/s)
    const windSpeedFps = windSpeedMph * 1.46667;
    const crosswindFps = windSpeedFps * Math.sin(windDegrees * Math.PI / 180);

    const time = segmentDistance / ballSpeedFps;

    const driftFeet = crosswindFps * time;
    const driftInches = driftFeet * 12;

    return Math.round(driftInches * 10) / 10; // Round to 1 decimal place
}

function setCardValue(cardType, text) {
    const el = document.querySelector(`.condition-card[data-card-type="${cardType}"] .current-value`);
    if (el) el.textContent = text;
}

async function updateSportsDashboard() {
    try {
        // One fetch feeds every card
        const { observations } = await fetchLiveObservations();

        const temp = getStationValue(observations, 'Temperature');
        const humidity = getStationValue(observations, 'Humidity');
        const windSpeed = getStationValue(observations, 'Wind Speed');
        const windDegrees = getStationValue(observations, 'Wind Direction');
        const dewPoint = getStationValue(observations, 'Dew Point');

        const feltTemp = calculateFeltTemperature(temp, humidity, windSpeed);
        const windDir = windDegrees !== null ? getCardinalDirection(windDegrees) : 'N/A';
        const baseballDrift = getWindDriftInches(windSpeed, windDegrees, baseball_avg_speed);
        const footballDrift = getWindDriftInches(windSpeed, windDegrees, football_avg_speed);

        setCardValue('current-temperature', temp !== null ? Math.round(temp) + ' °F' : '--');
        setCardValue('felt-temperature', feltTemp !== null ? feltTemp + ' °F' : '--');
        setCardValue('wind-speed-direction', windSpeed !== null ? Math.round(windSpeed) + ' mph ' + windDir : '-- --');
        setCardValue('dew-point', dewPoint !== null ? Math.round(dewPoint) + ' °F' : '--');
        setCardValue('baseball', baseballDrift !== null ? baseballDrift + ' in' : '--');
        setCardValue('football', footballDrift !== null ? footballDrift + ' in' : '--');

        // Not wired up yet
        setCardValue('uv-index', '--');
        setCardValue('visibility', '--');
        setCardValue('precipitation', '--');
    } catch (error) {
        console.error('Error updating sports dashboard:', error);
    }
}

/**
 * Prediction Game (prototype). Split your tokens across two outcomes with the
 * slider; a random side wins each round (+50% winners, -75% losers). Reach
 * 3000 tokens to win, hit 0 and you lose. No real stakes — tokens only.
 */
function initPredictionGame() {
    const gameGuessBtn = document.getElementById('gameGuessBtn');
    const gameSlider = document.getElementById('gameSlider');
    if (!gameGuessBtn || !gameSlider) return;

    function updateSliderDisplay() {
        const gameQuery = document.getElementById('gameProportion');
        const left = Number(gameSlider.value);
        const right = Number(gameSlider.max) - left;
        gameQuery.textContent = left + ' --- ' + right;
    }
    updateSliderDisplay();

    gameSlider.addEventListener('input', updateSliderDisplay);

    gameGuessBtn.addEventListener('click', () => {
        const gameQuery = document.getElementById('gameResult');

        let tokens = Number(gameSlider.max);
        const tokensBefore = tokens;
        const outcome = Math.floor(Math.random() * 2);
        const left = Number(gameSlider.value);
        const right = Number(gameSlider.max) - left;
        let losses;
        let gains;

        let winner;
        if (outcome === 0) {
            winner = 'RIGHT WINS! | ';
            losses = Math.round(right * 0.75);
            gains = Math.round(left * 0.5);
        } else {
            winner = 'LEFT WINS! | ';
            losses = Math.round(left * 0.75);
            gains = Math.round(right * 0.5);
        }

        tokens = tokens - losses + gains;

        if (tokens <= 0) {
            gameQuery.textContent = 'YOU RAN OUT OF TOKENS! YOU LOSE!';
        } else if (tokens > 3000) {
            gameQuery.textContent = 'YOU SURPASSED 3000 TOKENS! YOU WIN!';
        } else {
            gameQuery.textContent = winner + 'Losses: ' + losses +
                ' | Gains: ' + gains +
                ' | Tokens: ' + tokens + ' | Tokens before: ' + tokensBefore;
        }

        gameSlider.max = String(tokens);
        updateSliderDisplay();
    });
}

document.addEventListener('DOMContentLoaded', () => {
    updateSportsDashboard();
    initPredictionGame();

    // Refresh every 10 minutes like other pages
    setInterval(updateSportsDashboard, 10 * 60 * 1000);
});
