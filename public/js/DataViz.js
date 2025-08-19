// public/js/DataViz.js

import { DataLoader } from './dataLoader.js';
import { UIManager } from './uiManager.js';
import { PlotManager } from './plotManager.js';
import { COLORS, TIME_RANGES } from './constants.js';

/**
 * DataViz
 * Initializes and manages the data visualization dashboard.
 */
export class DataViz {
    /**
     * Constructs a new DataViz instance.
     *
     * @param {string} containerId - The ID of the container element.
     */
    constructor(containerId) {
        if (!containerId) {
            throw new Error('Container ID is required');
        }

        this.containerId = containerId;
        this.container = document.getElementById(containerId);

        if (!this.container) {
            throw new Error(`Container element with ID "${containerId}" not found`);
        }

        this.colors = COLORS;
        this.plotContainer = null;
        this.controlsContainer = null;
        this.data = null;
        this.windTimeSeriesData = null;
        this.selectedPlot = 'scatter';
        this.selectedVariables = [];
        this.selectedStations = [];
        this.timeRange = '24h';
        this.windStats = null;

        // Define Monitoring Stations with their coordinates
        this.stations = {
            'Roosevelt': { lat: 40.29430, lng: -110.009 },
            'Vernal': { lat: 40.46472, lng: -109.56083 },
            'Horsepool': { lat: 40.1433, lng: -109.4674 }
        };

        // Define Thresholds for Variables
        this.thresholds = {
            'Ozone': { warning: 50, danger: 70 },
            'PM2.5': { warning: 35, danger: 55 },
            'NOx': { warning: 100, danger: 150 },
            'NO': { warning: 100, danger: 150 },
            'Temperature': { warning: 30, danger: 35 },
            'Wind Speed': { warning: 2.0, danger: 3.0 }
        };

        // Initialize Components
        this.dataLoader = new DataLoader({
            liveObs: '/public/data/test_liveobs.json',
            wind: '/public/data/test_wind_ts.json'
        });

        // Initialize UIManager first
        this.uiManager = new UIManager(containerId, this.colors);

        // Start initialization
        this.init().catch(error => {
            console.error('Error during initialization:', error);
            this.uiManager.showError(error.message, () => this.init());
        });
    }

    /**
     * showLoading
     * Displays a loading indicator within the container.
     */
    showLoading() {
        if (!this.container) return;

        this.container.innerHTML = `
            <div class="loading" aria-live="polite">Loading visualization...
                <div class="loading-spinner" role="status" aria-hidden="true"></div>
            </div>
        `;
    }

    /**
     * init
     * Initializes the DataViz application by fetching data and setting up the UI.
     */
    async init() {
        try {
            // Display loading indicator
            this.showLoading();

            // Initialize UI first and wait for it to complete
            await this.uiManager.initializeUI();

            // Initialize PlotManager after UI is ready
            const plotContainer = document.getElementById('plot-container');
            if (!plotContainer) {
                throw new Error('Plot container element not found after UI initialization');
            }
            this.plotManager = new PlotManager(plotContainer, this.colors);

            // Fetch and process data
            const { liveObsData, windData } = await this.dataLoader.fetchData();
            this.processData(liveObsData, windData);

            // Get the variables and stations
            const variables = this.getVariables();
            const stations = Object.keys(this.stations);

            // Populate UI Checkboxes
            this.uiManager.populateCheckboxes(variables, stations);

            // Setup Event Listeners
            this.setupEventListeners();

            // Select Default Options
            this.selectDefaultOptions();

            // Render Initial Plot
            this.updatePlot();

            // Start Automatic Data Refresh
            this.startAutoRefresh();

        } catch (error) {
            console.error('Error initializing DataViz:', error);
            this.uiManager.showError(error.message, () => this.init());
            throw error; // Re-throw to be caught by constructor
        }
    }

    /**
     * processData
     * Processes fetched data and computes necessary statistics.
     *
     * @param {Object} liveObsData - Live observations data.
     * @param {Object} windData - Wind time series data.
     */
    processData(liveObsData, windData) {
        // Validate Data Structure
        if (!liveObsData || typeof liveObsData !== 'object') {
            throw new Error('Invalid live observations data format');
        }
        if (!windData || typeof windData !== 'object') {
            throw new Error('Invalid wind time series data format');
        }

        // Process Live Observations Data
        this.data = Object.keys(this.stations).map(station => {
            const dataPoint = {
                Station: station,
                Date: new Date().toISOString()
            };

            // Add Measurements for Each Variable
            Object.keys(liveObsData).forEach(measurement => {
                if (liveObsData[measurement][station] !== null && !isNaN(liveObsData[measurement][station])) {
                    dataPoint[measurement] = liveObsData[measurement][station];
                }
            });

            return dataPoint;
        });

        // Process Wind Time Series Data
        this.windTimeSeriesData = Object.entries(windData).map(([timestamp, data]) => ({
            timestamp: parseInt(timestamp),
            date: new Date(parseInt(timestamp)),
            windSpeed: data["Wind Speed"] || 0
        })).sort((a, b) => a.timestamp - b.timestamp);

        // Calculate Wind Statistics
        this.windStats = this.calculateWindStats();
    }

    /**
     * calculateWindStats
     * Calculates wind statistics from wind time series data.
     *
     * @returns {Object|null} Wind statistics or null if data is insufficient.
     */
    calculateWindStats() {
        if (!this.windTimeSeriesData || this.windTimeSeriesData.length === 0) return null;

        const speeds = this.windTimeSeriesData
            .map(d => d.windSpeed)
            .filter(speed => speed !== null && !isNaN(speed));

        if (speeds.length === 0) return null;

        const sortedData = [...this.windTimeSeriesData].sort((a, b) => a.timestamp - b.timestamp);
        return {
            average: speeds.reduce((a, b) => a + b, 0) / speeds.length,
            max: Math.max(...speeds),
            min: Math.min(...speeds),
            current: sortedData[sortedData.length - 1].windSpeed,
            hourlyAverages: this.calculateHourlyAverages(sortedData)
        };
    }

    /**
     * calculateHourlyAverages
     * Calculates hourly averages of wind speed.
     *
     * @param {Array<Object>} sortedData - Sorted wind data.
     * @returns {Array<Object>} Hourly averages.
     */
    calculateHourlyAverages(sortedData) {
        const hourlyData = {};

        sortedData.forEach(data => {
            const hour = data.date.getHours();
            if (!hourlyData[hour]) {
                hourlyData[hour] = {
                    sum: 0,
                    count: 0
                };
            }
            if (data.windSpeed !== null && !isNaN(data.windSpeed)) {
                hourlyData[hour].sum += data.windSpeed;
                hourlyData[hour].count++;
            }
        });

        return Object.entries(hourlyData).map(([hour, data]) => ({
            hour: parseInt(hour),
            average: data.sum / data.count
        })).sort((a, b) => a.hour - b.hour);
    }

    /**
     * getVariables
     * Retrieves the list of variables from the data.
     *
     * @returns {Array<string>} List of variable names.
     */
    getVariables() {
        if (!this.data || this.data.length === 0) return [];
        return Object.keys(this.data[0]).filter(key => key !== 'Station' && key !== 'Date');
    }

    /**
     * setupEventListeners
     * Sets up event listeners for UI interactions.
     */
    setupEventListeners() {
        // Event Delegation for Variable Checkboxes
        const variablesContainer = document.getElementById('variables-checkboxes');
        if (variablesContainer) {
            variablesContainer.addEventListener('change', (e) => {
                if (e.target.classList.contains('variable-checkbox')) {
                    const value = e.target.value;
                    if (e.target.checked) {
                        this.selectedVariables.push(value);
                    } else {
                        this.selectedVariables = this.selectedVariables.filter(v => v !== value);
                    }
                    this.updatePlot();
                }
            });
        }

        // Event Delegation for Station Checkboxes
        const stationsContainer = document.getElementById('stations-checkboxes');
        if (stationsContainer) {
            stationsContainer.addEventListener('change', (e) => {
                if (e.target.classList.contains('station-checkbox')) {
                    const value = e.target.value;
                    if (e.target.checked) {
                        this.selectedStations.push(value);
                    } else {
                        this.selectedStations = this.selectedStations.filter(s => s !== value);
                    }
                    this.updatePlot();
                }
            });
        }

        // Plot Type Change
        const plotTypeSelect = document.getElementById('plot-type');
        if (plotTypeSelect) {
            plotTypeSelect.addEventListener('change', (e) => {
                this.selectedPlot = e.target.value;
                this.uiManager.showWindControls(this.selectedPlot === 'wind');
                this.updatePlot();
            });
        }

        // Time Range Change
        const timeRangeSelect = document.getElementById('time-range');
        if (timeRangeSelect) {
            timeRangeSelect.addEventListener('change', (e) => {
                this.timeRange = e.target.value;
                this.updatePlot();
            });
        }

        // Reset Button
        const resetButton = document.getElementById('reset-button');
        if (resetButton) {
            resetButton.addEventListener('click', () => this.reset());
        }

        // Window Resize for Responsive Plots
        window.addEventListener('resize', () => {
            if (this.plotManager) {
                this.plotManager.resizePlot();
            }
        });
    }

    /**
     * selectDefaultOptions
     * Selects default options for variables and stations.
     */
    selectDefaultOptions() {
        // Select first variable by default
        const firstVarCheckbox = document.querySelector('.variable-checkbox');
        if (firstVarCheckbox) {
            firstVarCheckbox.checked = true;
            this.selectedVariables = [firstVarCheckbox.value];
        }

        // Select first station by default
        const firstStationCheckbox = document.querySelector('.station-checkbox');
        if (firstStationCheckbox) {
            firstStationCheckbox.checked = true;
            this.selectedStations = [firstStationCheckbox.value];
        }

        // Update the UI based on default plot type
        this.uiManager.showWindControls(this.selectedPlot === 'wind');
    }

    /**
     * updatePlot
     * Updates the plot based on current selections.
     */
    updatePlot() {
        if (this.selectedPlot === 'wind') {
            this.plotManager.generateWindPlot(
                this.windTimeSeriesData,
                this.thresholds,
                TIME_RANGES[this.timeRange],
                this.colors
            );
            this.uiManager.updateWindStats(this.windStats);
        } else {
            this.plotManager.generateStandardPlot(
                this.data,
                this.selectedVariables,
                this.selectedStations,
                this.selectedPlot,
                this.thresholds,
                this.colors
            );
        }
        this.uiManager.updateTimestamp();
    }

    /**
     * reset
     * Resets all selections to their default states.
     */
    reset() {
        // Reset plot type to default
        const plotTypeSelect = document.getElementById('plot-type');
        if (plotTypeSelect) {
            this.selectedPlot = 'scatter';
            plotTypeSelect.value = 'scatter';
            this.uiManager.showWindControls(false);
        }

        // Reset variables
        this.selectedVariables = [];
        document.querySelectorAll('.variable-checkbox').forEach(checkbox => {
            checkbox.checked = false;
        });
        const firstVarCheckbox = document.querySelector('.variable-checkbox');
        if (firstVarCheckbox) {
            firstVarCheckbox.checked = true;
            this.selectedVariables = [firstVarCheckbox.value];
        }

        // Reset stations
        this.selectedStations = [];
        document.querySelectorAll('.station-checkbox').forEach(checkbox => {
            checkbox.checked = false;
        });
        const firstStationCheckbox = document.querySelector('.station-checkbox');
        if (firstStationCheckbox) {
            firstStationCheckbox.checked = true;
            this.selectedStations = [firstStationCheckbox.value];
        }

        // Reset time range
        const timeRangeSelect = document.getElementById('time-range');
        if (timeRangeSelect) {
            this.timeRange = '24h';
            timeRangeSelect.value = '24h';
        }

        // Update plot
        this.updatePlot();
    }

    /**
     * startAutoRefresh
     * Starts automatic data refresh at set intervals.
     */
    startAutoRefresh() {
        // Refresh data every 5 minutes (300,000 milliseconds)
        this.refreshInterval = setInterval(() => this.refreshData(), 5 * 60 * 1000);
    }

    /**
     * refreshData
     * Refreshes data by fetching it again and updating the visualization.
     */
    async refreshData() {
        try {
            // Refreshing data silently - automatic background update
            const { liveObsData, windData } = await this.dataLoader.fetchData();
            this.processData(liveObsData, windData);
            this.updatePlot();
        } catch (error) {
            console.error('Error refreshing data:', error);
            // Optionally show a non-intrusive error message to the user
        }
    }
}