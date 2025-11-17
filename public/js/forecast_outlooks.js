// Enhanced forecast_outlooks.js with proper risk word highlighting
document.addEventListener("DOMContentLoaded", function() {
    if (typeof markdownit === 'undefined') {
        return;
    }

    const md = markdownit({
        html: true,
        linkify: true,
        typographer: true
    });

    const outlookContainer = document.getElementById("current-outlook");
    const outlookContent = outlookContainer?.querySelector(".outlook-content");
    const archiveContainer = document.getElementById("outlook-archive");
    const archiveList = archiveContainer?.querySelector(".archive-list");
    const outlookSummary = document.getElementById("outlook-summary");

    let currentFile = null;

    // Enhanced risk word highlighting function
    function highlightRiskWords(html) {
        return html
            // NO RISK - Green
            .replace(/\bNO RISK\b/g, '<span class="risk-indicator risk-no">NO RISK</span>')
            .replace(/\bNO\b(?=\s+(RISK|CONCERN))/g, '<span style="color: #22c55e; font-weight: 600;">NO</span>')

            // LOW RISK - Blue
            .replace(/\bLOW RISK\b/g, '<span class="risk-indicator risk-low">LOW RISK</span>')
            .replace(/\bLOW\b(?=\s+(RISK|CONFIDENCE))/g, '<span style="color: #3b82f6; font-weight: 600;">LOW</span>')

            // MODERATE RISK - Orange
            .replace(/\bMODERATE RISK\b/g, '<span class="risk-indicator risk-moderate">MODERATE RISK</span>')
            .replace(/\bMODERATE\b(?=\s+(RISK|CONFIDENCE))/g, '<span style="color: #f59e0b; font-weight: 600;">MODERATE</span>')

            // HIGH RISK - Red
            .replace(/\bHIGH RISK\b/g, '<span class="risk-indicator risk-high">HIGH RISK</span>')
            .replace(/\bHIGH\b(?=\s+(RISK|CONFIDENCE))/g, '<span style="color: #dc2626; font-weight: 600;">HIGH</span>')

            // Standalone confidence indicators
            .replace(/\b(HIGH|MODERATE|LOW) CONFIDENCE\b/g, (match, level) => {
                const colors = {
                    'HIGH': '#22c55e',
                    'MODERATE': '#f59e0b',
                    'LOW': '#dc2626'
                };
                return `<span style="color: ${colors[level]}; font-weight: 600;">${match}</span>`;
            });
    }

    async function loadOutlook(filename, summaryOnly = false) {
        try {
            if (outlookContent && !summaryOnly) {
                outlookContent.innerHTML = '<div class="loading">Loading outlook...</div>';
            } else if (outlookSummary && summaryOnly) {
                outlookSummary.innerHTML = '<div class="loading">Loading latest outlook...</div>';
            }

            const response = await fetch(`/api/static/outlooks/${filename}`);
            if (!response.ok) {
                const target = summaryOnly ? outlookSummary : outlookContent;
                if (target) {
                    target.innerHTML = `
                        <div class="error">
                            <p>Failed to load outlook: ${response.status}</p>
                        </div>
                    `;
                }
                return;
            }

            const markdown = await response.text();

            if (summaryOnly && outlookSummary) {
                const firstLines = markdown.split('\n').slice(0, 5).join('\n');
                let renderedHtml = md.render(firstLines);
                renderedHtml = highlightRiskWords(renderedHtml);
                outlookSummary.innerHTML = renderedHtml;

                const linkContainer = document.getElementById('see-more');
                if (linkContainer) {
                    linkContainer.href = `/forecast_outlooks?file=${filename}`;
                }
                return;
            }

            if (outlookContent) {
                let renderedHtml = md.render(markdown);
                renderedHtml = highlightRiskWords(renderedHtml);

                outlookContent.innerHTML = `
                    <div class="markdown-content">
                        ${renderedHtml}
                    </div>
                    <div class="outlook-meta">
                        <strong>Issued:</strong> ${formatDateFromFilename(filename)}
                    </div>
                `;

                history.pushState({ filename }, '', `/forecast_outlooks?file=${filename}`);
                currentFile = filename;

                if (archiveList) {
                    document.querySelectorAll('.archive-item').forEach(item => {
                        item.classList.toggle('active', item.dataset.filename === filename);
                    });
                }

                // Make day sections collapsible
                makeCollapsible();
            }
        } catch (error) {
            const target = summaryOnly ? outlookSummary : outlookContent;
            if (target) {
                target.innerHTML = `
                    <div class="error">
                        <p>Failed to load outlook: ${error.message}</p>
                    </div>
                `;
            }
        }
    }

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
            hour12: true,
            timeZone: 'America/Denver' // Mountain Time
        }) + ' MT';
    }

    // Enhanced collapsible functionality
    function makeCollapsible() {
        // Handle day sections
        const dayHeaders = document.querySelectorAll('.markdown-content h3');
        dayHeaders.forEach(header => {
            if (header.textContent.includes('Day ')) {
                header.style.cursor = 'pointer';
                header.addEventListener('click', function() {
                    this.classList.toggle('collapsed');
                    let nextEl = this.nextElementSibling;
                    const isCollapsed = this.classList.contains('collapsed');

                    while (nextEl && !nextEl.matches('h3, hr')) {
                        nextEl.style.display = isCollapsed ? 'none' : 'block';
                        nextEl = nextEl.nextElementSibling;
                    }

                    // Visual indicator
                    const indicator = this.querySelector('.collapse-indicator') || document.createElement('span');
                    indicator.className = 'collapse-indicator';
                    indicator.style.cssText = 'float: right; transition: transform 0.3s ease;';
                    indicator.textContent = '▼';
                    indicator.style.transform = isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)';

                    if (!this.querySelector('.collapse-indicator')) {
                        this.appendChild(indicator);
                    }
                });
            }
        });

        // Handle Extended Discussion section
        handleExtendedDiscussion();
    }

    function handleExtendedDiscussion() {
        // Find the Extended Discussion header (h1 with "Extended discussion")
        const headers = document.querySelectorAll('.markdown-content h1, .markdown-content h2');
        headers.forEach(header => {
            if (header.textContent.toLowerCase().includes('extended discussion')) {
                createCollapsibleSection(header);
            }
        });
    }

    function createCollapsibleSection(header) {
        // Create wrapper
        const wrapper = document.createElement('div');
        wrapper.className = 'extended-discussion collapsed'; // Start collapsed

        // Create header
        const collapsibleHeader = document.createElement('div');
        collapsibleHeader.className = 'extended-discussion-header';

        const toggle = document.createElement('div');
        toggle.className = 'extended-discussion-toggle';

        const title = document.createElement('h2');
        title.className = 'extended-discussion-title';
        title.textContent = header.textContent;

        collapsibleHeader.appendChild(toggle);
        collapsibleHeader.appendChild(title);

        // Create content container
        const content = document.createElement('div');
        content.className = 'extended-discussion-content';

        // Move all content after the header until next major section or end
        let nextEl = header.nextElementSibling;
        while (nextEl && !nextEl.matches('h1, hr[style*="2.5rem"]')) {
            const elementToMove = nextEl;
            nextEl = nextEl.nextElementSibling;
            content.appendChild(elementToMove);
        }

        // Replace original header with collapsible version
        wrapper.appendChild(collapsibleHeader);
        wrapper.appendChild(content);
        header.parentNode.replaceChild(wrapper, header);

        // Add click handler
        collapsibleHeader.addEventListener('click', function() {
            wrapper.classList.toggle('collapsed');
        });
    }

    async function loadOutlooksList() {
        if (outlookSummary && !outlookContent) {
            loadLatestOutlook(true);
            return;
        }

        if (!archiveList) return;

        try {
            archiveList.innerHTML = '<div class="loading">Loading archive...</div>';

            const response = await fetch('/api/static/outlooks/outlooks_list.json');
            if (!response.ok) {
                archiveList.innerHTML = `<div class="error"><p>Failed to load outlooks: ${response.status}</p></div>`;
                return;
            }

            const outlooks = await response.json();
            populateArchiveList(outlooks);

        } catch (error) {
            archiveList.innerHTML = `<div class="error"><p>Failed to load outlooks: ${error.message}</p></div>`;
        }
    }

    function populateArchiveList(outlooks) {
        if (!archiveList) return;

        archiveList.innerHTML = outlooks.map((outlook, index) => {
            const date = new Date(outlook.date);
            const formattedDate = date.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric'
            });
            const formattedTime = date.toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
            });

            return `
                <a href="#" class="archive-item" data-filename="${outlook.filename}">
                    <div style="display: flex; flex-direction: column;">
                        <div class="archive-date">${formattedDate}</div>
                        <div class="archive-item-time">${formattedTime}</div>
                    </div>
                    <div class="archive-title">${index === 0 ? 'Latest' : `#${index + 1}`}</div>
                    <div class="archive-icon">
                        <i class="fas fa-file-alt"></i>
                    </div>
                </a>
            `;
        }).join('');

        // Add click handlers
        document.querySelectorAll('.archive-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const filename = item.dataset.filename;
                loadOutlook(filename);
            });
        });
    }

    async function loadLatestOutlook(summaryOnly = false) {
        try {
            const response = await fetch('/api/static/outlooks/outlooks_list.json');
            if (!response.ok) {
                const target = summaryOnly ? outlookSummary : outlookContent;
                if (target) target.innerHTML = 'Error loading latest outlook.';
                return;
            }

            const outlooks = await response.json();
            if (!outlooks || outlooks.length === 0) {
                const target = summaryOnly ? outlookSummary : outlookContent;
                if (target) target.innerHTML = 'No outlooks available.';
                return;
            }

            loadOutlook(outlooks[0].filename, summaryOnly);
        } catch (error) {
            const target = summaryOnly ? outlookSummary : outlookContent;
            if (target) target.innerHTML = 'Error loading latest outlook.';
        }
    }

    function init() {
        const isHomepage = !!outlookSummary && !outlookContent;
        const isOutlooksPage = !!outlookContent;

        if (isHomepage) {
            loadLatestOutlook(true);
            return;
        }

        if (isOutlooksPage) {
            const urlParams = new URLSearchParams(window.location.search);
            const fileParam = urlParams.get('file');

            if (fileParam) {
                currentFile = fileParam;
                loadOutlook(fileParam);
            } else {
                loadLatestOutlook(false);
            }

            loadOutlooksList();
        }
    }

    init();
});