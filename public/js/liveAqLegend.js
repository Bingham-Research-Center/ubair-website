import { thresholds } from './config.js';

export function buildLegendMarkup(ozoneThresholds = thresholds.Ozone) {
    const { warning, danger } = ozoneThresholds;

    return `
        <div class="live-aq-legend-section-title">Ozone (ppb)</div>
        <div class="live-aq-legend-row">
            <span class="live-aq-legend-swatch live-aq-legend-swatch--green" aria-hidden="true"></span>
            <span>Good (&lt;${warning} ppb)</span>
        </div>
        <div class="live-aq-legend-row">
            <span class="live-aq-legend-swatch live-aq-legend-swatch--orange" aria-hidden="true"></span>
            <span>Warning (${warning} to &lt;${danger} ppb)</span>
        </div>
        <div class="live-aq-legend-row">
            <span class="live-aq-legend-swatch live-aq-legend-swatch--red" aria-hidden="true"></span>
            <span>Danger (&gt;=${danger} ppb)</span>
        </div>
        <div class="live-aq-legend-row">
            <span class="live-aq-legend-swatch live-aq-legend-swatch--blue" aria-hidden="true"></span>
            <span>Blue = station reporting weather only, no ozone</span>
        </div>
        <div class="live-aq-legend-row">
            <span class="live-aq-legend-swatch live-aq-legend-swatch--gray" aria-hidden="true"></span>
            <span>No data</span>
        </div>
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
