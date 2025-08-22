# CLAUDE.md for Python Repository (brc-tools)

Copy this file to your Python repository's root as `CLAUDE.md` to give Claude Code context about the data pipeline.

## Overview
This Python repository (`brc-tools`) handles the Uintah Basin weather data pipeline:
1. Fetches data from Synoptic Weather API
2. Processes with pandas/polars
3. Formats as JSON
4. POSTs to basinwx.com website

## Related Documentation
The web repository has comprehensive guides in its `/docs/` folder:
- `python-developer-guide.md` - Complete pipeline implementation guide
- `DATA_SCHEMA.md` - Expected JSON structures
- `winter-ozone-science-README.md` - Domain knowledge for data decisions
- `test-data-README.md` - Example data for testing

## Quick Reference: Data Formats

### Observations Format
```python
# Each observation is a separate object
observations = [
    {
        "stid": "BUNUT",           # Station ID
        "variable": "air_temp",     # Variable name
        "value": -47.606,          # Measurement
        "date_time": "2025-07-31T02:10:00.000Z",  # ISO 8601
        "units": "Celsius"         # Units
    },
    # More observations...
]
```

### Station Metadata Format
```python
metadata = [
    {
        "stid": "BUNUT",           # Must match observations
        "name": "Bunnells Ridge",  # Display name
        "elevation": 8800.0,       # Feet
        "latitude": 40.314757,     # Decimal degrees
        "longitude": -111.563976   # Negative for West
    }
]
```

### Required Variables per Station
- `air_temp` (Celsius)
- `wind_speed` (m/s)
- `wind_direction` (Degrees, 0-360)

### Optional Variables
- `dew_point_temperature` (Celsius)
- `relative_humidity` (%)
- `snow_depth` (Millimeters)
- `ozone` (ppb)
- `pm25` (µg/m³)

## API Endpoint Configuration
```python
API_CONFIG = {
    "base_url": "https://basinwx.com/api/upload",
    "endpoints": {
        "observations": "/observations",
        "metadata": "/metadata",
        "timeseries": "/timeseries",
        "outlook": "/outlook"
    },
    "api_key": "stored_securely_in_env_or_file",
    "timeout": 30,
    "max_file_size_mb": 10
}
```

## Key Functions to Implement

### 1. Data Fetching
```python
def fetch_synoptic_data(station_ids, variables, start_time, end_time):
    """
    Fetch from Synoptic API
    Returns: Raw API response
    """
    pass
```

### 2. Data Processing
```python
def process_observations(raw_data):
    """
    Convert Synoptic format to website format
    - Flatten nested structures
    - Convert units if needed
    - Add ISO timestamps
    Returns: List of observation dicts
    """
    pass

def extract_metadata(raw_data):
    """
    Extract station information
    Returns: List of metadata dicts
    """
    pass
```

### 3. Data Validation
```python
def validate_observations(obs_list):
    """
    Check required fields exist
    Verify data types
    Check reasonable ranges
    Returns: Validated data or raises exception
    """
    required_fields = ["stid", "variable", "value", "date_time", "units"]
    for obs in obs_list:
        if not all(field in obs for field in required_fields):
            raise ValueError(f"Missing required field in {obs}")
    return obs_list
```

### 4. Data Upload
```python
def upload_to_website(data, data_type, api_key):
    """
    POST data to website
    Handle errors and retries
    Log results
    """
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%MZ")
    filename = f"map_obs_{timestamp}.json"
    
    response = requests.post(
        f"{API_CONFIG['base_url']}/{data_type}",
        headers={
            "x-api-key": api_key,
            "Content-Type": "application/json"
        },
        json={"filename": filename, "data": data},
        timeout=30
    )
    
    if response.status_code != 200:
        raise Exception(f"Upload failed: {response.text}")
```

## Winter Ozone Considerations

When processing data, prioritize these variables during winter (Dec-Mar):
1. **Wind speed** - Best predictor of ozone episodes
2. **Temperature** - Indicates inversion strength
3. **Snow depth** - Affects photochemistry
4. **Ozone** - Primary pollutant of concern

### Episode Detection Logic
```python
def detect_ozone_episode(data):
    """
    Flag potential high ozone conditions
    """
    conditions = {
        "calm_wind": data["wind_speed"] < 2,  # m/s
        "cold_temp": data["air_temp"] < -5,    # Celsius
        "snow_present": data["snow_depth"] > 50,  # mm
        "previous_high": data.get("yesterday_ozone", 0) > 60  # ppb
    }
    
    risk_score = sum(conditions.values()) * 25
    return risk_score > 50  # Boolean flag
```

## Station Priority

### Tier 1 (Essential - Always include)
- BUNUT - Bunnells Ridge
- CEN - Centerville  
- ROO - Roosevelt
- VER - Vernal
- HOR - Horsepool
- CAS - Castle Peak

### Tier 2 (Include when available)
- Other UDEQ stations
- Synoptic mesonet stations
- RAWS stations

## Error Handling

### Common Issues
1. **Synoptic API timeout**: Implement exponential backoff
2. **Missing data**: Use None/null, don't skip the observation
3. **Unit conversion errors**: Log and use raw value with note
4. **Upload failures**: Queue for retry, alert after 3 failures

### Logging Requirements
```python
import logging

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('/path/to/pipeline.log'),
        logging.StreamHandler()
    ]
)

logger = logging.getLogger(__name__)

# Log key events
logger.info(f"Fetched {len(stations)} stations")
logger.info(f"Processed {len(observations)} observations")
logger.error(f"Upload failed: {error}")
```

## Testing Checklist

Before deploying:
- [ ] Test with single station first
- [ ] Verify JSON structure matches schema
- [ ] Check timezone handling (UTC)
- [ ] Test error handling (bad API key, network issues)
- [ ] Verify data appears on website map
- [ ] Check log output is useful
- [ ] Test with missing/null values
- [ ] Verify file naming convention

## Scheduling Recommendations

```bash
# Crontab for every 10 minutes
*/10 * * * * /path/to/python /path/to/fetch_and_upload.py

# Or with error handling
*/10 * * * * /path/to/python /path/to/fetch_and_upload.py || echo "Pipeline failed" | mail -s "Weather Pipeline Error" admin@example.com
```

## Environment Setup

```bash
# Required packages
pip install requests pandas polars python-dateutil

# Environment variables (.env file)
SYNOPTIC_API_TOKEN=your_token_here
BASINWX_API_KEY=your_key_here
LOG_LEVEL=INFO
```

## Contact & Coordination

When changing data structure:
1. Test with web team's test endpoint first
2. Coordinate field additions/removals
3. Update this documentation
4. Version your changes

## Quick Debug Commands

```python
# Test Synoptic connection
import requests
response = requests.get(
    "https://api.synopticdata.com/v2/stations/metadata",
    params={"token": TOKEN, "stid": "BUNUT"}
)
print(response.json())

# Test website API
response = requests.get("https://basinwx.com/api/health")
print(response.status_code)  # Should be 200

# Validate JSON structure
import json
with open("test_output.json") as f:
    data = json.load(f)
    assert all(k in data[0] for k in ["stid", "variable", "value"])
```

Remember: The website expects exact field names and structure. When in doubt, refer to the example files in the web repository's `/public/api/static/` directory.