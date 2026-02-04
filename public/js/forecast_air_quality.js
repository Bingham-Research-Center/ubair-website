// public/js/forecast_air_quality.js
// Clyfar Forecast Visualization - Static PNG Mode (Dec 2025 Launch)
// Note: Plotly interactive mode disabled until January 2026
import { loadAndRenderMarkdown } from './markdownLoader.js';

// API endpoints
const API_IMAGES = '/api/static/images';
const API_FORECASTS = '/api/static/forecasts';

// Helper: Extract init time from filename (e.g., "20251129-1200" from "heatmap_UB-dailymax_ozone_20251129-1200_clyfar017.png")
function extractInitTime(filename) {
    const match = filename.match(/(\d{8}-\d{4})/);
    return match ? match[1] : null;
}

// Helper: Format init time for display ("20251129-1200" → "Nov 29, 12:00 UTC")
function formatInitTime(initTime) {
    if (!initTime) return 'Unknown';
    const [date, time] = initTime.split('-');
    const year = date.slice(0, 4);
    const month = parseInt(date.slice(4, 6), 10) - 1;
    const day = parseInt(date.slice(6, 8), 10);
    const hour = time.slice(0, 2);
    const minute = time.slice(2, 4);

    const dateObj = new Date(Date.UTC(year, month, day, parseInt(hour), parseInt(minute)));
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    return `${monthNames[month]} ${day}, ${hour}:${minute} UTC`;
}

// Helper: Group heatmaps by init time
function groupHeatmapsByInitTime(heatmaps) {
    const groups = {};
    heatmaps.forEach(f => {
        const initTime = extractInitTime(f);
        if (initTime) {
            if (!groups[initTime]) groups[initTime] = [];
            groups[initTime].push(f);
        }
    });
    // Sort each group by member number
    Object.keys(groups).forEach(key => {
        groups[key].sort();
    });
    return groups;
}

document.addEventListener('DOMContentLoaded', async function() {
    initializeTabs();
    initializeTooltips();
    loadLatestFfionOutlook();
    await loadLLMSummaries();
    await initializeClyfar();
});

async function loadLatestFfionOutlook() {
    try {
        const res = await fetch('/api/filelist/llm_outlooks');
        if (!res.ok) return;
        const files = await res.json();
        const pdfs = (Array.isArray(files) ? files : [])
            .filter(f => f.endsWith('.pdf'))
            .sort();
        if (pdfs.length === 0) return;
        const latest = pdfs[pdfs.length - 1];
        const btn = document.getElementById('ffion-outlook-btn');
        if (btn) {
            btn.href = `/api/static/llm_outlooks/${latest}`;
            btn.style.display = '';
        }
    } catch { /* button stays hidden */ }
}

function initializeTabs() {
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.summary-content');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetTab = button.getAttribute('data-tab');

            // Update active states
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));

            button.classList.add('active');
            const targetContent = document.getElementById(`${targetTab}-content`);
            if (targetContent) {
                targetContent.classList.add('active');
            }
        });
    });
}

async function loadLLMSummaries() {
    const levels = ['plain', 'extended', 'detailed'];

    for (const level of levels) {
        const contentId = `${level}-content`;
        const contentElement = document.getElementById(contentId);

        if (!contentElement) continue;

        // Show loading state
        contentElement.innerHTML = '<div class="loading">Loading summary...</div>';

        try {
            const success = await loadAndRenderMarkdown(
                `/public/data/clyfar/${level}.md`,
                contentId
            );

            if (!success) {
                // Fallback content if file doesn't exist
                contentElement.innerHTML = `
                    <div class="placeholder-content">
                        <h3>${level.charAt(0).toUpperCase() + level.slice(1)} Summary</h3>
                        <p>The ${level} summary is being prepared by our AI system and will be available soon.</p>
                        <p>This view is designed for ${getAudienceForLevel(level)}.</p>
                    </div>
                `;
            }
        } catch (error) {
            contentElement.innerHTML = `
                <div class="error-content">
                    <p>Unable to load ${level} summary. Please try refreshing the page.</p>
                </div>
            `;
        }
    }
}

function getAudienceForLevel(level) {
    const audiences = {
        'plain': 'the general public',
        'extended': 'oil, gas, and public stakeholders',
        'detailed': 'researchers with meteorology, chemistry, and statistics background'
    };
    return audiences[level] || 'all users';
}

function initializeTooltips() {
    const tooltipTriggers = document.querySelectorAll('[data-tooltip]');
    let tooltip = document.getElementById('tooltip');

    if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.id = 'tooltip';
        tooltip.className = 'tooltip';
        tooltip.setAttribute('role', 'tooltip');
        document.body.appendChild(tooltip);
    }

    tooltipTriggers.forEach(trigger => {
        trigger.addEventListener('mouseenter', (e) => {
            tooltip.textContent = e.target.getAttribute('data-tooltip');
            tooltip.classList.add('show');

            // Position tooltip
            const rect = e.target.getBoundingClientRect();
            const tooltipRect = tooltip.getBoundingClientRect();

            let left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);
            let top = rect.top - tooltipRect.height - 10;

            // Keep tooltip within viewport
            if (left < 10) left = 10;
            if (left + tooltipRect.width > window.innerWidth - 10) {
                left = window.innerWidth - tooltipRect.width - 10;
            }
            if (top < 10) {
                top = rect.bottom + 10;
                tooltip.classList.add('bottom');
            } else {
                tooltip.classList.remove('bottom');
            }

            tooltip.style.left = left + 'px';
            tooltip.style.top = top + 'px';
        });

        trigger.addEventListener('mouseleave', () => {
            tooltip.classList.remove('show');
        });
    });
}

// Store heatmaps globally for dropdown switching
let dailymaxHeatmaps = [];
let currentInitTime = null;
let heatmapsByInitTime = {};
let clusteringData = null; // clustering_summary.json content
let memberMode = false; // false = cluster view, true = member dropdown

// Convert clustering init "20260121_0600Z" to heatmap init "20260121-0600"
function clusterInitToHeatmapInit(clusterInit) {
    return clusterInit.replace('Z', '').replace('_', '-');
}

// Find clustering data matching the current init time
function getClusteringForInit(initTime) {
    if (!clusteringData) return null;
    const clusterInit = clusterInitToHeatmapInit(clusteringData.init);
    return clusterInit === initTime ? clusteringData : null;
}

// Find heatmap filename for a given clyfar member ID (e.g., "clyfar000")
function findHeatmapForMember(memberId) {
    return dailymaxHeatmaps.find(f => f.includes(memberId));
}

async function fetchClusteringData() {
    try {
        const res = await fetch('/api/filelist/forecasts');
        if (!res.ok) return null;
        const files = await res.json();
        const clusterFile = (Array.isArray(files) ? files : [])
            .find(f => f === 'clustering_summary.json');
        if (!clusterFile) return null;
        const dataRes = await fetch(`${API_FORECASTS}/${clusterFile}`);
        if (!dataRes.ok) return null;
        return await dataRes.json();
    } catch { return null; }
}

async function initializeClyfar() {
    try {
        const [imageFiles, clustering] = await Promise.all([
            fetchImageList(),
            fetchClusteringData()
        ]);
        clusteringData = clustering;

        // Find dailymax heatmaps (filter out poss_ozone)
        const allHeatmaps = findDailymaxHeatmaps(imageFiles);

        if (allHeatmaps.length > 0) {
            // Group by init time
            heatmapsByInitTime = groupHeatmapsByInitTime(allHeatmaps);
            const initTimes = Object.keys(heatmapsByInitTime).sort().reverse();

            if (initTimes.length > 0) {
                currentInitTime = initTimes[0];
                dailymaxHeatmaps = heatmapsByInitTime[currentInitTime];

                createDropdowns(initTimes);
                showDefaultView();
            } else {
                showNoDataMessage();
            }
        } else {
            showNoDataMessage();
        }

        // Find meteogram
        const meteogramFile = findLatestImage(imageFiles, 'meteogram');
        renderStaticImage('scenario-chart', meteogramFile, 'Ozone Forecast Scenarios');

        // Try to load JSON forecast data for summary cards
        await loadForecastJSON();

    } catch (error) {
        console.error('Error initializing Clyfar:', error);
        showNoDataMessage();
    }
}

function showDefaultView() {
    const clustering = getClusteringForInit(currentInitTime);
    if (clustering && !memberMode) {
        showClusterView(clustering);
    } else {
        showMemberView();
    }
}

function showClusterView(clustering) {
    const clusterRow = document.getElementById('cluster-buttons');
    const memberRow = document.getElementById('member-selector-group');
    if (clusterRow) clusterRow.style.display = '';
    if (memberRow) memberRow.style.display = 'none';

    // Build cluster buttons
    if (clusterRow) {
        clusterRow.innerHTML = clustering.clusters.map((c, i) => {
            const pct = Math.round(c.fraction * 100);
            return `<button class="cluster-btn${i === 0 ? ' active' : ''}" data-medoid="${c.medoid}" data-idx="${i}" title="${c.members.length} members, ${c.clyfar_ozone.risk_level} ozone risk">Cluster ${c.id} (${pct}%)</button>`;
        }).join('');

        // Bind click events
        clusterRow.querySelectorAll('.cluster-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                clusterRow.querySelectorAll('.cluster-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const medoid = btn.dataset.medoid;
                const heatmap = findHeatmapForMember(medoid);
                renderStaticImage('heatmap-image-container', heatmap, 'Daily Max Ozone Heatmap');
            });
        });

        // Show first cluster's medoid
        const firstMedoid = clustering.clusters[0].medoid;
        renderStaticImage('heatmap-image-container', findHeatmapForMember(firstMedoid), 'Daily Max Ozone Heatmap');
    }
}

function showMemberView() {
    const clusterRow = document.getElementById('cluster-buttons');
    const memberRow = document.getElementById('member-selector-group');
    if (clusterRow) clusterRow.style.display = 'none';
    if (memberRow) memberRow.style.display = '';

    updateMemberDropdown();

    // Show first member
    if (dailymaxHeatmaps.length > 0) {
        renderStaticImage('heatmap-image-container', dailymaxHeatmaps[0], 'Daily Max Ozone Heatmap');
    }
}

function createDropdowns(initTimes) {
    const container = document.getElementById('exceedance-heatmap');
    if (!container) return;

    const clustering = getClusteringForInit(currentInitTime);
    const hasCluster = !!clustering;

    const wrapper = document.createElement('div');
    wrapper.className = 'heatmap-with-dropdown';
    wrapper.innerHTML = `
        <div class="dropdown-row">
            <div class="dropdown-group">
                <label for="inittime-selector">Forecast Run:</label>
                <select id="inittime-selector" class="member-dropdown"></select>
            </div>
            <div class="dropdown-group toggle-group">
                <label class="toggle-label" for="member-mode-toggle">
                    <input type="checkbox" id="member-mode-toggle" ${hasCluster ? '' : 'checked disabled'}>
                    Choose by member
                </label>
            </div>
        </div>
        <div id="cluster-buttons" class="cluster-buttons" style="${hasCluster ? '' : 'display:none'}"></div>
        <div id="member-selector-group" class="dropdown-group" style="${hasCluster ? 'display:none' : ''}">
            <label for="member-selector">Ensemble Member:</label>
            <select id="member-selector" class="member-dropdown"></select>
        </div>
        <div id="heatmap-image-container"></div>
    `;

    container.innerHTML = '';
    container.appendChild(wrapper);

    // Populate init time dropdown
    const initTimeDropdown = document.getElementById('inittime-selector');
    initTimes.forEach(time => {
        const option = document.createElement('option');
        option.value = time;
        option.textContent = formatInitTime(time);
        initTimeDropdown.appendChild(option);
    });

    // Populate member dropdown
    updateMemberDropdown();

    // Event: init time changed
    initTimeDropdown.addEventListener('change', (e) => {
        currentInitTime = e.target.value;
        dailymaxHeatmaps = heatmapsByInitTime[currentInitTime];

        const newClustering = getClusteringForInit(currentInitTime);
        const toggle = document.getElementById('member-mode-toggle');
        if (newClustering) {
            toggle.disabled = false;
            if (!memberMode) {
                toggle.checked = false;
            }
        } else {
            toggle.checked = true;
            toggle.disabled = true;
            memberMode = true;
        }

        updateMemberDropdown();
        showDefaultView();
    });

    // Event: member changed
    document.getElementById('member-selector').addEventListener('change', (e) => {
        const idx = parseInt(e.target.value, 10);
        renderStaticImage('heatmap-image-container', dailymaxHeatmaps[idx], 'Daily Max Ozone Heatmap');
    });

    // Event: toggle cluster/member mode
    document.getElementById('member-mode-toggle').addEventListener('change', (e) => {
        memberMode = e.target.checked;
        showDefaultView();
    });
}

function updateMemberDropdown() {
    const dropdown = document.getElementById('member-selector');
    if (!dropdown) return;

    dropdown.innerHTML = '';
    dailymaxHeatmaps.forEach((f, idx) => {
        const match = f.match(/clyfar(\d{3})/);
        if (!match) return;
        const clyfarId = `clyfar${match[1]}`;
        const memberNum = parseInt(match[1], 10) + 1;
        const option = document.createElement('option');
        option.value = idx;
        option.textContent = `Member ${memberNum} (${clyfarId})`;
        dropdown.appendChild(option);
    });
}

async function fetchImageList() {
    try {
        const response = await fetch('/api/filelist/images');
        if (!response.ok) return [];
        const data = await response.json();
        // Return array of image filenames
        return Array.isArray(data) ? data : (data.files || []);
    } catch {
        return [];
    }
}

function findDailymaxHeatmaps(files) {
    // Filter for dailymax heatmaps only (not poss_ozone)
    const matches = files.filter(f =>
        f.includes('dailymax') && f.includes('heatmap') && f.endsWith('.png')
    );
    if (matches.length === 0) return [];
    // Sort by filename
    matches.sort();
    return matches;
}

function findLatestImage(files, pattern) {
    // Filter for PNGs matching pattern (e.g., 'heatmap', 'meteogram')
    const matches = files.filter(f =>
        f.toLowerCase().includes(pattern) && f.endsWith('.png')
    );
    if (matches.length === 0) return null;
    // Sort by filename (assumes timestamp in name like YYYYMMDD)
    matches.sort().reverse();
    return matches[0];
}

function renderStaticImage(containerId, filename, altText) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!filename) {
        container.innerHTML = `
            <div class="chart-no-data">
                <i class="fas fa-cloud-sun fa-3x"></i>
                <p>Forecast image not yet available</p>
                <small>Forecasts are generated 4× daily</small>
            </div>
        `;
        return;
    }

    container.innerHTML = `
        <img
            src="${API_IMAGES}/${filename}"
            alt="${altText}"
            class="forecast-image"
            loading="lazy"
            onerror="this.parentElement.innerHTML='<div class=\\'chart-error\\'><i class=\\'fas fa-exclamation-triangle\\'></i><p>Image failed to load</p></div>'"
        />
    `;
}

// Fetch and display JSON forecast data for summary cards
async function loadForecastJSON() {
    try {
        // Get list of forecast JSON files
        const response = await fetch('/api/filelist/forecasts');
        if (!response.ok) {
            updateSummaryCardsStatic();
            return;
        }

        const files = await response.json();
        const forecastFiles = (Array.isArray(files) ? files : [])
            .filter(f => f.includes('exceedance_probabilities') && f.endsWith('.json'));

        if (forecastFiles.length === 0) {
            updateSummaryCardsStatic();
            return;
        }

        // Get latest file (sort descending by filename which includes timestamp)
        forecastFiles.sort().reverse();
        const latestFile = forecastFiles[0];

        // Fetch the forecast data
        const dataResponse = await fetch(`${API_FORECASTS}/${latestFile}`);
        if (!dataResponse.ok) {
            updateSummaryCardsStatic();
            return;
        }

        const forecastData = await dataResponse.json();
        updateSummaryCards(forecastData);

    } catch (error) {
        console.error('Error loading forecast JSON:', error);
        updateSummaryCardsStatic();
    }
}

// Update summary cards with real forecast data
function updateSummaryCards(data) {
    // Map ozone level to display text and color class
    const levelInfo = {
        'background': { text: 'Background', color: 'level-background' },
        'moderate': { text: 'Moderate', color: 'level-moderate' },
        'elevated': { text: 'Elevated', color: 'level-elevated' },
        'extreme': { text: 'Extreme', color: 'level-extreme' }
    };

    // Handle different possible JSON structures
    const forecasts = data.daily_forecast || data.forecasts || data;

    if (Array.isArray(forecasts) && forecasts.length > 0) {
        // Today's forecast (index 0)
        const today = forecasts[0];
        const todayLevel = document.querySelector('.summary-card.current .forecast-level');
        const todayConf = document.querySelector('.summary-card.current .confidence');

        if (todayLevel && today) {
            const level = today.ozone_level || today.level || 'background';
            const info = levelInfo[level] || levelInfo['background'];
            todayLevel.textContent = info.text;
            todayLevel.className = `forecast-level ${info.color}`;

            if (todayConf) {
                const conf = today.confidence || today.exceedance_probability;
                if (typeof conf === 'number') {
                    todayConf.textContent = `${Math.round(conf * 100)}% exceedance prob.`;
                } else if (conf) {
                    todayConf.textContent = `${conf} confidence`;
                }
            }
        }

        // Tomorrow's forecast (index 1)
        if (forecasts.length > 1) {
            const tomorrow = forecasts[1];
            const tomorrowLevel = document.querySelector('.summary-card.tomorrow .forecast-level');
            const tomorrowConf = document.querySelector('.summary-card.tomorrow .confidence');

            if (tomorrowLevel && tomorrow) {
                const level = tomorrow.ozone_level || tomorrow.level || 'background';
                const info = levelInfo[level] || levelInfo['background'];
                tomorrowLevel.textContent = info.text;
                tomorrowLevel.className = `forecast-level ${info.color}`;

                if (tomorrowConf) {
                    const conf = tomorrow.confidence || tomorrow.exceedance_probability;
                    if (typeof conf === 'number') {
                        tomorrowConf.textContent = `${Math.round(conf * 100)}% exceedance prob.`;
                    } else if (conf) {
                        tomorrowConf.textContent = `${conf} confidence`;
                    }
                }
            }
        }

        // 7-day trend
        const weekTrend = document.querySelector('.summary-card.week .forecast-level');
        if (weekTrend && forecasts.length >= 7) {
            // Calculate trend from first 7 days
            const weekLevels = forecasts.slice(0, 7).map(f =>
                f.exceedance_probability || 0
            );
            const avgProb = weekLevels.reduce((a, b) => a + b, 0) / weekLevels.length;

            if (avgProb < 0.2) {
                weekTrend.textContent = 'Low Risk';
                weekTrend.className = 'forecast-level level-background';
            } else if (avgProb < 0.5) {
                weekTrend.textContent = 'Moderate Risk';
                weekTrend.className = 'forecast-level level-moderate';
            } else if (avgProb < 0.7) {
                weekTrend.textContent = 'Elevated Risk';
                weekTrend.className = 'forecast-level level-elevated';
            } else {
                weekTrend.textContent = 'High Risk';
                weekTrend.className = 'forecast-level level-extreme';
            }
        } else if (weekTrend) {
            weekTrend.textContent = 'See Chart';
        }
    } else {
        // Fallback to static
        updateSummaryCardsStatic();
    }
}

function updateSummaryCardsStatic() {
    // Set placeholder values for summary cards when JSON data is unavailable
    const todayLevel = document.querySelector('.summary-card.current .forecast-level');
    const todayConf = document.querySelector('.summary-card.current .confidence');
    if (todayLevel) todayLevel.textContent = 'See Chart';
    if (todayConf) todayConf.textContent = 'Check forecast image';

    const tomorrowLevel = document.querySelector('.summary-card.tomorrow .forecast-level');
    const tomorrowConf = document.querySelector('.summary-card.tomorrow .confidence');
    if (tomorrowLevel) tomorrowLevel.textContent = 'See Chart';
    if (tomorrowConf) tomorrowConf.textContent = 'Check forecast image';

    const weekTrend = document.querySelector('.summary-card.week .forecast-level');
    if (weekTrend) weekTrend.textContent = 'See Chart';
}

function showNoDataMessage() {
    const heatmap = document.getElementById('exceedance-heatmap');
    const scenario = document.getElementById('scenario-chart');

    const msg = `
        <div class="chart-no-data">
            <i class="fas fa-cloud-sun fa-3x"></i>
            <p>No forecast data available yet</p>
            <small>Forecasts are generated 4× daily</small>
        </div>
    `;

    if (heatmap) heatmap.innerHTML = msg;
    if (scenario) scenario.innerHTML = msg;
}

function showErrorMessage() {
    const heatmap = document.getElementById('exceedance-heatmap');
    const scenario = document.getElementById('scenario-chart');

    const msg = `
        <div class="chart-error">
            <i class="fas fa-exclamation-circle fa-3x"></i>
            <p>Error loading forecast data</p>
            <small>Please try refreshing the page</small>
        </div>
    `;

    if (heatmap) heatmap.innerHTML = msg;
    if (scenario) scenario.innerHTML = msg;
}
