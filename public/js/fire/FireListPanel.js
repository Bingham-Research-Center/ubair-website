/* Auto-generated fire info cards. Renders two sub-sections — Active and
   Recent — each populated from the server-clustered FIRMS data. Hides
   the whole panel when both lists are empty. Every metadata field is
   conditionally rendered so missing values just don't appear. */

function renderFireList(fires) {
    const panel = document.getElementById('fire-list-panel');
    const activeList = document.getElementById('active-fires-list');
    const recentList = document.getElementById('recent-fires-list');
    const activeGroup = document.getElementById('active-fires-group');
    const recentGroup = document.getElementById('recent-fires-group');
    const activeCount = document.getElementById('active-fires-count');
    const recentCount = document.getElementById('recent-fires-count');
    if (!panel || !activeList || !recentList) return;

    const active = Array.isArray(fires?.active) ? fires.active : [];
    const recent = Array.isArray(fires?.recent) ? fires.recent : [];

    if (active.length === 0 && recent.length === 0) {
        panel.hidden = true;
        activeList.innerHTML = '';
        recentList.innerHTML = '';
        return;
    }
    panel.hidden = false;

    if (activeCount) activeCount.textContent = active.length || '0';
    if (recentCount) recentCount.textContent = recent.length || '0';

    if (activeGroup) activeGroup.hidden = active.length === 0;
    if (recentGroup) recentGroup.hidden = recent.length === 0;

    activeList.innerHTML = active.map(renderCard).join('');
    recentList.innerHTML = recent.map(renderCard).join('');
}

function renderCard(f) {
    const esc = window.fireEscapeHtml || ((s) => s);
    const rel = window.formatFireRelativeTime || ((s) => s || '—');

    const title = `Fire near ${f.centerLat.toFixed(3)}, ${f.centerLon.toFixed(3)}`;
    const confLabel = ({ h: 'high', n: 'nominal', l: 'low' })[f.maxConfidence];

    const rows = [
        rowIf('Detections',
            f.detectionCount != null
                ? `${f.detectionCount} &middot; ~${(f.estimatedAreaKm2 ?? 0).toFixed(2)} km<sup>2</sup>`
                : null),
        rowIf('First seen',
            f.firstSeenAt
                ? `${esc(rel(f.firstSeenAt))} <span class="fire-card-abs" title="${esc(f.firstSeenAt)}">(${esc(formatAbs(f.firstSeenAt))})</span>`
                : null),
        rowIf('Last seen',
            f.lastSeenAt
                ? `${esc(rel(f.lastSeenAt))} <span class="fire-card-abs" title="${esc(f.lastSeenAt)}">(${esc(formatAbs(f.lastSeenAt))})</span>`
                : null),
        rowIf('Max FRP',
            f.maxFrp != null ? `${f.maxFrp.toFixed(1)} MW` : null),
        rowIf('Confidence',
            confLabel ? esc(confLabel) : null),
        rowIf('Source',
            Array.isArray(f.satellites) && f.satellites.length
                ? esc(f.satellites.join(', ')) : null)
    ].filter(Boolean).join('');

    const linkAttrs = `data-lat="${f.centerLat}" data-lon="${f.centerLon}"`;

    return `
        <article class="fire-card" data-fire-id="${esc(f.id)}">
            <header class="fire-card-head">
                <h4 class="fire-card-title">${esc(title)}</h4>
                <span class="fire-status-pill" data-status="${esc(f.status || '')}">${esc(f.status || '')}</span>
            </header>
            <dl class="fire-card-meta">${rows}</dl>
            <p class="fire-card-foot"><a class="fire-card-link" href="#fire-map" ${linkAttrs}>Show on map &rarr;</a></p>
        </article>
    `;
}

function rowIf(label, valueHtml) {
    if (valueHtml == null) return null;
    return `<dt>${label}</dt><dd>${valueHtml}</dd>`;
}

function formatAbs(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString(undefined, {
        month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
}

// Click handler: zoom map to the clicked fire's centroid.
document.addEventListener('click', (e) => {
    const link = e.target.closest?.('.fire-card-link');
    if (!link) return;
    const lat = parseFloat(link.dataset.lat);
    const lon = parseFloat(link.dataset.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    if (window.fireMap && window.fireMap.map) {
        e.preventDefault();
        window.fireMap.map.flyTo([lat, lon], 12, { duration: 0.6 });
        // Keep #fire-map jumping behaviour for non-JS-map fallback users too:
        const mapEl = document.getElementById('fire-map');
        if (mapEl) mapEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
});

window.renderFireList = renderFireList;
