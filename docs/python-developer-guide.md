# Python Developer Guide: Weather Data Pipeline

## Overview
You'll be sending weather data from CHPC to a web server that displays it on maps. The website expects specific JSON formats that it can parse and display. This guide shows you exactly what to send and how to test it.

## Quick Start Checklist
1. Get weather data from Synoptic API
2. Structure it into the correct JSON format
3. POST it to the API endpoint with authentication
4. Test that it appears correctly on the website

## Data Types You'll Send

### 1. Live Observations (`map_obs_YYYYMMDD_HHMMZ.json`)
Latest weather readings from stations. Each observation is a separate object with station ID, variable name, value, timestamp, and units.

**Structure:**
```json
[
  {
    "stid": "BUNUT",           // Station ID (matches metadata)
    "variable": "air_temp",     // What you're measuring
    "value": -47.606,          // The measurement
    "date_time": "2025-07-31T02:10:00.000Z",  // ISO 8601 format
    "units": "Celsius"         // Units of measurement
  },
  {
    "stid": "BUNUT",
    "variable": "wind_speed",
    "value": 3.37,
    "date_time": "2025-07-31T02:10:00.000Z",
    "units": "m/s"
  }
]
```

**Required variables per station:**
- `air_temp` (Celsius)
- `wind_speed` (m/s)
- `wind_direction` (Degrees, 0-360)

**Optional variables:**
- `dew_point_temperature` (Celsius)
- `relative_humidity` (%)
- `snow_depth` (Millimeters)
- `ozone` (ppb - parts per billion)
- `pm25` (µg/m³ - micrograms per cubic meter)

### 2. Station Metadata (`map_obs_meta_YYYYMMDD_HHMMZ.json`)
Information about each weather station. Send this whenever stations change or daily with observations.

**Structure:**
```json
[
  {
    "stid": "BUNUT",           // Must match observations
    "name": "Bunnells Ridge",  // Display name
    "elevation": 8800.0,       // Feet above sea level
    "latitude": 40.314757,     // Decimal degrees
    "longitude": -111.563976   // Decimal degrees (negative for West)
  }
]
```

### 3. Time Series Data (for charts)
Historical or forecast data for plotting.

**Structure:**
```json
{
  "station_id": "BUNUT",
  "variable": "ozone",
  "units": "ppb",
  "data": [
    {
      "time": "2025-07-31T00:00:00Z",
      "value": 45.2
    },
    {
      "time": "2025-07-31T01:00:00Z",
      "value": 46.8
    }
  ]
}
```

### 4. Forecast Outlooks (Markdown)
Plain language weather summaries from your LLM.

**Format:** Standard Markdown (.md file)
```markdown
# Uintah Basin Air Quality Outlook
## Valid: July 31, 2025

Air quality is expected to remain **good** through the weekend...
```

## Sending Data to the Website

### API Endpoint
```
POST https://basinwx.com/api/upload/{dataType}
```

Where `{dataType}` is one of:
- `observations` - Live weather data
- `metadata` - Station information
- `timeseries` - Chart data
- `outlook` - Markdown forecasts

### Authentication
Include header: `x-api-key: YOUR_API_KEY_HERE`

### Python Example
```python
import requests
import json
from datetime import datetime

def send_observations(data, api_key):
    # Generate filename with timestamp
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%MZ")
    filename = f"map_obs_{timestamp}.json"
    
    # Prepare request
    url = "https://basinwx.com/api/upload/observations"
    headers = {
        "x-api-key": api_key,
        "Content-Type": "application/json"
    }
    
    # Send data
    response = requests.post(
        url,
        headers=headers,
        json={"filename": filename, "data": data}
    )
    
    if response.status_code == 200:
        print(f"✓ Uploaded {filename}")
    else:
        print(f"✗ Failed: {response.text}")
    
    return response.status_code == 200
```

## Testing Your Pipeline

### 1. Local Testing First
Before sending to production, test with sample data:

```python
# test_data.py
sample_obs = [
    {
        "stid": "TEST01",
        "variable": "air_temp",
        "value": 25.5,
        "date_time": datetime.utcnow().isoformat() + "Z",
        "units": "Celsius"
    }
]

sample_meta = [
    {
        "stid": "TEST01",
        "name": "Test Station",
        "elevation": 5000.0,
        "latitude": 40.5,
        "longitude": -110.0
    }
]

# Validate JSON structure
assert all(key in sample_obs[0] for key in ["stid", "variable", "value", "date_time", "units"])
assert all(key in sample_meta[0] for key in ["stid", "name", "elevation", "latitude", "longitude"])
print("✓ Data structure valid")
```

### 2. Test API Connection
```bash
# From CHPC, test the API is reachable
curl -X POST https://basinwx.com/api/upload/test \
  -H "x-api-key: YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"test": true}'
```

### 3. Send Test Data
Use a TEST station ID first to verify the pipeline works without affecting real data.

### 4. Verify on Website
1. Check API response: Should return `{"success": true, "filename": "..."}`
2. Visit https://basinwx.com to see if data appears on map
3. Check browser console for any JavaScript errors

## Common Issues & Solutions

### Issue: Data not appearing on map
**Check:**
- Station IDs in observations match metadata exactly
- Coordinates are valid (lat: -90 to 90, lon: -180 to 180)
- Timestamp is recent (within last 24 hours)

### Issue: API returns 401 Unauthorized
**Check:**
- API key is correct
- Header name is exactly `x-api-key` (lowercase)

### Issue: API returns 400 Bad Request
**Check:**
- JSON is valid (use `json.dumps()` not string concatenation)
- Required fields are present
- File size under 10MB

## Synchronizing Changes

When you add/remove weather variables:

1. **Update your Python code** to include/exclude the variable
2. **Notify the web developer** about changes needed:
   - Which variables added/removed
   - Units and expected ranges
   - Any new station IDs

3. **Test with one station first** before bulk updates

## Data Schema Contract

This is what the website expects. Don't change field names without coordination:

```python
OBSERVATION_SCHEMA = {
    "stid": str,          # Required, must match metadata
    "variable": str,      # Required, from approved list
    "value": float,       # Required, numeric only
    "date_time": str,     # Required, ISO 8601 with Z
    "units": str          # Required, standard units
}

METADATA_SCHEMA = {
    "stid": str,          # Required, unique identifier
    "name": str,          # Required, display name
    "elevation": float,   # Required, in feet
    "latitude": float,    # Required, -90 to 90
    "longitude": float    # Required, -180 to 180
}
```

## Production Checklist

Before scheduling your script:

- [ ] Test with sample data locally
- [ ] Verify API authentication works
- [ ] Send test station data and verify on website
- [ ] Handle API errors gracefully (retry logic)
- [ ] Log successes and failures
- [ ] Set up monitoring/alerts for failures
- [ ] Document your station IDs and variables

## Support

When something breaks:
1. Check your JSON structure matches examples exactly
2. Verify the API is up: `curl https://basinwx.com/api/health`
3. Check server response for error details
4. Save failed payloads for debugging

## Example Full Pipeline

```python
#!/usr/bin/env python3
"""
Send weather observations to BasinWX website
Run every 10 minutes via cron
"""

import json
import requests
from datetime import datetime
import logging

# Configure logging
logging.basicConfig(
    filename='/path/to/weather_upload.log',
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)

API_KEY = "your-api-key-here"
API_BASE = "https://basinwx.com/api/upload"

def fetch_weather_data():
    """Get data from Synoptic API"""
    # Your existing code to get weather data
    pass

def format_observations(raw_data):
    """Convert to website's expected format"""
    observations = []
    for station in raw_data:
        for var_name, var_value in station['observations'].items():
            observations.append({
                "stid": station['stid'],
                "variable": var_name,
                "value": var_value,
                "date_time": station['timestamp'],
                "units": get_units(var_name)
            })
    return observations

def get_units(variable):
    """Map variable names to units"""
    units_map = {
        "air_temp": "Celsius",
        "wind_speed": "m/s",
        "wind_direction": "Degrees",
        "relative_humidity": "%",
        "ozone": "ppb",
        "pm25": "µg/m³"
    }
    return units_map.get(variable, "unknown")

def upload_data(data, data_type):
    """Send data to website API"""
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%MZ")
    
    if data_type == "observations":
        filename = f"map_obs_{timestamp}.json"
    elif data_type == "metadata":
        filename = f"map_obs_meta_{timestamp}.json"
    else:
        filename = f"{data_type}_{timestamp}.json"
    
    try:
        response = requests.post(
            f"{API_BASE}/{data_type}",
            headers={
                "x-api-key": API_KEY,
                "Content-Type": "application/json"
            },
            json={"filename": filename, "data": data},
            timeout=30
        )
        
        if response.status_code == 200:
            logging.info(f"Successfully uploaded {filename}")
            return True
        else:
            logging.error(f"Upload failed: {response.status_code} - {response.text}")
            return False
            
    except Exception as e:
        logging.error(f"Upload exception: {str(e)}")
        return False

def main():
    """Main pipeline execution"""
    logging.info("Starting weather data pipeline")
    
    # Fetch data
    raw_data = fetch_weather_data()
    
    # Format for website
    observations = format_observations(raw_data)
    
    # Upload
    success = upload_data(observations, "observations")
    
    if success:
        logging.info("Pipeline completed successfully")
    else:
        logging.error("Pipeline failed")
        # Could trigger alert here
    
    return success

if __name__ == "__main__":
    main()
```

Remember: The website code expects this exact structure. When in doubt, match the example files exactly.