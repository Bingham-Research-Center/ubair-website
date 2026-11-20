/* NWS Red Flag / Fire Weather alert banner.
   Uses aria-live="polite" via the static markup so screen readers
   announce new alerts on refresh. */

// `alerts` is a list (empty when the NWS reports none) or null when the NWS could not be
// asked. Null must not look like an empty list: a hidden banner reads as "no Red Flag Warning".
function renderRedFlagBanner(alerts) {
    const banner = document.getElementById('red-flag-banner');
    if (!banner) return;
    banner.classList.toggle('is-unavailable', alerts === null);
    if (alerts === null) {
        banner.hidden = false;
        banner.classList.remove('is-hidden');
        banner.textContent = 'Red Flag Warnings and Fire Weather Watches could not be checked just now. '
            + 'See weather.gov for current alerts.';
        return;
    }
    if (!Array.isArray(alerts) || alerts.length === 0) {
        banner.hidden = true;
        banner.classList.add('is-hidden');
        banner.innerHTML = '';
        return;
    }
    const esc = window.fireEscapeHtml || ((s) => s);
    banner.hidden = false;
    banner.classList.remove('is-hidden');
    banner.innerHTML = alerts.map(a => {
        const expires = a.expires ? new Date(a.expires).toLocaleString() : 'TBD';
        const headline = a.headline || a.event || 'Fire-weather alert';
        return `
            <article class="red-flag-card" data-event="${esc(a.event)}">
                <header class="red-flag-card-head">
                    <i class="fas fa-fire-flame-curved" aria-hidden="true"></i>
                    <strong>${esc(a.event)}</strong>
                    <span class="red-flag-area">${esc(a.areaDesc)}</span>
                    <span class="red-flag-expires">until ${esc(expires)}</span>
                </header>
                <details>
                    <summary>${esc(headline)}</summary>
                    <p>${esc(a.description || '')}</p>
                    ${a.instruction ? `<p class="red-flag-instruction"><strong>Action:</strong> ${esc(a.instruction)}</p>` : ''}
                </details>
            </article>
        `;
    }).join('');
}

window.renderRedFlagBanner = renderRedFlagBanner;
