// Define disclaimers for different pages
const PAGE_DISCLAIMERS = {
    '/forecast_air_quality': `DISCLAIMER: Clyfar AI forecasts are experimental research products and have not been operationally validated.
        Real-time data are preliminary and subject to quality control. For official air quality forecasts,
        please visit the Utah Department of Environmental Quality. ©2024, Utah State University.`,

    '/forecast_weather': `DISCLAIMER: Weather forecasts are experimental research products for Basin-specific analysis.
        For official weather forecasts and warnings, please visit the National Weather Service.
        Real-time data are preliminary and subject to quality control. ©2024, Utah State University.`,

    '/roads': `UDOT data may be delayed. Verify critical trips with official sources.`,

    '/aviation': `DISCLAIMER: Aviation weather products are experimental and for planning only. They are NOT an
        official weather briefing: obtain one from Flight Service (1-800-WX-BRIEF) or another approved source
        before flight. Real-time data are preliminary and subject to quality control. ©2026, Utah State University.`,

    '/fire': `DISCLAIMER: Fire-weather products are experimental research outputs and informational only.
        They are NOT a substitute for official NWS forecasts and must NOT be used for fire-suppression decisions.
        Satellite hotspot detections (NASA FIRMS) can lag by ~3 hours and may include false positives.
        For active wildfires and operational guidance, consult Utah Fire Info and the National Weather Service.
        ©2026, Utah State University.`,

    '/sports': `DISCLAIMER: Sports weather products are experimental research outputs for planning
        and recreation only. Crosswind drift figures are modelled estimates, not measurements, and assume a
        steady crosswind with no spin on the ball. Real-time data are preliminary and subject to quality
        control. For official forecasts and warnings, please visit the National Weather Service.
        ©2026, Utah State University.`,

    '/locations': `DISCLAIMER: Real-time data are preliminary and have yet to undergo quality control.
        Some data are obtained in cooperation with other agencies, including the Ute Indian Tribe and the Utah Department of Environmental Quality. ©2025, Utah State University.`,

    '/forecast_outlooks': `DISCLAIMER: Forecasts are experimental and subject to change.
        For official air quality forecasts, please visit the Utah Department of Environmental Quality.
        ©2024, Utah State University.`,

    '/': `DISCLAIMER: This information is provided by Utah State University's Bingham Research Center.
        For official air quality data, please visit the Utah DEQ website. ©2025, Utah State University.`,

    '/live_aq': 'Real-time data are preliminary and subject to quality control. ©2025, Utah State University.',

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

        sidebarContainer.querySelectorAll('.dropdown-toggle').forEach((toggle) => {
            toggle.setAttribute('aria-expanded', 'false');

            toggle.addEventListener('click', (event) => {
                event.preventDefault();

                const dropdown = toggle.closest('.nav-dropdown');
                const isOpen = dropdown.classList.toggle('is-open');

                toggle.setAttribute('aria-expanded', String(isOpen));
            });
        });

        const host = window.location.host.replace(/^www\./, '') || 'basinwx.com';
        const brandEl = sidebarContainer.querySelector('.sidebar-logo-title');
        if (brandEl) brandEl.textContent = host;
        const brandLink = sidebarContainer.querySelector('.sidebar-logo a');
        if (brandLink) brandLink.title = `${host} - Home`;

        const currentPath = window.location.pathname;
        const currentPageLink = document.querySelector(`.sidebar a[href="${currentPath}"]`);
        if (currentPageLink) {
            currentPageLink.parentElement.classList.add('nav-active');
        }


        // Get current page disclaimer
        const pageDisclaimer = PAGE_DISCLAIMERS[currentPath];

        // Update disclaimer text if there's a page-specific one
        const disclaimer = document.querySelector('.sidebar-disclaimer');
        if (disclaimer && pageDisclaimer) {
            disclaimer.querySelector('p').textContent = pageDisclaimer;
        }

        // Update the copyright year to current year
        if (disclaimer) {
            const currentYear = new Date().getFullYear();
            disclaimer.querySelector('p').textContent = disclaimer.querySelector('p').textContent.replace(/©\d{4}/g, '©' + currentYear);
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

    } catch (error) {
        console.error('Error loading sidebar:', error);
    }
}

// Load the sidebar when the document is ready
document.addEventListener('DOMContentLoaded', loadSidebar);

// Time-on-page beacon. Loaded from here because every page with the sidebar runs this file,
// so no page can forget it; kiosk pages have no sidebar and so send none, which is right for
// an unattended display. The beacon guards itself against loading twice.
(function loadEngagementBeacon() {
    const script = document.createElement('script');
    script.src = '/public/js/engagement-beacon.js';
    script.async = true;
    (document.head || document.documentElement).appendChild(script);
})();
