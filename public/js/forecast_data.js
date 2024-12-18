// public/js/forecast_data.js

import { DataViz } from './DataViz.js';

/**
 * Initialize DataViz Dashboard
 * Creates a new instance of DataViz targeting the specified container.
 */
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Ensure the container exists
        const container = document.getElementById('visualization-container');
        if (!container) {
            throw new Error('Visualization container not found. Make sure the HTML includes an element with id "visualization-container".');
        }

        // Initialize DataViz
        const dataViz = new DataViz('visualization-container');

        // Add error handler for uncaught promise rejections
        window.addEventListener('unhandledrejection', (event) => {
            console.error('Unhandled promise rejection:', event.reason);
            if (dataViz && dataViz.uiManager) {
                dataViz.uiManager.showError(
                    'An unexpected error occurred. Please try refreshing the page.',
                    () => window.location.reload()
                );
            }
        });

    } catch (error) {
        console.error('Failed to initialize DataViz:', error);
        // Show error in the container if possible
        const container = document.getElementById('visualization-container');
        if (container) {
            container.innerHTML = `
                <div class="error-message">
                    <h3>Initialization Error</h3>
                    <p>${error.message}</p>
                    <button onclick="window.location.reload()" class="reset-button">Retry</button>
                </div>
            `;
        }
    }
});