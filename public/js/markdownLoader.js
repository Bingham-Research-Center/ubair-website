// public/js/markdownLoader.js
// Centralized markdown loading utility

let markdownRenderer = null;

// Initialize markdown-it with consistent settings
export async function getMarkdownRenderer() {
    if (markdownRenderer) return markdownRenderer;

    // Wait for markdown-it to be available
    let attempts = 0;
    while (typeof markdownit === 'undefined' && attempts < 20) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
    }

    if (typeof markdownit === 'undefined') {
        throw new Error('markdown-it library failed to load');
    }

    markdownRenderer = markdownit({
        html: true,
        linkify: true,
        typographer: true,
        breaks: true
    });

    return markdownRenderer;
}

// Load and render markdown from a URL
export async function loadAndRenderMarkdown(url, targetElementId) {
    try {
        const md = await getMarkdownRenderer();
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`Failed to load ${url}: ${response.status}`);
        }

        const content = await response.text();
        const targetElement = document.getElementById(targetElementId);

        if (targetElement) {
            targetElement.innerHTML = `<div class="markdown-content">${md.render(content)}</div>`;
            return true;
        }

        throw new Error(`Target element ${targetElementId} not found`);

    } catch (error) {
        console.error('Markdown loading error:', error);
        const targetElement = document.getElementById(targetElementId);
        if (targetElement) {
            targetElement.innerHTML = `<p class="error">Error loading content: ${error.message}</p>`;
        }
        return false;
    }
}