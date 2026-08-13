# HTTPS/SSL Setup for basinwx.com

## Problem
Browsers show "Not Secure" warning for HTTP sites, which can deter users.

## Solution Options

### Option 1: Let's Encrypt (Free, Recommended)
```bash
# Install certbot
sudo apt-get install certbot

# Get SSL certificate
sudo certbot certonly --standalone -d basinwx.com

# Certificates will be in /etc/letsencrypt/live/basinwx.com/
```

### Option 2: Cloudflare (Free tier available)
1. Add domain to Cloudflare
2. Update nameservers 
3. Enable SSL in Cloudflare dashboard
4. Force HTTPS redirect

### Option 3: Update Express Server for HTTPS
```javascript
import https from 'https';
import fs from 'fs';

const options = {
  key: fs.readFileSync('/etc/letsencrypt/live/basinwx.com/privkey.pem'),
  cert: fs.readFileSync('/etc/letsencrypt/live/basinwx.com/fullchain.pem')
};

const httpsServer = https.createServer(options, app);
httpsServer.listen(443, () => {
    console.log('HTTPS Server running on port 443');
});
```

## Quick Fix for Development
Add to all HTML `<head>` sections:
```html
<meta http-equiv="Content-Security-Policy" content="upgrade-insecure-requests">
```

## Deployment Checklist
- [ ] Get SSL certificate 
- [ ] Update server.js for HTTPS
- [ ] Test certificate renewal
- [ ] Add HTTP → HTTPS redirect
- [ ] Update any hardcoded HTTP links to HTTPS