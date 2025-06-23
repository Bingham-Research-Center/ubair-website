document.addEventListener('DOMContentLoaded', async function() {
    // Initialize tooltips
    initializeTooltips();

    // Load latest outlook preview
    await loadOutlookPreview();

    // Initialize Clyfar visualizations (placeholder for now)
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

async function loadOutlookPreview() {
    try {
        const response = await fetch('/public/data/outlooks/outlooks_list.json');
        const outlooks = await response.json();

        if (outlooks.length === 0) return;

        const latestOutlook = outlooks[0];
        const outlookResponse = await fetch(`/public/data/outlooks/${latestOutlook.filename}`);
        const content = await outlookResponse.text();

        // Extract first two lines
        const lines = content.split('\n').filter(line => line.trim() !== '').slice(0, 2);
        document.getElementById('outlook-preview').innerHTML = lines.join('<br>');

    } catch (error) {
        console.error('Error loading outlook preview:', error);
        document.getElementById('outlook-preview').textContent = 'Error loading outlook preview.';
    }
}

function initializeClyfarpages() {
    // Placeholder for Clyfar visualization initialization
    // This would eventually connect to your Clyfar data APIs
    console.log('Clyfar visualizations initialized');
}