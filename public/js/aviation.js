// Aviation page — minimal HRRR crosswind consumer.
//
// Reads the latest forecast_hrrr_kvel_crosswind_*.json pushed by brc-tools
// (stages A/B/C of the HRRR -> BasinWX rollout) and renders a simple
// runway-relative wind table. Non-invasive: if no data is available the
// rest of the aviation page (including its Coming Soon overlay) is
// untouched.

const API_FORECASTS = '/api/static/forecasts';
const API_FILELIST = '/api/filelist/forecasts';
const KVEL_PREFIX = 'forecast_hrrr_kvel_crosswind_';

async function fetchLatestCrosswindPayload() {
    const res = await fetch(API_FILELIST, { cache: 'no-store' });
    if (!res.ok) return null;
    const files = await res.json();
    const matches = (files || [])
        .filter(name => typeof name === 'string' && name.startsWith(KVEL_PREFIX) && name.endsWith('.json'))
        .sort()
        .reverse();
    if (matches.length === 0) return null;
    const payloadRes = await fetch(`${API_FORECASTS}/${matches[0]}`, { cache: 'no-store' });
    if (!payloadRes.ok) return null;
    return payloadRes.json();
}

function formatTime(iso) {
    const d = new Date(iso);
    return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}Z`;
}

function buildTable(payload) {
    const series = payload.series || {};
    const runways = payload.runway_headings_deg || [];
    const rows = (payload.valid_times || []).map((iso, idx) => {
        const cells = [formatTime(iso)];
        cells.push(fmt(series.wind_speed_kt?.[idx], 0));
        cells.push(fmt(series.wind_dir_deg?.[idx], 0));
        for (const heading of runways) {
            const tag = String(heading).padStart(3, '0');
            cells.push(fmt(series[`headwind_kt_${tag}`]?.[idx], 0));
            cells.push(fmt(series[`crosswind_kt_${tag}`]?.[idx], 0));
        }
        return cells;
    });

    const headers = ['Time (UTC)', 'Wind kt', 'Dir°'];
    for (const heading of runways) {
        const rwy = String(Math.round(heading / 10)).padStart(2, '0');
        headers.push(`HW Rwy${rwy}`);
        headers.push(`XW Rwy${rwy}`);
    }

    const table = document.createElement('table');
    table.className = 'crosswind-table';
    const thead = document.createElement('thead');
    thead.innerHTML = `<tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>`;
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    for (const row of rows) {
        const tr = document.createElement('tr');
        tr.innerHTML = row.map(c => `<td>${c}</td>`).join('');
        tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    return table;
}

function fmt(value, decimals) {
    if (value === null || value === undefined || Number.isNaN(value)) return '—';
    return Number(value).toFixed(decimals);
}

function mountCrosswindSection(payload) {
    const container = document.querySelector('.forecast-container') || document.querySelector('.content');
    if (!container) return;

    const section = document.createElement('section');
    section.className = 'forecast-section crosswind-preview';
    section.innerHTML = `
        <h2><i class="fas fa-plane"></i> KVEL Runway Winds (HRRR ${payload.product === 'aviation_crosswind' ? payload.model : 'hrrr'})</h2>
        <p class="init-time">Init ${payload.init_time} • runways ${(payload.runway_headings_deg || []).join('/')}° true</p>
    `;
    section.appendChild(buildTable(payload));
    container.appendChild(section);
}

async function initAviation() {
    try {
        const payload = await fetchLatestCrosswindPayload();
        if (payload) mountCrosswindSection(payload);
    } catch (err) {
        console.warn('aviation: crosswind payload fetch failed', err);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAviation);
} else {
    initAviation();
}
