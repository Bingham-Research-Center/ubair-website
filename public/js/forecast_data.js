// Constants for stations and parameters
const stations = {
    'roosevelt': { id: 'roosevelt', label: 'Roosevelt' },
    'vernal': { id: 'vernal', label: 'Vernal' },
    'horsepool': { id: 'horsepool', label: 'Horsepool' },
    'ouray': { id: 'ouray', label: 'Ouray' },
    'myton': { id: 'myton', label: 'Myton' },
    'whiterocks': { id: 'whiterocks', label: 'Whiterocks' },
    'dinosaur': { id: 'dinosaur', label: 'Dinosaur NM' },
    'redwash': { id: 'redwash', label: 'Red Wash' }
};

const parameters = {
    'wind': { id: 'wind', label: 'Wind Speed', unit: 'm/s' },
    'ozone': { id: 'ozone', label: 'Ozone', unit: 'ppb' },
    'temperature': { id: 'temperature', label: 'Temperature', unit: '°C' },
    'pressure': { id: 'pressure', label: 'Pressure', unit: 'hPa' },
    'snow_depth': { id: 'snow_depth', label: 'Snow Depth', unit: 'cm' },
    'humidity': { id: 'humidity', label: 'Humidity', unit: '%' }
};

// USU Colors for traces
const usuColors = {
    primary: ['#00263A', '#627C8B', '#8B9299', '#A7A9AC'],
    secondary: ['#003857', '#004B74', '#005E91', '#0071AE'],
    accent: ['#8B0000', '#B22222', '#DC143C', '#FF4500']
};

// State variables
let currentData = null;
let selectedLocations = ['roosevelt', 'vernal', 'horsepool']; // Default selections
let selectedParameters = ['wind']; // Default selection
let startDate = null;
let endDate = null;
let updateInterval = null;
let isTestMode = true;

// Initialize the date pickers with default range
function initializeDatePickers() {
    const today = new Date();
    const lastWeek = new Date(today.getTime() - (7 * 24 * 60 * 60 * 1000));

    const startPicker = document.getElementById('start-date');
    const endPicker = document.getElementById('end-date');

    if (startPicker && endPicker) {
        startPicker.valueAsDate = lastWeek;
        endPicker.valueAsDate = today;

        startDate = lastWeek;
        endDate = today;

        startPicker.addEventListener('change', (e) => {
            startDate = e.target.valueAsDate;
            if (endDate < startDate) {
                endDate = new Date(startDate);
                endPicker.valueAsDate = endDate;
            }
            updatePlot();
        });

        endPicker.addEventListener('change', (e) => {
            const selectedDate = e.target.valueAsDate;
            endDate = selectedDate > today ? today : selectedDate;
            if (endDate < startDate) {
                startDate = new Date(endDate);
                startPicker.valueAsDate = startDate;
            }
            endPicker.valueAsDate = endDate;
            updatePlot();
        });

        endPicker.max = today.toISOString().split('T')[0];
    }
}

// Enhanced test data generation with realistic patterns
function generateSampleTimeSeries() {
    const data = {};
    const now = new Date();
    const timePoints = 24; // 24 hours of data
    const parameterMap = {
        'Wind Speed': {
            min: 2,
            max: 10,
            generator: (hour) => 4 + Math.sin(hour/12 * Math.PI) * 3 + Math.random() * 2
        },
        'Temperature': {
            min: -10,
            max: 30,
            generator: (hour) => 10 + Math.sin(hour/12 * Math.PI) * 15 + Math.random() * 2
        },
        'Ozone': {
            min: 20,
            max: 80,
            generator: (hour) => 40 + Math.sin(hour/12 * Math.PI) * 20 + Math.random() * 5
        },
        'Pressure': {
            min: 850,
            max: 870,
            generator: (hour) => 860 + Math.sin(hour/24 * Math.PI) * 5 + Math.random()
        },
        'Snow Depth': {
            min: 0,
            max: 100,
            generator: (hour) => Math.max(0, 50 + Math.sin(hour/24 * Math.PI) * 10 + Math.random() * 5)
        },
        'Humidity': {
            min: 20,
            max: 90,
            generator: (hour) => 55 + Math.sin(hour/12 * Math.PI) * 25 + Math.random() * 5
        }
    };

    // Generate data with location-specific variations
    for (let i = 0; i < timePoints; i++) {
        const timestamp = new Date(now.getTime() - (i * 3600000)).toISOString();
        data[timestamp] = {};

        Object.keys(stations).forEach((location, locationIndex) => {
            data[timestamp][location] = {};
            Object.entries(parameterMap).forEach(([param, config]) => {
                const baseValue = config.generator(i);
                const locationVariation = Math.sin(locationIndex) * 5;
                data[timestamp][location][param] = Math.max(
                    config.min,
                    Math.min(config.max, baseValue + locationVariation)
                );
            });
        });
    }
    return data;
}

// Event handler for checkbox changes
function handleCheckboxChange(e, type) {
    const checkboxes = document.querySelectorAll(`#${type}-select input[type="checkbox"]`);
    const selectedValues = Array.from(checkboxes)
        .filter(cb => cb.checked)
        .map(cb => cb.value);

    if (type === 'location') {
        selectedLocations = selectedValues;
    } else {
        selectedParameters = selectedValues;
    }

    updatePlot();
}

// Get color for traces with USU color scheme
function getTraceColor(location, parameter) {
    const locationIndex = Object.keys(stations).indexOf(location) % usuColors.primary.length;
    const parameterIndex = Object.keys(parameters).indexOf(parameter) % usuColors.secondary.length;

    return locationIndex % 2 === 0 ?
        usuColors.primary[locationIndex] :
        usuColors.secondary[parameterIndex];
}

// Load data function - handles both test data and future API integration
async function loadData() {
    try {
        if (isTestMode) {
            const testData = generateSampleTimeSeries();
            return {
                current: Object.values(testData)[0],
                forecast: testData
            };
        } else {
            const response = await fetch('/api/forecast-data');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return await response.json();
        }
    } catch (error) {
        console.error('Error loading data:', error);
        return null;
    }
}

// Create time series for plotting
function createTimeSeries(data, location, parameter) {
    try {
        const timestamps = Object.keys(data).map(ts => new Date(ts));
        const values = timestamps.map(timestamp => {
            const timestampStr = timestamp.toISOString();
            if (data[timestampStr] && data[timestampStr][location]) {
                return data[timestampStr][location][parameter] || null;
            }
            return null;
        });

        return {
            x: timestamps,
            y: values,
            type: 'scatter',
            mode: 'lines+markers',
            name: `${stations[location].label} - ${parameter}`,
            line: {
                color: getTraceColor(location, parameter),
                width: 2
            },
            marker: {
                size: 6
            }
        };
    } catch (error) {
        console.error('Error creating time series:', error);
        return {
            x: [],
            y: [],
            type: 'scatter',
            mode: 'lines+markers',
            name: `${stations[location].label} - ${parameter} (Error)`,
            line: {
                color: getTraceColor(location, parameter),
                width: 2
            }
        };
    }
}

// Update the plot
async function updatePlot() {
    try {
        const plotElement = document.getElementById('time-series');
        if (!plotElement) return;

        plotElement.innerHTML = '<div class="loading"><div class="loading-spinner"></div></div>';

        const data = await loadData();

        if (!data) {
            throw new Error('No data available');
        }

        let traces = [];

        selectedLocations.forEach(location => {
            selectedParameters.forEach(parameter => {
                const parameterLabel = parameters[parameter].label;
                const trace = createTimeSeries(data.forecast, location, parameterLabel);
                traces.push(trace);
            });
        });

        const layout = {
            title: {
                text: 'Multi-Parameter Forecast',
                font: {
                    family: 'Arial',
                    size: 24,
                    color: '#00263A'
                }
            },
            xaxis: {
                title: 'Time',
                type: 'date',
                range: [startDate, endDate],
                showgrid: true,
                gridcolor: '#E4E4E4',
                linecolor: '#00263A',
                linewidth: 2
            },
            yaxis: {
                title: selectedParameters.length === 1 ?
                    `${parameters[selectedParameters[0]].label} (${parameters[selectedParameters[0]].unit})` :
                    'Values',
                showgrid: true,
                gridcolor: '#E4E4E4',
                linecolor: '#00263A',
                linewidth: 2
            },
            plot_bgcolor: '#FFFFFF',
            paper_bgcolor: '#FFFFFF',
            margin: { t: 50, r: 50, l: 60, b: 50 },
            showlegend: true,
            legend: {
                x: 1,
                xanchor: 'right',
                y: 1,
                bgcolor: '#FFFFFF',
                bordercolor: '#00263A',
                borderwidth: 1
            },
            hovermode: 'closest',
            font: {
                family: 'Arial',
                color: '#00263A'
            }
        };

        const config = {
            responsive: true,
            displayModeBar: true,
            displaylogo: false,
            modeBarButtonsToRemove: ['lasso2d', 'select2d'],
            toImageButtonOptions: {
                format: 'png',
                filename: 'forecast_data',
                height: 800,
                width: 1200,
                scale: 2
            }
        };

        Plotly.newPlot('time-series', traces, layout, config);
        updateStatistics(traces);

        const lastUpdateElement = document.getElementById('last-update-time');
        if (lastUpdateElement) {
            lastUpdateElement.textContent = new Date().toLocaleString();
        }

    } catch (error) {
        console.error('Error updating plot:', error);
        const plotElement = document.getElementById('time-series');
        plotElement.innerHTML = `
            <div class="error-message">
                Error loading data. Please try again later.
                ${isTestMode ? ' (Using test data)' : ''}
            </div>
        `;
    }
}

// Update statistics panel
function updateStatistics(traces) {
    const statsContainer = document.getElementById('stats-container');
    if (!statsContainer) return;

    statsContainer.innerHTML = '';

    traces.forEach(trace => {
        if (!trace.y || trace.y.length === 0) return;

        const values = trace.y.filter(v => v !== null && !isNaN(v));
        if (values.length === 0) return;

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
                    <div class="stat-label">Average</div>
                    <div class="stat-value">${stats.average.toFixed(1)}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">Maximum</div>
                    <div class="stat-value">${stats.max.toFixed(1)}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">Minimum</div>
                    <div class="stat-value">${stats.min.toFixed(1)}</div>
                </div>
            </div>
        `;

        statsContainer.appendChild(statBox);
    });
}

// Initialize everything when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    initializeDatePickers();

    // Set up event listeners for checkbox controls
    const locationCheckboxes = document.querySelectorAll('#location-select input[type="checkbox"]');
    const parameterCheckboxes = document.querySelectorAll('#parameter-select input[type="checkbox"]');

    locationCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', (e) => handleCheckboxChange(e, 'location'));
    });

    parameterCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', (e) => handleCheckboxChange(e, 'parameter'));
    });

    document.getElementById('update-plot')?.addEventListener('click', updatePlot);

    window.addEventListener('resize', () => {
        const plot = document.getElementById('time-series');
        if (plot) {
            Plotly.Plots.resize(plot);
        }
    });

    // Initial plot update
    updatePlot();

    // Set up automatic updates every hour
    updateInterval = setInterval(updatePlot, 3600000);
});

// Clean up interval when leaving the page
window.addEventListener('beforeunload', () => {
    if (updateInterval) {
        clearInterval(updateInterval);
    }
});