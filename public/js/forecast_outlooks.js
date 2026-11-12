// /forecast_outlooks: one outlook in full, and every issued outlook listed by season.
import { describeOutlook, groupBySeason } from './outlookSeasons.js';

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
    const outlookHeading = outlookContainer?.querySelector("h2");
    const outlookContent = outlookContainer?.querySelector(".outlook-content");
    const archiveList = document.querySelector("#outlook-archive .archive-list");

    if (!outlookContent) return;

    let newestFile = null;

    async function loadOutlook(filename, { pushHistory = true } = {}) {
        const info = describeOutlook(filename);
        if (!info) {
            outlookContent.innerHTML = '<div class="error"><p>No outlook by that name.</p></div>';
            return;
        }

        outlookContent.innerHTML = '<div class="loading">Loading outlook...</div>';
        try {
            const response = await fetch(`/api/static/outlooks/${encodeURIComponent(filename)}`);
            if (!response.ok) {
                outlookContent.innerHTML = `<div class="error"><p>Failed to load outlook: ${response.status}</p></div>`;
                return;
            }

            const renderedHtml = highlightRiskWords(md.render(await response.text()));

            if (outlookHeading) {
                outlookHeading.textContent = filename === newestFile ? 'Latest outlook' : 'Archived outlook';
            }
            outlookContent.innerHTML = `
                <p class="outlook-meta">
                    Issued ${info.date}, ${info.time} <span class="outlook-season">${info.season} season</span>
                </p>
                <div class="markdown-content">
                    ${renderedHtml}
                </div>
            `;

            if (pushHistory) {
                history.pushState({ filename }, '', `/forecast_outlooks?file=${encodeURIComponent(filename)}`);
            }
            markActive(filename);

            // Make day sections collapsible
            makeCollapsible();
        } catch (error) {
            outlookContent.innerHTML = `<div class="error"><p>Failed to load outlook: ${error.message}</p></div>`;
        }
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

    // Seasons newest first. The season holding the open outlook starts expanded; the others
    // start folded, so a long archive stays short.
    function populateArchiveList(groups, openFile) {
        if (!archiveList) return;

        archiveList.innerHTML = groups.map((group) => {
            const open = group.outlooks.some((o) => o.filename === openFile);
            const items = group.outlooks.map((outlook) => `
                <a href="/forecast_outlooks?file=${encodeURIComponent(outlook.filename)}" class="archive-item" data-filename="${outlook.filename}">
                    <span class="archive-item-when">
                        <span class="archive-date">${outlook.date}</span>
                        <span class="archive-item-time">${outlook.time}</span>
                    </span>
                    ${outlook.filename === newestFile ? '<span class="archive-latest">Latest</span>' : ''}
                </a>`).join('');
            const count = group.outlooks.length;
            return `
                <details class="archive-season"${open ? ' open' : ''}>
                    <summary class="archive-season-title">
                        <span>${group.season} season</span>
                        <span class="archive-season-count">${count} outlook${count === 1 ? '' : 's'}</span>
                    </summary>
                    ${items}
                </details>`;
        }).join('');

        archiveList.querySelectorAll('.archive-item').forEach((item) => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                loadOutlook(item.dataset.filename);
            });
        });
        markActive(openFile);
    }

    function markActive(filename) {
        archiveList?.querySelectorAll('.archive-item').forEach((item) => {
            item.classList.toggle('active', item.dataset.filename === filename);
        });
    }

    async function init() {
        let groups = [];
        try {
            const response = await fetch('/api/static/outlooks/outlooks_list.json');
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            groups = groupBySeason(await response.json());
        } catch (error) {
            outlookContent.innerHTML = `<div class="error"><p>Failed to load outlooks: ${error.message}</p></div>`;
            if (archiveList) archiveList.innerHTML = '';
            return;
        }

        newestFile = groups[0]?.outlooks[0]?.filename ?? null;
        if (!newestFile) {
            outlookContent.innerHTML = '<p>No outlooks have been issued yet.</p>';
            if (archiveList) archiveList.innerHTML = '';
            return;
        }

        const requested = new URLSearchParams(window.location.search).get('file');
        const openFile = requested && describeOutlook(requested) ? requested : newestFile;
        populateArchiveList(groups, openFile);
        loadOutlook(openFile, { pushHistory: false });
    }

    window.addEventListener('popstate', (event) => {
        if (event.state?.filename) loadOutlook(event.state.filename, { pushHistory: false });
    });

    init();
});
