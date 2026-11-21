/**
 * The most recent upload attempts, accepted or rejected.
 *
 * Answers "did my push from CHPC land, and if not, where was it stopped?" from outside
 * the box, via GET /api/monitoring/uploads (API-key gated). Until 2026-09 that endpoint
 * parsed /tmp/basinwx_upload.log, which nothing ever wrote, so it returned
 * "Log file not found" on both boxes.
 *
 * Until 1.7.9 this was 200 entries in memory and nothing else. Measured on 2026-11-21: one
 * Clyfar run is 144 uploads in 90 seconds, so the list on .com reached back 3.3 hours, and
 * .dev's had been emptied by a restart, which left 13 missed observation cycles that week
 * with no record of whether the app had refused them or never been sent them. So now:
 *   - the list holds about two days (MAX_ATTEMPTS);
 *   - refused attempts are also kept in a list of their own, which a burst of accepted files
 *     cannot push them out of;
 *   - once enableAttemptLog() has run, every attempt is appended to a file under
 *     logs/analytics and read back at the next start. /api/health `startedAt` still says when
 *     the process came up; an entry older than that was recorded by the one before.
 */

import { promises as fsp } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export const MAX_ATTEMPTS = 2000;
export const MAX_REJECTED = 200;

// The file is rotated once (to `<name>.1`) when it passes this, so it never holds more than
// twice this much: about forty days of attempts at 2026-11 rates.
const MAX_LOG_BYTES = 5 * 1024 * 1024;
// Enough of the end of the file to refill the list: an entry is about 260 bytes.
const TAIL_BYTES = 768 * 1024;

let attempts = [];
let rejected = [];

let logFile = null;
let logBytes = 0;
let maxLogBytes = MAX_LOG_BYTES;
let writes = Promise.resolve();
let writeFailureLogged = false;

function remember(entry) {
    attempts.push(entry);
    if (attempts.length > MAX_ATTEMPTS) attempts = attempts.slice(-MAX_ATTEMPTS);
    if (!entry.ok) {
        rejected.push(entry);
        if (rejected.length > MAX_REJECTED) rejected = rejected.slice(-MAX_REJECTED);
    }
}

// One line per attempt, in order, never in the way of the upload that caused it: a failure to
// write is logged once and otherwise ignored.
function persist(entry) {
    if (!logFile) return;
    const file = logFile;
    const line = `${JSON.stringify(entry)}\n`;
    writes = writes.then(async () => {
        if (logBytes > maxLogBytes) {
            await fsp.rename(file, `${file}.1`);
            logBytes = 0;
        }
        await fsp.appendFile(file, line);
        logBytes += Buffer.byteLength(line);
    }).catch((error) => {
        if (!writeFailureLogged) console.error(`[uploads] attempt log not written: ${error.message}`);
        writeFailureLogged = true;
    });
}

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
    const entry = {
        ts: new Date().toISOString(),
        ip: ip ?? null,
        hostname: hostname ?? null,
        dataType: dataType ?? null,
        filename: filename ?? null,
        status,
        ok: status >= 200 && status < 300,
        detail,
    };
    remember(entry);
    persist(entry);
}

/** Newest first. */
export function getRecentUploadAttempts(limit = 50) {
    const n = Math.max(0, Math.min(limit, MAX_ATTEMPTS));
    return attempts.slice(-n).reverse();
}

/** The refused attempts alone, newest first. */
export function getRecentRejectedAttempts(limit = 50) {
    const n = Math.max(0, Math.min(limit, MAX_REJECTED));
    return rejected.slice(-n).reverse();
}

export function countUploadAttempts() {
    return attempts.length;
}

export function countRejectedAttempts() {
    return rejected.length;
}

const isEntry = (value) => value !== null && typeof value === 'object'
    && typeof value.ts === 'string' && Number.isFinite(value.status) && typeof value.ok === 'boolean';

// The whole lines in the last TAIL_BYTES of a file, parsed. A missing file is no lines.
async function tailEntries(file) {
    let handle;
    try {
        handle = await fsp.open(file, 'r');
        const { size } = await handle.stat();
        const start = Math.max(0, size - TAIL_BYTES);
        const { buffer, bytesRead } = await handle.read(Buffer.alloc(size - start), 0, size - start, start);
        const lines = buffer.subarray(0, bytesRead).toString('utf8').split('\n');
        if (start > 0) lines.shift(); // the read began part-way through a line
        const entries = [];
        for (const line of lines) {
            if (line === '') continue;
            try {
                const entry = JSON.parse(line);
                if (isEntry(entry)) entries.push(entry);
            } catch {
                // A line cut short by a crash: skip it.
            }
        }
        return { entries, size };
    } catch (error) {
        if (error.code !== 'ENOENT') console.warn(`[uploads] could not read ${path.basename(file)}: ${error.message}`);
        return { entries: [], size: 0 };
    } finally {
        await handle?.close();
    }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Where the attempts are kept: beside the pipeline log, outside anything served. */
export function defaultAttemptLogFile() {
    const dir = process.env.ANALYTICS_LOG_DIR || path.join(__dirname, '../../logs/analytics');
    return path.join(dir, 'upload_attempts.log');
}

/**
 * Startup only: read back what the last process recorded, then append every attempt from now
 * on. Never throws: without the file the list is simply in memory, as it was before 1.7.9.
 */
export async function enableAttemptLog(file = defaultAttemptLogFile(), { maxBytes = MAX_LOG_BYTES } = {}) {
    try {
        maxLogBytes = maxBytes;
        await fsp.mkdir(path.dirname(file), { recursive: true });
        const previous = await tailEntries(`${file}.1`);
        const current = await tailEntries(file);
        // Anything recorded while the file was being read is newer than all of it.
        const sinceStart = attempts;
        attempts = [];
        rejected = [];
        for (const entry of [...previous.entries, ...current.entries, ...sinceStart]) remember(entry);
        logBytes = current.size;
        logFile = file;
        for (const entry of sinceStart) persist(entry);
        return { loaded: previous.entries.length + current.entries.length };
    } catch (error) {
        console.error(`[uploads] attempt log disabled: ${error.message}`);
        return { loaded: 0 };
    }
}

/** Resolves when every attempt recorded so far has been written. For tests and shutdown. */
export function flushAttemptLog() {
    return writes;
}

/** Test hook. */
export function _resetUploadAttemptsForTests() {
    attempts = [];
    rejected = [];
    logFile = null;
    logBytes = 0;
    maxLogBytes = MAX_LOG_BYTES;
    writes = Promise.resolve();
    writeFailureLogged = false;
}
