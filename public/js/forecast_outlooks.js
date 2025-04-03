// public/js/forecast_outlooks.js
document.addEventListener("DOMContentLoaded", function() {
    // Render markdown content with proper styling
    const markdownIt = window.markdownit({
        html: true,
        linkify: true,
        typographer: true
    });

    const outlookContainer = document.getElementById("current-outlook");
    const outlookContent = outlookContainer.querySelector(".outlook-content");
    const archiveContainer = document.getElementById("outlook-archive");
    const archiveList = archiveContainer.querySelector(".archive-list");

    let currentFile = null;

    // Function to load and render a specific outlook file
    async function loadOutlook(filename) {
        try {
            outlookContent.innerHTML = '<div class="loading">Loading outlook...</div>';

            const response = await fetch(`/public/data/outlooks/${filename}`);
            if (!response.ok) throw new Error(`Failed to load outlook: ${response.status}`);

            const markdown = await response.text();
            outlookContent.innerHTML = `
        <div class="markdown-content">
          ${markdownIt.render(markdown)}
        </div>
        <div class="outlook-meta">
          Issued: ${extractDateFromFilename(filename)}
        </div>
      `;

            // Update URL without page reload
            history.pushState(
                { filename },
                '',
                `/forecast_outlooks?file=${filename}`
            );

            currentFile = filename;

            // Update active state in archive list
            document.querySelectorAll('.archive-item').forEach(item => {
                item.classList.toggle('active', item.dataset.filename === filename);
            });
        } catch (error) {
            console.error("Error loading outlook:", error);
            outlookContent.innerHTML = `
        <div class="error">
          <p>Failed to load outlook: ${error.message}</p>
        </div>
      `;
        }
    }

    // Function to extract a readable date from filename
    function extractDateFromFilename(filename) {
        const match = filename.match(/outlook_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})\.md/);
        if (!match) return "Unknown date";

        const [_, year, month, day, hour, minute] = match;
        const date = new Date(`${year}-${month}-${day}T${hour}:${minute}:00`);

        return date.toLocaleString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
    }

    // Load the list of available outlooks
    async function loadOutlooksList() {
        try {
            archiveList.innerHTML = '<div class="loading">Loading archive...</div>';

            const response = await fetch('/public/data/outlooks/outlooks_list.json');
            if (!response.ok) throw new Error(`Failed to load outlooks list: ${response.status}`);

            const outlooks = await response.json();

            if (outlooks.length === 0) {
                archiveList.innerHTML = '<div class="empty-message">No outlooks available</div>';
                return;
            }

            // Generate archive list HTML
            archiveList.innerHTML = outlooks.map(outlook => `
        <div class="archive-item ${currentFile === outlook.filename ? 'active' : ''}" 
             data-filename="${outlook.filename}">
          <div class="archive-item-date">${new Date(outlook.date).toLocaleDateString()}</div>
          <div class="archive-item-time">${new Date(outlook.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
        </div>
      `).join('');

            // Add click handlers to archive items
            document.querySelectorAll('.archive-item').forEach(item => {
                item.addEventListener('click', () => {
                    loadOutlook(item.dataset.filename);
                });
            });

            // If no outlook is currently loaded, load the latest one
            if (!currentFile && outlooks.length > 0) {
                loadOutlook(outlooks[0].filename);
            }
        } catch (error) {
            console.error("Error loading outlooks list:", error);
            archiveList.innerHTML = `
        <div class="error">
          <p>Failed to load outlooks list: ${error.message}</p>
        </div>
      `;
        }
    }

    // Initialize the page
    function init() {
        // Check if a specific file was requested in the URL
        const urlParams = new URLSearchParams(window.location.search);
        const fileParam = urlParams.get('file');

        if (fileParam) {
            currentFile = fileParam;
            loadOutlook(fileParam);
        }

        loadOutlooksList();
    }

    // Start the application
    init();
});