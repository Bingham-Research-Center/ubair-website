/* FIRMS satellite hotspot layer + 24h count utility. */

const FIRMS_CONFIDENCE_COLOR = {
    l: '#ffcc00',
    n: '#ff8800',
    h: '#cc0000'
};

function hotspotColor(h) {
    if (!h || !h.confidence) return '#ff5722';
    return FIRMS_CONFIDENCE_COLOR[h.confidence.toLowerCase?.() || h.confidence] || '#ff5722';
}

function hotspotRadius(h) {
    const frp = h && Number.isFinite(h.frp) ? h.frp : 0;
    const base = 4;
    const scale = Math.min(12, base + Math.sqrt(Math.max(0, frp)));
    return scale;
}

function renderHotspots(map, hotspots, hotspotMarkers) {
    if (!map || typeof L === 'undefined') return;
    for (const m of hotspotMarkers.values()) map.removeLayer(m);
    hotspotMarkers.clear();
    if (!Array.isArray(hotspots)) return;
    hotspots.forEach((h, idx) => {
        if (h.lat == null || h.lon == null) return;
        const marker = L.circleMarker([h.lat, h.lon], {
            radius: hotspotRadius(h),
            fillColor: hotspotColor(h),
            color: '#660000',
            weight: 1,
            fillOpacity: 0.85,
            className: 'fire-hotspot-marker'
        }).bindPopup(hotspotPopup(h));
        marker.addTo(map);
        hotspotMarkers.set(`${h.acqDate}_${h.acqTime}_${idx}`, marker);
    });
}

function hotspotPopup(h) {
    const esc = window.fireEscapeHtml || ((s) => s);
    const acq = h.acqDate && h.acqTime
        ? `${h.acqDate} ${h.acqTime.slice(0, 2)}:${h.acqTime.slice(2)} UTC`
        : 'unknown';
    const conf = ({ l: 'low', n: 'nominal', h: 'high' })[h.confidence] || h.confidence || '—';
    const frp = h.frp != null ? `${h.frp.toFixed(1)} MW` : '—';
    return `
        <div class="fire-popup">
            <h4>FIRMS detection</h4>
            <p class="popup-meta">${esc(h.satellite || 'VIIRS')} · ${esc(acq)}</p>
            <p class="popup-row"><strong>Confidence</strong> ${esc(conf)}</p>
            <p class="popup-row"><strong>Fire radiative power</strong> ${esc(frp)}</p>
            <p class="popup-row"><strong>Location</strong> ${h.lat.toFixed(4)}, ${h.lon.toFixed(4)}</p>
        </div>
    `;
}

function countHotspotsLast24h(hotspots) {
    if (!Array.isArray(hotspots)) return 0;
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    let n = 0;
    for (const h of hotspots) {
        if (!h.acqDate) continue;
        const time = h.acqTime ? `${h.acqTime.slice(0, 2)}:${h.acqTime.slice(2)}:00Z` : '00:00:00Z';
        const ts = Date.parse(`${h.acqDate}T${time}`);
        if (Number.isFinite(ts) && ts >= cutoff) n++;
    }
    return n;
}

/* Fire-cluster overlays — one translucent red circle per confirmed fire,
   sized to the cluster radius. Drawn beneath the individual hotspot dots
   so the granular detections stay visible. */
function renderFires(map, fires, fireLayers) {
    if (!map || typeof L === 'undefined') return;
    if (!fireLayers) return;
    for (const layer of fireLayers.values()) map.removeLayer(layer);
    fireLayers.clear();
    if (!Array.isArray(fires)) return;

    for (const f of fires) {
        if (!Number.isFinite(f.centerLat) || !Number.isFinite(f.centerLon)) continue;
        const isActive = f.status === 'active';
        const stroke = isActive ? '#dc2626' : '#8a4a3a';
        const fill   = isActive ? '#dc2626' : '#a07060';
        const layer = L.circle([f.centerLat, f.centerLon], {
            radius: Math.max(f.radiusM || 0, 800),
            color: stroke,
            weight: 2,
            opacity: 0.9,
            fillColor: fill,
            fillOpacity: isActive ? 0.18 : 0.10,
            className: 'fire-cluster-circle'
        }).bindPopup(firePopupHtml(f));
        layer.addTo(map);
        fireLayers.set(f.id, layer);
    }
}

function firePopupHtml(f) {
    const esc = window.fireEscapeHtml || ((s) => s);
    const confLabel = ({ h: 'high', n: 'nominal', l: 'low' })[f.maxConfidence] || '—';
    const firstSeen = formatRelativeTime(f.firstSeenAt);
    const lastSeen = formatRelativeTime(f.lastSeenAt);
    const frpLine = f.maxFrp != null ? `<p class="popup-row"><strong>Max FRP</strong> ${f.maxFrp.toFixed(1)} MW</p>` : '';
    const sat = Array.isArray(f.satellites) && f.satellites.length
        ? `<p class="popup-row"><strong>Source</strong> ${esc(f.satellites.join(', '))}</p>` : '';
    return `
        <div class="fire-popup">
            <h4>Fire near ${f.centerLat.toFixed(3)}, ${f.centerLon.toFixed(3)}</h4>
            <p class="popup-meta">${f.detectionCount} detection${f.detectionCount === 1 ? '' : 's'} &middot; ~${(f.estimatedAreaKm2 ?? 0).toFixed(2)} km<sup>2</sup></p>
            <p class="popup-row"><strong>First seen</strong> ${esc(firstSeen)}</p>
            <p class="popup-row"><strong>Last seen</strong> ${esc(lastSeen)}</p>
            ${frpLine}
            <p class="popup-row"><strong>Confidence</strong> ${esc(confLabel)}</p>
            ${sat}
            <p class="popup-row"><strong>Status</strong> <span class="popup-badge" style="color:${f.status === 'active' ? '#dc2626' : '#666'}">${esc(f.status || 'unknown')}</span></p>
        </div>
    `;
}

function formatRelativeTime(iso) {
    if (!iso) return '—';
    const ts = Date.parse(iso);
    if (!Number.isFinite(ts)) return '—';
    const seconds = Math.round((Date.now() - ts) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 48) return `${hours}h ago`;
    const days = Math.round(hours / 24);
    return `${days}d ago`;
}

window.renderHotspots = renderHotspots;
window.renderFires = renderFires;
window.countHotspotsLast24h = countHotspotsLast24h;
window.formatFireRelativeTime = formatRelativeTime;
