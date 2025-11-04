# Data Manifest Guide
## Understanding and Modifying DATA_MANIFEST.json

## What is the Manifest?

The `DATA_MANIFEST.json` file is the **single source of truth** for your data pipeline. Both CHPC (data sender) and the web server (data receiver) read this file to understand:

- What data types exist
- What format each data type should be in
- How often data should be sent
- What validation rules to enforce
- How to handle errors

Think of it as a contract between CHPC and the website.

## Manifest Structure

```json
{
  "version": "1.0.0",                    // Manifest version (semantic versioning)
  "description": "...",                  // Human-readable description
  "dataTypes": {                         // All data types defined here
    "observations": { ... },
    "metadata": { ... },
    ...
  },
  "globalValidation": { ... },           // Rules that apply to all data types
  "monitoring": { ... },                 // Alerting and monitoring config
  "changeManagement": { ... }            // Process for making changes
}
```

## Data Type Definition

Each data type (observations, metadata, etc.) has this structure:

```json
"observations": {
  "description": "Live weather observations from stations",
  "format": "json",                      // File format
  "endpoint": "/api/upload/observations", // API endpoint
  "schedule": {
    "frequency": "*/10 * * * *",         // Cron expression
    "description": "Every 10 minutes"
  },
  "filename": {
    "pattern": "map_obs_YYYYMMDD_HHMMZ.json",
    "example": "map_obs_20250731_0230Z.json"
  },
  "schema": {                            // JSON Schema for validation
    "type": "array",
    "items": { ... }
  },
  "validation": {                        // Custom validation rules
    "maxFileSize": "10MB",
    "maxRecords": 50000,
    "requiredVariables": ["air_temp", "wind_speed"]
  }
}
```

## Common Modifications

### Adding a New Variable

To add a new weather variable (e.g., `snow_accumulation`):

1. **Update the enum:**
   ```json
   "variable": {
     "enum": [
       "air_temp",
       "wind_speed",
       ...
       "snow_accumulation"  // Add here
     ]
   }
   ```

2. **Add unit mapping:**
   ```json
   "unitMapping": {
     "air_temp": "Celsius",
     ...
     "snow_accumulation": "Inches"  // Add here
   }
   ```

3. **Notify team:** Create GitHub issue with details

4. **Test:** Use one station first before rolling out

### Changing Upload Frequency

To change how often data is sent:

```json
"schedule": {
  "frequency": "*/5 * * * *",  // Change from */10 to */5 (every 5 min)
  "description": "Every 5 minutes"
}
```

**Impact:**
- CHPC: Update cron job to match
- Server: Will expect data more frequently
- Monitoring: Alert thresholds will adjust automatically

### Adjusting File Size Limits

```json
"validation": {
  "maxFileSize": "50MB"  // Changed from 10MB
}
```

**Why you might do this:**
- Adding more stations
- Including more variables
- Higher resolution images

### Making a Variable Required

To make a variable mandatory for all stations:

```json
"requiredVariables": [
  "air_temp",
  "wind_speed",
  "wind_direction",
  "ozone"  // Now required
]
```

**Impact:**
- Uploads will fail validation if missing
- Warnings will appear in logs
- CHPC must ensure all stations report this variable

## Versioning

Use semantic versioning (MAJOR.MINOR.PATCH):

- **MAJOR:** Breaking changes (e.g., changing field names)
  - Example: 1.0.0 → 2.0.0
  - Requires coordination with entire team

- **MINOR:** Adding new features (e.g., new data type)
  - Example: 1.0.0 → 1.1.0
  - Backward compatible

- **PATCH:** Bug fixes or clarifications
  - Example: 1.0.0 → 1.0.1
  - No code changes needed

## Change Process

### For Non-Breaking Changes

1. Update manifest
2. Commit to repository
3. Notify team via Slack/email
4. Deploy to CHPC
5. Monitor for issues

### For Breaking Changes

1. **Discuss with team** (2 weeks advance notice)
2. **Create migration plan:**
   - What's changing
   - Who needs to update code
   - Timeline
3. **Update manifest version** (increment MAJOR)
4. **Add deprecation notice** to old fields
5. **Coordinate deployment:**
   - Update CHPC scripts
   - Update web server code
   - Test thoroughly
6. **Monitor closely** after deployment

## Validation Rules

### Available Schema Types

The manifest uses JSON Schema. Common types:

```json
"type": "string"    // Text
"type": "number"    // Numeric (int or float)
"type": "integer"   // Whole numbers only
"type": "boolean"   // true/false
"type": "array"     // List of items
"type": "object"    // Key-value pairs
```

### Constraints

```json
"minimum": 0,           // Numeric minimum
"maximum": 100,         // Numeric maximum
"minLength": 3,         // String minimum length
"maxLength": 10,        // String maximum length
"pattern": "^[A-Z]+$",  // Regex pattern
"enum": ["a", "b"]      // Must be one of these values
```

### Example: Temperature Field

```json
"air_temp": {
  "type": "number",
  "minimum": -50,
  "maximum": 60,
  "description": "Air temperature in Celsius"
}
```

This ensures:
- Value is numeric
- Between -50°C and 60°C
- Invalid values are rejected

## Testing Manifest Changes

### 1. Validate JSON Syntax

```bash
# Check if JSON is valid
python3 -m json.tool DATA_MANIFEST.json
```

### 2. Test with Sample Data

```bash
# Create test data that matches new schema
cat > test_data.json << 'EOF'
[
  {
    "stid": "TEST",
    "variable": "new_variable",
    "value": 123,
    "date_time": "2025-11-03T12:00:00.000Z",
    "units": "NewUnits"
  }
]
EOF

# Validate against manifest
python chpc_uploader.py --validate-only --file test_data.json --data-type observations
```

### 3. Test Upload

```bash
# Test with real endpoint (use staging if available)
BASINWX_API_URL="https://staging.basinwx.com" \
python chpc_uploader.py --file test_data.json --data-type observations
```

## Common Mistakes

### 1. Forgetting to Update Unit Mapping

**Symptom:** Warnings about unit mismatches

**Fix:**
```json
"unitMapping": {
  "new_variable": "correct_unit"  // Add this
}
```

### 2. Invalid Cron Expression

**Symptom:** Monitoring shows incorrect expected frequency

**Fix:** Use valid cron syntax:
- `*/10 * * * *` - Every 10 minutes
- `0 * * * *` - Every hour
- `0 */6 * * *` - Every 6 hours

Verify at https://crontab.guru

### 3. Overly Strict Validation

**Symptom:** Valid data gets rejected

**Fix:** Loosen constraints:
```json
// Too strict
"value": {
  "type": "number",
  "minimum": 0,
  "maximum": 10
}

// Better
"value": {
  "type": "number",
  "minimum": -1000,
  "maximum": 1000
}
```

### 4. Missing Required Fields

**Symptom:** Schema validation fails

**Fix:** Ensure all required fields are in schema:
```json
"required": ["stid", "variable", "value", "date_time", "units"]
```

## Best Practices

1. **Always increment version** when making changes
2. **Document why** in git commit message
3. **Test locally** before deploying
4. **Notify team** of any changes
5. **Monitor closely** after changes
6. **Keep backwards compatible** when possible
7. **Use clear descriptions** for all fields

## Rollback Procedure

If a manifest change causes issues:

1. **Revert to previous version:**
   ```bash
   git checkout HEAD~1 DATA_MANIFEST.json
   git commit -m "Revert manifest to previous version"
   ```

2. **Redeploy:**
   ```bash
   # On web server
   git pull
   npm restart

   # On CHPC
   git pull
   # Cron will pick up old manifest automatically
   ```

3. **Investigate issue** before trying again

## Getting Help

- **Schema reference:** https://json-schema.org/
- **Cron syntax:** https://crontab.guru/
- **Team discussion:** GitHub issues or Slack

## Appendix: Full Example

See `DATA_MANIFEST.json` for complete, working example.

---

**Last Updated:** 2025-11-03
**Audience:** All team members (CHPC and web developers)
