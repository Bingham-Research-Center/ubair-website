document.addEventListener('DOMContentLoaded', async function() {
    initializeTooltips();
    await loadLLMSummaries();
    initializeClyfarpages();
});

function initializeTooltips() {
    const tooltipTriggers = document.querySelectorAll('[data-tooltip]');
    const tooltip = document.getElementById('tooltip');

    tooltipTriggers.forEach(trigger => {
        trigger.addEventListener('mouseenter', (e) => {
            const text = e.target.getAttribute('data-tooltip');
            tooltip.textContent = text;
            tooltip.classList.add('show');

            const rect = e.target.getBoundingClientRect();
            tooltip.style.left = rect.left + 'px';
            tooltip.style.top = (rect.top - tooltip.offsetHeight - 10) + 'px';
        });

        trigger.addEventListener('mouseleave', () => {
            tooltip.classList.remove('show');
        });
    });
}

async function loadLLMSummaries() {
    const md = markdownit({ html: true, linkify: true, typographer: true });

    // Setup tab switching
    const tabButtons = document.querySelectorAll('.tab-button');
    const summaryContents = document.querySelectorAll('.summary-content');

    tabButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            e.preventDefault();
            const tab = button.dataset.tab;

            // Update active states
            tabButtons.forEach(b => b.classList.remove('active'));
            summaryContents.forEach(c => c.classList.remove('active'));

            button.classList.add('active');
            const targetContent = document.getElementById(`${tab}-content`);
            if (targetContent) {
                targetContent.classList.add('active');
            }
        });
    });

    // Load content for each tab
    const levels = ['plain', 'extended', 'detailed'];
    for (const level of levels) {
        try {
            const response = await fetch(`/public/data/clyfar/${level}.md`);
            if (response.ok) {
                const content = await response.text();
                const targetElement = document.getElementById(`${level}-content`);
                if (targetElement) {
                    targetElement.innerHTML =
                        `<div class="markdown-content">${md.render(content)}</div>`;
                }
            } else {
                console.log(`${level}.md not found, using placeholder`);
                const targetElement = document.getElementById(`${level}-content`);
                if (targetElement) {
                    targetElement.innerHTML = `<p>${level.charAt(0).toUpperCase() + level.slice(1)} summary will be available here.</p>`;
                }
            }
        } catch (error) {
            console.error(`Error loading ${level} summary:`, error);
            const targetElement = document.getElementById(`${level}-content`);
            if (targetElement) {
                targetElement.innerHTML = `<p>Error loading ${level} summary.</p>`;
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