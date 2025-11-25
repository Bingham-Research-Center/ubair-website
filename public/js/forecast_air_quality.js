// public/js/forecast_air_quality.js
// Clyfar Forecast Visualization with Plotly.js
import { loadAndRenderMarkdown } from './markdownLoader.js';

// Ozone category colors (matching CSS legend)
const OZONE_COLORS = {
    background: '#4CAF50',  // Green
    moderate: '#FFC107',    // Yellow
    elevated: '#FF9800',    // Orange
    extreme: '#F44336'      // Red
};

// API endpoints
const API_BASE = '/api/static/forecasts';

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
    // Fetch latest forecast file list
    try {
        const fileList = await fetchFileList();
        if (!fileList || fileList.length === 0) {
            showNoDataMessage();
            return;
        }

        // Find most recent exceedance and percentile files
        const exceedanceFile = findLatestFile(fileList, 'exceedance_probabilities');
        const percentileFile = findLatestFile(fileList, 'percentile_scenarios_c00');

        // Load and render charts
        if (exceedanceFile) {
            await renderExceedanceHeatmap(exceedanceFile);
        }
        if (percentileFile) {
            await renderScenarioChart(percentileFile);
        }

        // Update summary cards with latest data
        updateSummaryCards(exceedanceFile);

    } catch (error) {
        console.error('Error initializing Clyfar:', error);
        showErrorMessage();
    }
}

async function fetchFileList() {
    try {
        const response = await fetch('/api/filelist.json');
        if (!response.ok) return [];
        const data = await response.json();
        // Filter for forecast files only
        return (data.files || []).filter(f => f.startsWith('forecast_'));
    } catch {
        return [];
    }
}

function findLatestFile(files, pattern) {
    const matches = files.filter(f => f.includes(pattern));
    if (matches.length === 0) return null;
    // Sort by timestamp in filename (YYYYMMDD_HHMMZ)
    matches.sort().reverse();
    return matches[0];
}

async function renderExceedanceHeatmap(filename) {
    const container = document.getElementById('exceedance-heatmap');
    if (!container) return;

    try {
        const response = await fetch(`${API_BASE}/${filename}`);
        if (!response.ok) throw new Error('Failed to fetch exceedance data');
        const data = await response.json();

        const { forecast_dates, exceedance_probabilities, metadata } = data;

        // Build heatmap data
        const thresholds = ['30ppb', '50ppb', '60ppb', '75ppb'];
        const labels = ['Background (30)', 'Moderate (50)', 'Elevated (60)', 'Extreme (75)'];
        const z = thresholds.map(t => exceedance_probabilities[t] || []);

        const heatmapData = [{
            z: z,
            x: forecast_dates,
            y: labels,
            type: 'heatmap',
            colorscale: [
                [0, '#E8F5E9'],
                [0.25, '#FFF9C4'],
                [0.5, '#FFCC80'],
                [0.75, '#EF9A9A'],
                [1, '#E53935']
            ],
            zmin: 0,
            zmax: 1,
            hoverongaps: false,
            hovertemplate: '%{y}<br>Date: %{x}<br>Probability: %{z:.0%}<extra></extra>',
            colorbar: {
                title: 'Probability',
                tickformat: '.0%'
            }
        }];

        const layout = {
            title: {
                text: `Exceedance Probabilities (${metadata?.num_members || '?'} members)`,
                font: { size: 14 }
            },
            xaxis: {
                title: 'Forecast Date',
                tickangle: -45
            },
            yaxis: {
                title: 'Threshold'
            },
            margin: { l: 120, r: 60, t: 50, b: 80 },
            paper_bgcolor: 'rgba(0,0,0,0)',
            plot_bgcolor: 'rgba(0,0,0,0)'
        };

        const config = {
            responsive: true,
            displayModeBar: true,
            modeBarButtonsToRemove: ['lasso2d', 'select2d']
        };

        Plotly.newPlot(container, heatmapData, layout, config);

    } catch (error) {
        console.error('Error rendering heatmap:', error);
        container.innerHTML = `
            <div class="chart-error">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Unable to load exceedance data</p>
            </div>
        `;
    }
}

async function renderScenarioChart(filename) {
    const container = document.getElementById('scenario-chart');
    if (!container) return;

    try {
        const response = await fetch(`${API_BASE}/${filename}`);
        if (!response.ok) throw new Error('Failed to fetch scenario data');
        const data = await response.json();

        const { forecast_dates, scenarios, metadata } = data;

        const traces = [
            {
                x: forecast_dates,
                y: scenarios.p10 || [],
                name: 'Best Case (10th %ile)',
                type: 'scatter',
                mode: 'lines',
                line: { color: OZONE_COLORS.background, width: 2 },
                fill: 'none'
            },
            {
                x: forecast_dates,
                y: scenarios.p50 || [],
                name: 'Median (50th %ile)',
                type: 'scatter',
                mode: 'lines+markers',
                line: { color: '#2196F3', width: 3 },
                marker: { size: 6 }
            },
            {
                x: forecast_dates,
                y: scenarios.p90 || [],
                name: 'Worst Case (90th %ile)',
                type: 'scatter',
                mode: 'lines',
                line: { color: OZONE_COLORS.extreme, width: 2 },
                fill: 'tonexty',
                fillcolor: 'rgba(244, 67, 54, 0.1)'
            }
        ];

        // Add threshold reference lines
        const thresholdShapes = [
            { y: 70, color: OZONE_COLORS.moderate, label: 'NAAQS (70 ppb)' }
        ];

        const shapes = thresholdShapes.map(t => ({
            type: 'line',
            x0: forecast_dates[0],
            x1: forecast_dates[forecast_dates.length - 1],
            y0: t.y,
            y1: t.y,
            line: { color: t.color, width: 2, dash: 'dash' }
        }));

        const layout = {
            title: {
                text: `Ozone Forecast Scenarios (${metadata?.member || 'Control'})`,
                font: { size: 14 }
            },
            xaxis: {
                title: 'Forecast Date',
                tickangle: -45
            },
            yaxis: {
                title: 'Ozone (ppb)',
                rangemode: 'tozero'
            },
            shapes: shapes,
            legend: {
                orientation: 'h',
                y: -0.25
            },
            margin: { l: 60, r: 30, t: 50, b: 100 },
            paper_bgcolor: 'rgba(0,0,0,0)',
            plot_bgcolor: 'rgba(0,0,0,0)',
            hovermode: 'x unified'
        };

        const config = {
            responsive: true,
            displayModeBar: true,
            modeBarButtonsToRemove: ['lasso2d', 'select2d']
        };

        Plotly.newPlot(container, traces, layout, config);

    } catch (error) {
        console.error('Error rendering scenario chart:', error);
        container.innerHTML = `
            <div class="chart-error">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Unable to load scenario data</p>
            </div>
        `;
    }
}

async function updateSummaryCards(exceedanceFile) {
    if (!exceedanceFile) return;

    try {
        const response = await fetch(`${API_BASE}/${exceedanceFile}`);
        if (!response.ok) return;
        const data = await response.json();

        const { forecast_dates, exceedance_probabilities } = data;

        // Get today and tomorrow indices
        const today = new Date().toISOString().split('T')[0];
        const todayIdx = forecast_dates.indexOf(today);
        const tomorrowIdx = todayIdx >= 0 ? todayIdx + 1 : 0;

        // Determine forecast level based on exceedance probabilities
        const getLevel = (idx) => {
            if (idx < 0 || idx >= forecast_dates.length) return 'Unknown';
            const p75 = exceedance_probabilities['75ppb']?.[idx] || 0;
            const p60 = exceedance_probabilities['60ppb']?.[idx] || 0;
            const p50 = exceedance_probabilities['50ppb']?.[idx] || 0;

            if (p75 > 0.3) return 'Extreme';
            if (p60 > 0.3) return 'Elevated';
            if (p50 > 0.3) return 'Moderate';
            return 'Background';
        };

        const getConfidence = (idx) => {
            if (idx < 0) return 'Unknown';
            if (idx <= 2) return 'High Confidence';
            if (idx <= 5) return 'Medium Confidence';
            return 'Low Confidence';
        };

        // Update cards
        const todayLevel = document.querySelector('.summary-card.current .forecast-level');
        const todayConf = document.querySelector('.summary-card.current .confidence');
        if (todayLevel) todayLevel.textContent = getLevel(todayIdx >= 0 ? todayIdx : 0);
        if (todayConf) todayConf.textContent = getConfidence(0);

        const tomorrowLevel = document.querySelector('.summary-card.tomorrow .forecast-level');
        const tomorrowConf = document.querySelector('.summary-card.tomorrow .confidence');
        if (tomorrowLevel) tomorrowLevel.textContent = getLevel(tomorrowIdx);
        if (tomorrowConf) tomorrowConf.textContent = getConfidence(1);

        // 7-day trend
        const weekTrend = document.querySelector('.summary-card.week .forecast-level');
        if (weekTrend && forecast_dates.length >= 7) {
            const p50_first = exceedance_probabilities['50ppb']?.[0] || 0;
            const p50_7day = exceedance_probabilities['50ppb']?.[6] || 0;
            if (p50_7day > p50_first + 0.1) weekTrend.textContent = 'Increasing';
            else if (p50_7day < p50_first - 0.1) weekTrend.textContent = 'Decreasing';
            else weekTrend.textContent = 'Stable';
        }

    } catch (error) {
        console.error('Error updating summary cards:', error);
    }
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
