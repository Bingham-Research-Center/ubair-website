# API Pipeline Testing Plan

## Overview

Test the data pipeline in three phases:
1. **Local Testing** - Verify code works on your laptop
2. **Server Testing** - Deploy and test on production website server
3. **End-to-End Testing** - Test full CHPC → Website → Browser flow

---

## Phase 1: Local Testing (Your Laptop)

### Step 1.1: Environment Setup
**What**: Configure your local development environment
**Where**: Your laptop terminal
**Time**: 2 minutes

```bash
# Ensure .env file exists with API key
cat .env | grep DATA_UPLOAD_API_KEY

# If not set, generate a test key
echo "DATA_UPLOAD_API_KEY=$(openssl rand -hex 16)" >> .env
```

**Success**: `.env` file contains `DATA_UPLOAD_API_KEY`

---

### Step 1.2: Start Local Server
**What**: Run the website server locally
**Where**: Your laptop terminal
**Time**: 1 minute

```bash
npm run dev
```

**Success**: See "Server running at http://localhost:3000"
**Keep this terminal open** - you'll need the server running

---

### Step 1.3: Run Automated Tests
**What**: Test API endpoints with built-in test script
**Where**: New terminal window on your laptop
**Time**: 30 seconds

```bash
npm run test-api
```

**Success**:
- ✅ Health check passes
- ✅ File listing works
- ✅ Upload succeeds
- ✅ Data retrieval works

**If it fails**:
- Check server is running in other terminal
- Verify `DATA_UPLOAD_API_KEY` is set in `.env`

---

### Step 1.4: Manual Upload Test (Observations)
**What**: Upload a weather observation file to test observations endpoint
**Where**: Your laptop terminal
**Time**: 2 minutes

```bash
# Create test observation data
cat > test_observation.json << 'EOF'
[
  {
    "stid": "TEST_STATION",
    "variable": "air_temp",
    "value": 20.5,
    "date_time": "2025-09-30T14:00:00.000Z",
    "units": "Celsius"
  },
  {
    "stid": "TEST_STATION",
    "variable": "ozone_concentration",
    "value": 45.2,
    "date_time": "2025-09-30T14:00:00.000Z",
    "units": "ppb"
  }
]
EOF

# Upload it
curl -X POST http://localhost:3000/api/upload/observations \
  -H "x-api-key: $(grep DATA_UPLOAD_API_KEY .env | cut -d '=' -f2)" \
  -H "x-client-hostname: test.chpc.utah.edu" \
  -F "file=@test_observation.json"

# Verify it uploaded
ls -la public/api/static/observations/
```

**Success**:
- Response shows `"success": true`
- File appears in `public/api/static/observations/`

---

### Step 1.5: Manual Upload Test (Outlooks)
**What**: Upload an outlook markdown file to test outlooks endpoint
**Where**: Your laptop terminal
**Time**: 2 minutes

```bash
# Create test outlook
cat > test_outlook.md << 'EOF'
# Air Quality Outlook - Test

**Issued**: September 30, 2025 at 2:00 PM MDT

## Summary
This is a test outlook to verify the pipeline is working correctly.

## Forecast
- **Today**: Good air quality expected
- **Tomorrow**: Moderate conditions possible

## Confidence
HIGH - This is a test message.
EOF

# Upload it
curl -X POST http://localhost:3000/api/upload/outlooks \
  -H "x-api-key: $(grep DATA_UPLOAD_API_KEY .env | cut -d '=' -f2)" \
  -H "x-client-hostname: test.chpc.utah.edu" \
  -F "file=@test_outlook.md"

# Verify it uploaded
ls -la public/api/static/outlooks/
```

**Success**:
- Response shows `"success": true`
- File appears in `public/api/static/outlooks/`

---

### Step 1.6: Verify Frontend Display
**What**: Check if uploaded data appears on the website
**Where**: Your web browser
**Time**: 2 minutes

1. Open browser to `http://localhost:3000/live_aq`
2. Open browser DevTools (F12) → Network tab
3. Look for requests to `/api/static/observations/`
4. Check if your test data appears

Then:
1. Navigate to `http://localhost:3000/forecast_outlooks`
2. Check if your test outlook appears

**Success**:
- Live AQ page loads without errors
- Forecast outlooks page shows your test outlook

**If data doesn't appear**: Check browser console for errors

---

### Step 1.7: Test File Listing API
**What**: Verify the file listing endpoint works
**Where**: Your laptop terminal
**Time**: 1 minute

```bash
# Get list of all uploaded files
curl http://localhost:3000/api/filelist.json

# Get live observations
curl http://localhost:3000/api/live-observations
```

**Success**: Both commands return JSON data

---

## Phase 2: Production Website Server Testing

### Step 2.1: Deploy Code to Website Server
**What**: Push your code changes to production
**Where**: Your laptop terminal
**Time**: 5 minutes

```bash
# Commit and push changes (if not already done)
git add .
git commit -m "Refactor: Unified API pipeline with subdirectories"
git push origin main

# SSH to website server
ssh your-username@basinwx.com  # Or whatever your server address is

# On the server, pull latest code
cd /path/to/ubair-website
git pull origin main
npm install  # In case dependencies changed
```

**Success**: Code is updated on production server

---

### Step 2.2: Configure Production Environment
**What**: Set up `.env` file on production server
**Where**: SSH session on website server
**Time**: 3 minutes

```bash
# On website server
cd /path/to/ubair-website

# Check if .env exists
cat .env

# If it doesn't exist or needs updating
cp .env.example .env
nano .env
```

**In the .env file**, set:
```bash
PORT=3000
NODE_ENV=production
DATA_UPLOAD_API_KEY=your_production_key_here  # Generate: openssl rand -hex 16
```

**Success**: `.env` file configured with production API key

---

### Step 2.3: Restart Production Server
**What**: Start/restart the website server
**Where**: SSH session on website server
**Time**: 2 minutes

```bash
# If using PM2
pm2 restart ubair-website

# Or if first time
pm2 start server/server.js --name ubair-website
pm2 save

# Check it's running
pm2 status
```

**Success**: Server shows as "online" in PM2 status

---

### Step 2.4: Test Production Server Health
**What**: Verify the production server is responding
**Where**: Your laptop terminal (or SSH session)
**Time**: 1 minute

```bash
# From anywhere
curl https://basinwx.com/api/health

# Should return:
# {"success":true,"message":"Data upload API is running","timestamp":"..."}
```

**Success**: Health check returns 200 status

---

### Step 2.5: Test Production Upload (From Your Laptop)
**What**: Upload test data directly to production
**Where**: Your laptop terminal
**Time**: 2 minutes

```bash
# Get the production API key (securely from password manager or ask team)
export PROD_API_KEY="your_production_key_here"

# Upload test observation
curl -X POST https://basinwx.com/api/upload/observations \
  -H "x-api-key: $PROD_API_KEY" \
  -H "x-client-hostname: test.chpc.utah.edu" \
  -F "file=@test_observation.json"
```

**Success**: Response shows `"success": true`

**Expected Failure**: Might get `403 Forbidden` if hostname validation is strict (this is OK - means security is working)

---

## Phase 3: End-to-End CHPC → Production Testing

### Step 3.1: Configure CHPC Environment
**What**: Set up API key and endpoint on CHPC
**Where**: SSH session on CHPC
**Time**: 3 minutes

```bash
# SSH to CHPC
ssh your-username@notchpeak.chpc.utah.edu

# Set environment variables in ~/.bashrc or your project env
nano ~/.bashrc

# Add these lines:
export BASINWX_API_KEY="your_production_key_here"  # MUST MATCH website server
export BASINWX_ENDPOINT="https://basinwx.com/api/upload"

# Reload environment
source ~/.bashrc

# Verify
echo $BASINWX_API_KEY
```

**Success**: Environment variables are set

---

### Step 3.2: Create Test Upload Script on CHPC
**What**: Write a simple script to test uploading from CHPC
**Where**: SSH session on CHPC
**Time**: 5 minutes

```bash
# Create test script
nano test_upload.sh
```

**Contents**:
```bash
#!/bin/bash
set -e

API_KEY=$BASINWX_API_KEY
ENDPOINT=$BASINWX_ENDPOINT
HOSTNAME=$(hostname -f)

echo "Testing upload from CHPC..."
echo "Hostname: $HOSTNAME"
echo "Endpoint: $ENDPOINT"

# Create test data
cat > /tmp/test_chpc_upload.json << 'EOF'
[{"stid":"CHPC_TEST","variable":"air_temp","value":15.0,"date_time":"2025-09-30T20:00:00Z","units":"Celsius"}]
EOF

# Upload it
curl -X POST "$ENDPOINT/observations" \
  -H "x-api-key: $API_KEY" \
  -H "x-client-hostname: $HOSTNAME" \
  -F "file=@/tmp/test_chpc_upload.json" \
  -v

echo "Upload test complete!"
```

```bash
# Make it executable
chmod +x test_upload.sh
```

**Success**: Script is created and executable

---

### Step 3.3: Run Test Upload from CHPC
**What**: Execute the test upload
**Where**: SSH session on CHPC
**Time**: 1 minute

```bash
./test_upload.sh
```

**Success**:
- Response shows HTTP 200
- Response body shows `"success": true`

**If 403 Forbidden**: Hostname validation working (good security, but need to verify hostname)

---

### Step 3.4: Verify Upload on Website Server
**What**: Check if file arrived on website server
**Where**: SSH session on website server
**Time**: 1 minute

```bash
# On website server
ls -lat public/api/static/observations/

# Check logs
pm2 logs ubair-website --lines 20
```

**Success**:
- New file appears with recent timestamp
- Logs show "File uploaded: test_chpc_upload.json"

---

### Step 3.5: Verify Frontend Shows CHPC Data
**What**: Check if data from CHPC appears on public website
**Where**: Your web browser
**Time**: 2 minutes

1. Open `https://basinwx.com/live_aq`
2. Open DevTools → Network tab
3. Check for API calls to `/api/static/observations/`
4. Verify your test data from CHPC appears

**Success**: Website displays data uploaded from CHPC

---

### Step 3.6: Test Outlook Upload from CHPC
**What**: Upload an outlook file from CHPC
**Where**: SSH session on CHPC
**Time**: 3 minutes

```bash
# Create test outlook
cat > /tmp/test_outlook_$(date +%Y%m%d_%H%M).md << 'EOF'
# Test Outlook from CHPC

This outlook was uploaded from CHPC to verify the pipeline.

## Test Details
- Source: CHPC compute node
- Pipeline: CHPC → basinwx.com → Public browser
- Data type: Outlook markdown

Pipeline is operational!
EOF

# Upload it
curl -X POST "$BASINWX_ENDPOINT/outlooks" \
  -H "x-api-key: $BASINWX_API_KEY" \
  -H "x-client-hostname: $(hostname -f)" \
  -F "file=@/tmp/test_outlook_$(date +%Y%m%d_%H%M).md"
```

**Success**:
- Response shows `"success": true`
- File appears on website server in `public/api/static/outlooks/`
- Outlook appears on `https://basinwx.com/forecast_outlooks`

---

## Summary Checklist

### ✅ Phase 1: Local Testing Complete When:
- [ ] Automated tests pass (`npm run test-api`)
- [ ] Manual observation upload works
- [ ] Manual outlook upload works
- [ ] Frontend displays uploaded data
- [ ] File listing API works

### ✅ Phase 2: Production Server Complete When:
- [ ] Code deployed to production
- [ ] Environment configured
- [ ] Server running and healthy
- [ ] Can upload test data to production

### ✅ Phase 3: End-to-End Complete When:
- [ ] CHPC environment configured
- [ ] Can upload observations from CHPC
- [ ] Can upload outlooks from CHPC
- [ ] Website displays CHPC data in browser
- [ ] Logs show successful uploads

---

## Troubleshooting Quick Reference

| Problem | Cause | Fix |
|---------|-------|-----|
| `401 Unauthorized` | API keys don't match | Check keys match on both servers |
| `403 Forbidden` | Hostname validation | Verify hostname ends with `.chpc.utah.edu` |
| `ECONNREFUSED` | Server not running | Start server with `npm run dev` or `pm2 start` |
| Files not appearing | Wrong directory | Check `public/api/static/{dataType}/` |
| Frontend not updating | Cache issue | Hard refresh browser (Ctrl+Shift+R) |
| No data on website | File permissions | Check `ls -la public/api/static/` |

---

## Next Steps After Testing

Once all phases pass:
1. Set up automated cron jobs on CHPC (see `CRONJOB-ADVICE.md`)
2. Monitor logs for first 24 hours
3. Verify data updates every cycle
4. Document any issues encountered
