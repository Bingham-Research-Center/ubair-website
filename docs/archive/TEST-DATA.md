# Test Data Documentation

## Overview
Test data files for validating the data pipeline from backend (CHPC) to frontend display. These files help developers test edge cases, handle missing data, and verify the complete data flow.

## Test Data Files

### `test_liveobs.json`
Example observation data for different locations with intentionally missing sensors to practice edge cases and exception handling.

**Data Structure Example:**

| Location   | PM2.5 | Ozone | Temperature | NO  | NOx |
|------------|-------|-------|-------------|-----|-----|
| Roosevelt  | 5.0   | 46.0  | 16.5        |     |     |
| Vernal     | 2.5   | 42.0  |             |     | 4.3 |
| Horsepool  |       |       | 18.0        | 3.0 | 4.0 |

**Key Testing Scenarios:**
- Missing sensors (empty cells)
- Partial data availability
- Different unit types
- Location-specific variables

### `test_wind_ts.json`
Time series data with 96 timestamps of wind speeds for testing temporal data visualization.

**Data Structure Example:**

| Date Time           | Wind Speed (m/s) |
|---------------------|------------------|
| 2021-01-01 00:00:00 | 0.882026         |
| 2021-01-01 00:30:00 | 0.000000         |
| 2021-01-01 01:00:00 | 1.084653         |
| 2021-01-01 01:30:00 | 1.715730         |
| 2021-01-01 02:00:00 | 2.083779         |
| ...                 | ...              |

**Testing Use Cases:**
- Time series plotting
- Handling zero values
- 30-minute interval data
- Chart rendering performance

## Future Test Data Requirements
- Clyfar output ozone level (time series forecast)
- Clyfar possibility distributions (bar charts of uncertainty)
- Extreme weather events
- Multi-day forecast data
- Historical comparison datasets

## How to Use Test Data

1. **Local Development:**
   - Place test files in `/public/data/` directory
   - Use `npm run dev` to test with local data
   - Verify data appears correctly on maps and charts

2. **API Testing:**
   - Use `npm run test-api` with test data files
   - Verify data passes validation
   - Check error handling for missing fields

3. **Edge Case Testing:**
   - Intentionally corrupt data format
   - Test with missing required fields
   - Verify graceful error handling

## Notes
Generated from the `dataframe_to_json` notebook for consistent test data creation.