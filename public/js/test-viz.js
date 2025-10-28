import { fetchTimeSeriesData } from './api.js';

class TimeSeriesViewer {
    constructor() {
        this.data = null;
        this.metadata = null;
        this.map = null;
        this.markers = {};
        this.selectedStations = [];
        this.maxStations = 4;
        this.darkMode = false;

        // Station coordinates (Uintah Basin)
        this.stationData = {
            'UBHSP': { name: 'Horsepool', lat: 40.1438, lng: -109.4686 },
            'UBCSP': { name: 'Castle Peak', lat: 40.1511, lng: -109.3258 },
            'UB7ST': { name: 'Seven Sisters', lat: 40.0294, lng: -109.3956 },
            'KVEL': { name: 'Vernal', lat: 40.4409, lng: -109.5099 },
            'K74V': { name: 'Roosevelt', lat: 40.2788, lng: -110.0513 },
            'UTMYT': { name: 'Myton', lat: 40.1947, lng: -110.0636 },
            'UCC34': { name: 'Bluebell', lat: 40.1697, lng: -110.2489 },
            'BUNUT': { name: 'Roosevelt Alt', lat: 40.2994, lng: -109.9889 },
            'UTDAN': { name: 'Daniels Summit', lat: 40.3553, lng: -111.3208 },
            'UTICS': { name: 'Indian Canyon', lat: 39.9389, lng: -110.7542 },
            'UTSLD': { name: 'Soldier Summit', lat: 39.9336, lng: -111.0531 },
            'K40U': { name: 'Manila', lat: 40.9878, lng: -109.7233 }
        };

        this.init();
    }

    init() {
        // Set default date range to last 24 hours
        this.setPreset('24h');

        // Add date input listeners for validation and auto-adjustment
        document.getElementById('start-date').addEventListener('change', () => {
            this.onStartDateChange();
            this.updateSummaryBar();
        });
        document.getElementById('end-date').addEventListener('change', () => {
            this.validateDateRange();
            this.updateSummaryBar();
        });

        // Add variable checkbox listeners
        document.querySelectorAll('#variable-checkboxes input[type="checkbox"]').forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                this.updateVariableDisplay();
                this.updateSummaryBar();
            });
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            const dropdown = document.getElementById('variable-dropdown');
            const btn = document.getElementById('variable-select-btn');
            if (dropdown && btn && dropdown.style.display === 'block') {
                if (!dropdown.contains(e.target) && !btn.contains(e.target)) {
                    this.toggleVariableDropdown();
                }
            }
        });

        // Add station search listener
        const searchInput = document.getElementById('station-search');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => this.handleStationSearch(e.target.value));
        }

        // Initialize map
        this.initializeMap();

        // Check for saved dark mode preference
        const savedDarkMode = localStorage.getItem('darkMode') === 'true';
        if (savedDarkMode) {
            this.toggleDarkMode();
        }

        // Check for URL parameters and restore state
        this.loadStateFromURL();

        // Initialize variable display
        this.updateVariableDisplay();

        // Add window resize handler for D3 chart responsiveness
        let resizeTimeout;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                if (this.d3Chart && this.d3Chart.createChart) {
                    this.d3Chart.createChart();
                }
            }, 250);
        });
    }

    /**
     * Save current state to URL
     */
    saveStateToURL() {
        const state = {
            start: document.getElementById('start-date').value,
            end: document.getElementById('end-date').value,
            stations: this.selectedStations,
            variables: this.getSelectedVariables()
        };

        const encoded = btoa(JSON.stringify(state));
        const url = new URL(window.location);
        url.searchParams.set('config', encoded);
        window.history.pushState({}, '', url);
    }

    /**
     * Load state from URL
     */
    loadStateFromURL() {
        const url = new URL(window.location);
        const config = url.searchParams.get('config');

        if (!config) return;

        try {
            const state = JSON.parse(atob(config));

            // Restore dates
            if (state.start) document.getElementById('start-date').value = state.start;
            if (state.end) document.getElementById('end-date').value = state.end;

            // Restore stations
            if (state.stations && Array.isArray(state.stations)) {
                state.stations.forEach(stid => {
                    if (this.stationData[stid]) {
                        this.selectStation(stid);
                    }
                });
            }

            // Restore variables
            if (state.variables && Array.isArray(state.variables)) {
                document.querySelectorAll('#variable-checkboxes input[type="checkbox"]').forEach(checkbox => {
                    checkbox.checked = state.variables.includes(checkbox.value);
                });
            }

            // Update summary
            this.updateSummaryBar();

        } catch (error) {
            console.error('Failed to load state from URL:', error);
        }
    }

    /**
     * Copy shareable link to clipboard
     */
    copyShareLink() {
        this.saveStateToURL();
        const url = window.location.href;

        navigator.clipboard.writeText(url).then(() => {
            // Show success message
            const message = document.createElement('div');
            message.className = 'share-success-message';
            message.innerHTML = '<i class="fas fa-check-circle"></i> Shareable link copied to clipboard!';
            document.body.appendChild(message);

            setTimeout(() => {
                message.classList.add('fade-out');
                setTimeout(() => message.remove(), 300);
            }, 3000);
        }).catch(err => {
            console.error('Failed to copy link:', err);
            alert('Failed to copy link. Please copy manually from the address bar.');
        });
    }

    /**
     * Toggle dark mode
     */
    toggleDarkMode() {
        this.darkMode = !this.darkMode;
        const body = document.body;
        const toggle = document.getElementById('dark-mode-toggle');
        const icon = toggle.querySelector('i');

        if (this.darkMode) {
            body.classList.add('dark-mode');
            icon.classList.remove('fa-moon');
            icon.classList.add('fa-sun');
            localStorage.setItem('darkMode', 'true');
        } else {
            body.classList.remove('dark-mode');
            icon.classList.remove('fa-sun');
            icon.classList.add('fa-moon');
            localStorage.setItem('darkMode', 'false');
        }
    }

    /**
     * Handle station search
     */
    handleStationSearch(query) {
        const lowerQuery = query.toLowerCase().trim();

        if (!lowerQuery) {
            // Reset all markers to default state
            Object.entries(this.markers).forEach(([stid, marker]) => {
                marker.setOpacity(1);
            });
            return;
        }

        // Filter markers based on search
        Object.entries(this.stationData).forEach(([stid, station]) => {
            const marker = this.markers[stid];
            const matchesName = station.name.toLowerCase().includes(lowerQuery);
            const matchesId = stid.toLowerCase().includes(lowerQuery);

            if (matchesName || matchesId) {
                marker.setOpacity(1);
                // Highlight matching station
                if (!this.selectedStations.includes(stid)) {
                    marker.getElement().querySelector('.station-marker').style.transform = 'scale(1.2)';
                }
            } else {
                marker.setOpacity(0.3);
                marker.getElement().querySelector('.station-marker').style.transform = 'scale(1)';
            }
        });
    }

    /**
     * Toggle variable dropdown
     */
    toggleVariableDropdown() {
        const dropdown = document.getElementById('variable-dropdown');
        const btn = document.getElementById('variable-select-btn');
        const isOpen = dropdown.style.display === 'block';

        if (isOpen) {
            dropdown.style.display = 'none';
            btn.setAttribute('aria-expanded', 'false');
        } else {
            dropdown.style.display = 'block';
            btn.setAttribute('aria-expanded', 'true');
        }
    }

    /**
     * Update variable display button text
     */
    updateVariableDisplay() {
        const selected = this.getSelectedVariables();
        const display = document.getElementById('variable-select-display');

        if (selected.length === 0) {
            display.textContent = 'Select variables...';
        } else if (selected.length === 1) {
            display.textContent = this.getVariableDisplayName(selected[0]);
        } else if (selected.length === 2) {
            display.textContent = `${this.getVariableDisplayName(selected[0])}, ${this.getVariableDisplayName(selected[1])}`;
        } else {
            const first = this.getVariableDisplayName(selected[0]);
            const second = this.getVariableDisplayName(selected[1]);
            const count = selected.length - 2;
            display.textContent = `${first}, ${second} +${count} more`;
        }
    }

    /**
     * Handle start date change - auto-adjust end date to maintain duration
     */
    onStartDateChange() {
        const startInput = document.getElementById('start-date').value;
        const endInput = document.getElementById('end-date').value;

        if (!startInput || !endInput) {
            this.validateDateRange();
            return;
        }

        const oldStart = this.lastStartDate ? new Date(this.lastStartDate) : null;
        const newStart = new Date(startInput);
        const oldEnd = new Date(endInput);

        // Calculate the current duration if we have a previous start date
        if (oldStart) {
            const durationMs = oldEnd - oldStart;

            // Set new end date to maintain the same duration
            const newEnd = new Date(newStart.getTime() + durationMs);

            // Format for datetime-local input
            const formatDatetime = (date) => {
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                const hours = String(date.getHours()).padStart(2, '0');
                const minutes = String(date.getMinutes()).padStart(2, '0');
                return `${year}-${month}-${day}T${hours}:${minutes}`;
            };

            document.getElementById('end-date').value = formatDatetime(newEnd);
        }

        // Store current start date for next change
        this.lastStartDate = startInput;

        this.validateDateRange();
    }

    /**
     * Initialize Leaflet map with station markers
     */
    initializeMap() {
        // Center on Uintah Basin
        const centerLat = 40.3;
        const centerLng = -109.9;

        this.map = L.map('station-map').setView([centerLat, centerLng], 9);

        // Add OpenStreetMap tiles
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 19
        }).addTo(this.map);

        // Add station markers
        this.addStationMarkers();

        // No default station selection - user must select manually
    }

    /**
     * Add clickable markers for all stations
     */
    addStationMarkers() {
        Object.entries(this.stationData).forEach(([stid, station]) => {
            // Create custom div icon
            const icon = L.divIcon({
                className: 'station-marker-container',
                html: `<div class="station-marker" data-stid="${stid}"></div>`,
                iconSize: [20, 20],
                iconAnchor: [10, 10]
            });

            const marker = L.marker([station.lat, station.lng], { icon: icon })
                .addTo(this.map)
                .bindPopup(`
                    <strong>${station.name}</strong><br>
                    Station ID: ${stid}<br>
                    <em>Click to select/deselect</em>
                `);

            // Click handler
            marker.on('click', () => {
                this.toggleStationSelection(stid);
            });

            this.markers[stid] = marker;
        });
    }

    /**
     * Toggle station selection
     */
    toggleStationSelection(stid) {
        const index = this.selectedStations.indexOf(stid);

        if (index > -1) {
            // Deselect
            this.deselectStation(stid);
        } else {
            // Select (if under limit)
            if (this.selectedStations.length < this.maxStations) {
                this.selectStation(stid);
            } else {
                alert(`Maximum ${this.maxStations} stations allowed. Please deselect a station first.`);
            }
        }
    }

    /**
     * Select a station
     */
    selectStation(stid) {
        if (this.selectedStations.includes(stid)) return;

        this.selectedStations.push(stid);
        this.updateMarkerStyle(stid, true);
        this.updateSelectionCounter();
        this.updateMarkerStates();
    }

    /**
     * Deselect a station
     */
    deselectStation(stid) {
        const index = this.selectedStations.indexOf(stid);
        if (index > -1) {
            this.selectedStations.splice(index, 1);
            this.updateMarkerStyle(stid, false);
            this.updateSelectionCounter();
            this.updateMarkerStates();
        }
    }

    /**
     * Clear all station selections
     */
    clearStationSelection() {
        this.selectedStations.forEach(stid => {
            this.updateMarkerStyle(stid, false);
        });
        this.selectedStations = [];
        this.updateSelectionCounter();
        this.updateMarkerStates();
    }

    /**
     * Reset all selections and form inputs
     */
    resetAll() {
        // Reset date range to last 24 hours
        this.setPreset('24h');

        // Clear station selections
        this.clearStationSelection();

        // Reset all variable checkboxes to defaults (only Temperature checked)
        document.querySelectorAll('#variable-checkboxes input[type="checkbox"]').forEach(checkbox => {
            checkbox.checked = checkbox.value === 'air_temp';
        });

        // Clear search input
        const searchInput = document.getElementById('station-search');
        if (searchInput) {
            searchInput.value = '';
            this.handleStationSearch('');
        }

        // Hide plots
        document.getElementById('stats-section').style.display = 'none';
        document.getElementById('timeseries-section').style.display = 'none';

        // Reset data info banner
        document.getElementById('data-info').innerHTML = `
            <i class="fas fa-info-circle"></i> Select date range, stations, and variables above, then click "Fetch & Plot Data"
        `;

        // Update summary bar
        this.updateSummaryBar();

        // Update variable display
        this.updateVariableDisplay();

        // Hide warnings
        this.hideWarning();
    }

    /**
     * Update marker visual style
     */
    updateMarkerStyle(stid, selected) {
        const marker = this.markers[stid];
        if (!marker) return;

        const markerElement = marker.getElement().querySelector('.station-marker');
        if (selected) {
            markerElement.classList.add('selected');
        } else {
            markerElement.classList.remove('selected');
        }
    }

    /**
     * Update all marker states (disable/enable based on limit)
     */
    updateMarkerStates() {
        const limitReached = this.selectedStations.length >= this.maxStations;

        Object.keys(this.markers).forEach(stid => {
            const markerElement = this.markers[stid].getElement().querySelector('.station-marker');

            if (limitReached && !this.selectedStations.includes(stid)) {
                markerElement.classList.add('disabled');
            } else {
                markerElement.classList.remove('disabled');
            }
        });
    }

    /**
     * Update selection counter display
     */
    updateSelectionCounter() {
        const counter = document.getElementById('selection-count');
        const count = this.selectedStations.length;

        counter.textContent = `${count}/${this.maxStations} stations selected`;

        if (count >= this.maxStations) {
            counter.classList.add('limit-reached');
        } else {
            counter.classList.remove('limit-reached');
        }

        // Update summary bar
        this.updateSummaryBar();
    }

    /**
     * Update the selection summary bar
     */
    updateSummaryBar() {
        const summaryBar = document.getElementById('selection-summary');
        const startDate = document.getElementById('start-date').value;
        const endDate = document.getElementById('end-date').value;
        const stationCount = this.selectedStations.length;
        const variables = this.getSelectedVariables();

        // Show summary bar if any selections are made
        if (startDate && endDate && (stationCount > 0 || variables.length > 0)) {
            summaryBar.style.display = 'flex';

            // Format dates
            const formatDate = (dateStr) => {
                if (!dateStr) return '—';
                const date = new Date(dateStr);
                return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
            };

            document.getElementById('summary-date-range').textContent =
                `${formatDate(startDate)} – ${formatDate(endDate)}`;
            document.getElementById('summary-stations').textContent = stationCount;

            // Variable list
            const varNames = variables.map(v => this.getVariableDisplayName(v)).join(', ');
            document.getElementById('summary-variables').textContent = varNames || '—';
        } else {
            summaryBar.style.display = 'none';
        }
    }

    /**
     * Set preset date ranges
     */
    setPreset(preset) {
        const now = new Date();
        const endDate = now;
        let startDate;

        if (preset === '24h') {
            startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        } else if (preset === '7d') {
            startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        }

        // Format for datetime-local input (YYYY-MM-DDTHH:mm)
        const formatDatetime = (date) => {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            return `${year}-${month}-${day}T${hours}:${minutes}`;
        };

        document.getElementById('start-date').value = formatDatetime(startDate);
        document.getElementById('end-date').value = formatDatetime(endDate);

        // Store the start date for auto-adjustment
        this.lastStartDate = formatDatetime(startDate);

        this.validateDateRange();
    }

    /**
     * Validate that date range is <= 7 days
     */
    validateDateRange() {
        const startInput = document.getElementById('start-date').value;
        const endInput = document.getElementById('end-date').value;

        if (!startInput || !endInput) {
            this.showWarning('Please select both start and end dates');
            return false;
        }

        const start = new Date(startInput);
        const end = new Date(endInput);

        const daysDiff = (end - start) / (1000 * 60 * 60 * 24);

        if (daysDiff < 0) {
            this.showWarning('Start date must be before end date');
            return false;
        }

        if (daysDiff > 7) {
            this.showWarning(`Date range is ${daysDiff.toFixed(1)} days. Maximum allowed is 7 days.`);
            return false;
        }

        this.hideWarning();
        return true;
    }

    showWarning(message) {
        const warning = document.getElementById('date-range-warning');
        document.getElementById('warning-text').textContent = message;
        warning.style.display = 'block';
    }

    hideWarning() {
        document.getElementById('date-range-warning').style.display = 'none';
    }

    /**
     * Get selected stations from map
     */
    getSelectedStations() {
        return this.selectedStations;
    }

    /**
     * Get selected variables from checkboxes
     */
    getSelectedVariables() {
        const checkboxes = document.querySelectorAll('#variable-checkboxes input[type="checkbox"]:checked');
        return Array.from(checkboxes).map(cb => cb.value);
    }

    /**
     * Fetch data and create all visualizations
     */
    async fetchAndPlot() {
        try {
            // Validate date range
            if (!this.validateDateRange()) {
                return;
            }

            // Get selections
            const stations = this.getSelectedStations();
            const variables = this.getSelectedVariables();

            if (stations.length === 0) {
                this.showError('Please select at least one station');
                return;
            }

            if (variables.length === 0) {
                this.showError('Please select at least one variable');
                return;
            }

            // Get date range
            const startDate = new Date(document.getElementById('start-date').value);
            const endDate = new Date(document.getElementById('end-date').value);

            // Show loading state
            this.showLoading();

            // Fetch data from API
            console.log('Fetching data:', { stations, variables, startDate, endDate });
            const result = await fetchTimeSeriesData(stations, variables, startDate, endDate);

            this.data = result.data;
            this.metadata = result.metadata;

            console.log('Data received:', this.data);

            // Update UI
            this.updateDataInfo(result.metadata, result.warnings);
            this.createStatisticsCards();

            // Show plot sections FIRST so container has width
            document.getElementById('stats-section').style.display = 'block';
            document.getElementById('timeseries-section').style.display = 'block';

            // Then create the plot after the container is visible
            this.createTimeSeriesPlot();

            // Hide loading overlay
            this.hideLoading();

        } catch (error) {
            console.error('Error fetching data:', error);
            this.showError(`Failed to fetch data: ${error.message}`);
            this.hideLoading();
        }
    }

    showLoading() {
        // Show loading overlay
        const loadingOverlay = document.getElementById('loading-overlay');
        if (loadingOverlay) {
            loadingOverlay.classList.add('active');
        }

        document.getElementById('data-info').innerHTML = `
            <i class="fas fa-spinner fa-spin"></i> Fetching data from Synoptic API...
        `;
    }

    hideLoading() {
        // Hide loading overlay
        const loadingOverlay = document.getElementById('loading-overlay');
        if (loadingOverlay) {
            loadingOverlay.classList.remove('active');
        }
    }

    showError(message) {
        this.hideLoading();
        document.getElementById('data-info').innerHTML = `
            <div class="error-message" style="background: #fee2e2; padding: 10px; border-radius: 4px; color: #dc2626;">
                <i class="fas fa-exclamation-triangle"></i>
                <strong>Error:</strong> ${message}
            </div>
        `;
    }

    updateDataInfo(metadata, warnings) {
        const { stations, variables, start, end, dataPoints, successfulStations, failedStations, skippedStations } = metadata;

        let warningHtml = '';
        if (failedStations && failedStations.length > 0) {
            warningHtml += `<br><i class="fas fa-exclamation-triangle" style="color: #e67e22;"></i> <strong>Failed stations:</strong> ${failedStations.join(', ')}`;
        }
        if (skippedStations && skippedStations.length > 0) {
            warningHtml += `<br><i class="fas fa-info-circle" style="color: #3498db;"></i> <strong>Unavailable stations:</strong> ${skippedStations.join(', ')} (inactive or no data for this period)`;
        }

        document.getElementById('data-info').innerHTML = `
            <i class="fas fa-check-circle" style="color: #27ae60;"></i>
            <strong>Data loaded successfully!</strong><br>
            <i class="fas fa-broadcast-tower"></i> Stations: <strong>${successfulStations || stations.length}</strong> successful
            ${stations.length > (successfulStations || stations.length) ? ` (${stations.length} requested)` : ''} |
            <i class="fas fa-chart-line"></i> Variables: <strong>${variables.length}</strong> |
            <i class="fas fa-database"></i> Data Points: <strong>${dataPoints.toLocaleString()}</strong> |
            <i class="fas fa-calendar"></i> Range: <strong>${new Date(start).toLocaleString()}</strong> to <strong>${new Date(end).toLocaleString()}</strong>
            ${warningHtml}
        `;
    }

    /**
     * Create statistical summary cards
     */
    createStatisticsCards() {
        const container = document.getElementById('stats-cards');
        container.innerHTML = '';

        if (!this.data || !this.data.stations) return;

        const stats = [];

        // Calculate statistics for each station/variable combination
        Object.entries(this.data.stations).forEach(([stid, station]) => {
            Object.entries(station.variables || {}).forEach(([varName, varData]) => {
                const values = varData.values.filter(v => v !== null && v !== undefined);

                if (values.length > 0) {
                    const min = Math.min(...values);
                    const max = Math.max(...values);
                    const avg = values.reduce((a, b) => a + b, 0) / values.length;
                    const latest = values[values.length - 1];

                    stats.push({
                        station: station.name || stid,
                        variable: this.getVariableDisplayName(varName),
                        units: varData.units,
                        min,
                        max,
                        avg,
                        latest,
                        count: values.length
                    });
                }
            });
        });

        // Display cards for each unique station
        const uniqueStations = [...new Set(stats.map(s => s.station))];

        uniqueStations.forEach(stationName => {
            const stationStats = stats.filter(s => s.station === stationName);

            stationStats.forEach(stat => {
                const card = document.createElement('div');
                card.className = 'stat-card';
                card.innerHTML = `
                    <div class="stat-card-header">${stat.station} - ${stat.variable}</div>
                    <div class="stat-card-value">${stat.latest.toFixed(1)}</div>
                    <div class="stat-card-label">${stat.units} (latest)</div>
                    <div class="stat-card-range">
                        <span>Min: ${stat.min.toFixed(1)}</span>
                        <span>Avg: ${stat.avg.toFixed(1)}</span>
                        <span>Max: ${stat.max.toFixed(1)}</span>
                    </div>
                `;
                container.appendChild(card);
            });
        });
    }

    /**
     * Create time series line chart using D3.js for full-width control
     */
    createTimeSeriesPlot() {
        console.log('createTimeSeriesPlot called');

        if (!this.data || !this.data.stations) {
            console.log('No data available');
            return;
        }

        // Check if D3 is loaded
        if (typeof d3 === 'undefined') {
            console.error('D3.js is not loaded!');
            return;
        }

        // Clear any existing chart
        const container = document.getElementById('timeseries-plot');
        if (!container) {
            console.error('Container element not found!');
            return;
        }

        console.log('Container width:', container.offsetWidth);
        container.innerHTML = '';

        // Get container dimensions for full-width chart
        const containerWidth = container.offsetWidth;

        // If container width is 0, skip rendering
        if (containerWidth === 0) {
            console.warn('Container width is 0, skipping render');
            return;
        }

        const margin = { top: 60, right: 30, bottom: 150, left: 70 };
        const width = containerWidth - margin.left - margin.right;
        const height = 600 - margin.top - margin.bottom;

        console.log('Calculated dimensions:', { width, height });

        // Prepare data: convert to D3-friendly format
        const series = [];
        const colorScale = d3.scaleOrdinal(d3.schemeCategory10);
        let colorIndex = 0;

        try {
            Object.entries(this.data.stations).forEach(([stid, station]) => {
                Object.entries(station.variables || {}).forEach(([varName, varData]) => {
                    const displayName = this.getVariableDisplayName(varName);
                    const seriesName = `${station.name || stid} - ${displayName}`;

                    const data = varData.times.map((time, i) => ({
                        date: new Date(time),
                        value: varData.values[i]
                    })).filter(d => d.value !== null && d.value !== undefined);

                    if (data.length > 0) {
                        series.push({
                            name: seriesName,
                            data: data,
                            color: colorScale(colorIndex++)
                        });
                    }
                });
            });

            console.log('Series prepared:', series.length, 'series');

            if (series.length === 0) {
                console.warn('No series data to plot');
                return;
            }
        } catch (error) {
            console.error('Error preparing series data:', error);
            return;
        }

        // Create SVG with responsive sizing
        let svg;
        try {
            console.log('Creating SVG...');
            svg = d3.select(container)
                .append('svg')
                .attr('width', width + margin.left + margin.right)
                .attr('height', height + margin.top + margin.bottom)
                .style('max-width', '100%')
                .style('height', 'auto')
                .append('g')
                .attr('transform', `translate(${margin.left},${margin.top})`);

            console.log('SVG created successfully');
        } catch (error) {
            console.error('Error creating SVG:', error);
            return;
        }

        // Get data extents
        const allDates = series.flatMap(s => s.data.map(d => d.date));
        const allValues = series.flatMap(s => s.data.map(d => d.value));

        // Create scales
        const xScale = d3.scaleTime()
            .domain(d3.extent(allDates))
            .range([0, width]);

        const yScale = d3.scaleLinear()
            .domain([d3.min(allValues), d3.max(allValues)])
            .nice()
            .range([height, 0]);

        // Create line generator with curve smoothing
        const line = d3.line()
            .defined(d => d.value !== null)
            .x(d => xScale(d.date))
            .y(d => yScale(d.value))
            .curve(d3.curveMonotoneX);

        // Add grid lines
        svg.append('g')
            .attr('class', 'grid')
            .attr('opacity', 0.1)
            .call(d3.axisLeft(yScale)
                .tickSize(-width)
                .tickFormat(''));

        // Add X axis
        const xAxis = svg.append('g')
            .attr('transform', `translate(0,${height})`)
            .call(d3.axisBottom(xScale)
                .ticks(width / 80)
                .tickFormat(d3.timeFormat('%m/%d %H:%M')))
            .style('font-size', '12px')
            .style('color', '#00263A');

        // Rotate x-axis labels
        xAxis.selectAll('text')
            .attr('transform', 'rotate(-45)')
            .style('text-anchor', 'end');

        // Add Y axis
        svg.append('g')
            .call(d3.axisLeft(yScale))
            .style('font-size', '12px')
            .style('color', '#00263A');

        // Add X axis label
        svg.append('text')
            .attr('transform', `translate(${width/2},${height + 70})`)
            .style('text-anchor', 'middle')
            .style('font-size', '14px')
            .style('fill', '#00263A')
            .text('Time');

        // Add Y axis label
        svg.append('text')
            .attr('transform', 'rotate(-90)')
            .attr('y', 0 - margin.left + 15)
            .attr('x', 0 - (height / 2))
            .style('text-anchor', 'middle')
            .style('font-size', '14px')
            .style('fill', '#00263A')
            .text('Value');

        // Add title
        svg.append('text')
            .attr('x', width / 2)
            .attr('y', -30)
            .attr('text-anchor', 'middle')
            .style('font-size', '20px')
            .style('font-weight', '700')
            .style('fill', '#00263A')
            .style('font-family', 'Roboto, sans-serif')
            .text('Time Series - Variables Over Time');

        // Draw lines for each series with class names for toggling
        series.forEach((s, idx) => {
            const seriesClass = `series-${idx}`;
            s.seriesClass = seriesClass; // Store for later reference

            svg.append('path')
                .datum(s.data)
                .attr('class', `line ${seriesClass}`)
                .attr('fill', 'none')
                .attr('stroke', s.color)
                .attr('stroke-width', 3)
                .attr('d', line)
                .style('opacity', 1);
        });

        // Add dots for each data point with class names for toggling
        series.forEach((s, idx) => {
            const seriesClass = `series-${idx}`;

            svg.selectAll(`.dot-${seriesClass}`)
                .data(s.data)
                .enter()
                .append('circle')
                .attr('class', `dot ${seriesClass}`)
                .attr('cx', d => xScale(d.date))
                .attr('cy', d => yScale(d.value))
                .attr('r', 4)
                .attr('fill', s.color)
                .attr('stroke', 'white')
                .attr('stroke-width', 1.5)
                .style('cursor', 'pointer')
                .style('opacity', 1)
                .on('mouseover', function(event, d) {
                    // Tooltip on hover
                    d3.select(this).attr('r', 6);

                    const tooltip = d3.select('body').append('div')
                        .attr('class', 'd3-tooltip')
                        .style('position', 'absolute')
                        .style('background', 'rgba(0, 38, 58, 0.95)')
                        .style('color', 'white')
                        .style('padding', '10px')
                        .style('border-radius', '6px')
                        .style('font-size', '13px')
                        .style('pointer-events', 'none')
                        .style('z-index', '10000')
                        .html(`<strong>${s.name}</strong><br/>Time: ${d3.timeFormat('%Y-%m-%d %H:%M')(d.date)}<br/>Value: ${d.value.toFixed(2)}`)
                        .style('left', (event.pageX + 15) + 'px')
                        .style('top', (event.pageY - 28) + 'px');
                })
                .on('mouseout', function() {
                    d3.select(this).attr('r', 4);
                    d3.selectAll('.d3-tooltip').remove();
                });
        });

        // Add legend at bottom (horizontal layout) with interactive toggle
        const legend = svg.append('g')
            .attr('class', 'legend')
            .attr('transform', `translate(0, ${height + 80})`);

        // Calculate legend item positions to wrap if needed
        let xOffset = 0;
        let yOffset = 0;
        const itemWidth = 200; // Approximate width per legend item
        const itemsPerRow = Math.floor(width / itemWidth);

        // Track visibility state for each series
        const seriesVisibility = {};
        series.forEach((s, i) => {
            seriesVisibility[s.seriesClass] = true; // All visible by default
        });

        series.forEach((s, i) => {
            const col = i % itemsPerRow;
            const row = Math.floor(i / itemsPerRow);

            const legendRow = legend.append('g')
                .attr('transform', `translate(${col * itemWidth}, ${row * 20})`)
                .attr('class', `legend-item legend-${s.seriesClass}`)
                .style('cursor', 'pointer')
                .on('click', function() {
                    // Toggle visibility
                    seriesVisibility[s.seriesClass] = !seriesVisibility[s.seriesClass];
                    const isVisible = seriesVisibility[s.seriesClass];

                    // Toggle line and dots opacity
                    svg.selectAll(`.line.${s.seriesClass}`)
                        .transition()
                        .duration(200)
                        .style('opacity', isVisible ? 1 : 0.1);

                    svg.selectAll(`.dot.${s.seriesClass}`)
                        .transition()
                        .duration(200)
                        .style('opacity', isVisible ? 1 : 0.1);

                    // Update legend appearance
                    d3.select(this).select('rect')
                        .transition()
                        .duration(200)
                        .style('opacity', isVisible ? 1 : 0.3);

                    d3.select(this).select('text')
                        .transition()
                        .duration(200)
                        .style('opacity', isVisible ? 1 : 0.5)
                        .style('text-decoration', isVisible ? 'none' : 'line-through');
                })
                .on('mouseover', function() {
                    // Highlight on hover
                    d3.select(this).select('rect')
                        .attr('width', 14)
                        .attr('height', 14);
                })
                .on('mouseout', function() {
                    // Reset on mouseout
                    d3.select(this).select('rect')
                        .attr('width', 12)
                        .attr('height', 12);
                });

            legendRow.append('rect')
                .attr('width', 12)
                .attr('height', 12)
                .attr('fill', s.color)
                .style('opacity', 1);

            legendRow.append('text')
                .attr('x', 18)
                .attr('y', 10)
                .style('font-size', '11px')
                .style('fill', '#00263A')
                .style('font-family', 'Roboto, sans-serif')
                .style('opacity', 1)
                .text(s.name);
        });

        // Store reference for resize
        this.d3Chart = { container, series, margin, createChart: () => this.createTimeSeriesPlot() };
    }

    /**
     * Create multi-station comparison plot
     */
    createComparisonPlot() {
        this.updateComparisonPlot();
    }

    updateComparisonPlot() {
        if (!this.data || !this.data.stations) return;

        const selectedVar = document.getElementById('comparison-variable').value;
        const traces = [];
        const colors = [
            '#00263A', '#627C8B', '#27AE60', '#8B9299',
            '#C8102E', '#0076A8', '#F39C12', '#1ABC9C'
        ];
        let colorIndex = 0;

        // Create a trace for each station
        Object.entries(this.data.stations).forEach(([stid, station]) => {
            const varData = station.variables?.[selectedVar];

            if (varData) {
                traces.push({
                    x: varData.times,
                    y: varData.values,
                    type: 'scatter',
                    mode: 'lines+markers',
                    name: station.name || stid,
                    line: {
                        color: colors[colorIndex % colors.length],
                        width: 3,
                        shape: 'spline',
                        smoothing: 0.3
                    },
                    marker: {
                        size: 6,
                        color: colors[colorIndex % colors.length],
                        line: {
                            color: 'white',
                            width: 1
                        }
                    },
                    hovertemplate: '<b>%{fullData.name}</b><br>' +
                                   'Time: %{x|%Y-%m-%d %H:%M}<br>' +
                                   'Value: %{y:.2f}<br>' +
                                   '<extra></extra>'
                });

                colorIndex++;
            }
        });

        const varDisplayName = this.getVariableDisplayName(selectedVar);

        // Get units from first available station
        let units = '';
        for (const station of Object.values(this.data.stations)) {
            if (station.variables?.[selectedVar]) {
                units = station.variables[selectedVar].units || '';
                break;
            }
        }

        const layout = {
            title: {
                text: `Station Comparison - ${varDisplayName}`,
                font: {
                    size: 20,
                    color: '#00263A',
                    family: 'Roboto, sans-serif'
                }
            },
            xaxis: {
                title: {
                    text: 'Time',
                    font: { size: 14, color: '#00263A' }
                },
                type: 'date',
                gridcolor: '#E8E8E8',
                showgrid: true
            },
            yaxis: {
                title: {
                    text: `${varDisplayName} (${units})`,
                    font: { size: 14, color: '#00263A' }
                },
                gridcolor: '#E8E8E8',
                showgrid: true
            },
            hovermode: 'closest',
            showlegend: true,
            legend: {
                orientation: 'h',
                x: 0.5,
                xanchor: 'center',
                y: -0.15,
                bgcolor: 'rgba(255,255,255,0.9)',
                bordercolor: '#CCCCCC',
                borderwidth: 1,
                font: { size: 12 }
            },
            margin: { l: 70, r: 50, t: 80, b: 100 },
            plot_bgcolor: '#FAFAFA',
            paper_bgcolor: 'white'
        };

        const config = {
            responsive: true,
            displayModeBar: true,
            displaylogo: false,
            modeBarButtonsToRemove: ['lasso2d', 'select2d']
        };

        Plotly.newPlot('comparison-plot', traces, layout, config);
    }

    /**
     * Create historical scatter plot
     */
    createScatterPlot() {
        this.updateScatterPlot();
    }

    updateScatterPlot() {
        if (!this.data || !this.data.stations) return;

        const xVar = document.getElementById('scatter-x-var').value;
        const yVar = document.getElementById('scatter-y-var').value;

        const traces = [];
        const colors = [
            '#00263A', '#627C8B', '#27AE60', '#8B9299',
            '#C8102E', '#0076A8', '#F39C12', '#1ABC9C'
        ];
        let colorIndex = 0;

        // Create scatter plot for each station
        Object.entries(this.data.stations).forEach(([stid, station]) => {
            const xData = station.variables?.[xVar];
            const yData = station.variables?.[yVar];

            if (xData && yData) {
                // Match timestamps
                const points = [];

                xData.times.forEach((time, idx) => {
                    const yIdx = yData.times.indexOf(time);
                    if (yIdx !== -1) {
                        points.push({
                            x: xData.values[idx],
                            y: yData.values[yIdx]
                        });
                    }
                });

                if (points.length > 0) {
                    traces.push({
                        x: points.map(p => p.x),
                        y: points.map(p => p.y),
                        type: 'scatter',
                        mode: 'markers',
                        name: station.name || stid,
                        marker: {
                            size: 10,
                            color: colors[colorIndex % colors.length],
                            opacity: 0.7,
                            line: {
                                color: 'white',
                                width: 1
                            }
                        },
                        hovertemplate: '<b>%{fullData.name}</b><br>' +
                                       'X: %{x:.2f}<br>' +
                                       'Y: %{y:.2f}<br>' +
                                       '<extra></extra>'
                    });

                    colorIndex++;
                }
            }
        });

        const xVarName = this.getVariableDisplayName(xVar);
        const yVarName = this.getVariableDisplayName(yVar);

        // Get units
        let xUnits = '', yUnits = '';
        for (const station of Object.values(this.data.stations)) {
            if (station.variables?.[xVar]) xUnits = station.variables[xVar].units || '';
            if (station.variables?.[yVar]) yUnits = station.variables[yVar].units || '';
            if (xUnits && yUnits) break;
        }

        const layout = {
            title: {
                text: `${yVarName} vs ${xVarName}`,
                font: {
                    size: 20,
                    color: '#00263A',
                    family: 'Roboto, sans-serif'
                }
            },
            xaxis: {
                title: {
                    text: `${xVarName} (${xUnits})`,
                    font: { size: 14, color: '#00263A' }
                },
                gridcolor: '#E8E8E8',
                showgrid: true
            },
            yaxis: {
                title: {
                    text: `${yVarName} (${yUnits})`,
                    font: { size: 14, color: '#00263A' }
                },
                gridcolor: '#E8E8E8',
                showgrid: true
            },
            hovermode: 'closest',
            showlegend: true,
            legend: {
                orientation: 'h',
                x: 0.5,
                xanchor: 'center',
                y: -0.15,
                bgcolor: 'rgba(255,255,255,0.9)',
                bordercolor: '#CCCCCC',
                borderwidth: 1,
                font: { size: 12 }
            },
            margin: { l: 70, r: 50, t: 80, b: 100 },
            plot_bgcolor: '#FAFAFA',
            paper_bgcolor: 'white'
        };

        const config = {
            responsive: true,
            displayModeBar: true,
            displaylogo: false,
            modeBarButtonsToRemove: ['lasso2d', 'select2d']
        };

        Plotly.newPlot('scatter-plot', traces, layout, config);
    }

    /**
     * Export data to CSV or JSON
     */
    exportData(format) {
        if (!this.data || !this.data.stations) {
            alert('No data to export. Please fetch data first.');
            return;
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        const filename = `weather_data_${timestamp}.${format}`;

        if (format === 'csv') {
            this.exportCSV(filename);
        } else if (format === 'json') {
            this.exportJSON(filename);
        }
    }

    /**
     * Export data to CSV format
     */
    exportCSV(filename) {
        const rows = [];

        // Header row
        rows.push(['Station', 'Station Name', 'Variable', 'Timestamp', 'Value', 'Units']);

        // Data rows
        Object.entries(this.data.stations).forEach(([stid, station]) => {
            Object.entries(station.variables || {}).forEach(([varName, varData]) => {
                const displayName = this.getVariableDisplayName(varName);
                varData.times.forEach((time, idx) => {
                    const value = varData.values[idx];
                    if (value !== null && value !== undefined) {
                        rows.push([
                            stid,
                            station.name || stid,
                            displayName,
                            time,
                            value,
                            varData.units || ''
                        ]);
                    }
                });
            });
        });

        // Convert to CSV string
        const csvContent = rows.map(row =>
            row.map(cell => `"${cell}"`).join(',')
        ).join('\n');

        // Download
        this.downloadFile(csvContent, filename, 'text/csv');
    }

    /**
     * Export data to JSON format
     */
    exportJSON(filename) {
        const exportData = {
            metadata: this.metadata,
            data: this.data,
            exportedAt: new Date().toISOString()
        };

        const jsonContent = JSON.stringify(exportData, null, 2);
        this.downloadFile(jsonContent, filename, 'application/json');
    }

    /**
     * Download file to user's computer
     */
    downloadFile(content, filename, contentType) {
        const blob = new Blob([content], { type: contentType });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    /**
     * Get human-readable variable names
     */
    getVariableDisplayName(varName) {
        const mappings = {
            'air_temp': 'Temperature',
            'ozone_concentration': 'Ozone',
            'PM_25_concentration': 'PM2.5',
            'relative_humidity': 'Humidity',
            'wind_speed': 'Wind Speed',
            'wind_direction': 'Wind Direction',
            'dew_point_temperature': 'Dew Point',
            'snow_depth': 'Snow Depth',
            'sea_level_pressure': 'Pressure'
        };

        // Strip the _set_1, _set_2, etc. suffix from variable names
        const cleanVarName = varName.replace(/_set_\d+$/, '');

        return mappings[cleanVarName] || mappings[varName] || varName;
    }
}

// Initialize and expose globally for button onclick
window.timeSeriesViewer = new TimeSeriesViewer();
