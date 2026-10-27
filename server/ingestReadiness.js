/**
 * Ingest readiness for /api/health: can this process accept CHPC uploads at all?
 *
 * Checked once at startup and cached, like buildInfo.js. Producers call /api/health before
 * every upload, so nothing here may touch disk per request. The one per-request stat lives in
 * lastUploadAgeMinutes(), which only GET /api/health/ingest (for uptime monitors) calls.
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

// Observations and metadata each arrive every 10 minutes, so half an hour with no accepted
// upload of any kind is an outage, not jitter.
export const UPLOAD_STALE_MINUTES = 30;

// Both paths resolve against the working directory, as `import 'dotenv/config'` and the
// upload route do.
const defaultEnvPath = () => path.resolve(process.cwd(), '.env');
const defaultStaticRoot = () => path.resolve(process.cwd(), 'public', 'api', 'static');

function accessible(p, mode) {
    try {
        fs.accessSync(p, mode);
        return true;
    } catch {
        return false;
    }
}

const canReadPath = p => accessible(p, fs.constants.R_OK);
const canWritePath = p => accessible(p, fs.constants.W_OK);

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
    canRead = canReadPath,
} = {}) {
    if (!exists(envPath)) return null;
    return canRead(envPath) ? null : '.env exists but is not readable by this process';
}

/**
 * `{ ready, problems }` for the process as configured right now. `ready: false` means every
 * upload will fail whatever the producer sends. The filesystem probes are injectable because
 * root passes every access() check, so tests cannot fake an unreadable file with chmod.
 */
export function checkIngestReadiness({
    env = process.env,
    envPath = defaultEnvPath(),
    staticRoot = defaultStaticRoot(),
    dataTypes = UPLOAD_DATA_TYPES,
    exists = fs.existsSync,
    canRead = canReadPath,
    canWrite = canWritePath,
} = {}) {
    const problems = [];

    const envProblem = envFileProblem({ envPath, exists, canRead });
    if (envProblem) problems.push(envProblem);

    if (!env.DATA_UPLOAD_API_KEY) problems.push('DATA_UPLOAD_API_KEY is not set');

    const unwritable = dataTypes.filter(dataType => {
        const dir = path.join(staticRoot, dataType);
        // The upload route creates a missing directory, so then only its parent must be writable.
        return !canWrite(exists(dir) ? dir : staticRoot);
    });
    if (unwritable.length > 0) {
        problems.push(`upload directories not writable: ${unwritable.join(', ')}`);
    }

    return { ready: problems.length === 0, problems };
}

/**
 * Minutes since the last accepted upload of any dataType, or null if there has never been one.
 * The upload route rewrites observations/filelist.json after every accepted upload, whatever
 * its dataType, so that file's mtime is the time of the last one. Per-dataType staleness is
 * /api/monitoring/freshness's job; this only answers "is anything arriving at all?".
 */
export function lastUploadAgeMinutes({
    staticRoot = defaultStaticRoot(),
    now = Date.now(),
    stat = fs.statSync,
} = {}) {
    try {
        const { mtimeMs } = stat(path.join(staticRoot, 'observations', 'filelist.json'));
        return Math.round((now - mtimeMs) / 60000);
    } catch {
        return null;
    }
}

let cached = null;

/** The block /api/health embeds. Computed on first call, then frozen for the process lifetime. */
export function getIngestReadiness() {
    if (!cached) {
        const { ready, problems } = checkIngestReadiness();
        cached = Object.freeze({ ready, problems: Object.freeze(problems) });
    }
    return cached;
}

/** Test hook. */
export function _resetIngestReadinessForTests() {
    cached = null;
}
