// Water page tab functionality
document.addEventListener('DOMContentLoaded', function() {
    initializeWaterTabs();
});

function initializeWaterTabs() {
    const tabs = document.querySelectorAll('.water-tab');
    const tabContents = document.querySelectorAll('.water-tab-content');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetTab = tab.getAttribute('data-tab');
            
            // Remove active class from all tabs and content
            tabs.forEach(t => t.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));
            
            // Add active class to clicked tab
            tab.classList.add('active');
            
            // Show corresponding content
            const targetContent = document.getElementById(`${targetTab}-tab`);
            if (targetContent) {
                targetContent.classList.add('active');
            }
        });
    });

    // Initialize first tab as active if none are active
    if (!document.querySelector('.water-tab.active')) {
        const firstTab = document.querySelector('.water-tab');
        const firstContent = document.querySelector('.water-tab-content');
        
        if (firstTab && firstContent) {
            firstTab.classList.add('active');
            firstContent.classList.add('active');
        }
    }
}
