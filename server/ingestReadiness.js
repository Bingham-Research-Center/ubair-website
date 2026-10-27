/**
 * Ingest readiness for /api/health: can this process accept CHPC uploads at all?
 *
 * Checked once at startup and cached, like buildInfo.js. Producers call /api/health before
 * every upload, so nothing here may touch disk per request.
 *
 * Why this exists: after a Linode reboot on 2026-10-26 a leftover systemd unit started the
 * app as www-data two seconds before pm2 did. That copy could not read .env (root, 0600) and
 * could not write to five of the seven upload directories, so every upload answered 500 for a
 * day. Meanwhile /api/health kept saying success:true and pm2's correctly configured copy
 * crash-looped on EADDRINUSE behind it.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

// Every directory POST /api/upload/:dataType writes into (the multer dataTypeMap in
// routes/dataUpload.js). A dataType added there should be added here.
export const UPLOAD_DATA_TYPES = [
    'observations',
    'metadata',
    'outlooks',
    'llm_outlooks',
    'images',
    'forecasts',
    'road-forecast',
];

// Files the upload route rewrites in place after the data file has landed. A read-only one
// turns the upload into a 500 even though its directory is writable.
export const REWRITTEN_FILES = [
    'observations/filelist.json', // after every upload, whatever its dataType
    'road-forecast/latest.json',  // after every road-forecast upload
];

// Observations and metadata each arrive every 10 minutes, so half an hour with no accepted
// upload of any kind is an outage, not jitter.
export const UPLOAD_STALE_MINUTES = 30;

// Both paths resolve against the working directory, as `import 'dotenv/config'` and the
// upload route do.
const defaultEnvPath = () => path.resolve(process.cwd(), '.env');
const defaultStaticRoot = () => path.resolve(process.cwd(), 'public', 'api', 'static');

// `access` has fs.accessSync's contract (throws when denied). It is injectable because root
// passes every access() check, so tests cannot fake a denial with chmod.
function allowed(access, p, mode) {
    try {
        access(p, mode);
        return true;
    } catch {
        return false;
    }
}

// Creating or replacing a file needs search (X) as well as write permission on its directory.
const DIR_WRITE = fs.constants.W_OK | fs.constants.X_OK;

/** OS user this process runs as, for log lines. Never sent in an HTTP response. */
export function processUser() {
    try {
        return os.userInfo().username;
    } catch {
        return `uid ${process.getuid?.() ?? 'unknown'}`;
    }
}

/**
 * Problem string when `.env` exists but this process cannot read it, else null.
 * dotenv swallows the EACCES, so without this check the app starts with no secrets at all.
 */
export function envFileProblem({
    envPath = defaultEnvPath(),
    exists = fs.existsSync,
    access = fs.accessSync,
} = {}) {
    if (!exists(envPath)) return null;
    return allowed(access, envPath, fs.constants.R_OK) ? null : '.env exists but is not readable by this process';
}

/**
 * `{ ready, problems }` for the process as configured right now. `ready: false` means every
 * upload (or every upload of some dataType) will fail whatever the producer sends.
 */
export function checkIngestReadiness({
    env = process.env,
    envPath = defaultEnvPath(),
    staticRoot = defaultStaticRoot(),
    dataTypes = UPLOAD_DATA_TYPES,
    rewrittenFiles = REWRITTEN_FILES,
    exists = fs.existsSync,
    access = fs.accessSync,
} = {}) {
    const problems = [];

    const envProblem = envFileProblem({ envPath, exists, access });
    if (envProblem) problems.push(envProblem);

    if (!env.DATA_UPLOAD_API_KEY) problems.push('DATA_UPLOAD_API_KEY is not set');

    const unwritable = dataTypes.filter(dataType => {
        const dir = path.join(staticRoot, dataType);
        // The upload route creates a missing directory, so then only its parent must be writable.
        return !allowed(access, exists(dir) ? dir : staticRoot, DIR_WRITE);
    });
    if (unwritable.length > 0) {
        problems.push(`upload directories not writable: ${unwritable.join(', ')}`);
    }

    // A missing file is created in a directory already checked above.
    const readOnly = rewrittenFiles.filter(rel => {
        const file = path.join(staticRoot, rel);
        return exists(file) && !allowed(access, file, fs.constants.W_OK);
    });
    if (readOnly.length > 0) {
        problems.push(`files rewritten on upload are not writable: ${readOnly.join(', ')}`);
    }

    return { ready: problems.length === 0, problems };
}

let cached = null;
let lastAcceptedAtMs = null;
let seededAtMs = null;

/** The block /api/health embeds. Computed on first call, then frozen for the process lifetime. */
export function getIngestReadiness() {
    if (!cached) {
        const { ready, problems } = checkIngestReadiness();
        cached = Object.freeze({ ready, problems: Object.freeze(problems) });
    }
    return cached;
}

/** The upload route calls this once an upload has fully succeeded, just before it answers 200. */
export function noteAcceptedUpload(at = Date.now()) {
    lastAcceptedAtMs = at;
}

/**
 * Startup only: seed "last accepted upload" from the mtime of observations/filelist.json, which
 * the upload route rewrites after every upload, so a restart does not read as an outage. It is
 * read once: after startup only noteAcceptedUpload() moves the time, because that file is also
 * rewritten by uploads that go on to fail.
 */
export function seedLastUploadFromDisk({ staticRoot = defaultStaticRoot(), stat = fs.statSync } = {}) {
    try {
        seededAtMs = stat(path.join(staticRoot, 'observations', 'filelist.json')).mtimeMs;
    } catch {
        seededAtMs = null;
    }
}

/** Minutes since the last fully successful upload of any dataType, or null if none is known. */
export function lastUploadAgeMinutes(now = Date.now()) {
    const at = lastAcceptedAtMs ?? seededAtMs;
    return at === null ? null : Math.round((now - at) / 60000);
}

/** Test hook. */
export function _resetIngestReadinessForTests() {
    cached = null;
    lastAcceptedAtMs = null;
    seededAtMs = null;
}
