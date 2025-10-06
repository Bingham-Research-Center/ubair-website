// public/js/forecast_air_quality.js
import { loadAndRenderMarkdown, getMarkdownRenderer } from './markdownLoader.js';
import { isExperimentalEnabled } from './devConfig.js';

document.addEventListener('DOMContentLoaded', async function() {
    initializeTabs();
    initializeTooltips();
    await loadLLMSummaries();
    initializeClyfar();
    
    // Hide confidence estimates if not enabled
    if (!isExperimentalEnabled('confidenceEstimates')) {
        const confidenceElements = document.querySelectorAll('.confidence');
        confidenceElements.forEach(element => {
            element.style.display = 'none';
        });
    }
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
            console.error(`Error loading ${level} summary:`, error);
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
            const text = e.target.getAttribute('data-tooltip');
            tooltip.textContent = text;
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

function initializeClyfar() {
    // Initialize with real data from JSON files
    // Check if the function exists before calling it
    if (typeof loadAirQualityForecastData === 'function') {
        loadAirQualityForecastData();
    } else {
        // Function not defined, use fallback or skip
        console.log('loadAirQualityForecastData function not available');
    }
}

function updateForecastCards() {
    // Generate realistic forecast values
    const forecasts = {
        today: {
            level: ['Low', 'Moderate', 'Elevated'][Math.floor(Math.random() * 3)],
            confidence: ['High', 'Medium', 'Low'][Math.floor(Math.random() * 3)]
        },
        tomorrow: {
            level: ['Low', 'Moderate', 'Elevated'][Math.floor(Math.random() * 3)],
            confidence: ['High', 'Medium', 'Low'][Math.floor(Math.random() * 3)]
        },
        week: {
            trend: ['Stable', 'Increasing', 'Decreasing', 'Variable'][Math.floor(Math.random() * 4)],
            confidence: 'Variable'
        }
    };

    // Update UI
    const todayLevel = document.querySelector('.summary-card.current .forecast-level');
    const todayConf = document.querySelector('.summary-card.current .confidence');
    const tomorrowLevel = document.querySelector('.summary-card.tomorrow .forecast-level');
    const tomorrowConf = document.querySelector('.summary-card.tomorrow .confidence');
    const weekTrend = document.querySelector('.summary-card.week .forecast-level');

    if (todayLevel) todayLevel.textContent = forecasts.today.level;
    if (tomorrowLevel) tomorrowLevel.textContent = forecasts.tomorrow.level;
    if (weekTrend) weekTrend.textContent = forecasts.week.trend;

    // Only show confidence estimates if experimental features are enabled
    if (isExperimentalEnabled('confidenceEstimates')) {
        if (todayConf) todayConf.textContent = `${forecasts.today.confidence} Confidence`;
        if (tomorrowConf) tomorrowConf.textContent = `${forecasts.tomorrow.confidence} Confidence`;
    } else {
        // Hide confidence estimates in production
        if (todayConf) todayConf.style.display = 'none';
        if (tomorrowConf) tomorrowConf.style.display = 'none';
        const weekConf = document.querySelector('.summary-card.week .confidence');
        if (weekConf) weekConf.style.display = 'none';
    }
}

function generateHeatmapDemo() {
    const heatmapPlaceholder = document.querySelector('.heatmap-overlay');
    if (heatmapPlaceholder) {
        // Remove overlay to show "heatmap"
        heatmapPlaceholder.style.display = 'none';

        // You could generate an actual heatmap visualization here
        // For now, we'll use the placeholder image
    }
}

function generateTimeSeriesDemo() {
    const chartArea = document.querySelector('.chart-area');
    if (chartArea) {
        chartArea.innerHTML = `
            <div class="forecast-chart">
                <canvas id="forecast-chart" width="400" height="200"></canvas>
                <p class="chart-caption">15-day ozone forecast scenarios</p>
            </div>
        `;
        // You could use Chart.js or another library to draw actual charts
    }
}

function updatePerformanceMetrics() {
    // Generate realistic performance metrics
    const metrics = {
        accuracy: 82 + Math.floor(Math.random() * 10), // 82-91%
        leadTime: 3 + Math.floor(Math.random() * 4), // 3-6 days
        skillScore: (0.65 + Math.random() * 0.2).toFixed(2) // 0.65-0.85
    };

    const accuracyEl = document.querySelector('.metric-card:nth-child(1) .metric-value');
    const leadTimeEl = document.querySelector('.metric-card:nth-child(2) .metric-value');
    const skillScoreEl = document.querySelector('.metric-card:nth-child(3) .metric-value');

    if (accuracyEl) accuracyEl.textContent = `${metrics.accuracy}%`;
    if (leadTimeEl) leadTimeEl.textContent = `${metrics.leadTime} days`;
    if (skillScoreEl) skillScoreEl.textContent = metrics.skillScore;
}