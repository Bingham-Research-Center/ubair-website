// Function to load observations data
async function loadObservations() {
    try {
        const response = await fetch('/public/data/test_liveobs.json');
        return await response.json();
    } catch (error) {
        console.error('Error loading observations:', error);
        return null;
    }
}

// Function to load wind data
async function loadWindData() {
    try {
        const response = await fetch('/public/data/test_wind_ts.json');
        return await response.json();
    } catch (error) {
        console.error('Error loading wind data:', error);
        return null;
    }
}

// Function to load latest outlook
async function loadLatestOutlook() {
    try {
        const response = await fetch('/public/data/outlooks/latest.txt');
        return await response.text();
    } catch (error) {
        console.error('Error loading outlook:', error);
        return null;
    }
}

// Function to list available outlooks
async function listOutlooks() {
    try {
        const response = await fetch('/public/data/outlooks/');
        const files = await response.text();
        // Parse the directory listing (this will depend on your server configuration)
        return files
            .split('\n')
            .filter(file => file.endsWith('.txt'))
            .sort()
            .reverse();
    } catch (error) {
        console.error('Error listing outlooks:', error);
        return [];
    }
}