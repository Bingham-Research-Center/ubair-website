These are steps needed before operations. Note some is on this server and other things for CHPC (compute server)

```bash
# Might need to make the script executable
chmod +x generate-api-key.js

# Generate an API key with custom name
./generate-api-key.js weather_data_upload

# For operations use systemd environment file
sudo mkdir -p /etc/systemd/system/your-app.service.d/
echo '[Service]' | sudo tee /etc/systemd/system/your-app.service.d/environment.conf
echo 'Environment="DATA_UPLOAD_API_KEY=your_generated_key_here"' | sudo tee -a /etc/systemd/system/your-app.service.d/environment.conf

# On CHPC server, create a secure directory for API keys
mkdir -p ~/.config/weather-website
chmod 700 ~/.config/weather-website

# Create a file to store the API key
echo "your_generated_key_here" > ~/.config/weather-website/api_key
chmod 600 ~/.config/weather-website/api_key

# Create a file to store the website URL
echo "https://your-akamai-server.com" > ~/.config/weather-website/website_url
chmod 600 ~/.config/weather-website/website_url
```

JRL May 2025