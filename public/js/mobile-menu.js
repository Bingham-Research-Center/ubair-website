function initializeMobileMenu() {
    // Create mobile menu toggle button
    const menuToggle = document.createElement('button');
    menuToggle.className = 'mobile-menu-toggle';
    menuToggle.innerHTML = '<i class="fas fa-bars"></i>';
    menuToggle.setAttribute('aria-label', 'Toggle navigation menu');

    // Add to body
    document.body.appendChild(menuToggle);
    
    // Get sidebar container
    const sidebarContainer = document.querySelector('.sidebar_container');
    
    // Toggle menu function
    function toggleMenu() {
        const isActive = sidebarContainer.classList.contains('active');
        
        if (isActive) {
            // Close menu
            sidebarContainer.classList.remove('active');
            menuToggle.innerHTML = '<i class="fas fa-bars"></i>';
            document.body.style.overflow = '';
        } else {
            // Open menu
            sidebarContainer.classList.add('active');
            menuToggle.innerHTML = '<i class="fas fa-times"></i>';
            document.body.style.overflow = 'hidden'; // Prevent scrolling when menu is open
        }
    }
    
    // Event listeners
    menuToggle.addEventListener('click', toggleMenu);
    
    // Close menu when clicking on a link (for better UX)
    const sidebarLinks = document.querySelectorAll('.sidebar-nav a');
    sidebarLinks.forEach(link => {
        link.addEventListener('click', function() {
            if (window.innerWidth <= 768) {
                sidebarContainer.classList.remove('active');
                menuToggle.innerHTML = '<i class="fas fa-bars"></i>';
                document.body.style.overflow = '';
            }
        });
    });
    
    // Handle window resize
    let resizeTimer;
    window.addEventListener('resize', function() {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function() {
            if (window.innerWidth > 768) {
                // Reset menu state on larger screens
                sidebarContainer.classList.remove('active');
                menuToggle.innerHTML = '<i class="fas fa-bars"></i>';
                document.body.style.overflow = '';
            }
        }, 250);
    });
}

document.addEventListener('DOMContentLoaded', function() {
    initializeMobileMenu();
});