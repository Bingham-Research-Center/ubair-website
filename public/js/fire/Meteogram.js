/* Open-Meteo 48-hour meteogram (temperature, RH, wind, gusts). */

function renderMeteogram(hourly) {
    const el = document.getElementById('meteogram');
    if (!el) return;
    if (!hourly || !window.Plotly) {
        el.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin" aria-hidden="true"></i><span>Hourly data unavailable.</span></div>';
        return;
    }
    const t = hourly.time || [];
    if (t.length === 0) {
        el.innerHTML = '<div class="loading-spinner"><span>No hourly data returned.</span></div>';
        return;
    }
    const traces = [
        { x: t, y: hourly.temperature_2m, name: 'Temp (°C)', type: 'scatter', mode: 'lines', line: { color: '#b22222', width: 2 }, yaxis: 'y' },
        { x: t, y: hourly.relative_humidity_2m, name: 'RH (%)', type: 'scatter', mode: 'lines', line: { color: '#2e8b57', width: 2 }, yaxis: 'y2' },
        { x: t, y: hourly.wind_speed_10m, name: 'Wind (m/s)', type: 'scatter', mode: 'lines', line: { color: '#ff8c00', width: 2 }, yaxis: 'y3' },
        { x: t, y: hourly.wind_gusts_10m, name: 'Gusts (m/s)', type: 'scatter', mode: 'lines', line: { color: '#ff4500', width: 2, dash: 'dot' }, yaxis: 'y3' }
    ];
    const layout = {
        margin: { l: 55, r: 70, t: 25, b: 45 },
        plot_bgcolor: '#fff8f0',
        paper_bgcolor: '#fff',
        xaxis: { title: '', tickfont: { size: 11 } },
        yaxis: { title: 'Temp °C', side: 'left', titlefont: { color: '#b22222' }, tickfont: { color: '#b22222' } },
        yaxis2: { title: 'RH %', overlaying: 'y', side: 'right', titlefont: { color: '#2e8b57' }, tickfont: { color: '#2e8b57' } },
        yaxis3: { title: 'm/s', overlaying: 'y', side: 'right', anchor: 'free', position: 1.0, showgrid: false, titlefont: { color: '#ff8c00' }, tickfont: { color: '#ff8c00' } },
        legend: { orientation: 'h', y: -0.2, x: 0 },
        showlegend: true,
        hovermode: 'x unified'
    };
    Plotly.newPlot('meteogram', traces, layout, { displayModeBar: false, responsive: true });
}

window.renderMeteogram = renderMeteogram;
