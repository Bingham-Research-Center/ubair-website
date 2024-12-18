// public/js/uiManager.js

import { createElement } from './utils.js';
import { COLORS } from './constants.js';

/**
 * UIManager
 * Manages the user interface components and interactions.
 */
export class UIManager {
    /**
     * Constructs a new UIManager instance.
     *
     * @param {string} containerId - The ID of the container element.
     * @param {Object} colors - Color scheme object.
     */
    constructor(containerId, colors) {
        this.container = document.getElementById(containerId);
        this.colors = colors;
        if (!this.container) {
            throw new Error(`Container with id "${containerId}" not found`);
        }
    }

    /**
     * initializeUI
     * Sets up the basic UI structure within the container.
     * @returns {Promise} A promise that resolves when UI initialization is complete
     */
    initializeUI() {
        return new Promise((resolve) => {
            // Clear container and set up the basic structure
            this.container.innerHTML = `
                <div class="viz-dashboard">
                    <div class="controls-container">
                        <div class="control-group" id="plot-type-group">
                            <label for="plot-type" class="control-label">Visualization Type</label>
                            <select id="plot-type" class="select-input" aria-label="Select Visualization Type">
                                <option value="scatter">Line Plot</option>
                                <option value="bar">Bar Chart</option>
                                <option value="pie">Pie Chart</option>
                                <option value="wind">Wind Analysis</option>
                            </select>
                        </div>
                        
                        <div class="control-group" id="variables-controls">
                            <label class="control-label">Variables</label>
                            <div id="variables-checkboxes" class="checkbox-grid" aria-label="Select Variables"></div>
                        </div>
                        
                        <div class="control-group" id="stations-controls">
                            <label class="control-label">Monitoring Stations</label>
                            <div id="stations-checkboxes" class="checkbox-grid" aria-label="Select Monitoring Stations"></div>
                        </div>

                        <div class="control-group" id="wind-controls" style="display: none;">
                            <label for="time-range" class="control-label">Time Range</label>
                            <select id="time-range" class="select-input" aria-label="Select Time Range">
                                <option value="6h">Last 6 Hours</option>
                                <option value="12h">Last 12 Hours</option>
                                <option value="24h" selected>Last 24 Hours</option>
                                <option value="48h">Last 48 Hours</option>
                                <option value="7d">Last 7 Days</option>
                            </select>
                        </div>
                        
                        <button id="reset-button" class="reset-button" aria-label="Reset View">Reset View</button>
                    </div>
                    
                    <div id="plot-container" class="plot-container" aria-label="Data Visualization"></div>
                    
                    <div id="wind-stats" class="wind-stats" style="display: none;" aria-label="Wind Statistics">
                        <h3>Wind Statistics</h3>
                        <div class="stats-grid">
                            <div class="stat-item">
                                <span class="stat-label">Current Speed:</span>
                                <span class="stat-value" id="current-wind"></span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-label">Average Speed:</span>
                                <span class="stat-value" id="avg-wind"></span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-label">Max Speed:</span>
                                <span class="stat-value" id="max-wind"></span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-label">Min Speed:</span>
                                <span class="stat-value" id="min-wind"></span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="dashboard-footer">
                        <p class="last-updated">Last Updated: <span id="last-update-time"></span></p>
                        <p class="data-note">Note: Colors indicate measurement levels: Normal (Blue), Warning (Yellow), Critical (Red)</p>
                    </div>
                </div>
            `;

            // Inject additional styles specific to UI components
            this.injectStyles();

            // Give the DOM time to update and verify critical elements exist
            setTimeout(() => {
                const plotContainer = document.getElementById('plot-container');
                const variablesContainer = document.getElementById('variables-checkboxes');
                const stationsContainer = document.getElementById('stations-checkboxes');

                if (!plotContainer || !variablesContainer || !stationsContainer) {
                    throw new Error('Failed to initialize required UI elements');
                }
                resolve();
            }, 0);
        });
    }

    /**
     * injectStyles
     * Injects necessary CSS styles into the document head.
     */
    injectStyles() {
        const style = createElement('style', {}, `
            .viz-dashboard {
                background: white;
                border-radius: 8px;
                box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
                padding: 1.5rem;
                box-sizing: border-box;
                width: 100%;
                height: 100%;
                font-family: 'Roboto', sans-serif;
            }

            .controls-container {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
                gap: 1.5rem;
                margin-bottom: 2rem;
                padding: 1rem;
                background: ${this.colors.background};
                border-radius: 6px;
            }

            .control-group {
                display: flex;
                flex-direction: column;
            }

            .control-label {
                display: block;
                font-weight: 500;
                margin-bottom: 0.5rem;
                color: ${this.colors.primary};
            }

            .select-input {
                width: 100%;
                padding: 0.5rem;
                border: 1px solid #D1D5DB;
                border-radius: 4px;
                background: white;
                font-size: 0.875rem;
            }

            .checkbox-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
                gap: 0.5rem;
            }

            .checkbox-item {
                display: flex;
                align-items: center;
                gap: 0.5rem;
            }

            .plot-container {
                background: white;
                border-radius: 6px;
                padding: 1rem;
                min-height: 500px;
                margin-bottom: 1rem;
                box-sizing: border-box;
            }

            .reset-button {
                padding: 0.5rem 1rem;
                background: ${this.colors.primary};
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                transition: background 0.2s;
                align-self: start;
                font-size: 0.875rem;
            }

            .reset-button:hover {
                background: ${this.colors.secondary};
            }

            .dashboard-footer {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding-top: 1rem;
                border-top: 1px solid ${this.colors.background};
                color: ${this.colors.accent};
                font-size: 0.875rem;
                flex-wrap: wrap;
            }

            .wind-stats {
                background: white;
                border-radius: 6px;
                padding: 1rem;
                margin-top: 1rem;
                border: 1px solid ${this.colors.background};
            }

            .wind-stats h3 {
                color: ${this.colors.primary};
                margin: 0 0 1rem 0;
                font-size: 1.2rem;
            }

            .stats-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                gap: 1rem;
            }

            .stat-item {
                padding: 0.5rem;
                background: ${this.colors.background};
                border-radius: 4px;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }

            .stat-label {
                color: ${this.colors.primary};
                font-weight: 500;
            }

            .stat-value {
                color: ${this.colors.secondary};
                font-weight: bold;
            }

            @media (max-width: 768px) {
                .controls-container {
                    grid-template-columns: 1fr;
                }

                .dashboard-footer {
                    flex-direction: column;
                    align-items: flex-start;
                }
            }

            /* Loading Spinner Styles */
            .loading {
                text-align: center;
                padding: 2rem;
                font-size: 1.2rem;
                color: ${this.colors.primary};
            }

            .loading-spinner {
                margin-top: 1rem;
                border: 8px solid ${this.colors.background};
                border-top: 8px solid ${this.colors.primary};
                border-radius: 50%;
                width: 50px;
                height: 50px;
                animation: spin 1s linear infinite;
                display: inline-block;
            }

            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }

            /* Error Message Styles */
            .error-message {
                text-align: center;
                padding: 2rem;
                color: ${this.colors.danger};
            }

            .error-message h3 {
                margin-bottom: 1rem;
            }
        `);
        document.head.appendChild(style);
    }

    /**
     * populateCheckboxes
     * Populates the variables and stations checkboxes based on provided data.
     *
     * @param {Array<string>} variables - List of variable names.
     * @param {Array<string>} stations - List of station names.
     */
    populateCheckboxes(variables, stations) {
        const variablesContainer = document.getElementById('variables-checkboxes');
        const stationsContainer = document.getElementById('stations-checkboxes');

        if (!variablesContainer || !stationsContainer) {
            console.error('Checkbox containers not found');
            return;
        }

        // Populate Variables Checkboxes
        variablesContainer.innerHTML = variables.map(variable => `
            <label class="checkbox-item">
                <input type="checkbox" value="${variable}" class="variable-checkbox" aria-label="Select ${variable}">
                <span>${variable}</span>
            </label>
        `).join('');

        // Populate Stations Checkboxes
        stationsContainer.innerHTML = stations.map(station => `
            <label class="checkbox-item">
                <input type="checkbox" value="${station}" class="station-checkbox" aria-label="Select ${station}">
                <span>${station}</span>
            </label>
        `).join('');
    }

    /**
     * showWindControls
     * Shows or hides wind-specific controls and statistics.
     *
     * @param {boolean} show - Whether to show wind controls.
     */
    showWindControls(show) {
        const windControls = document.getElementById('wind-controls');
        const standardControls = document.querySelectorAll('#variables-controls, #stations-controls');
        const windStats = document.getElementById('wind-stats');

        if (!windControls || !windStats) return;

        if (show) {
            windControls.style.display = 'block';
            standardControls.forEach(control => {
                if (control) control.style.display = 'none';
            });
            windStats.style.display = 'block';
        } else {
            windControls.style.display = 'none';
            standardControls.forEach(control => {
                if (control) control.style.display = 'block';
            });
            windStats.style.display = 'none';
        }
    }

    /**
     * updateWindStats
     * Updates wind statistics in the UI.
     *
     * @param {Object} stats - Wind statistics.
     */
    updateWindStats(stats) {
        if (!stats) return;

        const elements = {
            current: document.getElementById('current-wind'),
            avg: document.getElementById('avg-wind'),
            max: document.getElementById('max-wind'),
            min: document.getElementById('min-wind')
        };

        if (elements.current) elements.current.textContent = `${stats.current.toFixed(1)} m/s`;
        if (elements.avg) elements.avg.textContent = `${stats.average.toFixed(1)} m/s`;
        if (elements.max) elements.max.textContent = `${stats.max.toFixed(1)} m/s`;
        if (elements.min) elements.min.textContent = `${stats.min.toFixed(1)} m/s`;
    }

    /**
     * updateTimestamp
     * Updates the last updated timestamp in the UI.
     */
    updateTimestamp() {
        const element = document.getElementById('last-update-time');
        if (element) {
            element.textContent = new Date().toLocaleString();
        }
    }

    /**
     * showError
     * Displays an error message with a retry option.
     *
     * @param {string} message - The error message to display.
     * @param {Function} onRetry - The function to call when retrying.
     */
    showError(message, onRetry) {
        if (!this.container) return;

        this.container.innerHTML = `
            <div class="error-message">
                <h3>Error Loading Data</h3>
                <p>${message}</p>
                <button id="retry-button" class="reset-button" aria-label="Retry Loading Data">Retry</button>
            </div>
        `;

        const retryButton = document.getElementById('retry-button');
        if (retryButton && onRetry) {
            retryButton.addEventListener('click', onRetry);
        }
    }
}