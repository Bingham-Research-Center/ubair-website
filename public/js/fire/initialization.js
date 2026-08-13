/* Fire-weather page orchestrator. Fetches /api/fire-weather every 5 min,
   /api/fire-weather/alerts every 2 min (lighter), renders into the
   pre-existing markup. */

let fireMap = null;
let fireDataCache = null;
let snapshotInterval = null;
let consecutiveFailures = 0;

const REFRESH_FULL_MS = 5 * 60 * 1000;
const REFRESH_ALERTS_MS = 2 * 60 * 1000;
const REFRESH_RESTRICTIONS_MS = 30 * 60 * 1000;
const RETRY_FAST_MS = 15 * 1000;

document.addEventListener('DOMContentLoaded', () => {
    fireDataCache = new FireDataCache();
    fireMap = new FireWeatherMap('fire-map').init();
    if (fireMap) fireMap.fireLayers = new Map();
    window.fireMap = fireMap;

    loadFullSnapshot();
    loadRestrictions();
    snapshotInterval = setInterval(loadFullSnapshot, REFRESH_FULL_MS);
    setInterval(loadAlertsOnly, REFRESH_ALERTS_MS);
    setInterval(loadRestrictions, REFRESH_RESTRICTIONS_MS);
});

async function loadFullSnapshot() {
    try {
        const r = await fetch('/api/fire-weather');
        if (!r.ok) throw new Error(`/api/fire-weather ${r.status}`);
        const data = await r.json();
        fireDataCache.set(data);
        consecutiveFailures = 0;
        renderAll(data);
    } catch (err) {
        consecutiveFailures += 1;
        console.warn(`fire-weather fetch attempt ${consecutiveFailures} failed:`, err.message);
        if (consecutiveFailures >= 3) {
            markLoadFailure();
        }
        // fast retry: schedule a single quick re-attempt; the 5-min interval
        // continues independently.
        setTimeout(() => {
            if (consecutiveFailures > 0) loadFullSnapshot();
        }, RETRY_FAST_MS);
    }
}

async function loadAlertsOnly() {
    try {
        const r = await fetch('/api/fire-weather/alerts');
        if (!r.ok) return;
        const data = await r.json();
        renderRedFlagBanner(data.alerts || []);
    } catch (err) {
        console.warn('Alerts refresh failed:', err);
    }
}

async function loadRestrictions() {
    try {
        const r = await fetch('/api/fire-restrictions');
        if (!r.ok) return;
        const data = await r.json();
        if (typeof window.renderRestrictions === 'function') {
            window.renderRestrictions(data.restrictions || []);
        }
    } catch (err) {
        console.warn('Fire restrictions refresh failed:', err);
    }
}

function renderAll(data) {
    renderRedFlagBanner(data.alerts || []);
    renderHero(data.basin, data.stationMax, data.hotspots || []);
    renderCards(data.basin, data.stationMax);
    if (fireMap) {
        fireMap.renderStations(data.stations || []);
        renderHotspots(fireMap.map, data.hotspots || [], fireMap.hotspotMarkers);
        const fires = data.fires || { active: [], recent: [] };
        const allFires = [...(fires.active || []), ...(fires.recent || [])];
        if (typeof window.renderFires === 'function') {
            window.renderFires(fireMap.map, allFires, fireMap.fireLayers || new Map());
        }
    }
    if (typeof window.renderFireList === 'function') {
        window.renderFireList(data.fires || { active: [], recent: [] });
    }
    renderForecastStrip(data.forecast || []);
    renderMeteogram(data.hourly);
}

function renderHero(basin, stationMax, hotspots) {
    const badge = document.getElementById('basin-hdw-badge');
    const valueEl = document.getElementById('basin-hdw-value');
    const levelEl = document.getElementById('basin-hdw-level-name');
    const sourceEl = document.getElementById('basin-hdw-source');
    const snapshotEl = document.getElementById('hero-snapshot');
    const chip = document.getElementById('hotspot-count-chip');
    const chipValue = document.getElementById('hotspot-count-value');

    if (basin && basin.hdw != null) {
        const cls = classifyHDW(basin.hdw);
        if (badge) badge.setAttribute('data-level', cls?.level || 'low');
        if (valueEl) valueEl.textContent = basin.hdw.toFixed(1);
        if (levelEl) levelEl.textContent = cls?.label || '—';
        if (sourceEl) sourceEl.textContent = basin.hdwSource ? `peak: ${basin.hdwSource}` : '';
    } else {
        if (badge) badge.setAttribute('data-level', 'low');
        if (valueEl) valueEl.textContent = '—';
        if (levelEl) levelEl.textContent = 'No data';
        if (sourceEl) sourceEl.textContent = '';
    }

    if (snapshotEl) {
        const parts = [];
        if (basin?.tempC != null) parts.push(`${basin.tempC.toFixed(1)} °C`);
        if (basin?.rhPercent != null) parts.push(`${Math.round(basin.rhPercent)}% RH`);
        if (basin?.windMs != null) parts.push(`wind ${basin.windMs.toFixed(1)} m/s`);
        if (basin?.gustMs != null) parts.push(`gust ${basin.gustMs.toFixed(1)} m/s`);
        snapshotEl.textContent = parts.length ? parts.join(' · ') : 'Basin centroid conditions unavailable.';
    }

    const count = countHotspotsLast24h(hotspots);
    if (chip && chipValue) {
        if (count > 0) {
            chipValue.textContent = count;
            chip.hidden = false;
            chip.classList.remove('is-hidden');
        } else {
            chip.hidden = true;
            chip.classList.add('is-hidden');
        }
    }
}

function renderCards(basin, stationMax) {
    setText('card-temp', basin?.tempC != null ? `${basin.tempC.toFixed(1)} °C` : '—');
    setText('card-rh', basin?.rhPercent != null ? `${Math.round(basin.rhPercent)} %` : '—');
    setText('card-wind', basin?.windMs != null ? `${basin.windMs.toFixed(1)} m/s` : '—');
    setText('card-wind-trend', basin?.gustMs != null ? `gust ${basin.gustMs.toFixed(1)} m/s` : 'gust —');

    if (stationMax && stationMax.hdw != null) {
        setText('card-hdw', stationMax.hdw.toFixed(1));
        setText('card-hdw-station', stationMax.name || stationMax.stid || '');
    } else {
        setText('card-hdw', '—');
        setText('card-hdw-station', 'no station data');
    }
}

function renderForecastStrip(periods) {
    const strip = document.getElementById('forecast-strip');
    if (!strip) return;
    if (!Array.isArray(periods) || periods.length === 0) {
        strip.innerHTML = '<div class="loading-spinner"><span>NWS forecast unavailable.</span></div>';
        return;
    }
    const esc = window.fireEscapeHtml || ((s) => s);
    strip.innerHTML = periods.slice(0, 10).map(p => `
        <article class="forecast-day-card">
            <h3>${esc(p.name || '')}</h3>
            <p class="forecast-temp">${p.temperature ?? '—'}°${esc(p.temperatureUnit || 'F')}</p>
            <p class="forecast-wind">${esc(p.windSpeed || '—')} ${esc(p.windDirection || '')}</p>
            <p class="forecast-short">${esc(p.shortForecast || '')}</p>
        </article>
    `).join('');
}

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function markLoadFailure() {
    const snapshotEl = document.getElementById('hero-snapshot');
    if (snapshotEl) snapshotEl.textContent = 'Unable to load fire-weather data — retrying.';
}
