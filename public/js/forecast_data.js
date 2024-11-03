// Data cache
let cachedData = null;

// Constants for data visualization
const COLORS = {
    roosevelt: '#1f77b4',
    vernal: '#2ca02c',
    horsepool: '#ff7f0e'
};

const UNITS = {
    wind: 'm/s',
    ozone: 'ppb',
    temperature: '°C'
};

// Load data from JSON files
async function loadData() {
    if (cachedData) return cachedData;

    try {
        const [obsResponse, windResponse] = await Promise.all([
            fetch('/public/data/test_liveobs.json'),
            fetch('/public/data/test_wind_ts.json')
        ]);

        const obsData = await obsResponse.json();
        const windData = await windResponse.json();

        cachedData = {
            observations: obsData,
            wind: windData
        };

        return cachedData;
    } catch (error) {
        console.error('Error loading data:', error);
        return null;
    }
}

// Update plot based on selected options
async function updatePlot() {
    const locationSelect = document.getElementById('location-select');
    const parameterSelect = document.getElementById('parameter-select');
    const location = locationSelect.value;
    const parameter = parameterSelect.value;

    const data = await loadData();
    if (!data) return;

    let traces = [];

    if (parameter === 'wind') {
        // Process wind data
        const timestamps = Object.keys(data.wind).map(ts => new Date(parseInt(ts)));
        const windSpeeds = Object.values(data.wind).map(d => d['Wind Speed']);

        traces.push({
            x: timestamps,
            y: windSpeeds,
            type: 'scatter',
            mode: 'lines',
            name: 'Wind Speed',
            line: { color: '#2196F3' }
        });
    } else {
        // Process other parameters
        const locations = location === 'all'
            ? Object.keys(COLORS)
            : [location];

        locations.forEach(loc => {
            if (data.observations[parameter]?.[loc] !== null) {
                traces.push({
                    x: [new Date()], // Current time point
                    y: [data.observations[parameter][loc]],
                    type: 'scatter',
                    mode: 'lines+markers',
                    name: loc.charAt(0).toUpperCase() + loc.slice(1),
                    line: { color: COLORS[loc] }
                });
            }
        });
    }

    const layout = {
        title: `${parameter.charAt(0).toUpperCase() + parameter.slice(1)} Data`,
        xaxis: {
            title: 'Time',
            showgrid: true,
            gridcolor: '#E4E4E4'
        },
        yaxis: {
            title: `${parameter.charAt(0).toUpperCase() + parameter.slice(1)} (${UNITS[parameter]})`,
            showgrid: true,
            gridcolor: '#E4E4E4'
        },
        plot_bgcolor: '#FFFFFF',
        paper_bgcolor: '#FFFFFF',
        margin: { t: 40, r: 20, l: 60, b: 40 },
        showlegend: true,
        legend: {
            x: 1,
            xanchor: 'right',
            y: 1
        }
    };

    Plotly.newPlot('time-series', traces, layout, { responsive: true });
    updateStatistics(traces);
}

// Update statistics summary
function updateStatistics(traces) {
    const statsContainer = document.getElementById('stats-container');
    statsContainer.innerHTML = '';

    traces.forEach(trace => {
        if (!trace.y || trace.y.length === 0) return;

        const values = trace.y.filter(v => v !== null && !isNaN(v));
        if (values.length === 0) return;

        const stats = calculateStats(values);

        const statBox = document.createElement('div');
        statBox.className = 'stat-box';
        statBox.style.borderLeft = `4px solid ${trace.line.color}`;
        statBox.innerHTML = `
            <h3>${trace.name}</h3>
            <div class="stat-item">
                <div class="stat-label">Average</div>
                <div class="stat-value">${stats.average.toFixed(2)}</div>
            </div>
            <div class="stat-item">
                <div class="stat-label">Maximum</div>
                <div class="stat-value">${stats.max.toFixed(2)}</div>
            </div>
            <div class="stat-item">
                <div class="stat-label">Minimum</div>
                <div class="stat-value">${stats.min.toFixed(2)}</div>
            </div>
        `;

        statsContainer.appendChild(statBox);
    });
}

// Calculate basic statistics
function calculateStats(values) {
    return {
        average: values.reduce((a, b) => a + b, 0) / values.length,
        max: Math.max(...values),
        min: Math.min(...values)
    };
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    // Initial plot
    updatePlot();

    // Add event listeners to controls
    document.getElementById('location-select').addEventListener('change', updatePlot);
    document.getElementById('parameter-select').addEventListener('change', updatePlot);
    document.getElementById('update-plot').addEventListener('click', updatePlot);

    // Add window resize handler for responsive plots
    window.addEventListener('resize', () => {
        const plot = document.getElementById('time-series');
        Plotly.Plots.resize(plot);
    });
});