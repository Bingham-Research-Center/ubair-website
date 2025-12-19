// Weather Forecast Page - GEFS Meteogram Implementation

const API_IMAGES = '/api/static/images';
const GEFS_VARIABLES = ['temp', 'wind', 'mslp', 'snow', 'solar'];

// State
let weatherMap;
let allMeteograms = [];
let currentModel = 'GEFS';
let currentInitTime = null;
let currentVariable = 'temp';

document.addEventListener('DOMContentLoaded', function() {
    setupWeatherMap();
    initializeKioskMode();
    initializeMeteograms();
    setupMeteogramTabs();
    setupFullscreen();
});

// ============================================
// MAP SETUP
// ============================================

function setupWeatherMap() {
    const mapElement = document.getElementById('weather-map');
    if (!mapElement) return;

    weatherMap = L.map('weather-map', {
        zoomControl: true
    }).setView([40.3033, -110.0153], 9);

    // Add base map
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 15,
        attribution: '© OpenStreetMap contributors'
    }).addTo(weatherMap);
}

// ============================================
// METEOGRAM SECTION
// ============================================

async function initializeMeteograms() {
    try {
        // Fetch list of images
        const response = await fetch('/api/filelist/images');
        if (!response.ok) {
            showMeteogramError('Unable to fetch image list');
            return;
        }

        const files = await response.json();
        const imageList = Array.isArray(files) ? files : (files.files || []);

        // Filter for GEFS meteograms
        // Pattern: meteogram_UB-repr_{variable}_{date}-{time}_GEFS.png
        allMeteograms = imageList.filter(f =>
            f.includes('meteogram_UB-repr') && f.endsWith('_GEFS.png')
        );

        if (allMeteograms.length === 0) {
            showMeteogramError('No GEFS meteogram data available yet');
            return;
        }

        // Extract unique init times
        const initTimes = extractInitTimes(allMeteograms);
        if (initTimes.length === 0) {
            showMeteogramError('No valid init times found');
            return;
        }

        // Populate init time dropdown
        populateInitTimeDropdown(initTimes);

        // Select most recent init time
        currentInitTime = initTimes[0];

        // Setup event listeners
        setupMeteogramControls();

        // Render meteograms for current selection
        renderMeteograms();

    } catch (error) {
        console.error('Error initializing meteograms:', error);
        showMeteogramError('Error loading meteogram data');
    }
}

// Extract init time from filename (e.g., "20251129-1200" from "meteogram_UB-repr_temp_20251129-1200_GEFS.png")
function extractInitTime(filename) {
    const match = filename.match(/(\d{8}-\d{4})/);
    return match ? match[1] : null;
}

// Get unique init times sorted descending (most recent first)
function extractInitTimes(files) {
    const times = new Set();
    files.forEach(f => {
        const time = extractInitTime(f);
        if (time) times.add(time);
    });
    return Array.from(times).sort().reverse();
}

// Format init time for display ("20251129-1200" → "Nov 29, 12:00 UTC")
function formatInitTime(initTime) {
    if (!initTime) return 'Unknown';
    const [date, time] = initTime.split('-');
    const year = date.slice(0, 4);
    const month = parseInt(date.slice(4, 6), 10) - 1;
    const day = parseInt(date.slice(6, 8), 10);
    const hour = time.slice(0, 2);
    const minute = time.slice(2, 4);

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${monthNames[month]} ${day}, ${hour}:${minute} UTC`;
}

function populateInitTimeDropdown(initTimes) {
    const dropdown = document.getElementById('meteogram-inittime');
    if (!dropdown) return;

    dropdown.innerHTML = '';
    initTimes.forEach(time => {
        const option = document.createElement('option');
        option.value = time;
        option.textContent = formatInitTime(time);
        dropdown.appendChild(option);
    });
}

function setupMeteogramControls() {
    // Model selector (currently only GEFS)
    const modelDropdown = document.getElementById('model-selector');
    if (modelDropdown) {
        modelDropdown.addEventListener('change', (e) => {
            currentModel = e.target.value;
            renderMeteograms();
        });
    }

    // Init time selector
    const initTimeDropdown = document.getElementById('meteogram-inittime');
    if (initTimeDropdown) {
        initTimeDropdown.addEventListener('change', (e) => {
            currentInitTime = e.target.value;
            renderMeteograms();
        });
    }
}

function renderMeteograms() {
    renderCurrentMeteogram();
}

function renderCurrentMeteogram() {
    const container = document.getElementById('meteogram-current');
    if (!container) return;

    // Filter meteograms for current init time and model
    const filtered = allMeteograms.filter(f =>
        f.includes(currentInitTime) && f.includes(currentModel)
    );

    // Find image for current variable
    const img = filtered.find(f => f.includes(`_${currentVariable}_`));

    if (img) {
        container.innerHTML = `
            <img
                src="${API_IMAGES}/${img}"
                alt="${currentVariable} meteogram"
                class="meteogram-img"
                loading="lazy"
                onclick="openFullscreen(this.src)"
                onerror="this.parentElement.innerHTML='<div class=\\'chart-error\\'><i class=\\'fas fa-exclamation-triangle\\'></i><p>Image failed to load</p></div>'"
            />
        `;
    } else {
        container.innerHTML = `
            <div class="chart-no-data">
                <i class="fas fa-cloud-sun"></i>
                <p>No data available for ${currentVariable}</p>
            </div>
        `;
    }
}

function showMeteogramError(message) {
    const container = document.getElementById('meteogram-current');
    if (container) {
        container.innerHTML = `
            <div class="chart-no-data">
                <i class="fas fa-exclamation-circle"></i>
                <p>${message}</p>
            </div>
        `;
    }
}

// ============================================
// TAB SWITCHING
// ============================================

function setupMeteogramTabs() {
    const tabs = document.querySelectorAll('.meteogram-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Update active state
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            // Update current variable and render
            currentVariable = tab.dataset.variable;
            renderCurrentMeteogram();
        });
    });
}

// ============================================
// FULLSCREEN
// ============================================

function setupFullscreen() {
    const fullscreenBtn = document.getElementById('fullscreen-btn');
    const modal = document.getElementById('meteogram-modal');
    const modalClose = document.getElementById('modal-close');

    if (fullscreenBtn) {
        fullscreenBtn.addEventListener('click', () => {
            const img = document.querySelector('#meteogram-current .meteogram-img');
            if (img) {
                openFullscreen(img.src);
            }
        });
    }

    if (modalClose) {
        modalClose.addEventListener('click', closeFullscreen);
    }

    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeFullscreen();
            }
        });
    }

    // ESC key to close
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeFullscreen();
        }
    });
}

function openFullscreen(src) {
    const modal = document.getElementById('meteogram-modal');
    const content = document.getElementById('modal-content');

    if (modal && content) {
        content.innerHTML = `<img src="${src}" alt="Meteogram fullscreen" />`;
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

function closeFullscreen() {
    const modal = document.getElementById('meteogram-modal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

// ============================================
// KIOSK MODE
// ============================================

let kioskMode = false;
let kioskInterval;

function initializeKioskMode() {
    const kioskToggle = document.getElementById('kiosk-toggle');
    if (!kioskToggle) return;

    kioskToggle.addEventListener('click', function() {
        if (kioskMode) {
            stopKioskMode();
            this.innerHTML = '<i class="fas fa-play"></i> Start Kiosk Mode';
        } else {
            startKioskMode();
            this.innerHTML = '<i class="fas fa-stop"></i> Stop Kiosk Mode';
        }
    });
}

function startKioskMode() {
    kioskMode = true;
    const status = document.getElementById('kiosk-status');
    if (status) {
        status.querySelector('.status-text').textContent = 'Kiosk Mode Active';
    }
}

function stopKioskMode() {
    kioskMode = false;
    if (kioskInterval) {
        clearInterval(kioskInterval);
    }
    const status = document.getElementById('kiosk-status');
    if (status) {
        status.querySelector('.status-text').textContent = 'Manual Mode';
    }
}
