import { marked } from 'https://esm.sh/marked@4.0.12';

document.addEventListener("DOMContentLoaded", function() {
    const pageType = document.body.getAttribute("data-page-type");
    const outlookContainer = document.getElementById("outlook-summary") || document.querySelector(".outlook-content");
    const archiveContainer = document.querySelector(".archive-list");
    const maxPreviewLines = 7;

    // Async function to render content with Markdown
    async function renderContent(data, preview = false) {
        const lines = data.split('\n');
        const content = preview ? lines.slice(0, maxPreviewLines).join('\n') : data;
        return marked(content);  // This returns a Promise<string> if marked is asynchronous
    }

    // Fetch the latest outlook data
    async function fetchLatestOutlook() {
        try {
            const response = await fetch('/public/data/outlooks/file_list.json');
            const files = await response.json();
            if (files.length === 0) throw new Error("No forecast files found.");

            const latestFile = files[0];
            const latestFileUrl = `/public/data/outlooks/${latestFile}`;
            const fileResponse = await fetch(latestFileUrl);
            const content = await fileResponse.text();

            if (pageType === "index") {
                outlookContainer.innerHTML = await renderContent(content, true);
                document.getElementById("see-more").href = `/forecast_outlooks?file=${latestFile}`;
            } else if (pageType === "forecast_outlooks") {
                outlookContainer.innerHTML = await renderContent(content);
            }
        } catch (error) {
            console.error("Error fetching forecast outlook:", error);
            outlookContainer.textContent = "Unable to load the latest outlook.";
        }
    }

    // Render the archive list with links to previous forecasts
    async function renderArchiveList() {
        try {
            const response = await fetch('/public/data/outlooks/file_list.json');
            const files = await response.json();

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

    // Load a specific outlook file by name
    async function loadSpecificOutlook(file) {
        try {
            const fileUrl = `/public/data/outlooks/${file}`;
            const response = await fetch(fileUrl);
            const content = await response.text();
            outlookContainer.innerHTML = await renderContent(content);
        } catch (error) {
            console.error(`Error loading outlook file ${file}:`, error);
            outlookContainer.textContent = "Unable to load this forecast outlook.";
        }
    }

    // Main logic to determine page and load content
    (async function() {
        if (pageType === "index") {
            await fetchLatestOutlook();
        } else if (pageType === "forecast_outlooks") {
            const urlParams = new URLSearchParams(window.location.search);
            const fileParam = urlParams.get("file");

            if (fileParam) {
                await loadSpecificOutlook(fileParam);
            } else {
                await fetchLatestOutlook();
            }

            if (archiveContainer) await renderArchiveList();
        }
    })();
});