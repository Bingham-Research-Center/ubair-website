document.addEventListener("DOMContentLoaded", function() {
    const yearElement = document.getElementById('current-year');
    if (yearElement) {
        const currentYear = new Date().getFullYear().toString();
        yearElement.textContent = currentYear;
    }
});