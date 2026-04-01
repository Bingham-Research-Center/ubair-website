document.addEventListener("DOMContentLoaded", () => {
    const currentYear = new Date().getFullYear();

    const yearElement = document.getElementById("current-year");
    if (yearElement) {
        yearElement.textContent = currentYear;
    }
    const disclaimer = document.querySelector(".sidebar-disclaimer p");
    if (disclaimer) {
        disclaimer.textContent = disclaimer.textContent.replace(/©\d{4}/g, "©" + currentYear);
    }
});
