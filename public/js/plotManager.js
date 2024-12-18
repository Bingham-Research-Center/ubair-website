// public/js/plotManager.js

import { createElement } from './utils.js';

/**
 * PlotManager
 * Manages the creation and updating of Plotly visualizations.
 */
export class PlotManager {
    /**
     * Constructs a new PlotManager instance.
     *
     * @param {HTMLElement} container - The container element for the plots.
     * @param {Object} colors - Color scheme object.
     */
    constructor(container, colors) {
        if (!container) {
            throw new Error('Plot container element is required');
        }
        this.container = container;
        this.colors = colors || {};

        // Ensure the container is empty and properly styled
        this.container.innerHTML = '';
        this.container.style.width = '100%';
        this.container.style.height = '100%';
        this.container.style.minHeight = '500px';
    }

    /**
     * getColorForValue
     * Determines the color based on variable thresholds.
     *
     * @param {string} variable - The variable name.
     * @param {number} value - The value to evaluate.
     * @param {Object} thresholds - Thresholds for variables.
     * @returns {string} The corresponding color code.
     */
    getColorForValue(variable, value, thresholds) {
        const threshold = thresholds[variable];
        if (!threshold) return this.colors.accent; // Neutral color

        if (value >= threshold.danger) return this.colors.danger;
        if (value >= threshold.warning) return this.colors.warning;
        return this.colors.primary;
    }

    /**
     * generatePlotlyConfig
     * Generates Plotly configuration options.
     *
     * @returns {Object} Plotly config object.
     */
    generatePlotlyConfig() {
        return {
            responsive: true,
            displayModeBar: true,
            displaylogo: false,
            modeBarButtonsToRemove: [
                'lasso2d',
                'select2d'
            ]
        };
    }

    /**
     * generateWindPlot
     * Generates and renders the wind speed plot.
     *
     * @param {Array<Object>} windData - Array of wind data objects.
     * @param {Object} thresholds - Thresholds for wind speed.
     * @param {number} timeRangeHours - Time range in hours.
     * @param {Object} colors - Color scheme object.
     */
    generateWindPlot(windData, thresholds, timeRangeHours, colors) {
        if (!windData || windData.length === 0) return;

        const now = new Date();
        const cutoff = now.getTime() - (timeRangeHours * 60 * 60 * 1000);
        const filteredData = windData.filter(d => d.timestamp >= cutoff);

        const traces = [
            {
                x: filteredData.map(d => d.date),
                y: filteredData.map(d => d.windSpeed),
                type: 'scatter',
                mode: 'lines+markers',
                name: 'Wind Speed',
                line: {
                    color: colors.primary,
                    width: 2
                },
                marker: {
                    size: 6,
                    color: filteredData.map(d => this.getColorForValue('Wind Speed', d.windSpeed, thresholds))
                }
            },
            {
                x: filteredData.map(d => d.date),
                y: filteredData.map(() => thresholds['Wind Speed'].warning),
                type: 'scatter',
                mode: 'lines',
                name: 'Warning Threshold',
                line: {
                    color: colors.warning,
                    dash: 'dash'
                }
            },
            {
                x: filteredData.map(d => d.date),
                y: filteredData.map(() => thresholds['Wind Speed'].danger),
                type: 'scatter',
                mode: 'lines',
                name: 'Danger Threshold',
                line: {
                    color: colors.danger,
                    dash: 'dash'
                }
            }
        ];

        const layout = {
            title: {
                text: `Wind Speed Analysis (Last ${timeRangeHours} hours)`,
                font: {
                    size: 24,
                    color: colors.primary
                }
            },
            xaxis: {
                title: 'Time',
                gridcolor: colors.background,
                tickfont: { size: 12 }
            },
            yaxis: {
                title: 'Wind Speed (m/s)',
                gridcolor: colors.background,
                tickfont: { size: 12 }
            },
            paper_bgcolor: 'white',
            plot_bgcolor: 'white',
            height: 500,
            margin: { t: 50, r: 50, b: 50, l: 50 },
            showlegend: true,
            legend: {
                x: 1,
                xanchor: 'right',
                y: 1,
                bgcolor: 'rgba(255, 255, 255, 0.9)',
                bordercolor: colors.background,
                borderwidth: 1
            },
            hovermode: 'closest',
            hoverlabel: {
                bgcolor: 'white',
                font: { size: 12 }
            }
        };

        try {
            Plotly.newPlot(this.container, traces, layout, this.generatePlotlyConfig());
        } catch (error) {
            console.error('Error generating wind plot:', error);
            throw new Error('Failed to generate wind plot visualization');
        }
    }

    /**
     * generateStandardPlot
     * Generates and renders standard plots (scatter, bar, pie).
     *
     * @param {Array<Object>} data - Array of data objects.
     * @param {Array<string>} variables - Selected variables.
     * @param {Array<string>} stations - Selected stations.
     * @param {string} selectedPlot - Type of plot ('scatter', 'bar', 'pie').
     * @param {Object} thresholds - Thresholds for variables.
     * @param {Object} colors - Color scheme object.
     */
    generateStandardPlot(data, variables, stations, selectedPlot, thresholds, colors) {
        if (!data || variables.length === 0 || stations.length === 0) {
            console.warn('Insufficient data for plot generation');
            return;
        }

        const filteredData = data.filter(d => stations.includes(d.Station));
        let traces = [];

        if (selectedPlot === 'pie') {
            const variable = variables[0];
            traces.push({
                values: filteredData.map(d => d[variable]),
                labels: filteredData.map(d => d.Station),
                type: 'pie',
                textinfo: 'label+percent',
                hoverinfo: 'label+value+percent',
                marker: {
                    colors: filteredData.map(d => this.getColorForValue(variable, d[variable], thresholds))
                }
            });
        } else {
            variables.forEach(variable => {
                traces.push({
                    x: filteredData.map(d => d.Station),
                    y: filteredData.map(d => d[variable]),
                    name: variable,
                    type: selectedPlot,
                    marker: {
                        color: filteredData.map(d => this.getColorForValue(variable, d[variable], thresholds)),
                        line: {
                            color: colors.primary,
                            width: 1
                        }
                    }
                });
            });
        }

        const layout = {
            title: {
                text: this.generatePlotTitle(selectedPlot, variables),
                font: {
                    size: 24,
                    color: colors.primary
                }
            },
            xaxis: {
                title: 'Monitoring Station',
                gridcolor: colors.background,
                tickfont: { size: 12 }
            },
            yaxis: {
                title: variables.join(' / '),
                gridcolor: colors.background,
                tickfont: { size: 12 }
            },
            paper_bgcolor: 'white',
            plot_bgcolor: 'white',
            height: 500,
            margin: { t: 50, r: 50, b: 50, l: 50 },
            showlegend: true,
            legend: {
                x: 1,
                xanchor: 'right',
                y: 1,
                bgcolor: 'rgba(255, 255, 255, 0.9)',
                bordercolor: colors.background,
                borderwidth: 1
            },
            hovermode: 'closest',
            hoverlabel: {
                bgcolor: 'white',
                font: { size: 12 }
            }
        };

        try {
            Plotly.newPlot(this.container, traces, layout, this.generatePlotlyConfig());
        } catch (error) {
            console.error('Error generating standard plot:', error);
            throw new Error('Failed to generate plot visualization');
        }
    }

    /**
     * generatePlotTitle
     * Generates the plot title based on plot type and variables.
     *
     * @param {string} selectedPlot - Type of plot.
     * @param {Array<string>} variables - Selected variables.
     * @returns {string} The plot title.
     */
    generatePlotTitle(selectedPlot, variables) {
        const plotType = selectedPlot.charAt(0).toUpperCase() + selectedPlot.slice(1);
        const variableNames = variables.join(', ');
        return `${plotType} Visualization: ${variableNames}`;
    }

    /**
     * resizePlot
     * Adjusts the plot size on window resize for responsiveness.
     */
    resizePlot() {
        try {
            if (this.container) {
                Plotly.Plots.resize(this.container);
            }
        } catch (error) {
            console.error('Error resizing plot:', error);
        }
    }
}