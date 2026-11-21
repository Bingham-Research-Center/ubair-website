import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { promisify } from 'util';
import dns from 'dns';
import { fileURLToPath } from 'url';
import { logPipelineEvent } from '../middleware/pipelineAnalytics.js';
import { recordUploadAttempt } from '../monitoring/uploadAttempts.js';
import { getBuildInfo } from '../buildInfo.js';
import {
    getIngestReadiness,
    lastUploadAgeMinutes,
    noteAcceptedUpload,
    UPLOAD_STALE_MINUTES
} from '../ingestReadiness.js';
import {
    UPLOAD_DATA_TYPES,
    allowedExtensions,
    extensionAllowed,
    isAllowedHost,
    isKnownDataType,
    parseAllowedHosts
} from '../uploadPolicy.js';
import { parseUtc, validateLlmForecast } from '../../public/js/llmForecast.js';
import { TEMP_PREFIX, TEMP_SUFFIX, getUploadIndex } from '../uploadIndex.js';

const reverseLookup = promisify(dns.reverse);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read once at module load. Neither file changes at runtime, and CHPC producers
// call /health before every single upload, so this must not hit disk per request.
function readJsonField(relPath, field) {
    try {
        const content = fs.readFileSync(path.join(__dirname, relPath), 'utf8');
        return JSON.parse(content)[field] ?? null;
    } catch (error) {
        console.error(`Failed to read "${field}" from ${relPath}:`, error.message);
        return null;
    }
}

const SERVER_VERSION = readJsonField('../../package.json', 'version');
const MANIFEST_VERSION = readJsonField('../../DATA_MANIFEST.json', 'version');

const router = express.Router();

// How many reasons a refused llm_forecasts upload is told about at once.
const MAX_ERRORS_RETURNED = 25;

// Configure file storage
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        // A dataType is the name of its own directory. validateDataType has already checked it
        // against UPLOAD_DATA_TYPES; the check is repeated here because this line turns a
        // request parameter into a path, and "../.." must never get that far.
        const { dataType } = req.params;
        if (!isKnownDataType(dataType)) {
            return cb(new Error(`Unknown dataType: ${dataType}`));
        }
        const uploadDir = path.join(process.cwd(), 'public', 'api', 'static', dataType);

        // Create directory if it doesn't exist
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }

        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        // Written under a temporary name and renamed once it has passed every check. Until
        // 1.7.9 the file went straight to its final name, so a page could read half of it, and
        // a refused re-send of a fixed-name file (the surface-layers index) deleted the good
        // copy. Dot-names are not served, listed or counted.
        cb(null, `${TEMP_PREFIX}${process.pid}-${crypto.randomBytes(6).toString('hex')}${TEMP_SUFFIX}`);
    }
});

// The name a file is stored under is the producer's own, as long as it is a plain file name.
// A leading dot is refused because dot-names are this route's temporary files.
function storedName(originalname) {
    if (typeof originalname !== 'string' || originalname === '' || originalname.includes('\u0000')) return null;
    if (path.basename(originalname) !== originalname || originalname.startsWith('.')) return null;
    return originalname;
}

function removeQuietly(file) {
    try {
        fs.unlinkSync(file);
    } catch {
        // Already gone.
    }
}

// Copy `source` over `target` so that a reader sees the old file or the new one, never part of one.
function replaceWithCopy(source, target) {
    const tmpPath = path.join(path.dirname(target), `${TEMP_PREFIX}${process.pid}-${crypto.randomBytes(6).toString('hex')}${TEMP_SUFFIX}`);
    try {
        fs.copyFileSync(source, tmpPath);
        fs.renameSync(tmpPath, target);
    } catch (error) {
        removeQuietly(tmpPath);
        throw error;
    }
}

const upload = multer({
    storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    }
});

// Client IP as the proxy in front of us reports it (first X-Forwarded-For hop), else the
// socket peer. Both boxes' nginx set the header (prod since 2026-10-27; before that prod
// logged ::ffff:127.0.0.1 for every upload).
function clientIpOf(req) {
    return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip;
}

// One line per attempt into the in-memory ring that GET /api/monitoring/uploads serves.
// Called at every exit of the upload path so a rejected push is as visible as an accepted one.
function noteAttempt(req, status, detail, filename = null) {
    // validateApiKey also guards /api/monitoring/*; only the upload path is an "attempt".
    if (!req.path?.startsWith('/upload/')) return;
    recordUploadAttempt({
        ip: clientIpOf(req),
        hostname: req.headers['x-client-hostname'] ?? null,
        dataType: req.params?.dataType ?? null,
        filename,
        status,
        detail,
    });
}

// Middleware to validate API key.
// Exported so other routers can reuse it for state-mutating endpoints
// (e.g. POST /api/monitoring/alerts/clear).
export function validateApiKey(req, res, next) {
    const providedKey = req.headers['x-api-key'];
    const validKey = process.env.DATA_UPLOAD_API_KEY;

    // Production: minimal logging for security

    if (!validKey) {
        console.error('ERROR: DATA_UPLOAD_API_KEY environment variable is not set!');
        noteAttempt(req, 500, 'server has no DATA_UPLOAD_API_KEY');
        return res.status(500).json({
            success: false,
            message: 'Server configuration error: API key not configured'
        });
    }

    if (!providedKey) {
        noteAttempt(req, 401, 'no api key');
        return res.status(401).json({
            success: false,
            message: 'No API key provided in x-api-key header'
        });
    }

    if (providedKey !== validKey) {
        noteAttempt(req, 401, 'wrong api key');
        return res.status(401).json({
            success: false,
            message: `Invalid API key provided: ${providedKey.slice(0, 5)}...`
        });
    }

    next();
}

// UPLOAD_ALLOWED_HOSTS is read on each request, so the parsed rules are kept per value.
let allowedHostsCache = { value: null, rules: null };
function allowedHostRules() {
    const value = process.env.UPLOAD_ALLOWED_HOSTS ?? '';
    if (allowedHostsCache.rules === null || allowedHostsCache.value !== value) {
        allowedHostsCache = { value, rules: parseAllowedHosts(value) };
    }
    return allowedHostsCache.rules;
}

// Is this producer one we expect? The hostname the client states, or failing that the reverse
// DNS of its address, must be on the allowlist (UPLOAD_ALLOWED_HOSTS in .env; CHPC by default).
// This is a filter, not authentication: the header is the client's own word. The API key
// checked before this is what keeps strangers out.
async function validateOrigin(req, res, next) {
    try {
        const clientIp = clientIpOf(req);
        const clientHostname = req.headers['x-client-hostname'];
        const rules = allowedHostRules();

        // Log access attempts for security monitoring
        console.log(`Access attempt from IP: ${clientIp}, Hostname: ${clientHostname}`);

        // Method 1: Check custom hostname header
        if (isAllowedHost(clientHostname, rules)) {
            console.log('Access granted via hostname header');
            return next();
        }

        // Method 2: Fallback to reverse DNS lookup
        try {
            const hostnames = await reverseLookup(clientIp);
            if (hostnames.some(hostname => isAllowedHost(hostname, rules))) {
                console.log('Access granted via reverse DNS');
                return next();
            }
        } catch (dnsError) {
            console.log('Reverse DNS lookup failed:', dnsError.message);
        }

        // Both methods failed
        console.log(`Access denied from ${clientIp}`);
        noteAttempt(req, 403, 'host not allowed');
        return res.status(403).json({
            success: false,
            message: 'Forbidden: this host is not on the upload allowlist'
        });

    } catch (error) {
        console.error('Origin validation error:', error);
        noteAttempt(req, 500, 'origin check crashed');
        return res.status(500).json({
            success: false,
            message: 'Server error during validation'
        });
    }
}

// Refuse a dataType that is not on the list before multer writes anything. Until 1.7.3 an
// unknown name was used as a directory name as it came, so a name such as "../.." wrote
// outside the upload root.
function validateDataType(req, res, next) {
    if (isKnownDataType(req.params.dataType)) return next();
    noteAttempt(req, 400, 'unknown dataType');
    return res.status(400).json({
        success: false,
        message: 'Unknown dataType',
        supported: UPLOAD_DATA_TYPES
    });
}

// llm_forecasts keeps a latest_<persona>.json beside the run files, so a page fetches one known
// URL instead of listing the directory. It is replaced only by a file that passed validation and
// is not older than the one already there, and by rename, so a reader never sees half a file.
function updateLatestLlmForecast(uploadedPath, doc) {
    const latestPath = path.join(path.dirname(uploadedPath), `latest_${doc.persona}.json`);
    try {
        const current = JSON.parse(fs.readFileSync(latestPath, 'utf8'));
        if (parseUtc(current.issued) > parseUtc(doc.issued)) return false;
    } catch {
        // No latest file yet, or an unreadable one: replace it.
    }
    replaceWithCopy(uploadedPath, latestPath);
    return true;
}

// Main upload route
router.post('/upload/:dataType', validateApiKey, validateOrigin, validateDataType, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      noteAttempt(req, 400, 'no file in request');
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const { dataType } = req.params;
    const filename = storedName(req.file.originalname);
    if (!filename) {
      removeQuietly(req.file.path);
      noteAttempt(req, 400, 'invalid file name');
      return res.status(400).json({ success: false, message: 'Invalid file name' });
    }
    const ext = path.extname(filename).toLowerCase();
    const binaryExts = ['.png', '.pdf'];

    // Invalid type for this dataType
    if (!extensionAllowed(dataType, ext)) {
      fs.unlinkSync(req.file.path);
      noteAttempt(req, 400, 'invalid file type', req.file.originalname);
      return res.status(400).json({
        success: false,
        message: `Invalid file type: ${dataType} takes ${allowedExtensions(dataType).join(', ')}`
      });
    }

    // Set when the upload is an llm_forecasts file that passed its contract checks.
    let llmForecast = null;

    // Skip content validation for binary files (images, PDFs)
    if (!binaryExts.includes(ext)) {
      const contentBuffer = fs.readFileSync(req.file.path);
      const content = contentBuffer.toString('utf8');

      if (ext === '.json') {
        // JSON validation
        let parsed;
        try {
          parsed = JSON.parse(content);
        } catch {
          fs.unlinkSync(req.file.path);
          noteAttempt(req, 400, 'invalid json', req.file.originalname);
          return res.status(400).json({ success: false, message: 'Invalid JSON file' });
        }

        // LLM text is the one dataType checked against its contract here: it is prose shown to
        // the public on both boxes, so a malformed or overlong file is refused, with every
        // reason listed, rather than stored for a page to trip over.
        if (dataType === 'llm_forecasts') {
          const { ok, errors } = validateLlmForecast(parsed, {
            filename: req.file.originalname,
            now: Date.now()
          });
          if (!ok) {
            fs.unlinkSync(req.file.path);
            // Placement and tier names in these sentences come from the file, so cap both
            // the log line and the list: a file of nothing but bad keys stays a short answer.
            noteAttempt(req, 400, `llm_forecast refused: ${errors[0]}`.slice(0, 200), req.file.originalname);
            return res.status(400).json({
              success: false,
              message: 'The file does not meet the llm_forecast/1 contract',
              errors: errors.slice(0, MAX_ERRORS_RETURNED),
              errorCount: errors.length
            });
          }
          llmForecast = parsed;
        }
      } else {
        // Text validation: accept UTF-8 markdown/plain text, reject binary-like payloads.
        if (content.includes('\u0000')) {
          fs.unlinkSync(req.file.path);
          noteAttempt(req, 400, 'binary content in text file', req.file.originalname);
          return res.status(400).json({ success: false, message: 'Invalid text file' });
        }
      }
    }

    // Success: the file takes its own name. Same directory, so the rename is atomic and a
    // file of that name already there is replaced whole.
    const { size } = req.file;
    const finalPath = path.join(path.dirname(req.file.path), filename);
    const isNew = !fs.existsSync(finalPath);
    fs.renameSync(req.file.path, finalPath);
    console.log(`[${new Date().toISOString()}] File uploaded: ${filename} (${size} bytes) - Type: ${dataType}`);

    // Copy road-forecast uploads to latest.json for easy access
    if (dataType === 'road-forecast') {
      replaceWithCopy(finalPath, path.join(path.dirname(finalPath), 'latest.json'));
      console.log(`[${new Date().toISOString()}] Road forecast latest.json updated`);
    }

    if (llmForecast) {
      const replaced = updateLatestLlmForecast(finalPath, llmForecast);
      console.log(`[${new Date().toISOString()}] latest_${llmForecast.persona}.json ${replaced ? 'updated' : 'kept (it is newer)'}`);
    }

    // The index is how pages and the freshness check find the newest file of each product
    // without listing the directory (server/uploadIndex.js).
    getUploadIndex().noteUpload(dataType, filename, { isNew });

    // Counted as a success only now: either step above can still throw and turn this into a 500.
    // Fire-and-forget; logPipelineEvent swallows its own errors, and the .catch() is a
    // second belt so upload analytics can never reject on the ingest path.
    logPipelineEvent({ dataType, filename, size, success: true })
        .catch(err => console.error('[Pipeline] log failed:', err.message));
    noteAttempt(req, 200, 'accepted', filename);
    noteAcceptedUpload();

    res.status(200).json({
      success: true,
      message: `${dataType} data uploaded successfully`,
      filename,
      size,
      path: `/api/static/${dataType}/${filename}`
    });
  } catch (error) {
    console.error('Error handling file upload:', error);
    // Still under its temporary name if the failure came before the rename.
    if (req.file?.path) removeQuietly(req.file.path);
    noteAttempt(req, 500, 'server error', req.file?.originalname ?? null);
    logPipelineEvent({ dataType: req.params.dataType, filename: req.file?.originalname, size: 0, success: false, error: error.message })
        .catch(err => console.error('[Pipeline] log failed:', err.message));
    res.status(500).json({ success: false, message: 'Server error processing upload' });
  }
});

// Health check route for this API.
// version + manifestVersion ride along on the call producers already make before
// every upload, so brc-tools can check contract compatibility for free, and
// "which box am I talking to?" is answerable with one curl — dev carries a -dev
// suffix, ops does not.
//
// commit/branch/startedAt/vendorAssets make a deploy verifiable from outside without a
// shell: version says what package.json claims, commit says what `git pull` actually
// landed, startedAt says whether pm2 restarted, vendorAssets says whether `npm install` ran.
//
// ingest says whether this process can accept an upload at all (key loaded, upload
// directories writable). It does not change the status code or `success`: producers gate
// their uploads on this call, and an outage is not the moment to change what they read.
router.get('/health', (req, res) => {
    const build = getBuildInfo();
    res.status(200).json({
        success: true,
        message: 'Data upload API is running',
        version: SERVER_VERSION,
        manifestVersion: MANIFEST_VERSION,
        commit: build.commit,
        branch: build.branch,
        startedAt: build.startedAt,
        uptimeSeconds: Math.round(process.uptime()),
        vendorAssets: build.vendorAssets,
        ingest: getIngestReadiness(),
        timestamp: new Date().toISOString()
    });
});

// For an external uptime monitor, not for producers: 503 whenever uploads cannot succeed or
// none has fully succeeded for UPLOAD_STALE_MINUTES. Either one would have paged someone on
// 2026-10-26, when /api/health stayed 200 through a day of rejected uploads.
router.get('/health/ingest', async (req, res) => {
    // "Last upload" is seeded from the upload index at startup. Wait for that first read (a
    // fraction of a second, once) so a monitor polling as the app comes up is not told 503.
    await getUploadIndex().ready();
    const { ready, problems } = getIngestReadiness();
    const lastUploadMinutes = lastUploadAgeMinutes();
    const reasons = [...problems];
    if (lastUploadMinutes === null) {
        reasons.push('no accepted upload on record');
    } else if (lastUploadMinutes > UPLOAD_STALE_MINUTES) {
        reasons.push(`last accepted upload was ${lastUploadMinutes} min ago`);
    }
    const ok = reasons.length === 0;
    res.status(ok ? 200 : 503).json({
        ok,
        ready,
        lastUploadMinutes,
        staleAfterMinutes: UPLOAD_STALE_MINUTES,
        reasons,
        timestamp: new Date().toISOString()
    });
});

export default router;
