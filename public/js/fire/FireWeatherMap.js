/* Leaflet map of fire-weather stations + FIRMS hotspots. */

class FireWeatherMap {
    constructor(elId, opts = {}) {
        this.elId = elId;
        this.center = opts.center || [40.3033, -109.7];
        this.zoom = opts.zoom || 9;
        this.map = null;
        this.stationMarkers = new Map();
        this.hotspotMarkers = new Map();
    }

    init() {
        const el = document.getElementById(this.elId);
        if (!el) {
            console.warn(`FireWeatherMap: element #${this.elId} not found`);
            return this;
        }
        if (typeof L === 'undefined') {
            console.warn('FireWeatherMap: Leaflet not loaded');
            return this;
        }
        this.map = L.map(el, { scrollWheelZoom: false }).setView(this.center, this.zoom);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 15,
            minZoom: 6,
            attribution: '© OpenStreetMap | Wx: NWS, Open-Meteo, Synoptic | Detections: NASA FIRMS VIIRS NOAA-20 NRT'
        }).addTo(this.map);
        this.map.on('click', () => { this.map.scrollWheelZoom.enable(); });
        this.map.on('mouseout', () => { this.map.scrollWheelZoom.disable(); });
        this._addLegend();
        return this;
    }

    _addLegend() {
        if (!this.map) return;
        const legend = L.control({ position: 'bottomright' });
        legend.onAdd = () => {
            const div = L.DomUtil.create('div', 'fire-map-legend');
            const swatches = (window.HDW_CLASSES || []).map(c =>
                `<div class="legend-row"><span class="legend-swatch" style="background:${c.color}"></span>${c.label}</div>`
            ).join('');
            div.innerHTML = `
                <strong>HDW level</strong>
                ${swatches}
                <div class="legend-row legend-row-firms"><span class="legend-swatch legend-firms-swatch"></span>FIRMS detection</div>
            `;
            return div;
        };
        legend.addTo(this.map);
    }

    renderStations(stations) {
        if (!this.map) return;
        for (const m of this.stationMarkers.values()) this.map.removeLayer(m);
        this.stationMarkers.clear();
        if (!Array.isArray(stations)) return;
        for (const s of stations) {
            if (s.lat == null || s.lng == null) continue;
            const cls = (window.classifyHDW ? window.classifyHDW(s.hdw) : null);
            const color = cls?.color || '#888';
            const value = s.hdw != null ? Math.round(s.hdw) : '·';
            const icon = L.divIcon({
                className: 'fire-station-marker',
                html: `<div class="fire-station-pin" style="background:${color}"><span>${value}</span></div>`,
                iconSize: [34, 34],
                iconAnchor: [17, 17]
            });
            const marker = L.marker([s.lat, s.lng], { icon }).bindPopup(this._stationPopup(s));
            marker.addTo(this.map);
            this.stationMarkers.set(s.stid, marker);
        }
    }

    _stationPopup(s) {
        const fmt = (v, unit, digits = 1) => v == null ? '—' : `${v.toFixed(digits)}${unit}`;
        const obsTime = s.date ? new Date(s.date).toLocaleString() : 'unknown';
        const cls = (window.classifyHDW ? window.classifyHDW(s.hdw) : null);
        const levelHtml = cls ? `<span class="popup-badge" style="background:${cls.color}">${cls.label}</span>` : '';
        return `
            <div class="fire-popup">
                <h4>${escapeHtml(s.name || s.stid)}</h4>
                <p class="popup-meta">${escapeHtml(s.stid)} · ${obsTime}</p>
                <p class="popup-row"><strong>HDW</strong> ${fmt(s.hdw, '', 1)} ${levelHtml}</p>
                <p class="popup-row"><strong>Temp</strong> ${fmt(s.tempC, ' °C')} &nbsp; <strong>RH</strong> ${fmt(s.rh, ' %', 0)}</p>
                <p class="popup-row"><strong>Wind</strong> ${fmt(s.windMs, ' m/s')}</p>
            </div>
        `;
    }
}

function escapeHtml(s) {
    if (s == null) return '';
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

window.FireWeatherMap = FireWeatherMap;
window.fireEscapeHtml = escapeHtml;
