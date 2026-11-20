// Weather forecast page: the HRRR forecast map, and the GEFS ensemble charts in the expert
// drawer. The hazards pane and the town forecasts above them are weatherHazards.js and
// townForecast.js.
//
// Nothing here loads until it is wanted. The map's model run is 1.5 MB (about 145 KB on the
// wire), so it is fetched when the reader scrolls to the map; the ensemble charts are fetched
// when the drawer is opened. Times are Mountain time, with the model's own UTC hour beside a run.
//
// The map draws one layer as colour bands, like a contour map, with a time slider under it.
// What a layer is and how it is worked out is mapLayers.js; this file fetches, draws and
// listens. Every layer is computed here in the browser from the run already downloaded, so
// changing layer or hour asks the server for nothing.

import { runningTotalForHour, sliceFieldForHour } from './hrrrFields.js';
import {
    DEFAULT_LAYER,
    SCALES,
    availableLayers,
    fitGrid,
    formatValue,
    layerByKey,
    legendBands,
    rampColour,
    rasterise,
    valueAt,
} from './mapLayers.js';
import { firstHourFromNow, modelRunLabel, mountainTime } from './mountainTime.js';

const API_IMAGES = '/api/static/images';
const API_FORECASTS = '/api/static/forecasts';
const GEFS_VARIABLES = ['temp', 'wind', 'mslp', 'snow', 'solar'];
const HRRR_INDEX_FILE = 'forecast_hrrr_surface_layers_index.json';
const HRRR_RUN_PREFIX = 'forecast_hrrr_surface_layers_';

// Unit conversion helpers for the notes under the map. The run stays in SI.
const mmToIn = mm => mm / 25.4;
const msToMph = ms => ms * 2.23694;

// The picture of a field: this many pixels per grid step, at this opacity (0 to 255) so the
// greyed basemap's roads and names show through it.
const RASTER_FACTOR = 12;
const RASTER_ALPHA = 200;
// The thin line along each band edge: the page's text colour, mostly see-through.
const EDGE_ALPHA = 90;
// One forecast hour per step while playing; slower on a wall screen (?kiosk=1).
const PLAY_MS = 900;
const KIOSK_PLAY_MS = 5000;

let weatherMap;
let fieldOverlay;
let windLayerGroup;

let allMeteograms = [];
let currentModel = 'GEFS';
let currentInitTime = null;
let currentVariable = 'temp';

const surfaceState = {
    cache: new Map(),
    runs: [],
    selectedRunIndex: 0,
    payload: null,
    fit: null,          // where this run's grid sits on the map (mapLayers.fitGrid)
    layerKey: DEFAULT_LAYER,
    values: [],         // the field on the map now, in the layer's display units
    hourIndex: 0,
    fromHour: 0,        // the hour under way: earlier hours of the run are history
    showWind: true,
    playTimer: null,
    playMs: PLAY_MS
};

// Run `start` once, the first time `element` comes within a short scroll of the viewport.
function whenNear(element, start) {
    if (!element) return;
    if (typeof IntersectionObserver === 'undefined') {
        start();
        return;
    }
    const observer = new IntersectionObserver((entries) => {
        if (entries.some(entry => entry.isIntersecting)) {
            observer.disconnect();
            start();
        }
    }, { rootMargin: '200px 0px' });
    observer.observe(element);
}

let mapStarted = false;
async function startMap() {
    if (mapStarted) return;
    mapStarted = true;
    setupWeatherMap();
    await initializeSurfaceForecasts();
}

let meteogramsStarted = false;
function startMeteograms() {
    if (meteogramsStarted) return;
    meteogramsStarted = true;
    initializeMeteograms();
    setupMeteogramTabs();
    setupFullscreen();
}

document.addEventListener('DOMContentLoaded', function() {
    whenNear(document.getElementById('weather-map-section'), startMap);

    const drawer = document.getElementById('expert-drawer');
    if (drawer) {
        drawer.addEventListener('toggle', () => { if (drawer.open) startMeteograms(); });
        if (drawer.open) startMeteograms();
    }
});

// For a wall screen: ?kiosk=1 starts the map playing by itself, slowly, once it has loaded.
const kioskRequested = () => new URLSearchParams(window.location.search).get('kiosk') === '1';

// ============================================
// MAP SETUP
// ============================================

function setupWeatherMap() {
    const mapElement = document.getElementById('weather-map');
    if (!mapElement) return;

    // Quarter zoom steps let the map fit the Basin to its box instead of stopping a whole
    // zoom level short of it.
    weatherMap = L.map('weather-map', {
        zoomControl: true,
        preferCanvas: true,
        zoomSnap: 0.25
    }).setView([40.3033, -110.0153], 9);

    fieldOverlay = createFieldOverlay().addTo(weatherMap);
    windLayerGroup = L.layerGroup().addTo(weatherMap);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 15,
        attribution: '© OpenStreetMap contributors'
    }).addTo(weatherMap);

    // The value under the pointer, or under a tap.
    weatherMap.on('mousemove click', (event) => updateReadout(event.latlng));
    weatherMap.on('mouseout', () => updateReadout(null));
}

/**
 * A Leaflet layer that shows one picture (a canvas) stretched over the model grid.
 *
 * The grid is turned a few degrees from north, so the picture is a parallelogram on the map,
 * not an upright rectangle, and Leaflet's own image overlay cannot place it. This one sets a
 * CSS transform from three of the picture's corners. Panning and zooming then cost nothing:
 * the browser moves the picture; only a change of layer or hour redraws it.
 */
function createFieldOverlay() {
    const FieldOverlay = L.Layer.extend({
        onAdd(map) {
            this._canvas = L.DomUtil.create('canvas', 'field-raster leaflet-zoom-animated');
            this._canvas.width = 0;
            this._canvas.height = 0;
            map.getPane('overlayPane').appendChild(this._canvas);
            map.on('viewreset zoomend moveend resize', this._place, this);
            map.on('zoomanim', this._animate, this);
            this._place();
        },

        onRemove(map) {
            map.off('viewreset zoomend moveend resize', this._place, this);
            map.off('zoomanim', this._animate, this);
            this._canvas.remove();
        },

        /** Show `picture` ({ width, height, data }) with its corners at the three positions given. */
        setPicture(picture, corners) {
            this._canvas.width = picture.width;
            this._canvas.height = picture.height;
            this._canvas.getContext('2d').putImageData(new ImageData(picture.data, picture.width, picture.height), 0, 0);
            this._corners = corners;
            this._canvas.hidden = false;
            this._place();
        },

        clear() {
            this._corners = null;
            if (this._canvas) this._canvas.hidden = true;
        },

        // Pixel centres sit on grid points: the first and last pixel of a row are the grid's
        // first and last columns. `point` turns a [lat, lon] into a position in the map's layer.
        _transform(point) {
            const { width, height } = this._canvas;
            if (!this._corners || width < 2 || height < 2) return '';
            const topLeft = point(this._corners.topLeft);
            const topRight = point(this._corners.topRight);
            const bottomLeft = point(this._corners.bottomLeft);
            const a = (topRight.x - topLeft.x) / (width - 1);
            const b = (topRight.y - topLeft.y) / (width - 1);
            const c = (bottomLeft.x - topLeft.x) / (height - 1);
            const d = (bottomLeft.y - topLeft.y) / (height - 1);
            return `matrix(${a}, ${b}, ${c}, ${d}, ${topLeft.x - (a + c) / 2}, ${topLeft.y - (b + d) / 2})`;
        },

        _place() {
            if (!this._map || !this._canvas) return;
            this._canvas.style.transform = this._transform((position) => this._map.latLngToLayerPoint(position));
        },

        _animate(event) {
            if (!this._map || !this._canvas) return;
            this._canvas.style.transform = this._transform(
                (position) => this._map._latLngToNewLayerPoint(L.latLng(position), event.zoom, event.center));
        }
    });
    return new FieldOverlay();
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
    setForecastStatus('Loading the newest HRRR run…');
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
        if (kioskRequested()) {
            surfaceState.playMs = KIOSK_PLAY_MS;
            startPlaying();
        }
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

    const layerSelect = document.getElementById('weather-variable');
    if (layerSelect) {
        layerSelect.addEventListener('change', (event) => {
            surfaceState.layerKey = event.target.value;
            renderSurfaceForecast();
        });
    }

    const hourSlider = document.getElementById('forecast-hour');
    if (hourSlider) {
        // Dragging the slider is the reader taking over: stop playing.
        hourSlider.addEventListener('input', (event) => {
            stopPlaying();
            surfaceState.hourIndex = parseInt(event.target.value, 10);
            renderSurfaceForecast();
        });
    }

    const playButton = document.getElementById('forecast-play');
    if (playButton) {
        playButton.addEventListener('click', () => (surfaceState.playTimer ? stopPlaying() : startPlaying()));
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

    runSelect.replaceChildren(...runs.map((run, index) => {
        const option = document.createElement('option');
        option.value = String(index);
        option.textContent = run.init_time
            ? `HRRR ${formatRun(run.init_time)}`
            : nameToRunLabel(run.filename);
        return option;
    }));
    runSelect.value = '0';
}

async function selectSurfaceRun(index) {
    const run = surfaceState.runs[index];
    if (!run) return;

    surfaceState.selectedRunIndex = index;
    surfaceState.payload = await fetchSurfacePayload(run.filename);
    surfaceState.fit = fitGrid(surfaceState.payload.grid);
    // A run reaches the page hours after it starts: open on the hour under way, not on hour 0.
    surfaceState.hourIndex = firstHourFromNow(surfaceState.payload.valid_times, Date.now());
    surfaceState.fromHour = surfaceState.hourIndex;

    populateLayerSelector(surfaceState.payload);
    setupHourSlider(surfaceState.payload);
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

// The picker lists the layers this run can show. A layer whose field the producer has not
// sent is simply not there; when the field arrives, so does the layer.
function populateLayerSelector(payload) {
    const layerSelect = document.getElementById('weather-variable');
    if (!layerSelect) return;

    const layers = availableLayers(payload);
    if (!layers.some(layer => layer.key === surfaceState.layerKey)) {
        surfaceState.layerKey = layers.some(layer => layer.key === DEFAULT_LAYER) ? DEFAULT_LAYER : layers[0]?.key;
    }
    layerSelect.replaceChildren(...layers.map((layer) => {
        const option = document.createElement('option');
        option.value = layer.key;
        option.textContent = layer.label;
        return option;
    }));
    if (surfaceState.layerKey) layerSelect.value = surfaceState.layerKey;
    layerSelect.disabled = layers.length === 0;
}

// The slider runs from the hour under way to the end of the run: a run's first hours are
// already past when it reaches the page.
function setupHourSlider(payload) {
    const hourSlider = document.getElementById('forecast-hour');
    if (!hourSlider || !payload) return;
    const last = Math.max(0, (Array.isArray(payload.valid_times) ? payload.valid_times.length : 1) - 1);
    hourSlider.min = String(Math.min(surfaceState.fromHour, last));
    hourSlider.max = String(last);
    hourSlider.value = String(surfaceState.hourIndex);
}

function startPlaying() {
    if (surfaceState.playTimer || !surfaceState.payload) return;
    surfaceState.playTimer = setInterval(advanceForecastFrame, surfaceState.playMs);
    drawPlayButton();
}

function stopPlaying() {
    if (!surfaceState.playTimer) return;
    clearInterval(surfaceState.playTimer);
    surfaceState.playTimer = null;
    drawPlayButton();
}

function drawPlayButton() {
    const playButton = document.getElementById('forecast-play');
    if (!playButton) return;
    const playing = Boolean(surfaceState.playTimer);
    playButton.setAttribute('aria-pressed', String(playing));
    const icon = playButton.querySelector('i');
    if (icon) icon.className = playing ? 'fas fa-pause' : 'fas fa-play';
    const label = playButton.querySelector('.play-label');
    if (label) label.textContent = playing ? 'Pause' : 'Play';
}

// One hour on; after the run's last hour, back to the hour under way.
function advanceForecastFrame() {
    const payload = surfaceState.payload;
    if (!payload) return;
    const last = payload.valid_times.length - 1;
    surfaceState.hourIndex = surfaceState.hourIndex < last ? surfaceState.hourIndex + 1 : Math.min(surfaceState.fromHour, last);
    renderSurfaceForecast();
}

// ── Colours ────────────────────────────────────────────────────────────────────────────

// A ramp's steps as [r, g, b], read once from the theme tokens (--scale-<name>-1 to -5, or
// the single --scale-freezing). No colour is written in this file.
const rampCache = new Map();
function rampSteps(name) {
    if (!rampCache.has(name)) {
        const tokens = name === 'freezing' ? ['--scale-freezing'] : [1, 2, 3, 4, 5].map(step => `--scale-${name}-${step}`);
        rampCache.set(name, tokens.map(tokenRgb).filter(Boolean));
    }
    return rampCache.get(name);
}

/** A theme colour token as [r, g, b], or null if the page does not define it. */
function tokenRgb(token) {
    const probe = document.createElement('span');
    probe.hidden = true;
    document.body.appendChild(probe);
    probe.style.color = `var(${token})`;
    const parts = token && getComputedStyle(probe).color.match(/[\d.]+/g);
    probe.remove();
    return parts && parts.length >= 3 ? parts.slice(0, 3).map(Number) : null;
}

let inkColour;
const textColour = () => (inkColour === undefined ? (inkColour = tokenRgb('--color-text')) : inkColour);

/** The [r, g, b] of one band's colour, or null for a band that is left clear. */
function bandRgb(colour) {
    return colour ? rampColour(rampSteps(colour.ramp), colour.t) : null;
}

// ── Drawing ────────────────────────────────────────────────────────────────────────────

function renderSurfaceForecast() {
    const payload = surfaceState.payload;
    const layer = layerByKey(surfaceState.layerKey);
    if (!payload || !weatherMap || !layer) {
        renderNoSurfaceData('HRRR surface layer data unavailable');
        return;
    }
    if (!surfaceState.fit) {
        renderNoSurfaceData('This run\'s grid could not be placed on the map');
        return;
    }

    const scale = SCALES[layer.scale];
    const [rows, cols] = payload.grid.shape;
    const values = layer.values(payload, surfaceState.hourIndex, surfaceState.fromHour);
    surfaceState.values = values;
    if (!values.some(value => Number.isFinite(value))) {
        renderNoSurfaceData(`${layer.label}: this run has no values for this hour`);
        return;
    }

    const colours = scale.colours.map((colour) => {
        const rgb = bandRgb(colour);
        return rgb ? [...rgb, RASTER_ALPHA] : null;
    });
    const ink = textColour();
    fieldOverlay.setPicture(
        rasterise(values, rows, cols, RASTER_FACTOR, scale, colours, ink ? [...ink, EDGE_ALPHA] : null),
        surfaceState.fit.corners);

    if (windLayerGroup) windLayerGroup.clearLayers();
    // Arrows belong to one hour; a layer that covers the whole run has no one hour to show.
    if (surfaceState.showWind && !layer.wholeRun) {
        renderWindVectors(payload, surfaceState.hourIndex);
    }

    fitMapToPayload(payload);
    updateTimeControls(payload, layer);
    updateCurrentDisplay(payload, layer);
    updateLegend(layer, scale, values);
    updateSpecialConditions(payload);
    updateMapSource(payload);
    updateReadout(null);

    const note = document.getElementById('layer-note');
    if (note) note.textContent = `${layer.note} Colour bands are drawn between model points about 6 km apart, so nothing narrower than that shows.`;
    setForecastStatus(`Showing ${layer.label.toLowerCase()}${layer.wholeRun ? `, ${runWindowLabel(payload)}` : ` for ${hourLabel(payload)}`}.`);
}

const hourLabel = (payload) => {
    const validTime = payload.valid_times?.[surfaceState.hourIndex];
    return validTime ? formatValidTime(validTime) : 'the selected hour';
};

/** "11 PM to Fri 8 AM": the hours a whole-run layer covers. */
function runWindowLabel(payload) {
    const times = Array.isArray(payload.valid_times) ? payload.valid_times : [];
    const from = times[Math.min(surfaceState.fromHour, times.length - 1)];
    const to = times.at(-1);
    return from && to ? `${formatValidTime(from)} to ${formatValidTime(to)}` : 'now to the end of the run';
}

// The slider and its label. A layer that covers the whole run does not move with the slider,
// so the slider and the play button are switched off while one is showing.
function updateTimeControls(payload, layer) {
    const hourSlider = document.getElementById('forecast-hour');
    const hourText = document.getElementById('forecast-hour-label');
    const playButton = document.getElementById('forecast-play');
    const wholeRun = Boolean(layer.wholeRun);
    if (wholeRun) stopPlaying();
    if (hourSlider) {
        hourSlider.disabled = wholeRun;
        hourSlider.value = String(surfaceState.hourIndex);
        hourSlider.setAttribute('aria-valuetext', hourLabel(payload));
    }
    if (playButton) playButton.disabled = wholeRun;
    if (hourText) {
        const hoursOn = surfaceState.hourIndex - surfaceState.fromHour;
        const ahead = hoursOn <= 0 ? 'the hour under way' : `${hoursOn} hour${hoursOn === 1 ? '' : 's'} on`;
        hourText.textContent = wholeRun ? runWindowLabel(payload) : `${hourLabel(payload)} (${ahead})`;
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

            const arrow = document.createElement('div');
            arrow.className = 'wind-vector-arrow';
            arrow.textContent = '↑';
            arrow.style.transform = `rotate(${(Math.atan2(u, v) * 180) / Math.PI}deg)`;
            const icon = L.divIcon({ className: 'wind-vector-icon', html: arrow, iconSize: [18, 18], iconAnchor: [9, 9] });

            const marker = L.marker([lat, lon], { icon, keyboard: false });
            marker.bindTooltip(`Wind: ${msToMph(speed).toFixed(0)} mph`);
            windLayerGroup.addLayer(marker);
        }
    }
}

function fitMapToPayload(payload) {
    if (!weatherMap || weatherMap._surfaceBoundsSet) return;
    // The box asked for, where the file gives it: the grid actually sent runs a little past it
    // on every side, and fitting to that leaves the Basin small in the middle of the map.
    const bbox = payload.bbox?.requested?.sw ? payload.bbox.requested : payload.bbox?.actual;
    if (!bbox?.sw || !bbox?.ne) return;
    weatherMap.invalidateSize();

    weatherMap.fitBounds([
        [bbox.sw[0], bbox.sw[1]],
        [bbox.ne[0], bbox.ne[1]]
    ], { padding: [15, 15] });
    weatherMap._surfaceBoundsSet = true;
}

function updateCurrentDisplay(payload, layer) {
    const title = document.getElementById('current-variable');
    const time = document.getElementById('current-time');
    if (title) title.textContent = layer.label;
    if (time) time.textContent = layer.wholeRun ? runWindowLabel(payload) : hourLabel(payload);
}

// The value under the pointer (or under a tap), read from the same blended field the colours
// are drawn from. `position` is null when the pointer leaves the map.
function updateReadout(position) {
    const readout = document.getElementById('map-readout');
    if (!readout) return;
    const layer = layerByKey(surfaceState.layerKey);
    const payload = surfaceState.payload;
    if (!position || !layer || !payload || !surfaceState.fit || !surfaceState.values.length) {
        readout.textContent = 'Point at the map, or tap it, to read a value.';
        return;
    }
    const [rows, cols] = payload.grid.shape;
    const { col, row } = surfaceState.fit.toGrid(position.lat, position.lng);
    const value = valueAt(surfaceState.values, rows, cols, col, row);
    readout.textContent = Number.isFinite(value)
        ? `${layer.label}: ${formatValue(SCALES[layer.scale], value)}`
        : 'Outside the area the model run covers.';
}

function updateLegend(layer, scale, values) {
    const legend = document.getElementById('weather-legend');
    if (!legend) return;

    const title = document.createElement('div');
    title.className = 'map-legend-title';
    title.textContent = layer.label;

    const bands = legendBands(scale, values);
    if (bands.length === 0) {
        const none = document.createElement('p');
        none.className = 'map-legend-none';
        none.textContent = `Under ${scale.edges[0]} ${scale.unit} everywhere on the map.`;
        legend.replaceChildren(title, none);
        return;
    }

    const list = document.createElement('ul');
    list.className = 'map-legend-scale';
    list.append(...bands.map((band) => {
        const row = document.createElement('li');
        row.className = 'map-legend-row';
        const swatch = document.createElement('span');
        swatch.className = 'map-legend-swatch';
        swatch.setAttribute('aria-hidden', 'true');
        const rgb = bandRgb(band.colour);
        if (rgb) swatch.style.backgroundColor = `rgb(${rgb.join(', ')})`;
        row.append(swatch, band.label);
        return row;
    }));
    legend.replaceChildren(title, list);
}

// What stands out across the map at the selected hour. Each line is a count or a peak over the
// grid points shown, said as that: no Basin-wide average, which would describe no real place.
function updateSpecialConditions(payload) {
    const conditions = document.getElementById('special-conditions');
    if (!conditions) return;

    const notesTitle = document.getElementById('map-notes-title');
    if (notesTitle) notesTitle.textContent = `Across the map at ${hourLabel(payload)}`;

    const freezingFraction = fractionBelowValue(sliceFieldForHour(payload, 'temperature_2m_c', surfaceState.hourIndex), 0);
    const maxWind = maxSpeed(
        sliceFieldForHour(payload, 'wind_u_10m_ms', surfaceState.hourIndex),
        sliceFieldForHour(payload, 'wind_v_10m_ms', surfaceState.hourIndex)
    );
    // Snow is a total since the run began (hrrrFields.js); rain is a true hourly amount.
    const snowTotal = maxFinite(runningTotalForHour(payload, 'snowfall_1h_mm', surfaceState.hourIndex));
    const maxRain = maxFinite(sliceFieldForHour(payload, 'rainfall_1h_mm', surfaceState.hourIndex));

    const items = [];
    if (freezingFraction >= 0.5) {
        items.push(renderConditionBlock('alert', 'Freezing:', `${Math.round(freezingFraction * 100)}% of the map's grid points are at or below 32°F.`));
    }
    if (mmToIn(snowTotal) >= 1.0) {
        items.push(renderConditionBlock('alert', 'Snow:', `up to ${mmToIn(snowTotal).toFixed(1)} in since this run began, somewhere on the map.`));
    }
    if (maxRain >= 0.5) {
        items.push(renderConditionBlock('note', 'Rain:', `up to ${mmToIn(maxRain).toFixed(2)} in/hr somewhere on the map.`));
    }
    if (maxWind >= 10.0) {
        items.push(renderConditionBlock('note', 'Wind:', `up to ${msToMph(maxWind).toFixed(0)} mph somewhere on the map.`));
    }

    if (!items.length) {
        items.push(renderConditionBlock('note', 'Quiet hour:', 'no strong rain, snow, widespread freezing or wind shows on the map.'));
    }

    conditions.replaceChildren(...items);
}

// Where the map's data came from and how old it is. No "next update": runs reach this page in
// blocks through the day, and a guessed time would be wrong most of the time.
function updateMapSource(payload) {
    const source = document.getElementById('map-source');
    if (!source) return;
    const init = Date.parse(payload.init_time);
    if (!Number.isFinite(init)) {
        source.textContent = 'HRRR model forecast.';
        return;
    }
    const now = Date.now();
    const age = Math.max(0, Math.round((now - init) / 3600000));
    const built = Date.parse(payload.generated_at);
    const received = Number.isFinite(built) ? `, prepared ${mountainTime(built, now)}` : '';
    const stride = Number.isFinite(payload.stride) ? payload.stride : 1;
    const grid = stride > 1
        ? `Shown on a ${stride * 3} km grid (every ${stride === 2 ? '2nd' : `${stride}th`} point of the 3 km model).`
        : 'Shown on the model\'s 3 km grid.';
    source.textContent = `HRRR model run from ${modelRunLabel(init)}, ${age} hour${age === 1 ? '' : 's'} old${received}. `
        + `${grid} Runs reach this page in blocks through the day, so the newest is usually 3 to 6 hours old.`;
}

function renderNoSurfaceData(message) {
    stopPlaying();
    surfaceState.values = [];
    if (fieldOverlay) fieldOverlay.clear();
    if (windLayerGroup) windLayerGroup.clearLayers();

    const legend = document.getElementById('weather-legend');
    if (legend) {
        const title = document.createElement('div');
        title.className = 'map-legend-title';
        title.textContent = 'HRRR forecast map';
        const none = document.createElement('p');
        none.className = 'map-legend-none';
        none.textContent = message;
        legend.replaceChildren(title, none);
    }

    const title = document.getElementById('current-variable');
    const time = document.getElementById('current-time');
    if (title) title.textContent = 'HRRR forecast map';
    if (time) time.textContent = message;
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

// One note under the map: a bold word and a sentence, with a left rule. Built from text nodes.
function renderConditionBlock(type, title, description) {
    const note = document.createElement('p');
    note.className = 'map-note';
    note.dataset.kind = type;
    const strong = document.createElement('strong');
    strong.textContent = title;
    note.append(strong, ` ${description}`);
    return note;
}

function nameToRunLabel(filename) {
    const match = filename.match(/_(\d{8})_(\d{4})Z\.json$/);
    if (!match) return filename;
    return formatInitTime(`${match[1]}-${match[2]}`);
}

// A model run: "Thu 8 PM (03Z)". A forecast hour on the map: "Fri 6 AM", or "6 AM" today.
function formatRun(value) {
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? modelRunLabel(ms) : String(value);
}

function formatValidTime(value) {
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? mountainTime(ms, Date.now()) : String(value);
}

function setForecastStatus(message) {
    const status = document.getElementById('forecast-status');
    if (status) status.textContent = message;
}
