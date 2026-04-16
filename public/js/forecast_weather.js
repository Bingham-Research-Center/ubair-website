// Weather Forecast Page - GEFS meteograms + HRRR surface layers

const API_IMAGES = '/api/static/images';
const API_FORECASTS = '/api/static/forecasts';
const GEFS_VARIABLES = ['temp', 'wind', 'mslp', 'snow', 'solar'];
const HRRR_INDEX_FILE = 'forecast_hrrr_surface_layers_index.json';
const HRRR_RUN_PREFIX = 'forecast_hrrr_surface_layers_';

const VARIABLE_CONFIG = {
    temperature_2m_c: {
        label: 'Temperature',
        units: '°C',
        thresholds: [-15, -8, -2, 4, 10],
        colors: ['#2c3e73', '#3f73b9', '#8fc8ff', '#fee08b', '#f46d43', '#c91d2d'],
        emptyMessage: 'Temperature data unavailable'
    },
    rainfall_1h_mm: {
        label: 'Rainfall',
        units: 'mm/hr',
        thresholds: [0.1, 0.5, 1.0, 2.5, 5.0],
        colors: ['#f7fbff', '#d9ecff', '#9bc9ff', '#4f97ff', '#2166f3', '#123a97'],
        emptyMessage: 'Rainfall data unavailable'
    },
    snowfall_1h_mm: {
        label: 'Snowfall',
        units: 'mm/hr',
        thresholds: [0.1, 1.0, 2.5, 5.0, 10.0],
        colors: ['#f9fbff', '#dbe8ff', '#b7d2ff', '#7da8ff', '#4a74dd', '#283c96'],
        emptyMessage: 'Snowfall data unavailable'
    }
};

let weatherMap;
let scalarLayerGroup;
let windLayerGroup;
let canvasRenderer;

let allMeteograms = [];
let currentModel = 'GEFS';
let currentInitTime = null;
let currentVariable = 'temp';

const surfaceState = {
    cache: new Map(),
    runs: [],
    selectedRunIndex: 0,
    payload: null,
    selectedVariable: 'temperature_2m_c',
    hourIndex: 0,
    showWind: true,
    kioskMode: false,
    kioskInterval: null,
    kioskCountdownInterval: null,
    kioskCountdown: 30
};

document.addEventListener('DOMContentLoaded', async function() {
    setupWeatherMap();
    initializeTooltips();
    initializeKioskMode();
    initializeMeteograms();
    setupMeteogramTabs();
    setupFullscreen();
    await initializeSurfaceForecasts();
});

// ============================================
// MAP SETUP
// ============================================

function setupWeatherMap() {
    const mapElement = document.getElementById('weather-map');
    if (!mapElement) return;

    weatherMap = L.map('weather-map', {
        zoomControl: true,
        preferCanvas: true
    }).setView([40.3033, -110.0153], 9);

    canvasRenderer = L.canvas({ padding: 0.25 });
    scalarLayerGroup = L.layerGroup().addTo(weatherMap);
    windLayerGroup = L.layerGroup().addTo(weatherMap);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 15,
        attribution: '© OpenStreetMap contributors'
    }).addTo(weatherMap);
}

// ============================================
// METEOGRAM SECTION
// ============================================

async function initializeMeteograms() {
    try {
        const response = await fetch('/api/filelist/images');
        if (!response.ok) {
            showMeteogramError('Unable to fetch image list');
            return;
        }

        const files = await response.json();
        const imageList = Array.isArray(files) ? files : (files.files || []);

        allMeteograms = imageList.filter(f =>
            f.includes('meteogram_UB-repr') && f.endsWith('_GEFS.png')
        );

        if (allMeteograms.length === 0) {
            showMeteogramError('No GEFS meteogram data available yet');
            return;
        }

        const initTimes = extractInitTimes(allMeteograms);
        if (initTimes.length === 0) {
            showMeteogramError('No valid init times found');
            return;
        }

        populateInitTimeDropdown(initTimes);
        currentInitTime = initTimes[0];
        setupMeteogramControls();
        renderCurrentMeteogram();
    } catch (error) {
        console.error('Error initializing meteograms:', error);
        showMeteogramError('Error loading meteogram data');
    }
}

function extractInitTime(filename) {
    const match = filename.match(/(\d{8}-\d{4})/);
    return match ? match[1] : null;
}

function extractInitTimes(files) {
    const times = new Set();
    files.forEach(f => {
        const time = extractInitTime(f);
        if (time) times.add(time);
    });
    return Array.from(times).sort().reverse();
}

function formatInitTime(initTime) {
    if (!initTime) return 'Unknown';
    const [date, time] = initTime.split('-');
    const month = parseInt(date.slice(4, 6), 10) - 1;
    const day = parseInt(date.slice(6, 8), 10);
    const hour = time.slice(0, 2);
    const minute = time.slice(2, 4);

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${monthNames[month]} ${day}, ${hour}:${minute} UTC`;
}

function populateInitTimeDropdown(initTimes) {
    const dropdown = document.getElementById('meteogram-inittime');
    if (!dropdown) return;

    dropdown.innerHTML = '';
    initTimes.forEach(time => {
        const option = document.createElement('option');
        option.value = time;
        option.textContent = formatInitTime(time);
        dropdown.appendChild(option);
    });
}

function setupMeteogramControls() {
    const modelDropdown = document.getElementById('model-selector');
    if (modelDropdown) {
        modelDropdown.addEventListener('change', (e) => {
            currentModel = e.target.value;
            renderCurrentMeteogram();
        });
    }

    const initTimeDropdown = document.getElementById('meteogram-inittime');
    if (initTimeDropdown) {
        initTimeDropdown.addEventListener('change', (e) => {
            currentInitTime = e.target.value;
            renderCurrentMeteogram();
        });
    }
}

function renderCurrentMeteogram() {
    const container = document.getElementById('meteogram-current');
    if (!container) return;

    const filtered = allMeteograms.filter(f =>
        f.includes(currentInitTime) && f.includes(currentModel)
    );
    const img = filtered.find(f => f.includes(`_${currentVariable}_`));

    if (img) {
        container.innerHTML = `
            <img
                src="${API_IMAGES}/${img}"
                alt="${currentVariable} meteogram"
                class="meteogram-img"
                loading="lazy"
                onclick="openFullscreen(this.src)"
                onerror="this.parentElement.innerHTML='<div class=\\'chart-error\\'><i class=\\'fas fa-exclamation-triangle\\'></i><p>Image failed to load</p></div>'"
            />
        `;
    } else {
        container.innerHTML = `
            <div class="chart-no-data">
                <i class="fas fa-cloud-sun"></i>
                <p>No data available for ${currentVariable}</p>
            </div>
        `;
    }
}

function showMeteogramError(message) {
    const container = document.getElementById('meteogram-current');
    if (container) {
        container.innerHTML = `
            <div class="chart-no-data">
                <i class="fas fa-exclamation-circle"></i>
                <p>${message}</p>
            </div>
        `;
    }
}

function setupMeteogramTabs() {
    const tabs = document.querySelectorAll('.meteogram-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentVariable = tab.dataset.variable;
            renderCurrentMeteogram();
        });
    });
}

// ============================================
// FULLSCREEN
// ============================================

function setupFullscreen() {
    const fullscreenBtn = document.getElementById('fullscreen-btn');
    const modal = document.getElementById('meteogram-modal');
    const modalClose = document.getElementById('modal-close');

    if (fullscreenBtn) {
        fullscreenBtn.addEventListener('click', () => {
            const img = document.querySelector('#meteogram-current .meteogram-img');
            if (img) openFullscreen(img.src);
        });
    }

    if (modalClose) {
        modalClose.addEventListener('click', closeFullscreen);
    }

    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeFullscreen();
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeFullscreen();
    });
}

function openFullscreen(src) {
    const modal = document.getElementById('meteogram-modal');
    const content = document.getElementById('modal-content');

    if (modal && content) {
        content.innerHTML = `<img src="${src}" alt="Meteogram fullscreen" />`;
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

function closeFullscreen() {
    const modal = document.getElementById('meteogram-modal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

window.openFullscreen = openFullscreen;
window.closeFullscreen = closeFullscreen;

// ============================================
// HRRR SURFACE FORECASTS
// ============================================

async function initializeSurfaceForecasts() {
    const status = document.getElementById('forecast-status');
    if (status) status.textContent = 'Loading HRRR surface layers...';

    setupSurfaceControls();

    try {
        surfaceState.runs = await fetchSurfaceRunIndex();
        if (!surfaceState.runs.length) {
            setForecastStatus('No HRRR surface layer files are available yet.');
            renderNoSurfaceData('No HRRR surface layers available yet');
            return;
        }

        populateRunSelector(surfaceState.runs);
        await selectSurfaceRun(0);
        setForecastStatus(`Loaded ${surfaceState.runs.length} HRRR runs for the Basin map.`);
    } catch (error) {
        console.error('Error initializing HRRR surface layers:', error);
        setForecastStatus('Unable to load HRRR surface layers right now.');
        renderNoSurfaceData('Unable to load HRRR surface layer data');
    }
}

function setupSurfaceControls() {
    const runSelect = document.getElementById('forecast-run');
    if (runSelect) {
        runSelect.addEventListener('change', async (event) => {
            await selectSurfaceRun(parseInt(event.target.value, 10));
        });
    }

    const variableSelect = document.getElementById('weather-variable');
    if (variableSelect) {
        variableSelect.addEventListener('change', (event) => {
            surfaceState.selectedVariable = event.target.value;
            renderSurfaceForecast();
        });
    }

    const timeSelect = document.getElementById('forecast-time');
    if (timeSelect) {
        timeSelect.addEventListener('change', (event) => {
            surfaceState.hourIndex = parseInt(event.target.value, 10);
            renderSurfaceForecast();
        });
    }

    const windToggle = document.getElementById('wind-toggle');
    if (windToggle) {
        windToggle.addEventListener('change', (event) => {
            surfaceState.showWind = event.target.checked;
            renderSurfaceForecast();
        });
    }
}

async function fetchSurfaceRunIndex() {
    const indexResponse = await fetch(`${API_FORECASTS}/${HRRR_INDEX_FILE}`);
    if (indexResponse.ok) {
        const indexPayload = await indexResponse.json();
        return Array.isArray(indexPayload.runs) ? indexPayload.runs : [];
    }

    const fileListResponse = await fetch('/api/filelist/forecasts');
    if (!fileListResponse.ok) return [];

    const files = await fileListResponse.json();
    return (Array.isArray(files) ? files : [])
        .filter(name => name.startsWith(HRRR_RUN_PREFIX) && name.endsWith('.json') && name !== HRRR_INDEX_FILE)
        .sort()
        .reverse()
        .slice(0, 3)
        .map(name => ({ filename: name }));
}

function populateRunSelector(runs) {
    const runSelect = document.getElementById('forecast-run');
    if (!runSelect) return;

    runSelect.innerHTML = '';
    runs.forEach((run, index) => {
        const option = document.createElement('option');
        option.value = String(index);
        option.textContent = run.init_time
            ? `HRRR ${formatIsoTimestamp(run.init_time)}`
            : nameToRunLabel(run.filename);
        runSelect.appendChild(option);
    });
    runSelect.value = '0';
}

async function selectSurfaceRun(index) {
    const run = surfaceState.runs[index];
    if (!run) return;

    surfaceState.selectedRunIndex = index;
    surfaceState.payload = await fetchSurfacePayload(run.filename);
    surfaceState.hourIndex = 0;

    populateHourSelector(surfaceState.payload);
    renderSurfaceForecast();
}

async function fetchSurfacePayload(filename) {
    if (surfaceState.cache.has(filename)) {
        return surfaceState.cache.get(filename);
    }

    const response = await fetch(`${API_FORECASTS}/${filename}`);
    if (!response.ok) {
        throw new Error(`Failed to load ${filename}`);
    }

    const payload = await response.json();
    surfaceState.cache.set(filename, payload);
    return payload;
}

function populateHourSelector(payload) {
    const timeSelect = document.getElementById('forecast-time');
    if (!timeSelect || !payload) return;

    const forecastHours = Array.isArray(payload.forecast_hours) ? payload.forecast_hours : [];
    const validTimes = Array.isArray(payload.valid_times) ? payload.valid_times : [];

    timeSelect.innerHTML = '';
    forecastHours.forEach((hour, index) => {
        const option = document.createElement('option');
        option.value = String(index);
        const validTime = validTimes[index] ? formatIsoTimestamp(validTimes[index]) : 'Unknown';
        option.textContent = `F${String(hour).padStart(2, '0')} | ${validTime}`;
        timeSelect.appendChild(option);
    });
    timeSelect.value = '0';
}

function renderSurfaceForecast() {
    const payload = surfaceState.payload;
    if (!payload || !weatherMap) {
        renderNoSurfaceData('HRRR surface layer data unavailable');
        return;
    }

    const variableKey = surfaceState.selectedVariable;
    const config = VARIABLE_CONFIG[variableKey];
    const scalarValues = sliceFieldForHour(payload, variableKey, surfaceState.hourIndex);
    const validValues = scalarValues.filter(value => Number.isFinite(value));

    if (!validValues.length) {
        renderNoSurfaceData(config.emptyMessage);
        return;
    }

    clearMapLayers();
    renderScalarLayer(payload, variableKey, scalarValues);
    if (surfaceState.showWind) {
        renderWindVectors(payload, surfaceState.hourIndex);
    }

    fitMapToPayload(payload);
    updateCurrentDisplay(payload, config);
    updateLegend(variableKey);
    updateSummaryPanels(payload, variableKey, scalarValues);
    updateModelInfo(payload);

    const run = surfaceState.runs[surfaceState.selectedRunIndex];
    const hourText = payload.forecast_hours?.[surfaceState.hourIndex];
    setForecastStatus(`Showing ${config.label.toLowerCase()} for ${run.init_time ? formatIsoTimestamp(run.init_time) : run.filename} at F${String(hourText).padStart(2, '0')}.`);
}

function clearMapLayers() {
    if (scalarLayerGroup) scalarLayerGroup.clearLayers();
    if (windLayerGroup) windLayerGroup.clearLayers();
}

function renderScalarLayer(payload, variableKey, scalarValues) {
    const config = VARIABLE_CONFIG[variableKey];
    const { lats, lons } = payload.grid;
    const [rows, cols] = payload.grid.shape;

    for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
            const index = row * cols + col;
            const value = scalarValues[index];
            const lat = lats[index];
            const lon = lons[index];

            if (!Number.isFinite(value) || !Number.isFinite(lat) || !Number.isFinite(lon)) {
                continue;
            }

            const marker = L.circleMarker([lat, lon], {
                radius: 7,
                renderer: canvasRenderer,
                stroke: false,
                fillOpacity: 0.72,
                fillColor: colorForValue(config, value)
            });
            marker.bindTooltip(`${config.label}: ${formatValue(value, config.units)}`);
            scalarLayerGroup.addLayer(marker);
        }
    }
}

function renderWindVectors(payload, hourIndex) {
    const { lats, lons } = payload.grid;
    const [rows, cols] = payload.grid.shape;
    const uValues = sliceFieldForHour(payload, 'wind_u_10m_ms', hourIndex);
    const vValues = sliceFieldForHour(payload, 'wind_v_10m_ms', hourIndex);
    const step = Math.max(1, Math.floor((payload.stride || 2) * 1.5));

    for (let row = 0; row < rows; row += step) {
        for (let col = 0; col < cols; col += step) {
            const index = row * cols + col;
            const u = uValues[index];
            const v = vValues[index];
            const lat = lats[index];
            const lon = lons[index];

            if (!Number.isFinite(u) || !Number.isFinite(v) || !Number.isFinite(lat) || !Number.isFinite(lon)) {
                continue;
            }

            const speed = Math.hypot(u, v);
            if (speed < 0.5) continue;

            const angle = (Math.atan2(u, v) * 180) / Math.PI;
            const icon = L.divIcon({
                className: 'wind-vector-icon',
                html: `<div class="wind-vector-arrow" style="transform: rotate(${angle}deg)">↑</div>`,
                iconSize: [18, 18],
                iconAnchor: [9, 9]
            });

            const marker = L.marker([lat, lon], { icon });
            marker.bindTooltip(`Wind: ${speed.toFixed(1)} m/s`);
            windLayerGroup.addLayer(marker);
        }
    }
}

function fitMapToPayload(payload) {
    if (!weatherMap || weatherMap._surfaceBoundsSet) return;
    const bbox = payload.bbox?.actual;
    if (!bbox?.sw || !bbox?.ne) return;

    weatherMap.fitBounds([
        [bbox.sw[0], bbox.sw[1]],
        [bbox.ne[0], bbox.ne[1]]
    ], { padding: [15, 15] });
    weatherMap._surfaceBoundsSet = true;
}

function updateCurrentDisplay(payload, config) {
    const currentVariable = document.getElementById('current-variable');
    const currentTime = document.getElementById('current-time');

    if (currentVariable) {
        currentVariable.textContent = surfaceState.showWind
            ? `${config.label} + Wind`
            : config.label;
    }

    if (currentTime) {
        const validTime = payload.valid_times?.[surfaceState.hourIndex];
        const forecastHour = payload.forecast_hours?.[surfaceState.hourIndex];
        currentTime.textContent = `F${String(forecastHour).padStart(2, '0')} | ${validTime ? formatIsoTimestamp(validTime) : 'Unknown valid time'}`;
    }
}

function updateLegend(variableKey) {
    const legend = document.getElementById('weather-legend');
    if (!legend) return;

    const config = VARIABLE_CONFIG[variableKey];
    const rows = config.colors.map((color, index) => {
        const lowerBound = index === 0 ? `<= ${config.thresholds[0]}` : `> ${config.thresholds[index - 1]}`;
        const upperBound = config.thresholds[index];
        const label = upperBound === undefined
            ? `${lowerBound} ${config.units}`
            : `${lowerBound} to ${upperBound} ${config.units}`;
        return `
            <div class="legend-row">
                <span class="legend-swatch" style="background:${color}"></span>
                <span class="legend-label">${label}</span>
            </div>
        `;
    }).join('');

    legend.innerHTML = `
        <div class="legend-title">${config.label}</div>
        <div class="legend-subtitle">${config.units}</div>
        <div class="legend-scale">${rows}</div>
    `;
}

function updateSummaryPanels(payload, variableKey, scalarValues) {
    updateWeatherSummary(variableKey, scalarValues, payload);
    updateForecastSnapshots(payload, variableKey);
    updateSpecialConditions(payload, scalarValues);
}

function updateWeatherSummary(variableKey, scalarValues, payload) {
    const config = VARIABLE_CONFIG[variableKey];
    const validValues = scalarValues.filter(value => Number.isFinite(value));
    const average = validValues.reduce((sum, value) => sum + value, 0) / validValues.length;
    const minimum = Math.min(...validValues);
    const maximum = Math.max(...validValues);

    const summary = document.getElementById('weather-summary');
    if (summary) {
        summary.innerHTML = `
            <p>HRRR ${config.label.toLowerCase()} for the Uintah Basin at ${formatIsoTimestamp(payload.valid_times[surfaceState.hourIndex])}. The map uses a reduced Basin grid for faster display on BasinWX.</p>
            <div class="summary-stats">
                <div class="stat-item">
                    <span class="stat-label">Basin Average:</span>
                    <span class="stat-value">${formatValue(average, config.units)}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Range:</span>
                    <span class="stat-value">${formatValue(minimum, config.units)} to ${formatValue(maximum, config.units)}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Trend:</span>
                    <span class="stat-value">${computeTrendText(payload, variableKey, average)}</span>
                </div>
            </div>
        `;
    }

    const basinAverage = document.getElementById('basin-average');
    const range = document.getElementById('temperature-range');
    const trend = document.getElementById('trend-indicator');
    if (basinAverage) basinAverage.textContent = formatValue(average, config.units);
    if (range) range.textContent = `${formatValue(minimum, config.units)} to ${formatValue(maximum, config.units)}`;
    if (trend) trend.textContent = computeTrendText(payload, variableKey, average);
}

function updateForecastSnapshots(payload, variableKey) {
    const config = VARIABLE_CONFIG[variableKey];
    const timeline = document.getElementById('forecast-outlook');
    if (!timeline) return;

    const indices = [surfaceState.hourIndex, surfaceState.hourIndex + 6, surfaceState.hourIndex + 12]
        .filter(index => index < payload.forecast_hours.length);

    timeline.innerHTML = `
        <div class="outlook-timeline">
            ${indices.map(index => {
                const values = sliceFieldForHour(payload, variableKey, index).filter(value => Number.isFinite(value));
                const average = values.length
                    ? values.reduce((sum, value) => sum + value, 0) / values.length
                    : null;
                return `
                    <div class="timeline-item">
                        <div class="timeline-time">F${String(payload.forecast_hours[index]).padStart(2, '0')}</div>
                        <div class="timeline-desc">${formatIsoTimestamp(payload.valid_times[index])}</div>
                        <div class="timeline-temp">${average === null ? '--' : formatValue(average, config.units)}</div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

function updateSpecialConditions(payload, scalarValues) {
    const conditions = document.getElementById('special-conditions');
    if (!conditions) return;

    const freezingFraction = fractionBelowValue(sliceFieldForHour(payload, 'temperature_2m_c', surfaceState.hourIndex), 0);
    const maxWind = maxSpeed(
        sliceFieldForHour(payload, 'wind_u_10m_ms', surfaceState.hourIndex),
        sliceFieldForHour(payload, 'wind_v_10m_ms', surfaceState.hourIndex)
    );
    const maxSnow = maxFinite(sliceFieldForHour(payload, 'snowfall_1h_mm', surfaceState.hourIndex));
    const maxRain = maxFinite(sliceFieldForHour(payload, 'rainfall_1h_mm', surfaceState.hourIndex));

    const items = [];
    if (freezingFraction >= 0.5) {
        items.push(renderConditionBlock('alert', 'Freezing Surface Layer', `${Math.round(freezingFraction * 100)}% of sampled grid points are at or below 0°C.`));
    }
    if (maxSnow >= 1.0) {
        items.push(renderConditionBlock('alert', 'Snowfall Signal', `Peak hourly snowfall in the sampled grid is ${maxSnow.toFixed(1)} mm/hr.`));
    }
    if (maxRain >= 0.5) {
        items.push(renderConditionBlock('note', 'Rainfall Signal', `Peak hourly rainfall in the sampled grid is ${maxRain.toFixed(1)} mm/hr.`));
    }
    if (maxWind >= 10.0) {
        items.push(renderConditionBlock('note', 'Windy Corridor', `Peak 10 m wind speed on the reduced grid is ${maxWind.toFixed(1)} m/s.`));
    }

    if (!items.length) {
        items.push(renderConditionBlock('note', 'Quiet Period', 'No strong rain, snow, freezing dominance, or wind signal is present on the selected HRRR slice.'));
    }

    conditions.innerHTML = items.join('');
}

function updateModelInfo(payload) {
    const updateTime = document.getElementById('model-update-time');
    const nextUpdateTime = document.getElementById('next-update-time');
    const gridReduction = document.getElementById('grid-reduction');

    if (updateTime) {
        updateTime.textContent = formatIsoTimestamp(payload.init_time);
    }
    if (nextUpdateTime) {
        const next = new Date(payload.init_time);
        next.setUTCHours(next.getUTCHours() + 1);
        nextUpdateTime.textContent = formatDateUTC(next);
    }
    if (gridReduction) {
        gridReduction.textContent = `Stride ${payload.stride || 1}`;
    }
}

function renderNoSurfaceData(message) {
    clearMapLayers();
    const legend = document.getElementById('weather-legend');
    if (legend) legend.innerHTML = `<div class="legend-title">HRRR Surface Layers</div><div class="legend-subtitle">${message}</div>`;

    const currentVariable = document.getElementById('current-variable');
    const currentTime = document.getElementById('current-time');
    if (currentVariable) currentVariable.textContent = 'HRRR Surface Layers';
    if (currentTime) currentTime.textContent = message;
}

function sliceFieldForHour(payload, fieldName, hourIndex) {
    const flat = payload.fields?.[fieldName];
    const shape = payload.field_shape || [];
    if (!Array.isArray(flat) || shape.length !== 3) {
        return [];
    }

    const [, rows, cols] = shape;
    const sliceSize = rows * cols;
    const offset = hourIndex * sliceSize;
    return flat.slice(offset, offset + sliceSize).map(value => (
        value === null || value === undefined ? NaN : Number(value)
    ));
}

function colorForValue(config, value) {
    for (let index = 0; index < config.thresholds.length; index += 1) {
        if (value <= config.thresholds[index]) {
            return config.colors[index];
        }
    }
    return config.colors[config.colors.length - 1];
}

function formatValue(value, units) {
    if (!Number.isFinite(value)) return '--';
    return `${value.toFixed(1)} ${units}`;
}

function computeTrendText(payload, variableKey, average) {
    if (surfaceState.hourIndex === 0) {
        return 'Baseline hour';
    }
    const previousValues = sliceFieldForHour(payload, variableKey, surfaceState.hourIndex - 1)
        .filter(value => Number.isFinite(value));
    if (!previousValues.length) {
        return 'Unavailable';
    }
    const previousAverage = previousValues.reduce((sum, value) => sum + value, 0) / previousValues.length;
    const delta = average - previousAverage;
    if (Math.abs(delta) < 0.2) return 'Steady';
    return delta > 0 ? `Rising (+${delta.toFixed(1)})` : `Falling (${delta.toFixed(1)})`;
}

function fractionBelowValue(values, threshold) {
    const validValues = values.filter(value => Number.isFinite(value));
    if (!validValues.length) return 0;
    return validValues.filter(value => value <= threshold).length / validValues.length;
}

function maxSpeed(uValues, vValues) {
    let maxValue = 0;
    for (let index = 0; index < uValues.length; index += 1) {
        const u = uValues[index];
        const v = vValues[index];
        if (Number.isFinite(u) && Number.isFinite(v)) {
            maxValue = Math.max(maxValue, Math.hypot(u, v));
        }
    }
    return maxValue;
}

function maxFinite(values) {
    const validValues = values.filter(value => Number.isFinite(value));
    return validValues.length ? Math.max(...validValues) : 0;
}

function renderConditionBlock(type, title, description) {
    const className = type === 'alert' ? 'condition-alert' : 'condition-note';
    const iconClass = type === 'alert' ? 'alert-icon' : 'note-icon';
    const icon = type === 'alert' ? 'fas fa-exclamation-triangle' : 'fas fa-info';
    const contentClass = type === 'alert' ? 'alert-content' : 'note-content';

    return `
        <div class="${className}">
            <div class="${iconClass}">
                <i class="${icon}"></i>
            </div>
            <div class="${contentClass}">
                <h4>${title}</h4>
                <p>${description}</p>
            </div>
        </div>
    `;
}

function nameToRunLabel(filename) {
    const match = filename.match(/_(\d{8})_(\d{4})Z\.json$/);
    if (!match) return filename;
    return formatInitTime(`${match[1]}-${match[2]}`);
}

function formatIsoTimestamp(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return formatDateUTC(date);
}

function formatDateUTC(date) {
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${monthNames[date.getUTCMonth()]} ${date.getUTCDate()}, ${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')} UTC`;
}

function setForecastStatus(message) {
    const status = document.getElementById('forecast-status');
    if (status) status.textContent = message;
}

// ============================================
// KIOSK MODE
// ============================================

function initializeKioskMode() {
    const kioskToggle = document.getElementById('kiosk-toggle');
    if (!kioskToggle) return;

    kioskToggle.addEventListener('click', function() {
        if (surfaceState.kioskMode) {
            stopKioskMode();
            this.innerHTML = '<i class="fas fa-play"></i> Start Kiosk Mode';
        } else {
            startKioskMode();
            this.innerHTML = '<i class="fas fa-stop"></i> Stop Kiosk Mode';
        }
    });
}

function startKioskMode() {
    surfaceState.kioskMode = true;
    document.body.classList.add('kiosk-mode');
    resetKioskCountdown();

    const status = document.getElementById('kiosk-status');
    const timer = document.getElementById('kiosk-timer');
    if (status) {
        status.querySelector('.status-text').textContent = 'Kiosk Mode Active';
    }
    if (timer) timer.style.display = 'inline-flex';

    surfaceState.kioskInterval = setInterval(() => {
        advanceForecastFrame();
        resetKioskCountdown();
    }, 30000);

    surfaceState.kioskCountdownInterval = setInterval(() => {
        surfaceState.kioskCountdown = Math.max(0, surfaceState.kioskCountdown - 1);
        const countdown = document.getElementById('timer-countdown');
        if (countdown) countdown.textContent = String(surfaceState.kioskCountdown);
    }, 1000);
}

function stopKioskMode() {
    surfaceState.kioskMode = false;
    document.body.classList.remove('kiosk-mode');

    if (surfaceState.kioskInterval) clearInterval(surfaceState.kioskInterval);
    if (surfaceState.kioskCountdownInterval) clearInterval(surfaceState.kioskCountdownInterval);
    surfaceState.kioskInterval = null;
    surfaceState.kioskCountdownInterval = null;

    const status = document.getElementById('kiosk-status');
    const timer = document.getElementById('kiosk-timer');
    if (status) {
        status.querySelector('.status-text').textContent = 'Manual Mode';
    }
    if (timer) timer.style.display = 'none';
}

function resetKioskCountdown() {
    surfaceState.kioskCountdown = 30;
    const countdown = document.getElementById('timer-countdown');
    if (countdown) countdown.textContent = String(surfaceState.kioskCountdown);
}

function advanceForecastFrame() {
    const payload = surfaceState.payload;
    if (!payload) return;

    if (surfaceState.hourIndex < payload.forecast_hours.length - 1) {
        surfaceState.hourIndex += 1;
    } else if (surfaceState.selectedRunIndex < surfaceState.runs.length - 1) {
        surfaceState.selectedRunIndex += 1;
        const runSelect = document.getElementById('forecast-run');
        if (runSelect) runSelect.value = String(surfaceState.selectedRunIndex);
        selectSurfaceRun(surfaceState.selectedRunIndex);
        return;
    } else {
        surfaceState.selectedRunIndex = 0;
        surfaceState.hourIndex = 0;
        const runSelect = document.getElementById('forecast-run');
        if (runSelect) runSelect.value = '0';
        selectSurfaceRun(0);
        return;
    }

    const timeSelect = document.getElementById('forecast-time');
    if (timeSelect) timeSelect.value = String(surfaceState.hourIndex);
    renderSurfaceForecast();
}

// ============================================
// TOOLTIPS
// ============================================

function initializeTooltips() {
    const tooltipTriggers = document.querySelectorAll('[data-tooltip]');
    let tooltip = document.getElementById('tooltip');

    if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.id = 'tooltip';
        tooltip.className = 'tooltip';
        tooltip.setAttribute('role', 'tooltip');
        document.body.appendChild(tooltip);
    }

    tooltipTriggers.forEach(trigger => {
        trigger.addEventListener('mouseenter', (e) => {
            tooltip.textContent = e.target.getAttribute('data-tooltip');
            tooltip.classList.add('show');

            const rect = e.target.getBoundingClientRect();
            const tooltipRect = tooltip.getBoundingClientRect();

            let left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);
            let top = rect.top - tooltipRect.height - 10;

            if (left < 10) left = 10;
            if (left + tooltipRect.width > window.innerWidth - 10) {
                left = window.innerWidth - tooltipRect.width - 10;
            }
            if (top < 10) {
                top = rect.bottom + 10;
                tooltip.classList.add('bottom');
            } else {
                tooltip.classList.remove('bottom');
            }

            tooltip.style.left = `${left}px`;
            tooltip.style.top = `${top}px`;
        });

        trigger.addEventListener('mouseleave', () => {
            tooltip.classList.remove('show');
        });
    });
}
