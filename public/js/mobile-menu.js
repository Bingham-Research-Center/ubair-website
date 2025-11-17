function initializeMobileMenu() {
    // Get sidebar container
    const sidebarContainer = document.querySelector('.sidebar_container');

    if (!sidebarContainer) {
        console.error('Sidebar container not found');
        return;
    }

    // Create mobile menu toggle button with arrow
    const menuToggle = document.createElement('button');
    menuToggle.className = 'mobile-menu-toggle';
    menuToggle.innerHTML = '<i class="fas fa-arrow-right"></i>';
    menuToggle.setAttribute('aria-label', 'Swipe right to open menu');

    // Add arrow to sidebar container (embedded in nav menu)
    sidebarContainer.appendChild(menuToggle);

    // Toggle menu function
    function toggleMenu() {
        const isActive = sidebarContainer.classList.contains('active');

        if (isActive) {
            // Close menu
            sidebarContainer.classList.remove('active');
            menuToggle.innerHTML = '<i class="fas fa-arrow-right"></i>';
            menuToggle.setAttribute('aria-label', 'Swipe right to open menu');
        } else {
            // Open menu
            sidebarContainer.classList.add('active');
            menuToggle.innerHTML = '<i class="fas fa-arrow-left"></i>';
            menuToggle.setAttribute('aria-label', 'Swipe left to close menu');
        }
    }

    // Event listeners
    menuToggle.addEventListener('click', toggleMenu);

    // Swipe gesture support
    let touchStartX = 0;
    let touchEndX = 0;

    function handleSwipe() {
        const swipeDistance = touchEndX - touchStartX;
        const isActive = sidebarContainer.classList.contains('active');

        // Swipe right to open (minimum 50px swipe)
        if (swipeDistance > 50 && !isActive) {
            toggleMenu();
        }
        // Swipe left to close (minimum 50px swipe)
        else if (swipeDistance < -50 && isActive) {
            toggleMenu();
        }
    }

    document.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
    });

    document.addEventListener('touchend', (e) => {
        touchEndX = e.changedTouches[0].screenX;
        handleSwipe();
    });
    
    // Close menu when clicking on a link (for better UX)
    const sidebarLinks = document.querySelectorAll('.sidebar-nav a');
    sidebarLinks.forEach(link => {
        link.addEventListener('click', function() {
            if (window.innerWidth <= 768) {
                sidebarContainer.classList.remove('active');
                menuToggle.innerHTML = '<i class="fas fa-arrow-right"></i>';
                menuToggle.setAttribute('aria-label', 'Swipe right to open menu');
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
                menuToggle.innerHTML = '<i class="fas fa-arrow-right"></i>';
                menuToggle.setAttribute('aria-label', 'Swipe right to open menu');
            }
        }, 250);
    });
}

document.addEventListener('DOMContentLoaded', function() {
    initializeMobileMenu();
});