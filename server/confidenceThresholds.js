/**
 * Confidence Thresholds Taxonomy (P1)
 *
 * Defines 3 levels of confidence for snow detection and road conditions:
 * 1. POSSIBILITY - Conditions suggest this MIGHT be occurring (low confidence)
 * 2. PROBABILITY - Conditions indicate this is LIKELY occurring (medium confidence)
 * 3. BEST_GUESS - High confidence determination based on multiple factors
 *
 * Site-wide consistency for uncertainty communication
 */

/**
 * Confidence level definitions
 */
export const ConfidenceLevels = {
    POSSIBILITY: {
        name: 'Possibility',
        range: [0, 0.4],
        description: 'Conditions suggest this might be occurring',
        badge: 'possible',
        color: '#6c757d',
        icon: '?',
        displayText: 'Possible'
    },
    PROBABILITY: {
        name: 'Probability',
        range: [0.4, 0.75],
        description: 'Conditions indicate this is likely occurring',
        badge: 'likely',
        color: '#ffc107',
        icon: '~',
        displayText: 'Likely'
    },
    BEST_GUESS: {
        name: 'Best Guess',
        range: [0.75, 1.0],
        description: 'High confidence determination based on multiple factors',
        badge: 'confirmed',
        color: '#28a745',
        icon: '✓',
        displayText: 'Confirmed'
    }
};

/**
 * Determine confidence level from numeric confidence value
 * @param {number} confidence - Confidence value between 0 and 1
 * @returns {Object} Confidence level object
 */
export function getConfidenceLevel(confidence) {
    if (confidence < 0 || confidence > 1 || isNaN(confidence)) {
        throw new Error(`Confidence must be between 0 and 1, got ${confidence}`);
    }

    if (confidence < ConfidenceLevels.POSSIBILITY.range[1]) {
        return ConfidenceLevels.POSSIBILITY;
    } else if (confidence < ConfidenceLevels.PROBABILITY.range[1]) {
        return ConfidenceLevels.PROBABILITY;
    } else {
        return ConfidenceLevels.BEST_GUESS;
    }
}

/**
 * Get confidence badge HTML for UI display
 * @param {number} confidence - Confidence value between 0 and 1
 * @param {Object} options - Display options
 * @returns {string} HTML string for badge
 */
export function getConfidenceBadge(confidence, options = {}) {
    const level = getConfidenceLevel(confidence);
    const showIcon = options.showIcon !== false;
    const showPercentage = options.showPercentage === true;
    const showTooltip = options.showTooltip !== false;

    let badgeText = level.displayText;
    if (showIcon) {
        badgeText = `${level.icon} ${badgeText}`;
    }
    if (showPercentage) {
        badgeText += ` (${Math.round(confidence * 100)}%)`;
    }

    const tooltip = showTooltip ? `title="${level.description}"` : '';

    return `<span class="confidence-badge confidence-${level.badge}"
                  style="background-color: ${level.color}; color: white; padding: 2px 8px; border-radius: 4px; font-size: 0.85em;"
                  ${tooltip}>
                ${badgeText}
            </span>`;
}

/**
 * Get confidence tooltip text
 * @param {number} confidence - Confidence value between 0 and 1
 * @param {Object} context - Additional context about the measurement
 * @returns {string} Tooltip text
 */
export function getConfidenceTooltip(confidence, context = {}) {
    const level = getConfidenceLevel(confidence);
    let tooltip = level.description;

    // Add context-specific information
    if (context.dataSource) {
        tooltip += `\n\nData source: ${context.dataSource}`;
    }

    if (context.factors && context.factors.length > 0) {
        tooltip += '\n\nFactors contributing to confidence:';
        context.factors.forEach(factor => {
            tooltip += `\n• ${factor}`;
        });
    }

    if (context.limitations) {
        tooltip += '\n\nLimitations:';
        context.limitations.forEach(limitation => {
            tooltip += `\n• ${limitation}`;
        });
    }

    return tooltip;
}

/**
 * Calculate composite confidence from multiple sources
 * @param {Array<Object>} sources - Array of {confidence, weight} objects
 * @returns {number} Weighted average confidence
 */
export function calculateCompositeConfidence(sources) {
    if (!sources || sources.length === 0) {
        return 0;
    }

    let totalWeight = 0;
    let weightedSum = 0;

    sources.forEach(source => {
        const confidence = Math.max(0, Math.min(1, source.confidence));
        const weight = source.weight || 1.0;

        weightedSum += confidence * weight;
        totalWeight += weight;
    });

    return totalWeight > 0 ? weightedSum / totalWeight : 0;
}

/**
 * Adjust confidence based on data quality indicators
 * @param {number} baseConfidence - Initial confidence value
 * @param {Object} qualityIndicators - Data quality metrics
 * @returns {number} Adjusted confidence value
 */
export function adjustConfidenceForQuality(baseConfidence, qualityIndicators = {}) {
    let adjusted = baseConfidence;

    // Data age penalty
    if (qualityIndicators.ageMinutes) {
        if (qualityIndicators.ageMinutes > 60) {
            adjusted *= 0.7; // 30% confidence reduction for data older than 1 hour
        } else if (qualityIndicators.ageMinutes > 30) {
            adjusted *= 0.85; // 15% reduction for data older than 30 minutes
        } else if (qualityIndicators.ageMinutes > 15) {
            adjusted *= 0.95; // 5% reduction for data older than 15 minutes
        }
    }

    // Sensor reliability
    if (qualityIndicators.sensorReliability !== undefined) {
        adjusted *= qualityIndicators.sensorReliability;
    }

    // Temporal consistency bonus
    if (qualityIndicators.temporalConsistency) {
        adjusted *= (1 + qualityIndicators.temporalConsistency * 0.1); // Up to 10% boost
    }

    // Spatial agreement bonus (nearby sensors agree)
    if (qualityIndicators.spatialAgreement) {
        adjusted *= (1 + qualityIndicators.spatialAgreement * 0.15); // Up to 15% boost
    }

    return Math.max(0, Math.min(1, adjusted));
}

/**
 * Generate confidence explanation for user display
 * @param {number} confidence - Confidence value
 * @param {Object} factors - Factors affecting confidence
 * @returns {string} Human-readable explanation
 */
export function explainConfidence(confidence, factors = {}) {
    const level = getConfidenceLevel(confidence);
    let explanation = `${level.displayText}: `;

    const parts = [];

    if (factors.directMeasurement) {
        parts.push('direct sensor measurement');
    }

    if (factors.temperature !== undefined) {
        if (factors.temperature > 40) {
            parts.push('temperature too warm for snow');
        } else if (factors.temperature <= 30) {
            parts.push('temperature ideal for snow');
        } else {
            parts.push('temperature in marginal snow range');
        }
    }

    if (factors.cameraAnalysis) {
        parts.push(`camera shows ${factors.whitePixelPercent}% white pixels`);
    }

    if (factors.temporalConsistency) {
        parts.push('consistent with recent observations');
    } else if (factors.temporalConsistency === false) {
        parts.push('conflicts with recent observations');
    }

    if (factors.dataAge) {
        if (factors.dataAge < 15) {
            parts.push('very recent data');
        } else if (factors.dataAge < 60) {
            parts.push(`data from ${factors.dataAge} minutes ago`);
        } else {
            parts.push('data may be outdated');
        }
    }

    if (parts.length > 0) {
        explanation += parts.join(', ');
    } else {
        explanation += level.description.toLowerCase();
    }

    return explanation;
}

/**
 * Validate confidence calculation meets quality standards
 * @param {number} confidence - Calculated confidence value
 * @param {Object} metadata - Calculation metadata
 * @returns {Object} Validation result with warnings
 */
export function validateConfidence(confidence, metadata = {}) {
    const warnings = [];
    const errors = [];

    // Check confidence range
    if (isNaN(confidence) || confidence < 0 || confidence > 1) {
        errors.push(`Confidence ${confidence} is outside valid range [0, 1]`);
        // Return early for invalid confidence
        return {
            valid: false,
            errors,
            warnings,
            level: null
        };
    }

    // Check for missing critical data
    if (!metadata.dataSource) {
        warnings.push('No data source specified');
    }

    // Check for stale data
    if (metadata.ageMinutes && metadata.ageMinutes > 120) {
        warnings.push(`Data is ${metadata.ageMinutes} minutes old - confidence may be overestimated`);
    }

    // Check for single-source reliance
    if (metadata.sourceCount === 1 && confidence > 0.8) {
        warnings.push('High confidence from single source - consider additional verification');
    }

    // Check for conflicting signals
    if (metadata.hasConflictingSignals) {
        warnings.push('Conflicting data sources detected - confidence may need adjustment');
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings,
        level: getConfidenceLevel(confidence)
    };
}

/**
 * Default export with all utilities
 */
export default {
    ConfidenceLevels,
    getConfidenceLevel,
    getConfidenceBadge,
    getConfidenceTooltip,
    calculateCompositeConfidence,
    adjustConfidenceForQuality,
    explainConfidence,
    validateConfidence
};
