// Define disclaimers for different pages
const PAGE_DISCLAIMERS = {
    '/forecast_air_quality': `DISCLAIMER: Clyfar AI forecasts are experimental research products and have not been operationally validated.
        Real-time data are preliminary and subject to quality control. For official air quality forecasts,
        please visit the Utah Department of Environmental Quality. ©2024, Utah State University.`,

    '/forecast_weather': `DISCLAIMER: Weather forecasts are experimental research products for Basin-specific analysis.
        For official weather forecasts and warnings, please visit the National Weather Service.
        Real-time data are preliminary and subject to quality control. ©2024, Utah State University.`,

    '/agriculture': `DISCLAIMER: Agricultural weather forecasts are experimental and for research purposes only.
        Consult with agricultural extension services and professional agronomists for farming decisions.
        ©2024, Utah State University.`,

    '/roads': `DISCLAIMER: Road weather information is for reference only and should not replace official
        UDOT road conditions and travel advisories. Always check current road conditions before traveling.
        ©2024, Utah State University.`,

    '/aviation': `DISCLAIMER: Aviation weather products are for planning purposes only. Always obtain official
        weather briefings from Flight Service or approved sources before flight operations.
        ©2024, Utah State University.`,

    '/water': `DISCLAIMER: Water recreation forecasts are experimental.
        Always check current conditions and weather warnings before water activities.
        ©2025, Utah State University.`,

    '/locations': `DISCLAIMER: Real-time data are preliminary and have yet to undergo quality control.
        Some data are obtained in cooperation with other agencies, including the Ute Indian Tribe and the Utah Department of Environmental Quality. ©2025, Utah State University.`,

    '/forecast_outlooks': `DISCLAIMER: Forecasts are experimental and subject to change.
        For official air quality forecasts, please visit the Utah Department of Environmental Quality.
        ©2024, Utah State University.`,

    '/': `DISCLAIMER: This information is provided by Utah State University's Bingham Research Center.
        For official air quality data, please visit the Utah DEQ website. ©2025, Utah State University.`,

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

        const currentPath = window.location.pathname;
        const currentPageLink = document.querySelector(`.sidebar a[href="${currentPath}"]`);
        if (currentPageLink) {
            currentPageLink.parentElement.classList.add('nav-active');
        }


        // Get current page disclaimer
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
        // const currentPageLink = document.querySelector(`.sidebar a[href="${currentPath}"]`);
        if (currentPageLink) {
            currentPageLink.classList.add('active');
        }

        // Load mobile menu script after sidebar is loaded
        if (!document.querySelector('script[src="/public/js/mobile-menu.js"]')) {
            const mobileMenuScript = document.createElement('script');
            mobileMenuScript.src = '/public/js/mobile-menu.js';
            mobileMenuScript.onload = function() {
                // Force mobile menu initialization since DOMContentLoaded has already fired
                initializeMobileMenu();
            };
            document.body.appendChild(mobileMenuScript);
        } else {
            // Script already exists but may not have initialized yet
            setTimeout(() => {
                if (!document.querySelector('.mobile-menu-toggle')) {
                    initializeMobileMenu();
                }
            }, 100);
        }

        // Initialize dev mode features
        initializeDevMode();
    } catch (error) {
        console.error('Error loading sidebar:', error);
    }
}

// Secret code to open kiosk mode via typing "lawsondavies"
function initializeDevMode() {
    const secretCode = 'lawsondavies';
    let userInput = '';
    let inputTimer = null;

    // Listen for keyboard input
    document.addEventListener('keydown', (e) => {
        // Add the key to the input string
        userInput += e.key.toLowerCase();

        // Keep only the last characters matching the secret code length
        if (userInput.length > secretCode.length) {
            userInput = userInput.slice(-secretCode.length);
        }

        // Reset input after 3 seconds of no typing
        clearTimeout(inputTimer);
        inputTimer = setTimeout(() => {
            userInput = '';
        }, 3000);

        // Check if the secret code was typed
        if (userInput === secretCode) {
            userInput = ''; // Reset
            openKioskMode();
        }
    });
}

function openKioskMode() {
    // Open kiosk page in new tab
    window.open('/kiosk', '_blank', 'noopener,noreferrer');

    // Show feedback message
    showDevModeMessage('Opening Kiosk Mode');
}

function showDevModeMessage(message) {
    const messageEl = document.createElement('div');
    messageEl.className = 'dev-mode-message';
    messageEl.textContent = `🔧 ${message}`;
    messageEl.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: 20px 40px;
        border-radius: 12px;
        font-size: 18px;
        font-weight: bold;
        z-index: 10000;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
        animation: devModePop 0.5s ease-out;
    `;

    // Add animation
    const style = document.createElement('style');
    style.textContent = `
        @keyframes devModePop {
            0% { transform: translate(-50%, -50%) scale(0); opacity: 0; }
            50% { transform: translate(-50%, -50%) scale(1.1); }
            100% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
        }
    `;
    document.head.appendChild(style);

    document.body.appendChild(messageEl);

    setTimeout(() => {
        messageEl.style.animation = 'fadeOut 0.5s ease-out forwards';
        setTimeout(() => messageEl.remove(), 500);
    }, 2000);
}

// Load the sidebar when the document is ready
document.addEventListener('DOMContentLoaded', loadSidebar);