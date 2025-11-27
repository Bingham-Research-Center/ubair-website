// public/js/forecast_air_quality.js
// Clyfar Forecast Visualization - Static PNG Mode (Dec 2025 Launch)
// Note: Plotly interactive mode disabled until January 2026
import { loadAndRenderMarkdown } from './markdownLoader.js';

// API endpoints
const API_IMAGES = '/api/static/images';

document.addEventListener('DOMContentLoaded', async function() {
    initializeTabs();
    initializeTooltips();
    await loadLLMSummaries();
    await initializeClyfar();
});

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

async function initializeClyfar() {
    // Static PNG mode for Dec 2025 launch
    // Fetch image file list and display static PNGs
    try {
        const imageFiles = await fetchImageList();

        // Find latest heatmap and meteogram PNGs
        const heatmapFile = findLatestImage(imageFiles, 'heatmap');
        const meteogramFile = findLatestImage(imageFiles, 'meteogram');

        // Render static images
        renderStaticImage('exceedance-heatmap', heatmapFile, 'Ozone Exceedance Heatmap');
        renderStaticImage('scenario-chart', meteogramFile, 'Ozone Forecast Scenarios');

        // Update summary cards with placeholder values
        updateSummaryCardsStatic();

    } catch (error) {
        console.error('Error initializing Clyfar:', error);
        showNoDataMessage();
    }
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

function updateSummaryCardsStatic() {
    // Set placeholder values for summary cards when using static PNGs
    // These will be updated when JSON data is also available
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
