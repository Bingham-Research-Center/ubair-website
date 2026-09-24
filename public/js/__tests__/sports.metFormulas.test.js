import { describe, it, expect } from '@jest/globals';
import {
    BALLS,
    relativeHumidityFromDewPoint,
    heatIndexF,
    windChillF,
    calculateFeltTemperature,
    airDensity,
    crosswindComponentMs,
    crosswindDriftInches,
    settleRound,
    formatLogScore
} from '../sports.js';

// The observation feed is raw SI (Celsius, m/s, Pascals) and api.js deliberately
// does not convert it. This suite exists because the page originally labelled
// those raw values as Fahrenheit and mph and fed them straight into NWS formulas.
const C_TO_F = c => c * 9 / 5 + 32;
const MS_TO_MPH = ms => ms * 2.23694;

describe('unit conversion at the display layer', () => {
    it('converts the feed units the page actually receives', () => {
        expect(C_TO_F(25)).toBeCloseTo(77, 6);
        expect(C_TO_F(8)).toBeCloseTo(46.4, 6);
        expect(MS_TO_MPH(4.63)).toBeCloseTo(10.36, 2);
    });
});

describe('relativeHumidityFromDewPoint', () => {
    it('returns 100% when dew point equals air temperature', () => {
        expect(relativeHumidityFromDewPoint(15, 15)).toBeCloseTo(100, 6);
    });

    it('matches a known pair (25 C air, 8 C dew point is roughly a third saturated)', () => {
        expect(relativeHumidityFromDewPoint(25, 8)).toBeCloseTo(33.9, 1);
    });

    it('falls as the air warms with the dew point held constant', () => {
        const cool = relativeHumidityFromDewPoint(10, 5);
        const warm = relativeHumidityFromDewPoint(30, 5);
        expect(warm).toBeLessThan(cool);
    });

    it('returns null when either input is missing', () => {
        expect(relativeHumidityFromDewPoint(null, 8)).toBeNull();
        expect(relativeHumidityFromDewPoint(25, null)).toBeNull();
    });
});

describe('windChillF', () => {
    // Values read off the NWS wind chill chart.
    it('matches published chart values', () => {
        expect(windChillF(40, 10)).toBeCloseTo(34, 0);
        expect(windChillF(0, 20)).toBeCloseTo(-22, 0);
        expect(windChillF(-10, 35)).toBeCloseTo(-41, 0);
    });

    it('bites hardest over the first few mph', () => {
        const firstFive = windChillF(20, 5) - windChillF(20, 0.0001);
        const nextFifteen = windChillF(20, 20) - windChillF(20, 5);
        expect(Math.abs(firstFive)).toBeGreaterThan(Math.abs(nextFifteen));
    });
});

describe('heatIndexF', () => {
    it('matches published NWS chart values', () => {
        expect(heatIndexF(90, 60)).toBeCloseTo(100, 0);
        expect(heatIndexF(100, 40)).toBeCloseTo(109, 0);
    });

    it('applies the dry-air adjustment that matters in the basin', () => {
        // Below 13% RH the regression overstates; the adjustment pulls it back.
        expect(heatIndexF(95, 10)).toBeLessThan(95);
    });
});

describe('calculateFeltTemperature', () => {
    it('regression: a raw Celsius reading must never be treated as Fahrenheit', () => {
        // The shipped bug. 25 C is 77 F, but 25 fed in as F tripped the wind
        // chill branch and rendered "19 F" on a 77 F afternoon.
        const correct = calculateFeltTemperature(C_TO_F(25), 33.6, MS_TO_MPH(4.63));
        expect(correct).toBe(77);
    });

    it('returns the plain air temperature in the mild middle range', () => {
        expect(calculateFeltTemperature(70, 40, 8)).toBe(70);
        expect(calculateFeltTemperature(60, 90, 20)).toBe(60);
    });

    it('applies wind chill only at or below 50 F with at least 3 mph of wind', () => {
        expect(calculateFeltTemperature(30, 50, 15)).toBeLessThan(30);
        expect(calculateFeltTemperature(30, 50, 1)).toBe(30);   // too little wind
        expect(calculateFeltTemperature(55, 50, 15)).toBe(55);  // too warm
    });

    it('applies heat index only at or above 80 F with humidity available', () => {
        expect(calculateFeltTemperature(90, 60, 5)).toBeGreaterThan(90);
        expect(calculateFeltTemperature(90, null, 5)).toBe(90); // no humidity
        expect(calculateFeltTemperature(75, 60, 5)).toBe(75);   // too cool
    });

    it('returns null without a temperature', () => {
        expect(calculateFeltTemperature(null, 50, 10)).toBeNull();
    });
});

describe('airDensity', () => {
    it('matches sea-level standard conditions', () => {
        expect(airDensity(101325, 15)).toBeCloseTo(1.225, 2);
    });

    it('is about 20% thinner at basin station pressure', () => {
        const basin = airDensity(83750, 25);
        expect(basin).toBeCloseTo(0.979, 2);
        expect(basin / airDensity(101325, 15)).toBeLessThan(0.85);
    });

    it('returns null when pressure or temperature is missing', () => {
        expect(airDensity(null, 25)).toBeNull();
        expect(airDensity(83750, null)).toBeNull();
    });
});

describe('crosswindComponentMs', () => {
    it('is zero for a pure headwind or tailwind', () => {
        // Wind FROM the north (0) blows TOWARD the south; a ball thrown south
        // (bearing 180) has that wind squarely behind it.
        expect(crosswindComponentMs(10, 0, 180)).toBeCloseTo(0, 6);
        expect(crosswindComponentMs(10, 0, 0)).toBeCloseTo(0, 6);
    });

    it('is the full wind speed for a square crosswind', () => {
        // Wind FROM the west (270) blows TOWARD the east; a ball thrown north
        // takes it entirely on the side, pushing it right.
        expect(crosswindComponentMs(10, 270, 0)).toBeCloseTo(10, 6);
        // Wind from the east pushes the other way.
        expect(crosswindComponentMs(10, 90, 0)).toBeCloseTo(-10, 6);
    });

    it('depends on the throw bearing, which the old model ignored', () => {
        const northThrow = crosswindComponentMs(10, 0, 0);
        const eastThrow = crosswindComponentMs(10, 0, 90);
        expect(Math.abs(northThrow - eastThrow)).toBeGreaterThan(5);
    });

    it('returns null when wind data is missing', () => {
        expect(crosswindComponentMs(null, 180, 0)).toBeNull();
        expect(crosswindComponentMs(10, null, 0)).toBeNull();
    });
});

describe('crosswindDriftInches', () => {
    const rho = 0.979; // basin air density

    it('is zero with no crosswind', () => {
        expect(crosswindDriftInches(BALLS.baseball, 0, rho)).toBeCloseTo(0, 6);
    });

    it('grows with the square of flight time, not linearly', () => {
        // The old model was crosswind speed x time, which is linear. The ball
        // starts with no sideways motion, so the real displacement is 1/2 a t^2.
        const slow = { ...BALLS.baseball, speedMs: BALLS.baseball.speedMs / 2 };
        const ratio = crosswindDriftInches(slow, 5, rho) /
                      crosswindDriftInches(BALLS.baseball, 5, rho);
        expect(ratio).toBeCloseTo(4, 1);
    });

    it('grows with the square of wind speed', () => {
        const ratio = crosswindDriftInches(BALLS.baseball, 10, rho) /
                      crosswindDriftInches(BALLS.baseball, 5, rho);
        expect(ratio).toBeCloseTo(4, 1);
    });

    it('keeps a baseball under an inch in a 10 mph full crosswind', () => {
        // Sanity anchor. The old model reported 83 inches over the same pitch.
        const drift = crosswindDriftInches(BALLS.baseball, 4.63, rho);
        expect(drift).toBeGreaterThan(0.2);
        expect(drift).toBeLessThan(1.0);
    });

    it('moves a football far more than a baseball in the same wind', () => {
        const baseball = crosswindDriftInches(BALLS.baseball, 4.63, rho);
        const football = crosswindDriftInches(BALLS.football, 4.63, rho);
        expect(football / baseball).toBeGreaterThan(10);
    });

    it('returns null when the inputs are missing', () => {
        expect(crosswindDriftInches(BALLS.baseball, null, rho)).toBeNull();
        expect(crosswindDriftInches(BALLS.baseball, 5, null)).toBeNull();
    });
});

describe('formatLogScore', () => {
    it('formats a finite score with a sign', () => {
        expect(formatLogScore(0.0823)).toBe('+0.082');
        expect(formatLogScore(-0.1335)).toBe('-0.134');
        expect(formatLogScore(0)).toBe('+0.000');
    });

    it('renders a wiped bank readably instead of "-Infinity"', () => {
        // settleRound returns log(0) when the winning side was left empty.
        // toFixed() would render the string "-Infinity", which is not a score.
        expect(formatLogScore(-Infinity)).toBe('\u2212\u221e');
        expect(formatLogScore(NaN)).toBe('\u2014');
    });
});

describe('settleRound', () => {
    it('rewards the side that actually won', () => {
        // The shipped bug printed "RIGHT WINS" and then grew the LEFT stake.
        const leftWon = settleRound(1000, 0.8, true, 0.5);
        const rightWon = settleRound(1000, 0.8, false, 0.5);
        expect(leftWon.tokens).toBeGreaterThan(1000);
        expect(rightWon.tokens).toBeLessThan(1000);
    });

    it('is a fair game: expected bank is unchanged for any allocation', () => {
        for (const x of [0, 0.25, 0.5, 0.75, 1]) {
            const expected = 0.5 * settleRound(1000, x, true, 0.5).tokens +
                             0.5 * settleRound(1000, x, false, 0.5).tokens;
            expect(expected).toBeCloseTo(1000, 6);
        }
    });

    it('leaves the bank untouched when you match the house quote', () => {
        expect(settleRound(1000, 0.5, true, 0.5).tokens).toBeCloseTo(1000, 6);
        expect(settleRound(1000, 0.3, true, 0.3).tokens).toBeCloseTo(1000, 6);
    });

    it('scores zero when your forecast equals the house forecast', () => {
        expect(settleRound(1000, 0.5, true, 0.5).logScore).toBeCloseTo(0, 6);
        expect(settleRound(1000, 0.7, false, 0.7).logScore).toBeCloseTo(0, 6);
    });

    it('is a proper scoring rule: honest reporting maximises expected log score', () => {
        // With a true probability p, expected log score peaks at x = p.
        const p = 0.7;
        const expectedLogScore = x =>
            p * settleRound(1000, x, true, 0.5).logScore +
            (1 - p) * settleRound(1000, x, false, 0.5).logScore;

        let best = -Infinity;
        let bestX = null;
        for (let x = 0.01; x < 1; x += 0.01) {
            const score = expectedLogScore(x);
            if (score > best) { best = score; bestX = x; }
        }
        expect(bestX).toBeCloseTo(p, 1);

        // And the growth rate achieved is the KL divergence from the house quote.
        const kl = p * Math.log(p / 0.5) + (1 - p) * Math.log((1 - p) / 0.5);
        expect(best).toBeCloseTo(kl, 3);
    });

    it('wipes the bank when the winning side was left empty', () => {
        const result = settleRound(1000, 0, true, 0.5);
        expect(result.tokens).toBe(0);
        expect(result.logScore).toBe(-Infinity);
    });
});
