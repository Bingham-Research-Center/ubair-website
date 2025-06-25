document.addEventListener('DOMContentLoaded', async function() {
    initializeTooltips();
    await loadLLMSummaries();
    initializeClyfarpages();
});

async function loadLLMSummaries() {
    const md = markdownit({ html: true, linkify: true, typographer: true });

    // Setup tab switching (keep existing code)

    // Fix the file paths and error handling
    const levels = ['plain', 'extended', 'detailed'];
    for (const level of levels) {
        try {
            const response = await fetch(`/public/data/clyfar/${level}.md`);
            if (response.ok) {
                const content = await response.text();
                const targetElement = document.getElementById(`${level}-content`);
                if (targetElement) {
                    targetElement.innerHTML = `<div class="markdown-content">${md.render(content)}</div>`;
                }
            } else {
                console.log(`${level}.md not found, using placeholder`);
                const targetElement = document.getElementById(`${level}-content`);
                if (targetElement) {
                    targetElement.innerHTML = `<p>The ${level} summary is being prepared and will be available soon.</p>`;
                }
            }
        } catch (error) {
            console.error(`Error loading ${level} summary:`, error);
            const targetElement = document.getElementById(`${level}-content`);
            if (targetElement) {
                targetElement.innerHTML = `<p>Error loading ${level} summary. Please try again later.</p>`;
            }
        }
    }
}

// Fix tooltip positioning
function initializeTooltips() {
    const tooltipTriggers = document.querySelectorAll('[data-tooltip]');
    let tooltip = document.getElementById('tooltip');

    if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.id = 'tooltip';
        tooltip.className = 'tooltip';
        document.body.appendChild(tooltip);
    }

    tooltipTriggers.forEach(trigger => {
        trigger.addEventListener('mouseenter', (e) => {
            const text = e.target.getAttribute('data-tooltip');
            tooltip.textContent = text;
            tooltip.classList.add('show');

            const rect = e.target.getBoundingClientRect();
            const tooltipRect = tooltip.getBoundingClientRect();

            // Position tooltip to the left if too far right
            let left = rect.left;
            if (left + tooltipRect.width > window.innerWidth - 20) {
                left = window.innerWidth - tooltipRect.width - 20;
            }

            tooltip.style.left = left + 'px';
            tooltip.style.top = (rect.top - tooltipRect.height - 10) + 'px';
        });

        trigger.addEventListener('mouseleave', () => {
            tooltip.classList.remove('show');
        });
    });
}

function initializeClyfarpages() {
    console.log('Clyfar visualizations initialized');
}