// Define disclaimers for different pages
const PAGE_DISCLAIMERS = {
    '/forecast_data': `DISCLAIMER: Real-time data are preliminary and have yet to undergo quality control. 
        Some data are obtained in cooperation with other agencies, including the Ute Indian Trove and 
        the Utah Department of Environmental Quality. ©2024, Utah State University.`,

    '/locations': `DISCLAIMER: Real-time data are preliminary and have yet to undergo quality control. Some data are obtained in cooperation with other agencies, including the Ute Indian Trove and the Utah Department of Environmental Quality. ©2024, Utah State University. 
`,

    '/forecast_outlooks': `DISCLAIMER: Forecasts are experimental and subject to change. 
        For official air quality forecasts, please visit the Utah Department of Environmental Quality. 
        ©2024, Utah State University.`,

    '/': `DISCLAIMER: This information is provided by Utah State University's Bingham Research Center. 
        For official air quality data, please visit the Utah DEQ website. ©2024, Utah State University.`
};

// Function to load the sidebar content
async function loadSidebar() {
    try {
        const sidebarContainer = document.querySelector('.sidebar_container');
        if (!sidebarContainer) {
            throw new Error('Sidebar container not found');
        }

        const response = await fetch('/public/partials/sidebar.html');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const content = await response.text();
        sidebarContainer.innerHTML = content;

        // Get current page disclaimer
        const currentPath = window.location.pathname;
        const pageDisclaimer = PAGE_DISCLAIMERS[currentPath];

        // If there's a disclaimer for this page, show it
        if (pageDisclaimer) {
            const disclaimer = document.querySelector('.sidebar-disclaimer');
            if (disclaimer) {
                disclaimer.style.display = 'block';
                disclaimer.querySelector('p').textContent = pageDisclaimer;
            }
        }

        // Highlight current page in navigation
        const currentPageLink = document.querySelector(`.sidebar a[href="${currentPath}"]`);
        if (currentPageLink) {
            currentPageLink.classList.add('active');
        }
    } catch (error) {
        console.error('Error loading sidebar:', error);
    }
}

// Load the sidebar when the document is ready
document.addEventListener('DOMContentLoaded', loadSidebar);