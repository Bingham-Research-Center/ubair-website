# Winter Ozone Science & Meteorology Guide

## Overview
This guide explains the unique winter ozone phenomenon in the Uintah Basin and the meteorological factors that drive it. Understanding the science helps developers make informed decisions about data visualization and forecast priorities.

## The Winter Ozone Problem

### What Makes It Unique?
Unlike typical summer ozone (urban smog), Uintah Basin experiences high ozone in **winter** under specific conditions:
- **Snow cover** (high albedo reflects UV radiation)
- **Temperature inversions** (trap pollutants near surface)
- **Calm winds** (prevent mixing and dispersion)
- **Sunny days** (drive photochemical reactions)

### The Perfect Storm Conditions
```
Snow + Inversion + Sun + Calm = High Ozone
```

## Key Meteorological Variables

### 1. Temperature Inversion
**What it is:** Warm air sits above cold air, acting like a lid

**Why it matters:** 
- Traps emissions near the ground
- Prevents vertical mixing
- Creates stable conditions for ozone formation

**How to detect in data:**
```javascript
// Inversion strength = temperature difference
const inversionStrength = upperAirTemp - surfaceTemp;
const hasInversion = inversionStrength > 0;
const strongInversion = inversionStrength > 5; // °C
```

### 2. Wind Speed & Direction
**Critical thresholds:**
- **< 2 m/s**: Very poor dispersion
- **2-4 m/s**: Marginal dispersion  
- **> 4 m/s**: Good dispersion, breaks inversions

**Valley drainage patterns:**
- Night: Down-valley (cooling)
- Day: Up-valley (heating)
- Stagnant: < 1 m/s, variable direction

### 3. Snow Depth & Albedo
**Why snow matters:**
- Reflects UV radiation back through pollution layer
- Doubles photochemical reaction potential
- Threshold: > 2 inches for significant effect

**Data consideration:**
```javascript
const snowFactor = snowDepth > 50 ? 2.0 : 1.0; // mm
const ozoneRisk = baseRisk * snowFactor;
```

### 4. Solar Radiation
**Even in winter:**
- Short days but intense UV when sun is out
- Snow reflection amplifies effect
- Cloud cover critical variable

## Pollution Sources

### Oil & Gas Operations
- **VOCs** (Volatile Organic Compounds): Methane, ethane, propane
- **NOx** (Nitrogen Oxides): Combustion from engines, flares
- Peak emissions: Morning startup, afternoon operations

### Geographic Distribution
```
West Basin: Higher density wells → Higher VOC emissions
East Basin: Fewer wells → Lower background levels
Roosevelt: Urban + oil/gas mix
Vernal: Urban emissions dominant
```

## Ozone Formation Chemistry (Simplified)

```
VOCs + NOx + Sunlight → Ozone (O₃)

Morning:   High NOx, Low O₃ (NOx titration)
Midday:    Peak sunlight → O₃ formation begins  
Afternoon: Peak O₃ (2-4 PM typically)
Evening:   O₃ decays, NOx increases
```

## Critical Data Relationships

### Temperature vs. Ozone
- **Winter**: Inverse relationship (colder = higher ozone)
- **Why**: Cold temperatures indicate strong inversions
- **Threshold**: Surface temp < -5°C often = high ozone days

### Wind Speed vs. Ozone
```javascript
// Exponential decay relationship
const ozoneReduction = Math.exp(-0.5 * windSpeed);
```

### Multi-day Episodes
**Pattern progression:**
1. Day 1: Inversion forms, light accumulation
2. Day 2-3: Building concentrations
3. Day 4+: Peak ozone, often > 70 ppb
4. Breakup: Storm system brings wind/clouds

## Forecast Priorities

### What to Show Users

**High Priority:**
- Current ozone (ppb)
- Wind speed & direction
- Temperature (inversion indicator)
- 3-day forecast (episode potential)

**Medium Priority:**
- Snow depth
- Solar radiation/cloud cover
- PM2.5 (often correlates)
- Mixing height

**Context Clues:**
- Multi-day trends (building vs. clearing)
- Regional patterns (west vs. east basin)
- Time of day patterns

## Data Visualization Best Practices

### Color Scales for Ozone (EPA AQI)
```javascript
const ozoneColors = {
    good:      { range: [0, 54],   color: '#00e400' },  // Green
    moderate:  { range: [55, 70],  color: '#ffff00' },  // Yellow  
    unhealthy: { range: [71, 85],  color: '#ff7e00' },  // Orange
    veryUnhealthy: { range: [86, 105], color: '#ff0000' }, // Red
    hazardous: { range: [106, 200], color: '#8f3f97' }   // Purple
};
```

### Time Series Considerations
- Show 24-hour cycles (diurnal patterns)
- Include previous days for context
- Mark sunrise/sunset (photochemistry timing)
- Highlight multi-day buildups

### Map Displays
- West vs. East basin distinction
- Elevation contours (inversions pool in valleys)
- Wind barbs or arrows
- Station clustering at zoom levels

## Seasonal Patterns

### Winter (Dec-Feb)
- **Peak ozone season**
- Episodes last 3-10 days
- Triggered by high pressure systems
- Broken by Pacific storms

### Spring (Mar-Apr)
- Transition period
- Snow melts → reduced albedo
- Increasing mixing heights
- Fewer episodes

### Summer (May-Sep)
- Minimal ozone issues
- Good ventilation
- No snow cover
- Different chemistry (not VOC-limited)

### Fall (Oct-Nov)
- Early inversions possible
- Waiting for snow cover
- Usually low ozone

## Common Data Patterns to Recognize

### High Ozone Episode Starting
```javascript
const episodeStarting = 
    windSpeed < 2 &&           // Calm
    temperature < -5 &&         // Cold
    snowDepth > 50 &&          // Snow present
    solarRadiation > 200;       // Sunny
```

### Episode Breaking
```javascript
const episodeBreaking = 
    windSpeed > 4 ||           // Increasing wind
    cloudCover > 70 ||         // Storms approaching
    temperature > 5;           // Warming (inversion breaking)
```

### Diurnal Pattern
```
00:00 - 06:00: Low O₃ (30-40 ppb)
06:00 - 10:00: Rising slowly
10:00 - 14:00: Rapid rise
14:00 - 16:00: Peak O₃ (60-100+ ppb)
16:00 - 20:00: Declining
20:00 - 00:00: Low again
```

## Special Considerations

### Elevation Effects
- **Valley floor** (5000 ft): Highest ozone
- **Benches** (5500 ft): Moderate ozone
- **Mountains** (7000+ ft): Usually clean air

### Holiday Patterns
- Reduced emissions on weekends/holidays
- But multi-day episodes override this
- Christmas/New Year often have episodes

### Data Quality Issues
- Instruments struggle in extreme cold
- Icing affects wind sensors
- Check QC flags in winter data

## Key Takeaways for Developers

1. **Winter ozone is counterintuitive** - Cold, calm, sunny = bad air
2. **Multi-day context crucial** - Single day doesn't tell story
3. **Wind is the key variable** - Best predictor of clearing
4. **Geography matters** - West vs. East basin very different
5. **Time of day important** - Afternoon peaks, morning lows
6. **Episodes are predictable** - Weather patterns give 2-3 day warning

## Useful Calculations

### Ozone Index (simplified)
```javascript
function calculateOzoneRisk(data) {
    let risk = 0;
    
    // Meteorology factors
    if (data.windSpeed < 2) risk += 30;
    if (data.temperature < -5) risk += 20;
    if (data.snowDepth > 50) risk += 20;
    if (data.solarRadiation > 200) risk += 15;
    
    // Recent history
    if (data.yesterdayOzone > 60) risk += 15;
    
    return Math.min(risk, 100); // Cap at 100
}
```

### Inversion Strength
```javascript
function inversionStrength(surfaceTemp, upperTemp) {
    const delta = upperTemp - surfaceTemp;
    if (delta <= 0) return 'None';
    if (delta < 2) return 'Weak';
    if (delta < 5) return 'Moderate';
    return 'Strong';
}
```

## References & Resources
- EPA AQI: https://www.airnow.gov/aqi/
- Uintah Basin Studies: https://deq.utah.gov/air-quality/winter-ozone-study
- NOAA Winter Ozone: https://csl.noaa.gov/projects/ubwos/

Remember: The goal is to help residents understand when outdoor activities are safe and when to take precautions. Clear, timely information saves health impacts.