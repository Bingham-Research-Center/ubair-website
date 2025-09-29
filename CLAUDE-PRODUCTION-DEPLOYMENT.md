# Production Server Deployment Guide

## Server Architecture

```
[CHPC Data Server] --POST--> [Akamai Website Server] --SERVE--> [Users at basinwx.com]
     (Utah)                        (CDN/Cloud)                     (Public)
```

## 1. Website Server (Akamai) - Receiving Data

### Deployment Steps:

#### A. Code Deployment
```bash
# On Akamai server:
git clone https://github.com/your-org/ubair-website.git
cd ubair-website
npm install
```

#### B. Environment Configuration
```bash
# Create production environment file
cp .env.example .env

# Edit .env with production values:
nano .env
```

**Production .env file**:
```bash
# Server Configuration
PORT=3000  # Or whatever port Akamai assigns
NODE_ENV=production

# Data Upload API (CRITICAL - must match CHPC)
DATA_UPLOAD_API_KEY=STRONG_RANDOM_32_CHAR_KEY_HERE

# Other APIs (if used)
UDOT_API_KEY=your_udot_api_key_here
SYNOPTIC_API_TOKEN=your_synoptic_token_here

# Website Upload API (should match DATA_UPLOAD_API_KEY)
BASINWX_API_KEY=STRONG_RANDOM_32_CHAR_KEY_HERE
```

#### C. Directory Setup
```bash
# Create required directories with proper permissions
mkdir -p public/api/static
mkdir -p public/data/outlooks
chmod 755 public/api/static
chmod 755 public/data/outlooks

# Verify web server can write to upload directories
sudo chown -R www-data:www-data public/api/static  # Adjust user as needed
```

#### D. Start Production Server
```bash
# Option 1: Direct node
node server/server.js

# Option 2: PM2 (recommended for production)
npm install -g pm2
pm2 start server/server.js --name ubair-website
pm2 save
pm2 startup  # Creates startup script
```

#### E. Verify Deployment
```bash
# Test health endpoint
curl https://basinwx.com/api/health

# Test file listing (should return empty array initially)
curl https://basinwx.com/api/filelist.json

# Check server logs
pm2 logs ubair-website
```

---

## 2. CHPC Data Server - Sending Data

### Configuration on CHPC:

#### A. Environment Setup in BRC-Tools
```bash
# In your brc-tools directory on CHPC:
nano .env  # or however you manage env vars

# Add these variables:
BASINWX_API_KEY=SAME_KEY_AS_WEBSITE_SERVER
BASINWX_ENDPOINT=https://basinwx.com/api/upload
CHPC_HOSTNAME=$(hostname -f)  # Should end in .chpc.utah.edu
```

#### B. Upload Script Configuration
Your brc-tools upload script should use:

```python
# upload_to_website.py (example)
import requests
import os
from pathlib import Path

API_KEY = os.getenv('BASINWX_API_KEY')
BASE_URL = os.getenv('BASINWX_ENDPOINT', 'https://basinwx.com/api/upload')
HOSTNAME = os.getenv('CHPC_HOSTNAME', socket.getfqdn())

def upload_data(data_type, file_path):
    with open(file_path, 'rb') as f:
        files = {'file': f}
        headers = {
            'x-api-key': API_KEY,
            'x-client-hostname': HOSTNAME
        }

        response = requests.post(
            f"{BASE_URL}/{data_type}",
            files=files,
            headers=headers,
            timeout=30
        )

    return response.status_code == 200
```

#### C. Cron Job Setup
```bash
# Edit crontab on CHPC
crontab -e

# Add entries like:
# Upload observations every 15 minutes
*/15 * * * * cd /path/to/brc-tools && python upload_observations.py >> /var/log/basinwx-upload.log 2>&1

# Upload metadata once per hour
0 * * * * cd /path/to/brc-tools && python upload_metadata.py >> /var/log/basinwx-upload.log 2>&1
```

---

## 3. Testing Production Pipeline

### From CHPC Server:
```bash
# Test connection to production website
curl -I https://basinwx.com/api/health

# Test upload with real API key
curl -X POST https://basinwx.com/api/upload/observations \
  -H "x-api-key: $BASINWX_API_KEY" \
  -H "x-client-hostname: $(hostname -f)" \
  -F "file=@/path/to/test_data.json"
```

### From Website Server:
```bash
# Monitor uploads in real-time
tail -f /var/log/pm2/ubair-website-out.log

# Check for new files
ls -lat public/api/static/

# Verify API responses
curl https://basinwx.com/api/filelist.json
curl https://basinwx.com/api/live-observations
```

### From Your Browser:
1. Visit https://basinwx.com/live_aq
2. Open Developer Tools → Network tab
3. Look for API calls fetching fresh data
4. Check timestamps in the UI match recent uploads

---

## 4. Security Considerations

### Website Server (Akamai):
- **Firewall**: Only allow HTTPS (443) and maybe SSH (22)
- **API Key**: Store in environment, never in code
- **Hostname Validation**: Ensure only `*.chpc.utah.edu` can upload
- **File Validation**: JSON parsing + size limits already implemented
- **Logging**: Monitor failed upload attempts

### CHPC Server:
- **API Key Storage**: Use secure environment variables
- **Network**: Ensure outbound HTTPS allowed to basinwx.com
- **Error Handling**: Log failures for debugging
- **Retry Logic**: Handle temporary network issues

---

## 5. Monitoring & Maintenance

### Key Metrics to Watch:
1. **Upload Success Rate**: Should be >95%
2. **File Freshness**: Latest files should be <30 minutes old
3. **API Response Times**: Should be <5 seconds
4. **Disk Usage**: Monitor `/public/api/static/` growth

### Log Locations:
- **Website**: PM2 logs or `/var/log/nodejs/`
- **CHPC**: `/var/log/basinwx-upload.log`

### Regular Tasks:
- **Weekly**: Check log files for errors
- **Monthly**: Clean up old data files if needed
- **Quarterly**: Rotate API keys (coordinate between servers)

---

## 6. Common Production Issues

### "403 Forbidden" Errors:
- Check API key matches between servers
- Verify hostname header ends with `.chpc.utah.edu`
- Check server time synchronization

### "File Not Found" Errors:
- Verify directory permissions on website server
- Check disk space on both servers
- Ensure upload directory exists and is writable

### "Connection Timeout" Errors:
- Check network connectivity between CHPC and Akamai
- Verify firewall allows outbound HTTPS from CHPC
- Test with smaller file sizes first

The local testing validates your code works - now this guide handles the production deployment on both servers.