/**
 * Map State Manager - Preserves map state across page navigation
 * Handles state persistence for roads/map view when navigating to/from webcam viewer
 */
class MapStateManager {
    constructor() {
        this.storageKey = 'ubair_map_state';
        this.restoreIntentKey = 'ubair_map_restore_intent';
        this.defaultState = {
            center: [40.3033, -109.7],
            zoom: 10,
            timestamp: Date.now()
        };
    }

    /**
     * Save current map state to sessionStorage
     */
    saveMapState(map, additionalData = {}) {
        if (!map) return;

        const state = {
            center: map.getCenter(),
            zoom: map.getZoom(),
            bounds: map.getBounds(),
            timestamp: Date.now(),
            ...additionalData
        };

        try {
            sessionStorage.setItem(this.storageKey, JSON.stringify(state));
        } catch (error) {
            console.warn('Failed to save map state:', error);
        }
    }

    /**
     * Restore map state from sessionStorage
     */
    restoreMapState(map) {
        if (!map) return false;

        try {
            const savedState = sessionStorage.getItem(this.storageKey);
            if (!savedState) return false;

            const state = JSON.parse(savedState);

            // Check if state is recent (within 1 hour)
            if (Date.now() - state.timestamp > 3600000) {
                this.clearMapState();
                return false;
            }

            // Restore map position
            if (state.center && state.zoom) {
                const latitude = Array.isArray(state.center) ? state.center[0] : state.center.lat;
                const longitude = Array.isArray(state.center) ? state.center[1] : state.center.lng;
                if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;

                map.setView([latitude, longitude], state.zoom);
                this.clearRestoreIntent();
                this.clearReturnSignal();
                return true;
            }
        } catch (error) {
            console.warn('Failed to restore map state:', error);
            this.clearMapState();
        }

        return false;
    }

    /**
     * Get saved state without applying it
     */
    getSavedState() {
        try {
            const savedState = sessionStorage.getItem(this.storageKey);
            if (savedState) {
                const state = JSON.parse(savedState);
                if (Date.now() - state.timestamp <= 3600000) {
                    return state;
                }
            }
        } catch (error) {
            console.warn('Failed to get saved state:', error);
        }
        return null;
    }

    /**
     * Clear saved map state
     */
    clearMapState() {
        try {
            sessionStorage.removeItem(this.storageKey);
        } catch (error) {
            console.warn('Failed to clear map state:', error);
        }
    }

    setRestoreIntent(source) {
        try {
            sessionStorage.setItem(this.restoreIntentKey, source);
        } catch (error) {
            console.warn('Failed to save map restore intent:', error);
        }
    }

    clearRestoreIntent() {
        try {
            sessionStorage.removeItem(this.restoreIntentKey);
        } catch (error) {
            console.warn('Failed to clear map restore intent:', error);
        }
    }

    clearReturnSignal() {
        const url = new URL(window.location.href);
        if (!url.searchParams.has('returnFrom')) return;

        url.searchParams.delete('returnFrom');
        window.history.replaceState(
            window.history.state,
            document.title,
            `${url.pathname}${url.search}${url.hash}`
        );
    }

    /**
     * Check if we should restore state (e.g., coming back from webcam viewer)
     */
    shouldRestoreState() {
        const referrer = document.referrer;
        const savedState = this.getSavedState();
        const urlParams = new URLSearchParams(window.location.search);
        const returningFromWebcam = (
            urlParams.get('returnFrom') === 'webcam' ||
            referrer.includes('/webcam-viewer')
        );
        const hasRestoreIntent = sessionStorage.getItem(this.restoreIntentKey) === 'webcam';

        // A normal visit or reload should always start at the Basin default view.
        return Boolean(savedState && returningFromWebcam && hasRestoreIntent);
    }

    /**
     * Enhanced navigation that preserves map state
     */
    navigateToWebcam(cameraId, currentMap) {
        // Save current map state before navigation
        this.saveMapState(currentMap, {
            navigatedTo: 'webcam',
            cameraId: cameraId
        });
        this.setRestoreIntent('webcam');

        // Navigate to webcam viewer
        const url = `/webcam-viewer?id=${cameraId}&return=roads`;
        window.open(url, '_blank');
    }

    /**
     * Enhanced back navigation that restores map state
     */
    navigateBackToMap() {
        const savedState = this.getSavedState();
        const urlParams = new URLSearchParams(window.location.search);
        const returnPage = urlParams.get('return') || 'roads';

        if (savedState && window.opener && !window.opener.closed) {
            // If opened in popup/tab and parent window is still open, close this window
            window.close();
        } else {
            // Navigate back to the specified return page (usually roads)
            window.location.href = `/${returnPage}?returnFrom=webcam`;
        }
    }

    /**
     * Initialize state manager with auto-save on map events
     */
    initAutoSave(map, throttleMs = 1000) {
        if (!map) return;

        let saveTimeout;
        const throttledSave = () => {
            clearTimeout(saveTimeout);
            saveTimeout = setTimeout(() => {
                this.saveMapState(map);
            }, throttleMs);
        };

        // Save state on map interactions
        map.on('moveend', throttledSave);
        map.on('zoomend', throttledSave);

        // Save state when page is about to unload
        window.addEventListener('beforeunload', () => {
            this.saveMapState(map);
        });

        // Handle visibility change (tab switching)
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.saveMapState(map);
            }
        });
    }
}

// Global instance
window.mapStateManager = new MapStateManager();
