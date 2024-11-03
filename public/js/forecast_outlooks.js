// forecast_outlooks.js

document.addEventListener("DOMContentLoaded", async function() {
    const pageType = document.body.getAttribute("data-page-type"); // Use data-page-type to distinguish pages
    const outlookContainer = document.getElementById("outlook-summary") || document.querySelector(".outlook-content");
    const archiveContainer = document.querySelector(".archive-list");
    const maxPreviewLines = 4;

    // Helper function to render forecast content with line breaks
    function renderContent(data, preview = false) {
        const lines = data.split('\n');
        return preview ? lines.slice(0, maxPreviewLines).join('<br>') : lines.join('<br>');
    }

    // Fetch file list and get the latest forecast file
    async function fetchLatestOutlook() {
        try {
            const response = await fetch('/public/data/outlooks/file_list.json');
            const files = await response.json();
            if (files.length === 0) throw new Error("No forecast files found.");

            // Get the latest forecast file
            const latestFile = files[0];
            const latestFileUrl = `/public/data/outlooks/${latestFile}`;
            const fileResponse = await fetch(latestFileUrl);
            const content = await fileResponse.text();

            if (pageType === "index") {
                // Display a preview on the index page
                outlookContainer.innerHTML = renderContent(content, true);
                // Add "See more" link to forecast_outlooks.html
                document.getElementById("see-more").href = `/forecast_outlooks?file=${latestFile}`;
            } else if (pageType === "forecast_outlooks") {
                // Display the full content on forecast_outlooks.html
                outlookContainer.innerHTML = renderContent(content);
            }
        } catch (error) {
            console.error("Error fetching forecast outlook:", error);
            outlookContainer.textContent = "Unable to load the latest outlook.";
        }
    }

    // Fetch archive and render links in the sidebar for navigation
    async function renderArchiveList() {
        try {
            const response = await fetch('/public/data/outlooks/file_list.json');
            const files = await response.json();

            // Generate archive list with links
            const archiveLinks = files.map(file => `
                <div class="archive-entry">
                    <a href="/forecast_outlooks?file=${file}" target="_self">${file}</a>
                </div>
            `).join('');
            archiveContainer.innerHTML = archiveLinks;
        } catch (error) {
            console.error("Error loading archive list:", error);
            if (archiveContainer) archiveContainer.textContent = "Failed to load archive.";
        }
    }

    // Check if a specific file is requested via URL (for navigating to older forecasts)
    async function loadSpecificOutlook(file) {
        try {
            const fileUrl = `/public/data/outlooks/${file}`;
            const response = await fetch(fileUrl);
            const content = await response.text();
            outlookContainer.innerHTML = renderContent(content);
        } catch (error) {
            console.error(`Error loading outlook file ${file}:`, error);
            outlookContainer.textContent = "Unable to load this forecast outlook.";
        }
    }

    // Determine which page is loaded and perform relevant actions
    if (pageType === "index") {
        // Fetch the latest forecast and display a preview for the index page
        await fetchLatestOutlook();
    } else if (pageType === "forecast_outlooks") {
        // Check URL parameters for a specific file
        const urlParams = new URLSearchParams(window.location.search);
        const fileParam = urlParams.get("file");

        if (fileParam) {
            // Load the specific file if specified in the URL
            await loadSpecificOutlook(fileParam);
        } else {
            // Otherwise, load the latest forecast
            await fetchLatestOutlook();
        }

        // Render the archive list in the sidebar for navigation
        if (archiveContainer) await renderArchiveList();
    }
});