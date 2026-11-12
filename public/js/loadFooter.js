// Renders the one site footer: this page's caveat and the copyright line, both from
// disclaimers.js. Pages carry no footer markup of their own.
import { footerText } from './disclaimers.js';

function renderFooter() {
    let footer = document.querySelector('footer.main-footer');
    if (!footer) {
        footer = document.createElement('footer');
        footer.className = 'main-footer';
        document.body.appendChild(footer);
    }
    const content = document.createElement('div');
    content.className = 'footer-content';
    const text = document.createElement('p');
    text.textContent = footerText(window.location.pathname);
    content.appendChild(text);
    footer.replaceChildren(content);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderFooter);
} else {
    renderFooter();
}
