/* Active fire-restriction cards for the Uinta Basin. Hides the section
   when there are no restrictions, renders one card per active order.
   Summary text + highlights come from the hand-maintained lookup in
   server/data/fireRestrictionsSummaries.json (keyed by OrderNum). */

function renderRestrictions(restrictions) {
    const panel = document.getElementById('fire-restrictions-panel');
    const list = document.getElementById('fire-restrictions-list');
    if (!panel || !list) return;

    if (!Array.isArray(restrictions) || restrictions.length === 0) {
        panel.hidden = true;
        list.innerHTML = '';
        return;
    }

    const esc = window.fireEscapeHtml || ((s) => s);
    panel.hidden = false;
    list.innerHTML = restrictions.map(r => {
        const area = r.areaDescription || r.shortArea || 'Unknown area';
        const type = r.type || 'Restriction';
        const typeAttr = String(type).toLowerCase().replace(/[^a-z0-9]+/g, '-');
        const effective = formatDate(r.effectiveAt);
        const rescinded = formatDate(r.rescindedAt);
        const dateLine = rescinded
            ? `Effective ${effective || '—'} → through ${rescinded}`
            : (effective ? `Effective since ${effective}` : '');

        const body = renderBody(r, esc);

        const order = r.orderNum ? `<span class="restriction-order">Order ${esc(r.orderNum)}</span>` : '';
        const cta = r.link
            ? `<a class="restriction-link" href="${esc(r.link)}" target="_blank" rel="noopener noreferrer">Read full order &rarr;</a>`
            : `<span class="restriction-no-link">Contact the issuing agency for the official text.</span>`;

        return `
            <article class="restriction-card">
                <header class="restriction-card-head">
                    <span class="restriction-agency">${esc(r.agency || 'Issuing agency')}</span>
                    <span class="restriction-type-pill" data-type="${esc(typeAttr)}">${esc(type)}</span>
                </header>
                <p class="restriction-area">${esc(area)}</p>
                ${body}
                ${dateLine ? `<p class="restriction-meta">${esc(dateLine)}</p>` : ''}
                <div class="restriction-foot">${order}${cta}</div>
            </article>
        `;
    }).join('');
}

function renderBody(r, esc) {
    const hasSummary = typeof r.summary === 'string' && r.summary.trim().length > 0;
    const hasHighlights = Array.isArray(r.highlights) && r.highlights.length > 0;

    if (!hasSummary && !hasHighlights) {
        return `<p class="restriction-empty">No summary written yet &mdash; read the full order for prohibited activities.</p>`;
    }

    const heading = `<h3 class="restriction-summary-heading">What this order prohibits</h3>`;
    const summary = hasSummary
        ? `<p class="restriction-summary">${esc(r.summary)}</p>`
        : '';
    const highlights = hasHighlights
        ? `<ul class="restriction-highlights">${r.highlights.map(h => `<li>${esc(h)}</li>`).join('')}</ul>`
        : '';
    return heading + summary + highlights;
}

function formatDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

window.renderRestrictions = renderRestrictions;
