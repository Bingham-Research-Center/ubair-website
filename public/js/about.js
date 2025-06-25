document.addEventListener('DOMContentLoaded', async function() {
    const md = markdownit({ html: true, linkify: true, typographer: true });
    const contentContainer = document.querySelector('.about-content');
    const page = window.location.pathname.split('/').pop();

    try {
        const response = await fetch(`/public/data/about/${page}.md`);
        if (response.ok) {
            const content = await response.text();
            contentContainer.innerHTML = `<div class="markdown-content">${md.render(content)}</div>`;
        } else {
            contentContainer.innerHTML = `<p>Content for ${page} not found.</p>`;
        }
    } catch (error) {
        console.error('Error loading about content:', error);
        contentContainer.innerHTML = `<p>Error loading content.</p>`;
    }
});