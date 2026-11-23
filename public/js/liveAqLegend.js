import { legendMarkup } from './mapUtils.js';

// The same legend as the homepage map, from the bands the markers use.
export function buildLegendMarkup() {
    return legendMarkup();
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
