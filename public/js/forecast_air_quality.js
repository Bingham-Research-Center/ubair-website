// public/js/forecast_air_quality.js
// Clyfar forecast page: static heatmap PNGs per run, chosen by cluster or by member.
import {
    extractInitTime, formatInitTime, formatInitDate, outlookFilenameToInit, describeLatestRun,
} from './clyfarRuns.js';

// API endpoints
const API_IMAGES = '/api/static/images';
const API_FORECASTS = '/api/static/forecasts';

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
    initializeTooltips();
    loadLatestFfionOutlook();
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
            // The newest outlook can be from last season, so the button says which one it opens.
            const issued = outlookFilenameToInit(latest);
            const dateEl = document.getElementById('ffion-outlook-date');
            if (issued && dateEl) dateEl.textContent = ` (${formatInitDate(issued)})`;
            btn.style.display = '';
        }
    } catch { /* button stays hidden */ }
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
let clusteringByInit = {}; // heatmap init time → clustering data
let memberMode = false; // false = cluster view, true = member dropdown
let shortcutsInitialized = false;

// Parse init time from clustering filename:
// "forecast_clustering_summary_20260204_0600Z.json" → "20260204-0600"
function clusterFilenameToInit(filename) {
    const match = filename.match(/(\d{8})_(\d{4})Z\.json$/);
    return match ? `${match[1]}-${match[2]}` : null;
}

// Find clustering data matching the current init time
function getClusteringForInit(initTime) {
    return clusteringByInit[initTime] || null;
}

// Find heatmap filename for a given clyfar member ID (e.g., "clyfar000")
function findHeatmapForMember(memberId) {
    return dailymaxHeatmaps.find(f => f.includes(memberId));
}

async function fetchClusteringData() {
    try {
        const res = await fetch('/api/filelist/forecasts');
        if (!res.ok) return;
        const files = await res.json();
        const clusterFiles = (Array.isArray(files) ? files : [])
            .filter(f => f.startsWith('forecast_clustering_summary_') && f.endsWith('.json'));
        // Fetch all clustering files in parallel, index by init time
        const results = await Promise.all(clusterFiles.map(async (f) => {
            const initTime = clusterFilenameToInit(f);
            if (!initTime) return null;
            try {
                const r = await fetch(`${API_FORECASTS}/${f}`);
                if (!r.ok) return null;
                return { initTime, data: await r.json() };
            } catch { return null; }
        }));
        results.forEach(r => { if (r) clusteringByInit[r.initTime] = r.data; });
    } catch { /* clustering unavailable */ }
}

async function initializeClyfar() {
    try {
        const [imageFiles] = await Promise.all([
            fetchImageList(),
            fetchClusteringData()
        ]);

        // Find dailymax heatmaps (filter out poss_ozone)
        const allHeatmaps = findDailymaxHeatmaps(imageFiles);

        if (allHeatmaps.length > 0) {
            // Group by init time
            heatmapsByInitTime = groupHeatmapsByInitTime(allHeatmaps);
            const initTimes = Object.keys(heatmapsByInitTime).sort().reverse();

            if (initTimes.length > 0) {
                currentInitTime = initTimes[0];
                dailymaxHeatmaps = heatmapsByInitTime[currentInitTime];

                showRunStatus(currentInitTime);
                createDropdowns(initTimes);
                showDefaultView();
                initializeHeatmapShortcuts();
            } else {
                showNoDataMessage();
            }
        } else {
            showNoDataMessage();
        }

        // Find meteogram
        const meteogramFile = findLatestImage(imageFiles, 'meteogram');
        renderStaticImage('scenario-chart', meteogramFile, 'Ozone Forecast Scenarios');

    } catch (error) {
        console.error('Error initializing Clyfar:', error);
        showNoDataMessage();
    }
}

// Says when the newest run was, and says so prominently once it is too old to be a forecast.
function showRunStatus(latestInitTime) {
    const el = document.getElementById('clyfar-run-status');
    if (!el) return;
    const status = describeLatestRun(latestInitTime);
    if (!status) return;
    el.textContent = status.text;
    el.classList.toggle('is-stale', status.stale);
    el.hidden = false;
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

    // Sort clusters by fraction descending
    const sorted = [...clustering.clusters].sort((a, b) => b.fraction - a.fraction);

    // Build cluster buttons
    if (clusterRow) {
        clusterRow.innerHTML = sorted.map((c, i) => {
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
                renderClusterImage(medoid, heatmap);
            });
        });

        // Show first (highest-fraction) cluster's medoid
        renderClusterImage(sorted[0].medoid, findHeatmapForMember(sorted[0].medoid));
    }
}

function renderClusterImage(medoid, heatmapFile) {
    const container = document.getElementById('heatmap-image-container');
    if (!container) return;

    const title = `Representative Member (${medoid})`;
    const titleHtml = `<div class="cluster-image-title">${title}</div>`;

    if (!heatmapFile) {
        container.innerHTML = titleHtml + `
            <div class="chart-no-data">
                <i class="fas fa-cloud-sun fa-3x"></i>
                <p>Heatmap not available for ${medoid}</p>
            </div>`;
        return;
    }

    container.innerHTML = titleHtml + `
        <img src="${API_IMAGES}/${heatmapFile}" alt="Daily Max Ozone Heatmap - ${medoid}"
             class="forecast-image" loading="lazy"
             onerror="this.parentElement.innerHTML='<div class=\\'chart-error\\'><i class=\\'fas fa-exclamation-triangle\\'></i><p>Image failed to load</p></div>'" />`;
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
        <div class="heatmap-shortcuts-hint">Shortcuts: m = toggle cluster/member, &lt; = previous, &gt; = next</div>
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

function isInteractiveElement(el) {
    if (!el) return false;
    const tag = (el.tagName || '').toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable;
}

function stepMemberSelection(delta) {
    const dropdown = document.getElementById('member-selector');
    if (!dropdown || dropdown.options.length <= 1) return;

    const currentIdx = dropdown.selectedIndex >= 0 ? dropdown.selectedIndex : 0;
    const nextIdx = (currentIdx + delta + dropdown.options.length) % dropdown.options.length;
    dropdown.selectedIndex = nextIdx;

    const memberIdx = parseInt(dropdown.options[nextIdx].value, 10);
    if (!Number.isNaN(memberIdx)) {
        renderStaticImage('heatmap-image-container', dailymaxHeatmaps[memberIdx], 'Daily Max Ozone Heatmap');
    }
}

function stepClusterSelection(delta) {
    const clusterRow = document.getElementById('cluster-buttons');
    if (!clusterRow || clusterRow.style.display === 'none') return;

    const buttons = Array.from(clusterRow.querySelectorAll('.cluster-btn'));
    if (buttons.length <= 1) return;

    let currentIdx = buttons.findIndex(btn => btn.classList.contains('active'));
    if (currentIdx < 0) currentIdx = 0;
    const nextIdx = (currentIdx + delta + buttons.length) % buttons.length;

    buttons.forEach(btn => btn.classList.remove('active'));
    const target = buttons[nextIdx];
    target.classList.add('active');

    const medoid = target.dataset.medoid;
    renderClusterImage(medoid, findHeatmapForMember(medoid));
}

function toggleViewModeWithShortcut() {
    const toggle = document.getElementById('member-mode-toggle');
    if (!toggle || toggle.disabled) return;
    toggle.checked = !toggle.checked;
    memberMode = toggle.checked;
    showDefaultView();
}

function initializeHeatmapShortcuts() {
    if (shortcutsInitialized) return;
    shortcutsInitialized = true;

    document.addEventListener('keydown', (e) => {
        if (isInteractiveElement(e.target)) return;

        if (e.key.toLowerCase() === 'm') {
            e.preventDefault();
            toggleViewModeWithShortcut();
            return;
        }

        const prevPressed = e.key === '<' || (e.key === ',' && e.shiftKey);
        const nextPressed = e.key === '>' || (e.key === '.' && e.shiftKey);
        if (!prevPressed && !nextPressed) return;

        e.preventDefault();
        const delta = prevPressed ? -1 : 1;
        const hasCluster = !!getClusteringForInit(currentInitTime);
        if (!memberMode && hasCluster) {
            stepClusterSelection(delta);
        } else {
            stepMemberSelection(delta);
        }
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

function showNoDataMessage() {
    const heatmap = document.getElementById('exceedance-heatmap');
    const scenario = document.getElementById('scenario-chart');

    const msg = `
        <div class="chart-no-data">
            <i class="fas fa-cloud-sun fa-3x"></i>
            <p>No Clyfar forecast is available</p>
            <small>Clyfar runs during the winter ozone season</small>
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
