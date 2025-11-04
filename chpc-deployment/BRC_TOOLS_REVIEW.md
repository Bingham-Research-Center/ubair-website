# brc-tools Code Review for CHPC Deployment
**Date:** 2025-11-04
**Reviewer:** Claude Code
**Purpose:** Identify issues before production deployment

---

## Critical Issues

### 1. Environment Variable Name Mismatch ⚠️

**Problem:**
- `brc-tools/push_data.py` line 82 expects: `DATA_UPLOAD_API_KEY`
- Deployment docs specify: `BASINWX_API_KEY`
- Website validation script uses: `BASINWX_API_KEY`

**Current Code:**
```python
# push_data.py line 82
api_key = os.environ.get('DATA_UPLOAD_API_KEY')
```

**Impact:** HIGH - Script will fail if wrong variable name is used

**Solutions:**

**Option A: Update brc-tools (requires git pull on CHPC)**
```python
# Change line 82 in push_data.py to:
api_key = os.environ.get('BASINWX_API_KEY') or os.environ.get('DATA_UPLOAD_API_KEY')
```

**Option B: Update CHPC environment (no code changes)**
```bash
# In setup_chpc_env.sh, use DATA_UPLOAD_API_KEY instead of BASINWX_API_KEY
export DATA_UPLOAD_API_KEY="48cd2f722c19af756e7443230efe9fcc"
```

**Recommendation:** Use Option B for now (simpler, no code changes needed)

---

### 2. Hardcoded Relative Path ⚠️

**Problem:**
`get_map_obs.py` line 25 uses relative path `../../data`

**Current Code:**
```python
data_root = "../../data"
```

**Impact:** MEDIUM - May fail if script not run from expected directory

**Behavior:**
- Works if run from `brc-tools/brc_tools/download/`
- Fails if run from project root or via cron with different working directory

**Solution:**

**Option A: Use absolute path with environment variable**
```python
data_root = os.environ.get('BRC_TOOLS_DATA_DIR', os.path.expanduser('~/brc-tools-data'))
```

**Option B: Calculate relative to script location**
```python
import pathlib
script_dir = pathlib.Path(__file__).parent
data_root = script_dir / "../../data"
```

**Option C: Use explicit cd in cron**
```bash
cd ~/brc-tools && python3 brc_tools/download/get_map_obs.py
```

**Recommendation:** Use Option C (already in cron templates)

---

## Minor Issues

### 3. Outdated TODO Comment

**Location:** `get_map_obs.py` line 45
```python
# TODO - eventually, also send metadata to the website
```

**Issue:** Code already sends metadata (lines 91-93)

**Impact:** LOW - Just confusing, no functional issue

**Fix:** Remove TODO or update comment

---

### 4. Website URL Configuration Method

**Current Implementation:**
```python
# push_data.py lines 91-97
url_file = os.path.join(config_dir, 'website_url')
if not os.path.exists(url_file):
    raise FileNotFoundError("Website URL file not found. Check docs for setup.")

with open(url_file, 'r') as f:
    website_url = f.read().strip()
```

**Observation:**
- Uses file `~/.config/ubair-website/website_url`
- Alternative would be environment variable
- Current approach works fine

**Status:** No change needed, already handled in setup script

---

### 5. API Key Length Validation

**Location:** `push_data.py` lines 87-88
```python
if len(api_key) != 32:
    raise ValueError(f"API key should be 32 characters (hex), got {len(api_key)}")
```

**Observation:**
- Good validation!
- Catches common copy/paste errors
- Current API key is correct length (32 chars)

**Status:** ✓ Working as intended

---

## Positive Findings ✓

### 1. Health Check Before Upload
```python
# Lines 45-51
health_response = requests.get(f"{server_address}/api/health", timeout=10)
```
- Smart pre-flight check
- Avoids wasting time on failed uploads

### 2. Proper Headers
```python
# Lines 40-43
headers = {
    'x-api-key': API_KEY,
    'x-client-hostname': hostname
}
```
- Correctly implements authentication
- Includes hostname for origin validation

### 3. Timeout Handling
```python
# Line 64
timeout=30
```
- 30-second timeout prevents hanging
- Reasonable for network operations

### 4. Error Messages
- Clear, actionable error messages
- Includes status codes and response text
- Uses emoji for visual distinction (✅/❌)

### 5. Data Cleaning
```python
# clean_dataframe_for_json function
df = df.where(pd.notnull(df), None)  # NaN → null
```
- Properly handles NaN values
- Ensures valid JSON output

---

## Configuration Requirements Summary

For `brc-tools` to work on CHPC, the following must be configured:

### Environment Variables
```bash
# Use DATA_UPLOAD_API_KEY (not BASINWX_API_KEY) to match current code
export DATA_UPLOAD_API_KEY="48cd2f722c19af756e7443230efe9fcc"
```

### Configuration Files
```bash
# Create directory
mkdir -p ~/.config/ubair-website

# Create URL file
echo "https://basinwx.com" > ~/.config/ubair-website/website_url
```

### Working Directory
```bash
# Cron jobs must cd to brc-tools directory
cd ~/brc-tools && python3 brc_tools/download/get_map_obs.py
```

---

## Recommended Changes (Optional)

If you want to make the code more robust, consider these changes to `brc-tools`:

### 1. Support Both Variable Names
```python
# push_data.py line 82
api_key = os.environ.get('BASINWX_API_KEY') or os.environ.get('DATA_UPLOAD_API_KEY')
if not api_key:
    raise ValueError("Neither BASINWX_API_KEY nor DATA_UPLOAD_API_KEY environment variable set")
```

### 2. Make data_root Configurable
```python
# get_map_obs.py line 25
data_root = os.environ.get('BRC_TOOLS_OUTPUT_DIR', '../../data')
```

### 3. Add Retry Logic
```python
# push_data.py send_json_to_server function
for attempt in range(3):
    try:
        response = requests.post(...)
        if response.status_code == 200:
            break
    except:
        if attempt < 2:
            time.sleep(5 * (attempt + 1))  # Exponential backoff
```

### 4. Log to File
```python
# Add logging configuration
import logging
logging.basicConfig(
    filename=os.path.expanduser('~/logs/brc-tools-upload.log'),
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
```

---

## Testing Checklist

Before deploying to production CHPC:

- [ ] Set `DATA_UPLOAD_API_KEY` (not `BASINWX_API_KEY`)
- [ ] Create `~/.config/ubair-website/website_url` file
- [ ] Test `load_config()` function works
- [ ] Run `get_map_obs.py` from project root (with cd)
- [ ] Verify JSON files created in expected location
- [ ] Test upload with health check
- [ ] Confirm data appears on website
- [ ] Check logs for errors

---

## Deployment Decision

**Current Assessment:** Code is production-ready with minor configuration adjustments

**Required Actions:**
1. Use `DATA_UPLOAD_API_KEY` in environment setup (critical)
2. Ensure cron jobs cd to project directory (critical)
3. Create config files as specified (critical)

**Optional Actions:**
1. Update variable name for consistency (nice-to-have)
2. Fix TODO comment (cosmetic)
3. Add retry logic (enhancement)

**Recommendation:** Deploy as-is with proper environment configuration. Schedule code improvements for future maintenance window.

---

## Files Reviewed

- `/Users/johnlawson/PycharmProjects/brc-tools/brc_tools/download/push_data.py`
- `/Users/johnlawson/PycharmProjects/brc-tools/brc_tools/download/get_map_obs.py`

**Review Status:** Complete ✓
