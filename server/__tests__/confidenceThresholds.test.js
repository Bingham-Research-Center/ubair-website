/**
 * Unit Tests for Confidence Thresholds Taxonomy
 *
 * Tests the 3-level confidence system:
 * - POSSIBILITY (0-40%)
 * - PROBABILITY (40-75%)
 * - BEST_GUESS (75-100%)
 */

import {
    ConfidenceLevels,
    getConfidenceLevel,
    getConfidenceBadge,
    getConfidenceTooltip,
    calculateCompositeConfidence,
    adjustConfidenceForQuality,
    explainConfidence,
    validateConfidence
} from '../confidenceThresholds.js';
import { describe, it, expect } from '@jest/globals';

describe('Confidence Thresholds Taxonomy', () => {

    describe('getConfidenceLevel', () => {
        it('should return POSSIBILITY for confidence 0-40%', () => {
            expect(getConfidenceLevel(0).name).toBe('Possibility');
            expect(getConfidenceLevel(0.2).name).toBe('Possibility');
            expect(getConfidenceLevel(0.39).name).toBe('Possibility');
        });

        it('should return PROBABILITY for confidence 40-75%', () => {
            expect(getConfidenceLevel(0.4).name).toBe('Probability');
            expect(getConfidenceLevel(0.55).name).toBe('Probability');
            expect(getConfidenceLevel(0.74).name).toBe('Probability');
        });

        it('should return BEST_GUESS for confidence 75-100%', () => {
            expect(getConfidenceLevel(0.75).name).toBe('Best Guess');
            expect(getConfidenceLevel(0.85).name).toBe('Best Guess');
            expect(getConfidenceLevel(1.0).name).toBe('Best Guess');
        });

        it('should throw error for invalid confidence values', () => {
            expect(() => getConfidenceLevel(-0.1)).toThrow();
            expect(() => getConfidenceLevel(1.1)).toThrow();
            expect(() => getConfidenceLevel(NaN)).toThrow();
        });

        it('should have correct visual properties for each level', () => {
            const possibility = getConfidenceLevel(0.3);
            expect(possibility.color).toBe('#6c757d');
            expect(possibility.icon).toBe('?');
            expect(possibility.displayText).toBe('Possible');

            const probability = getConfidenceLevel(0.6);
            expect(probability.color).toBe('#ffc107');
            expect(probability.icon).toBe('~');
            expect(probability.displayText).toBe('Likely');

            const bestGuess = getConfidenceLevel(0.9);
            expect(bestGuess.color).toBe('#28a745');
            expect(bestGuess.icon).toBe('✓');
            expect(bestGuess.displayText).toBe('Confirmed');
        });
    });

    describe('getConfidenceBadge', () => {
        it('should generate HTML badge with correct styling', () => {
            const badge = getConfidenceBadge(0.85, { showIcon: true, showPercentage: false });

            expect(badge).toContain('confidence-badge');
            expect(badge).toContain('confidence-confirmed');
            expect(badge).toContain('#28a745');
            expect(badge).toContain('✓');
            expect(badge).toContain('Confirmed');
        });

        it('should optionally show percentage', () => {
            const badgeWithPercent = getConfidenceBadge(0.67, { showPercentage: true });
            expect(badgeWithPercent).toContain('67%');

            const badgeWithoutPercent = getConfidenceBadge(0.67, { showPercentage: false });
            expect(badgeWithoutPercent).not.toContain('67%');
        });

        it('should optionally hide icon', () => {
            const badgeWithIcon = getConfidenceBadge(0.5, { showIcon: true });
            expect(badgeWithIcon).toContain('~');

            const badgeWithoutIcon = getConfidenceBadge(0.5, { showIcon: false });
            expect(badgeWithoutIcon).not.toContain('~');
        });

        it('should include tooltip by default', () => {
            const badge = getConfidenceBadge(0.5);
            expect(badge).toContain('title=');
        });
    });

    describe('calculateCompositeConfidence', () => {
        it('should calculate weighted average correctly', () => {
            const sources = [
                { confidence: 0.8, weight: 1.0 },
                { confidence: 0.6, weight: 1.0 }
            ];
            const result = calculateCompositeConfidence(sources);
            expect(result).toBeCloseTo(0.7, 2);
        });

        it('should handle different weights', () => {
            const sources = [
                { confidence: 0.9, weight: 2.0 },
                { confidence: 0.3, weight: 1.0 }
            ];
            const result = calculateCompositeConfidence(sources);
            expect(result).toBeCloseTo(0.7, 2); // (0.9*2 + 0.3*1) / (2+1) = 0.7
        });

        it('should default weight to 1.0 if not specified', () => {
            const sources = [
                { confidence: 0.8 },
                { confidence: 0.4 }
            ];
            const result = calculateCompositeConfidence(sources);
            expect(result).toBeCloseTo(0.6, 2);
        });

        it('should return 0 for empty sources', () => {
            expect(calculateCompositeConfidence([])).toBe(0);
            expect(calculateCompositeConfidence(null)).toBe(0);
        });

        it('should clamp confidence values to 0-1 range', () => {
            const sources = [
                { confidence: 1.5, weight: 1.0 },
                { confidence: -0.2, weight: 1.0 }
            ];
            const result = calculateCompositeConfidence(sources);
            expect(result).toBeGreaterThanOrEqual(0);
            expect(result).toBeLessThanOrEqual(1);
        });
    });

    describe('adjustConfidenceForQuality', () => {
        it('should reduce confidence for old data', () => {
            const base = 0.9;

            const fresh = adjustConfidenceForQuality(base, { ageMinutes: 5 });
            expect(fresh).toBeCloseTo(0.9, 2);

            const recent = adjustConfidenceForQuality(base, { ageMinutes: 20 });
            expect(recent).toBeCloseTo(0.855, 2); // 0.9 * 0.95

            const stale = adjustConfidenceForQuality(base, { ageMinutes: 45 });
            expect(stale).toBeCloseTo(0.765, 2); // 0.9 * 0.85

            const old = adjustConfidenceForQuality(base, { ageMinutes: 90 });
            expect(old).toBeCloseTo(0.63, 2); // 0.9 * 0.7
        });

        it('should apply sensor reliability multiplier', () => {
            const base = 0.8;
            const adjusted = adjustConfidenceForQuality(base, { sensorReliability: 0.9 });
            expect(adjusted).toBeCloseTo(0.72, 2);
        });

        it('should boost confidence for temporal consistency', () => {
            const base = 0.7;
            const adjusted = adjustConfidenceForQuality(base, { temporalConsistency: 0.8 });
            expect(adjusted).toBeCloseTo(0.756, 2); // 0.7 * (1 + 0.8*0.1)
        });

        it('should boost confidence for spatial agreement', () => {
            const base = 0.7;
            const adjusted = adjustConfidenceForQuality(base, { spatialAgreement: 0.9 });
            expect(adjusted).toBeCloseTo(0.7945, 2); // 0.7 * (1 + 0.9*0.15)
        });

        it('should combine multiple quality factors', () => {
            const base = 0.8;
            const adjusted = adjustConfidenceForQuality(base, {
                ageMinutes: 10,
                sensorReliability: 0.95,
                temporalConsistency: 0.9,
                spatialAgreement: 0.85
            });

            expect(adjusted).toBeGreaterThan(base); // Should be boosted overall
            expect(adjusted).toBeLessThanOrEqual(1.0); // Should be clamped
        });

        it('should clamp result to 0-1 range', () => {
            const highBoost = adjustConfidenceForQuality(0.9, {
                temporalConsistency: 1.0,
                spatialAgreement: 1.0
            });
            expect(highBoost).toBeLessThanOrEqual(1.0);

            const heavyPenalty = adjustConfidenceForQuality(0.5, {
                ageMinutes: 150,
                sensorReliability: 0.5
            });
            expect(heavyPenalty).toBeGreaterThanOrEqual(0.0);
        });
    });

    describe('explainConfidence', () => {
        it('should generate human-readable explanation', () => {
            const explanation = explainConfidence(0.85, {
                directMeasurement: true,
                temperature: 28,
                dataAge: 10
            });

            expect(explanation).toContain('Confirmed');
            expect(explanation).toContain('direct sensor measurement');
            expect(explanation).toContain('ideal for snow');
            expect(explanation).toContain('very recent data');
        });

        it('should explain low confidence', () => {
            const explanation = explainConfidence(0.25, {
                temperature: 45,
                dataAge: 90
            });

            expect(explanation).toContain('Possible');
            expect(explanation).toContain('too warm for snow');
            expect(explanation).toContain('may be outdated');
        });

        it('should mention camera analysis when present', () => {
            const explanation = explainConfidence(0.7, {
                cameraAnalysis: true,
                whitePixelPercent: 32
            });

            expect(explanation).toContain('camera shows 32% white pixels');
        });

        it('should note temporal consistency', () => {
            const consistent = explainConfidence(0.8, { temporalConsistency: true });
            expect(consistent).toContain('consistent with recent observations');

            const inconsistent = explainConfidence(0.4, { temporalConsistency: false });
            expect(inconsistent).toContain('conflicts with recent observations');
        });
    });

    describe('validateConfidence', () => {
        it('should validate confidence in correct range', () => {
            const valid = validateConfidence(0.75, { dataSource: 'UDOT' });
            expect(valid.valid).toBe(true);
            expect(valid.errors).toHaveLength(0);
        });

        it('should detect out-of-range confidence', () => {
            const tooLow = validateConfidence(-0.1, {});
            expect(tooLow.valid).toBe(false);
            expect(tooLow.errors.length).toBeGreaterThan(0);

            const tooHigh = validateConfidence(1.5, {});
            expect(tooHigh.valid).toBe(false);
            expect(tooHigh.errors.length).toBeGreaterThan(0);
        });

        it('should warn about missing data source', () => {
            const result = validateConfidence(0.6, {});
            expect(result.warnings).toContainEqual(expect.stringContaining('No data source'));
        });

        it('should warn about stale data', () => {
            const result = validateConfidence(0.8, { ageMinutes: 150 });
            expect(result.warnings).toContainEqual(expect.stringContaining('minutes old'));
        });

        it('should warn about single-source high confidence', () => {
            const result = validateConfidence(0.85, { sourceCount: 1 });
            expect(result.warnings).toContainEqual(expect.stringContaining('single source'));
        });

        it('should warn about conflicting signals', () => {
            const result = validateConfidence(0.7, { hasConflictingSignals: true });
            expect(result.warnings).toContainEqual(expect.stringContaining('Conflicting'));
        });

        it('should include confidence level in validation result', () => {
            const result = validateConfidence(0.88, { dataSource: 'Camera' });
            expect(result.level.name).toBe('Best Guess');
        });
    });

    describe('Boundary Testing', () => {
        it('should handle exact threshold values consistently', () => {
            // Test at exact boundaries
            expect(getConfidenceLevel(0.0).name).toBe('Possibility');
            expect(getConfidenceLevel(0.4).name).toBe('Probability');
            expect(getConfidenceLevel(0.75).name).toBe('Best Guess');
            expect(getConfidenceLevel(1.0).name).toBe('Best Guess');
        });

        it('should handle values just below thresholds', () => {
            expect(getConfidenceLevel(0.399).name).toBe('Possibility');
            expect(getConfidenceLevel(0.749).name).toBe('Probability');
        });

        it('should handle values just above thresholds', () => {
            expect(getConfidenceLevel(0.401).name).toBe('Probability');
            expect(getConfidenceLevel(0.751).name).toBe('Best Guess');
        });
    });

    describe('Real-World Scenarios', () => {
        it('should calculate confidence for UDOT sensor + camera', () => {
            const sources = [
                { confidence: 0.95, weight: 1.5, source: 'UDOT surface status' },
                { confidence: 0.72, weight: 1.2, source: 'Camera analysis' },
                { confidence: 0.90, weight: 1.0, source: 'Temperature check' }
            ];

            const composite = calculateCompositeConfidence(sources);
            expect(composite).toBeGreaterThan(0.75); // Should be BEST_GUESS

            const level = getConfidenceLevel(composite);
            expect(level.name).toBe('Best Guess');
        });

        it('should downgrade stale high-quality data', () => {
            const sources = [
                { confidence: 0.95, weight: 1.0 }
            ];

            const base = calculateCompositeConfidence(sources);
            const adjusted = adjustConfidenceForQuality(base, {
                ageMinutes: 90,
                sensorReliability: 0.95
            });

            expect(adjusted).toBeLessThan(base);
            expect(getConfidenceLevel(adjusted).name).not.toBe('Best Guess');
        });

        it('should boost marginal confidence with spatial agreement', () => {
            const sources = [
                { confidence: 0.65, weight: 1.0 }
            ];

            const base = calculateCompositeConfidence(sources);
            const boosted = adjustConfidenceForQuality(base, {
                spatialAgreement: 0.9,
                temporalConsistency: 0.8
            });

            expect(boosted).toBeGreaterThan(base);
        });
    });
});

/**
 * Integration Test: Full Confidence Workflow
 */
describe('Confidence Workflow Integration', () => {
    it('should process complete confidence calculation pipeline', () => {
        // Step 1: Multiple data sources with different qualities
        const sources = [
            { confidence: 0.85, weight: 1.5, source: 'Direct sensor' },
            { confidence: 0.60, weight: 1.0, source: 'Camera' },
            { confidence: 0.70, weight: 0.8, source: 'Regional weather' }
        ];

        // Step 2: Calculate composite
        const composite = calculateCompositeConfidence(sources);
        expect(composite).toBeGreaterThan(0);

        // Step 3: Apply quality adjustments
        const adjusted = adjustConfidenceForQuality(composite, {
            ageMinutes: 12,
            sensorReliability: 0.92,
            temporalConsistency: 0.85,
            spatialAgreement: 0.90
        });

        // Step 4: Validate
        const validation = validateConfidence(adjusted, {
            dataSource: 'Multi-source',
            sourceCount: 3,
            ageMinutes: 12
        });

        expect(validation.valid).toBe(true);
        expect(validation.warnings.length).toBeLessThan(2);

        // Step 5: Get level and explanation
        const level = getConfidenceLevel(adjusted);
        const explanation = explainConfidence(adjusted, {
            directMeasurement: true,
            temperature: 28,
            dataAge: 12
        });

        expect(['Probability', 'Best Guess']).toContain(level.name);
        expect(explanation).toContain(level.displayText);

        // Step 6: Generate UI badge
        const badge = getConfidenceBadge(adjusted, {
            showIcon: true,
            showPercentage: true
        });

        expect(badge).toContain('confidence-badge');
        expect(badge).toContain(level.icon);
    });
});
