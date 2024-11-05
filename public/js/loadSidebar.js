// public/js/loadSidebar.js
async function loadSidebar() {
    try {
        const response = await fetch('/public/partials/sidebar.html');
        document.querySelector('.sidebar_container').innerHTML = await response.text();
    } catch (error) {
        console.error('Error loading sidebar:', error);
    }
}

document.addEventListener('DOMContentLoaded', loadSidebar);