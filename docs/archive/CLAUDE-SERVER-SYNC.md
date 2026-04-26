# Production Server Synchronization Guide

## Critical: API Key Synchronization

The **same API key** must be configured on both servers or uploads will fail with 401 errors.

### Key Locations:

**Website Server (Akamai/basinwx.com)**:
```bash
# In .env file:
DATA_UPLOAD_API_KEY=your_32_char_key_here
BASINWX_API_KEY=your_32_char_key_here  # Should match above
```

**CHPC Data Server**:
```bash
# In brc-tools .env or environment:
BASINWX_API_KEY=your_32_char_key_here  # MUST MATCH website server
```

## Step-by-Step Sync Process

### 1. Generate Strong API Key (Do Once)
```bash
# Generate 32-character random key:
openssl rand -hex 16

# Or use Node.js:
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"

# Example output: a7f3d8e9b2c4f6a1d8e7c3b9f2a6d4e8
```

### 2. Deploy to Website Server First
```bash
# On Akamai server:
nano .env

# Add the generated key:
DATA_UPLOAD_API_KEY=a7f3d8e9b2c4f6a1d8e7c3b9f2a6d4e8
BASINWX_API_KEY=a7f3d8e9b2c4f6a1d8e7c3b9f2a6d4e8

# Restart website server:
pm2 restart ubair-website
```

### 3. Configure CHPC Server
```bash
# On CHPC server:
nano ~/.bashrc  # or your preferred env method

# Add:
export BASINWX_API_KEY="a7f3d8e9b2c4f6a1d8e7c3b9f2a6d4e8"

# Reload environment:
source ~/.bashrc
```

### 4. Test Synchronization
```bash
# From CHPC, test with real key:
curl -X POST https://basinwx.com/api/upload/test \
  -H "x-api-key: $BASINWX_API_KEY" \
  -H "x-client-hostname: $(hostname -f)" \
  -F "file=@test.json"

# Should return: {"success": true, "message": "test data uploaded successfully"}
# NOT: {"success": false, "message": "Invalid API key"}
```

## Environment Variable Management

### Secure Storage Options:

#### Option 1: Direct Environment Variables
```bash
# CHPC server:
export BASINWX_API_KEY="your_key_here"
export BASINWX_ENDPOINT="https://basinwx.com/api/upload"

# Website server:
# Use .env file (already implemented)
```

#### Option 2: Systemd Environment File (Recommended for Production)
```bash
# On website server:
sudo nano /etc/systemd/system/ubair-website.service.d/environment.conf

[Service]
Environment=DATA_UPLOAD_API_KEY=your_key_here
Environment=NODE_ENV=production

# Reload and restart:
sudo systemctl daemon-reload
sudo systemctl restart ubair-website
```

#### Option 3: Docker Secrets (If Using Containers)
```bash
# If deployed via Docker:
docker run -e DATA_UPLOAD_API_KEY="your_key_here" ubair-website
```

## Verification Checklist

### ✅ Before Going Live:

1. **Keys Match**:
   ```bash
   # On CHPC:
   echo $BASINWX_API_KEY

   # On website server:
   grep DATA_UPLOAD_API_KEY .env
   ```

2. **Network Connectivity**:
   ```bash
   # From CHPC:
   curl -I https://basinwx.com/api/health
   # Should return: HTTP/2 200
   ```

3. **Hostname Recognition**:
   ```bash
   # From CHPC:
   hostname -f
   # Should end in: .chpc.utah.edu
   ```

4. **Upload Permission Test**:
   ```bash
   # From CHPC:
   echo '{"test": true}' > test.json
   curl -X POST https://basinwx.com/api/upload/observations \
     -H "x-api-key: $BASINWX_API_KEY" \
     -H "x-client-hostname: $(hostname -f)" \
     -F "file=@test.json"
   ```

### ✅ After Deployment:

1. **File Uploads Working**:
   ```bash
   # Check new files appear:
   ls -lat public/api/static/
   ```

2. **Frontend Data Fresh**:
   - Visit https://basinwx.com/live_aq
   - Check timestamp in UI matches recent data

3. **No Authentication Errors**:
   ```bash
   # Website server logs should NOT show:
   # "Invalid API key provided"
   # "Access denied"
   ```

## Key Rotation (Security Best Practice)

### Monthly Key Rotation:
1. Generate new key
2. Update website server .env
3. Restart website server
4. Update CHPC environment
5. Test upload
6. Update documentation

### Emergency Key Change:
If key is compromised, immediately:
1. Change key on website server (blocks uploads)
2. Update CHPC as soon as possible
3. Monitor logs for unauthorized attempts

## Troubleshooting Common Sync Issues

### Issue: 401 Unauthorized
- **Cause**: Keys don't match
- **Fix**: Re-sync API keys, restart both services

### Issue: 403 Forbidden
- **Cause**: Wrong hostname or missing header
- **Fix**: Verify CHPC hostname ends in `.chpc.utah.edu`

### Issue: Connection Refused
- **Cause**: Network/firewall blocking
- **Fix**: Check firewall rules, test basic connectivity

### Issue: Uploads Work Sometimes
- **Cause**: Environment variables not persistent
- **Fix**: Add to system-level environment files, not session-only

The synchronization is critical - even a single character difference in API keys will break the entire pipeline.