# Production Server Deployment Guide

## Server Architecture

```
[CHPC Data Server] --POST--> [Website Server] --SERVE--> [Public Users]
     (Utah)                    (basinwx.com)              (Browsers)
```

## 1. Website Server Setup

### A. Code Deployment
```bash
git clone https://github.com/Bingham-Research-Center/ubair-website.git
cd ubair-website
npm install
```

### B. Environment Configuration
```bash
cp .env.example .env
nano .env
```

**Required .env variables**:
```bash
PORT=3000
NODE_ENV=production
DATA_UPLOAD_API_KEY=your_32_char_key_here
```

### C. Directory Setup
```bash
# Create API directories (server creates subdirectories automatically)
mkdir -p public/api/static
mkdir -p public/content
chmod 755 public/api/static

# Set ownership if needed
sudo chown -R www-data:www-data public/api/static
```

### D. Start Server
```bash
# Using PM2 (recommended)
npm install -g pm2
pm2 start server/server.js --name ubair-website
pm2 save
pm2 startup
```

### E. Verify Deployment
```bash
curl https://basinwx.com/api/health
curl https://basinwx.com/api/filelist.json
```

---

## 2. CHPC Data Server Setup

### A. Environment Configuration
```bash
# In brc-tools directory or ~/.bashrc
export BASINWX_API_KEY="your_32_char_key_here"  # MUST MATCH website server
export BASINWX_ENDPOINT="https://basinwx.com/api/upload"
```

### B. Upload Script Example
```python
import requests
import os

API_KEY = os.getenv('BASINWX_API_KEY')
ENDPOINT = os.getenv('BASINWX_ENDPOINT')
HOSTNAME = socket.getfqdn()

def upload_data(data_type, file_path):
    with open(file_path, 'rb') as f:
        response = requests.post(
            f"{ENDPOINT}/{data_type}",
            files={'file': f},
            headers={
                'x-api-key': API_KEY,
                'x-client-hostname': HOSTNAME
            },
            timeout=30
        )
    return response.status_code == 200

# Usage
upload_data('observations', 'map_obs_20250930_1200Z.json')
upload_data('outlooks', 'outlook_20250930_1200.md')
```

### C. Cron/SLURM Setup
See `CRONJOB-ADVICE.md` for detailed scheduling instructions.

---

## 3. Data Types & Endpoints

All uploads go to: `POST /api/upload/{dataType}`

| Data Type | Subdirectory | File Format | Example |
|-----------|--------------|-------------|---------|
| `observations` | `public/api/static/observations/` | JSON | `map_obs_20250930_1200Z.json` |
| `metadata` | `public/api/static/metadata/` | JSON | `map_obs_meta_20250930_1200Z.json` |
| `outlooks` | `public/api/static/outlooks/` | MD | `outlook_20250930_1200.md` |
| `images` | `public/api/static/images/` | PNG | `forecast_20250930.png` |
| `timeseries` | `public/api/static/timeseries/` | JSON | `ozone_ts_20250930.json` |

---

## 4. Testing Production Pipeline

### From CHPC:
```bash
# Test upload
curl -X POST https://basinwx.com/api/upload/observations \
  -H "x-api-key: $BASINWX_API_KEY" \
  -H "x-client-hostname: $(hostname -f)" \
  -F "file=@test.json"
```

### From Website Server:
```bash
# Monitor logs
pm2 logs ubair-website

# Check uploads
ls -lat public/api/static/observations/
ls -lat public/api/static/outlooks/
```

### From Browser:
Visit `https://basinwx.com/live_aq` and verify fresh data displays.

---

## 5. Common Issues

### 401 Unauthorized
- API keys don't match between servers
- Check: `echo $BASINWX_API_KEY` on both servers

### 403 Forbidden
- Hostname validation failed
- Ensure CHPC hostname ends with `.chpc.utah.edu`

### Files Not Appearing
- Directory permissions issue
- Check: `ls -la public/api/static/`

---

## 6. Monitoring

```bash
# Check upload success
grep "File uploaded" /var/log/pm2/ubair-website-out.log

# Check for errors
grep -i "error\|failed" /var/log/pm2/ubair-website-error.log

# Verify data freshness
curl https://basinwx.com/api/live-observations | jq '.timestamp'
```

See `CLAUDE-SERVER-SYNC.md` for API key synchronization details.
