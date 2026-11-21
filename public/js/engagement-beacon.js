/**
 * Lightweight engagement beacon — reports time-on-page when the user leaves.
 * Uses navigator.sendBeacon (fire-and-forget, survives page unload).
 * ~0.5 KB, no dependencies, no cookies, no identifier: the server derives the visitor from
 * the request, the same way it does for page loads.
 *
 * Loaded by loadSidebar.js on every page that has the sidebar. A beacon is the evidence
 * behind the `js_confirmed` visitor tier (server/middleware/visitorCounts.js, issue #340).
 */
(function () {
    if (window.__basinwxEngagementBeacon) return;
    window.__basinwxEngagementBeacon = true;

    var start = Date.now();

    function sendBeacon() {
        var duration = Math.round((Date.now() - start) / 1000);
        if (duration < 2) return; // ignore sub-2s bounces
        var data = JSON.stringify({
            path: window.location.pathname,
            duration_s: duration,
        });
        if (navigator.sendBeacon) {
            navigator.sendBeacon('/api/analytics/engagement', data);
        }
    }

    // Fire on page visibility change (tab switch / close) and beforeunload
    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'hidden') sendBeacon();
    });
    window.addEventListener('pagehide', sendBeacon);
})();
