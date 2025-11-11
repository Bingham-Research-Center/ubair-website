// public/js/forecast_air_quality.js
import { loadAndRenderMarkdown } from './markdownLoader.js';

document.addEventListener('DOMContentLoaded', async function() {
    initializeTabs();
    initializeTooltips();
    await loadLLMSummaries();
    initializeClyfar();
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

function initializeClyfar() {
    // Clyfar initialization
}