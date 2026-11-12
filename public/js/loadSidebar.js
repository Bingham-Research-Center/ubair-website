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
