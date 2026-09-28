/**
 * In-memory record of the most recent upload attempts, accepted or rejected.
 *
 * Answers "did my push from CHPC land, and if not, where was it stopped?" from outside
 * the box, via GET /api/monitoring/uploads (API-key gated). Until 2026-09 that endpoint
 * parsed /tmp/basinwx_upload.log, which nothing ever wrote, so it returned
 * "Log file not found" on both boxes.
 *
 * Deliberately not persisted: a restart wipes it, which is itself a useful signal
 * (empty list + fresh startedAt in /api/health = the process just came up).
 */

export const MAX_ATTEMPTS = 200;

let attempts = [];

/**
 * @param {object} a
 * @param {string} a.ip            client IP as the app saw it (X-Forwarded-For first hop, else socket)
 * @param {string|null} a.hostname x-client-hostname header, if any
 * @param {string|null} a.dataType route param
 * @param {string|null} a.filename original filename, if the request got that far
 * @param {number} a.status        HTTP status the app answered with
 * @param {string} a.detail        one short human phrase, e.g. "accepted", "bad api key"
 */
export function recordUploadAttempt({ ip, hostname, dataType, filename, status, detail }) {
    attempts.push({
        ts: new Date().toISOString(),
        ip: ip ?? null,
        hostname: hostname ?? null,
        dataType: dataType ?? null,
        filename: filename ?? null,
        status,
        ok: status >= 200 && status < 300,
        detail,
    });
    if (attempts.length > MAX_ATTEMPTS) {
        attempts = attempts.slice(-MAX_ATTEMPTS);
    }
}

/** Newest first. */
export function getRecentUploadAttempts(limit = 50) {
    const n = Math.max(0, Math.min(limit, MAX_ATTEMPTS));
    return attempts.slice(-n).reverse();
}

export function countUploadAttempts() {
    return attempts.length;
}

/** Test hook. */
export function _resetUploadAttemptsForTests() {
    attempts = [];
}
