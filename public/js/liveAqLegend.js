import { legendEntries, LEGEND_NOTE } from './mapUtils.js';

// The same rows and colours as the homepage legend, from the bands the markers use.
export function buildLegendMarkup() {
    const rows = legendEntries().map(({ status, label }) => `
        <div class="live-aq-legend-row">
            <span class="live-aq-legend-swatch aq-status" data-status="${status}" aria-hidden="true"></span>
            <span>${label}</span>
        </div>`).join('');

    return `
        <div class="live-aq-legend-section-title">Ozone (ppb)</div>
        ${rows}
        <p class="live-aq-legend-note">${LEGEND_NOTE}</p>
    `;
}

if (typeof document !== 'undefined') {
    const panel = document.getElementById('live-aq-legend-panel');
    const toggle = document.getElementById('live-aq-legend-toggle');

    if (panel && toggle) {
        panel.innerHTML = buildLegendMarkup();

        const isMobile = window.matchMedia('(max-width: 768px)').matches;
        panel.hidden = isMobile;
        toggle.setAttribute('aria-expanded', String(!isMobile));

        toggle.addEventListener('click', () => {
            panel.hidden = !panel.hidden;
            toggle.setAttribute('aria-expanded', String(!panel.hidden));
        });
    }
}
