// forecast_data.js
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

// Sample data generator
function generateSampleData() {
    const locations = ['roosevelt', 'vernal', 'horsepool'];
    const now = new Date();
    const hours = Array.from({length: 24}, (_, i) => new Date(now.getTime() + i * 3600000));

    const sampleData = {
        forecast: {
            wind: {},
            ozone: {},
            temperature: {}
        }
    };

    locations.forEach(location => {
        // Generate wind data
        sampleData.forecast.wind[location] = Array.from({length: 24}, () =>
            2 + Math.random() * 8); // Wind speed between 2-10 m/s

        // Generate ozone data
        sampleData.forecast.ozone[location] = Array.from({length: 24}, () =>
            30 + Math.random() * 40); // Ozone between 30-70 ppb

        // Generate temperature data
        sampleData.forecast.temperature[location] = Array.from({length: 24}, (_, i) =>
            15 + 10 * Math.sin(i * Math.PI / 12) + Math.random() * 2); // Temperature varying between ~5-25°C
    });

    return sampleData;
}

async function loadData() {
    // Using sample data instead of fetching
    return generateSampleData();
}

function createTimeSeries(data, location, parameter) {
    const now = new Date();
    const timestamps = Array.from({length: 24}, (_, i) =>
        new Date(now.getTime() + i * 3600000));

    return {
        x: timestamps,
        y: data.forecast[parameter][location],
        type: 'scatter',
        mode: 'lines+markers',
        name: `${location.charAt(0).toUpperCase() + location.slice(1)} ${parameter}`,
        line: {
            color: COLORS[location],
            width: 2
        },
        marker: {
            size: 6
        }
    };
}

async function updatePlot() {
    const location = document.getElementById('location-select').value;
    const parameter = document.getElementById('parameter-select').value;

    const data = await loadData();
    if (!data) {
        console.error('No data available');
        return;
    }

    let traces = [];

    if (location === 'all') {
        Object.keys(COLORS).forEach(loc => {
            traces.push(createTimeSeries(data, loc, parameter));
        });
    } else {
        traces.push(createTimeSeries(data, location, parameter));
    }

    const layout = {
        title: `${parameter.charAt(0).toUpperCase() + parameter.slice(1)} Forecast`,
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
        margin: { t: 50, r: 50, l: 60, b: 50 },
        showlegend: true,
        legend: {
            x: 1,
            xanchor: 'right',
            y: 1
        },
        hovermode: 'closest'
    };

    // Simplified configuration
    const config = {
        responsive: true,
        displayModeBar: true,
        displaylogo: false,
        modeBarButtonsToRemove: ['lasso2d', 'select2d']
    };

    Plotly.newPlot('time-series', traces, layout, config);
    updateStatistics(traces, parameter);
}

function updateStatistics(traces, parameter) {
    const statsContainer = document.getElementById('stats-container');
    statsContainer.innerHTML = '';

    traces.forEach(trace => {
        const values = trace.y;

        const stats = {
            average: values.reduce((a, b) => a + b, 0) / values.length,
            max: Math.max(...values),
            min: Math.min(...values)
        };

        const statBox = document.createElement('div');
        statBox.className = 'stat-box';
        statBox.style.borderLeft = `4px solid ${trace.line.color}`;
        statBox.innerHTML = `
            <h3>${trace.name}</h3>
            <div class="stat-grid">
                <div class="stat-item">
                    <div class="stat-label">Average ${UNITS[parameter]}</div>
                    <div class="stat-value">${stats.average.toFixed(1)}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">Maximum ${UNITS[parameter]}</div>
                    <div class="stat-value">${stats.max.toFixed(1)}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">Minimum ${UNITS[parameter]}</div>
                    <div class="stat-value">${stats.min.toFixed(1)}</div>
                </div>
            </div>
        `;

        statsContainer.appendChild(statBox);
    });
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    updatePlot();

    document.getElementById('location-select').addEventListener('change', updatePlot);
    document.getElementById('parameter-select').addEventListener('change', updatePlot);
    document.getElementById('update-plot').addEventListener('click', updatePlot);

    window.addEventListener('resize', () => {
        const plot = document.getElementById('time-series');
        Plotly.Plots.resize(plot);
    });
});