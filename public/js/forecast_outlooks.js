// public/js/forecast_outlooks.js
document.addEventListener("DOMContentLoaded", function() {
    // Wait for markdown-it to load, then initialize
    if (typeof markdownit === 'undefined') {
        console.error('markdown-it library not loaded');
        return;
    }

    // Initialize markdown renderer
    const md = markdownit({
        html: true,
        linkify: true,
        typographer: true
    });

    // DOM elements
    const outlookContainer = document.getElementById("current-outlook");
    const outlookContent = outlookContainer?.querySelector(".outlook-content");
    const archiveContainer = document.getElementById("outlook-archive");
    const archiveList = archiveContainer?.querySelector(".archive-list");

    // On home page, we only have the outlook summary element
    const outlookSummary = document.getElementById("outlook-summary");

    let currentFile = null;

    /**
     * Load and render a specific outlook file
     * @param {string} filename - The outlook file to load
     * @param {boolean} summaryOnly - Whether to only load a summary (for homepage)
     */
    async function loadOutlook(filename, summaryOnly = false) {
        try {
            // Show loading indicator
            if (outlookContent && !summaryOnly) {
                outlookContent.innerHTML = '<div class="loading">Loading outlook...</div>';
            } else if (outlookSummary && summaryOnly) {
                outlookSummary.innerHTML = '<div class="loading">Loading latest outlook...</div>';
            }

            // Fetch the markdown file
            const response = await fetch(`/public/data/outlooks/${filename}`);
            if (!response.ok) throw new Error(`Failed to load outlook: ${response.status}`);

            const markdown = await response.text();

            // For summary (homepage), only show the first few lines
            if (summaryOnly && outlookSummary) {
                const firstLines = markdown.split('\n').slice(0, 5).join('\n');
                outlookSummary.innerHTML = md.render(firstLines);

                // Add "See more" link that directs to the full outlook page
                const linkContainer = document.getElementById('see-more');
                if (linkContainer) {
                    linkContainer.href = `/forecast_outlooks?file=${filename}`;
                }
                return;
            }

            // For full view (outlooks page)
            if (outlookContent) {
                outlookContent.innerHTML = `
                    <div class="markdown-content">
                        ${md.render(markdown)}
                    </div>
                    <div class="outlook-meta">
                        Issued: ${formatDateFromFilename(filename)}
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
                if (archiveList) {
                    document.querySelectorAll('.archive-item').forEach(item => {
                        item.classList.toggle('active', item.dataset.filename === filename);
                    });
                }
            }
        } catch (error) {
            console.error("Error loading outlook:", error);
            if (outlookContent && !summaryOnly) {
                outlookContent.innerHTML = `
                    <div class="error">
                        <p>Failed to load outlook: ${error.message}</p>
                    </div>
                `;
            } else if (outlookSummary && summaryOnly) {
                outlookSummary.innerHTML = `
                    <div class="error">
                        <p>Failed to load latest outlook.</p>
                    </div>
                `;
            }
        }
    }

    /**
     * Format a readable date from the outlook filename
     * @param {string} filename - The filename to parse
     * @returns {string} Formatted date string
     */
    function formatDateFromFilename(filename) {
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

    /**
     * Load the list of available outlooks
     */
    async function loadOutlooksList() {
        // If we're on the homepage, just load the latest outlook
        if (outlookSummary && !outlookContent) {
            loadLatestOutlook(true);
            return;
        }

        // Only proceed if we're on the outlooks page
        if (!archiveList) return;

        try {
            archiveList.innerHTML = '<div class="loading">Loading archive...</div>';

            const response = await fetch('/public/data/outlooks/outlooks_list.json');
            if (!response.ok) throw new Error(`Failed to load outlooks list: ${response.status}`);

            const outlooks = await response.json();

            if (!outlooks || outlooks.length === 0) {
                archiveList.innerHTML = '<div class="empty-message">No outlooks available</div>';
                return;
            }

            // Generate archive list HTML
            archiveList.innerHTML = outlooks.map(outlook => {
                // Extract date from filename directly instead of using the JSON date
                const formattedDate = formatDateFromFilename(outlook.filename);
                return `
                <div class="archive-item ${currentFile === outlook.filename ? 'active' : ''}" 
                     data-filename="${outlook.filename}">
                    <div class="archive-item-date">${formattedDate}</div>
                </div>
                `;
            }).join('');

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

    function makeCollapsible() {
        const dayHeaders = document.querySelectorAll('.markdown-content h3');
        dayHeaders.forEach(header => {
            if (header.textContent.includes('Day ')) {
                header.addEventListener('click', function() {
                    this.classList.toggle('collapsed');
                    let nextEl = this.nextElementSibling;
                    while (nextEl && !nextEl.matches('h3')) {
                        nextEl.style.display = this.classList.contains('collapsed') ? 'none' : 'block';
                        nextEl = nextEl.nextElementSibling;
                    }
                });
            }
        });
    }

    /**
     * Load the most recent outlook
     * @param {boolean} summaryOnly - Whether to only load a summary (for homepage)
     */
    async function loadLatestOutlook(summaryOnly = false) {
        try {
            const response = await fetch('/public/data/outlooks/outlooks_list.json');
            if (!response.ok) throw new Error(`Failed to load outlooks list: ${response.status}`);

            const outlooks = await response.json();

            if (!outlooks || outlooks.length === 0) {
                if (outlookSummary && summaryOnly) {
                    outlookSummary.innerHTML = 'No outlooks available.';
                }
                return;
            }

            // Load the first (most recent) outlook
            loadOutlook(outlooks[0].filename, summaryOnly);
        } catch (error) {
            console.error("Error loading latest outlook:", error);
            if (outlookSummary && summaryOnly) {
                outlookSummary.innerHTML = 'Error loading latest outlook.';
            }
        }
    }

    // Call after loading content
    outlookContent.innerHTML = `
    <div class="markdown-content">
        ${md.render(markdown)}
    </div>
    <div class="outlook-meta">
        Issued: ${formatDateFromFilename(filename)}
    </div>
    `;

    makeCollapsible();

    /**
     * Initialize the page
     */
    function init() {
        // Check if we're on the homepage or the outlooks page
        const isHomepage = !!outlookSummary && !outlookContent;
        const isOutlooksPage = !!outlookContent;

        if (isHomepage) {
            // Just load the latest outlook summary
            loadLatestOutlook(true);
            return;
        }

        if (isOutlooksPage) {
            // Check if a specific file was requested in the URL
            const urlParams = new URLSearchParams(window.location.search);
            const fileParam = urlParams.get('file');

            if (fileParam) {
                currentFile = fileParam;
                loadOutlook(fileParam);
            }

            // Load the archive list
            loadOutlooksList();
        }
    }

    // Start the application
    init();
});