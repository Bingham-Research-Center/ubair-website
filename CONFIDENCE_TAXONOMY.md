# Confidence Thresholds Taxonomy

## Overview

This document defines the **3-level confidence taxonomy** used throughout the Uintah Basin Air Quality website for communicating uncertainty in measurements, predictions, and automated detections.

## Design Principles

1. **Semantic Clarity**: Use meaningful names (Possibility, Probability, Best Guess) rather than technical jargon
2. **Visual Consistency**: Uniform color coding and icons across all features
3. **User Trust**: Transparent about uncertainty and data quality
4. **Actionability**: Help users understand the reliability of information for decision-making

## Three Confidence Levels

### 1. POSSIBILITY (0-40%)
- **Display**: "Possible" with `?` icon
- **Color**: Grey (#6c757d)
- **Meaning**: Conditions suggest this MIGHT be occurring
- **Use Cases**:
  - Single indirect indicator
  - Conflicting data sources
  - Estimated values from regional weather
  - Stale data (>2 hours old)
  - Marginal temperature conditions (35-40°F for snow)

**Example**: "Possible snow on SR-121" when:
- Camera analysis disabled
- No direct sensor measurements
- Regional weather shows precipitation
- Temperature near freezing point

### 2. PROBABILITY (40-75%)
- **Display**: "Likely" with `~` icon
- **Color**: Yellow/Amber (#ffc107)
- **Meaning**: Conditions indicate this is LIKELY occurring
- **Use Cases**:
  - Multiple supporting indicators
  - Recent data (15-60 minutes old)
  - Single high-quality direct measurement
  - Camera analysis with temperature correlation
  - Temporal consistency over short period

**Example**: "Likely icy conditions on US-40" when:
- Road surface temp shows 30°F
- Camera shows wet pavement
- Recent precipitation reported
- But no direct ice detection sensor

### 3. BEST_GUESS (75-100%)
- **Display**: "Confirmed" with `✓` icon
- **Color**: Green (#28a745)
- **Meaning**: High confidence determination based on multiple factors
- **Use Cases**:
  - Direct sensor measurement (UDOT road stations)
  - Multiple corroborating sources
  - Very recent data (<15 minutes)
  - High temporal consistency
  - Spatial agreement with nearby sensors
  - Temperature + visual + precipitation all align

**Example**: "Confirmed snow on I-80" when:
- UDOT weather station reports "snow/ice"
- Surface temperature 25°F
- Camera shows white accumulation
- Multiple nearby stations agree
- Data from last 10 minutes

## Confidence Calculation Framework

### Base Confidence Sources

```javascript
// Example: Snow detection composite confidence
const sources = [
    { confidence: 0.85, weight: 1.5, source: 'UDOT surface status' },
    { confidence: 0.72, weight: 1.2, source: 'Camera white pixel analysis' },
    { confidence: 0.90, weight: 1.0, source: 'Temperature < 32°F' },
    { confidence: 0.60, weight: 0.8, source: 'NWS precipitation forecast' }
];

// Weighted average
const baseConfidence = calculateCompositeConfidence(sources);
```

### Quality Adjustments

```javascript
// Apply data quality penalties/bonuses
const qualityIndicators = {
    ageMinutes: 12,                    // Data recency
    sensorReliability: 0.95,           // Known sensor accuracy
    temporalConsistency: 0.80,         // Agreement with recent history
    spatialAgreement: 0.85,            // Nearby sensors agree
};

const finalConfidence = adjustConfidenceForQuality(baseConfidence, qualityIndicators);
```

### Age-Based Decay

| Data Age | Confidence Multiplier | Rationale |
|----------|----------------------|-----------|
| < 15 min | 1.00 | Real-time |
| 15-30 min | 0.95 | Recent |
| 30-60 min | 0.85 | Somewhat stale |
| 1-2 hours | 0.70 | Potentially outdated |
| > 2 hours | 0.50 | Unreliable |

## UI Display Guidelines

### Badges

```html
<!-- Example badge rendering -->
<span class="confidence-badge confidence-confirmed"
      style="background-color: #28a745; color: white;"
      title="High confidence determination based on multiple factors">
    ✓ Confirmed (87%)
</span>
```

### Tooltips

Tooltips should explain:
1. **Confidence level** and what it means
2. **Data sources** contributing to the assessment
3. **Factors** that increased or decreased confidence
4. **Limitations** of the measurement

**Example Tooltip**:
```
Likely: Conditions indicate this is likely occurring

Data source: UDOT Weather Station + Camera Analysis
Factors contributing to confidence:
• Direct temperature measurement (28°F)
• Camera shows 32% white pixels
• Consistent with observations from last 30 minutes

Limitations:
• Camera view partially obscured
• No direct ice detection sensor
```

### Color Coding

All confidence-related displays must use these exact colors:
- **Grey** `#6c757d` - Possible
- **Yellow/Amber** `#ffc107` - Likely
- **Green** `#28a745` - Confirmed

Never use RED for confidence levels (reserve for danger/alerts).

## Integration Points

### 1. Snow Detection (Camera Analysis)
```javascript
// server/snowDetectionService.js
import { getConfidenceLevel, getConfidenceBadge } from './confidenceThresholds.js';

const detection = await analyzeImageForSnow(imageUrl, cameraId, weatherData);
const confidenceLevel = getConfidenceLevel(detection.confidence);
console.log(`Snow detection: ${confidenceLevel.displayText} (${Math.round(detection.confidence * 100)}%)`);
```

### 2. Road Conditions Display
```javascript
// public/js/roads.js
import { getConfidenceBadge } from '/api/confidence-utilities';

const badge = getConfidenceBadge(segment.confidence, {
    showIcon: true,
    showPercentage: false,
    showTooltip: true
});
```

### 3. Air Quality Forecasts
- **Confirmed**: Direct sensor measurements (O₃ monitors)
- **Likely**: Forecast models with recent initialization
- **Possible**: Extended forecast periods (>48 hours)

### 4. Traffic Events
- **Confirmed**: Verified by UDOT or law enforcement
- **Likely**: Reported via 511, awaiting verification
- **Possible**: Inferred from traffic flow anomalies

## Validation & Testing

### Unit Tests
All confidence calculations must pass validation:
- Range check (0 ≤ confidence ≤ 1)
- Level assignment consistency
- Quality adjustment behavior
- Composite confidence logic

Run: `npm test -- confidenceThresholds.test.js`

### User Testing Goals
- Users can distinguish between the 3 levels
- Color coding is intuitive (no color blindness issues)
- Tooltips provide sufficient context
- Confidence levels align with user expectations

## Migration Guide

### Existing Code Updates

**Before**:
```javascript
const confidence = 0.67;
display = `Confidence: ${Math.round(confidence * 100)}%`;
```

**After**:
```javascript
import { getConfidenceBadge } from './confidenceThresholds.js';
const confidence = 0.67;
const badge = getConfidenceBadge(confidence, { showPercentage: true });
```

### Backward Compatibility
- Raw confidence values (0-1) remain unchanged
- New taxonomy is additive (doesn't break existing displays)
- Old percentage displays can coexist during transition

## Future Enhancements

1. **Machine Learning Calibration**
   - Train on historical data to optimize thresholds
   - Adjust 40% and 75% boundaries based on actual accuracy

2. **User Feedback Loop**
   - Allow users to report incorrect confidence levels
   - Use feedback to refine calculation weights

3. **Granular Sub-levels**
   - Possible-Low, Possible-High
   - Enable more nuanced communication

4. **Multi-language Support**
   - Translate level names while maintaining semantics
   - Cultural appropriateness of visual indicators

## References

- Snow Detection Service: `/server/snowDetectionService.js`
- Confidence Utilities: `/server/confidenceThresholds.js`
- Test Suite: `/server/__tests__/snowDetection.test.js`
- UI Components: `/public/js/roads.js`

---

**Document Version**: 1.0
**Last Updated**: 2025-10-06
**Owner**: Bingham Research Center Development Team
