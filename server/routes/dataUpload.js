import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { promisify } from 'util';
import dns from 'dns';
import { fileURLToPath } from 'url';
import { logPipelineEvent } from '../middleware/pipelineAnalytics.js';

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

// Add this helper at the top (after imports)
function updateFileList(uploadDir) {
  const files = fs.readdirSync(uploadDir);
  const filtered = files.filter(name =>
    /^map_obs(_meta)?_\d{8}_\d{4}Z\.json$/.test(name)
  );
  fs.writeFileSync(
    path.join(uploadDir, 'filelist.json'),
    JSON.stringify(filtered, null, 2)
  );
}

const router = express.Router();

// Configure file storage
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        // Map data types to subdirectories
        const dataTypeMap = {
            'observations': 'observations',
            'metadata': 'metadata',
            'outlooks': 'outlooks',
            'llm_outlooks': 'llm_outlooks',
            'images': 'images',
            'timeseries': 'timeseries',
            'forecasts': 'forecasts',
            'road-forecast': 'road-forecast'
        };

        const dataType = req.params.dataType || 'observations';
        const subDir = dataTypeMap[dataType] || dataType;
        const uploadDir = path.join(process.cwd(), 'public', 'api', 'static', subDir);

        // Create directory if it doesn't exist
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }

        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        // Keep original filename
        cb(null, file.originalname);
    }
});

const upload = multer({
    storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    }
});

// Middleware to validate API key.
// Exported so other routers can reuse it for state-mutating endpoints
// (e.g. POST /api/monitoring/alerts/clear).
export function validateApiKey(req, res, next) {
    const providedKey = req.headers['x-api-key'];
    const validKey = process.env.DATA_UPLOAD_API_KEY;

    // Production: minimal logging for security

    if (!validKey) {
        console.error('ERROR: DATA_UPLOAD_API_KEY environment variable is not set!');
        return res.status(500).json({
            success: false,
            message: 'Server configuration error: API key not configured'
        });
    }

    if (!providedKey) {
        return res.status(401).json({
            success: false,
            message: 'No API key provided in x-api-key header'
        });
    }

    if (providedKey !== validKey) {
        return res.status(401).json({
            success: false,
            message: `Invalid API key provided: ${providedKey.slice(0, 5)}...`
        });
    }

    next();
}

async function validateCHPCOrigin(req, res, next) {
    try {
        const clientIp = req.headers['x-forwarded-for']?.split(',')[0] || req.ip;
        const clientHostname = req.headers['x-client-hostname'];

        // Log access attempts for security monitoring
        console.log(`Access attempt from IP: ${clientIp}, Hostname: ${clientHostname}`);

        // Method 1: Check custom hostname header
        if (clientHostname && clientHostname.endsWith('chpc.utah.edu')) {
            console.log('Access granted via hostname header');
            return next();
        }

        // Method 2: Fallback to reverse DNS lookup
        try {
            const hostnames = await reverseLookup(clientIp);
            const isValidHostname = hostnames.some(hostname =>
                hostname.endsWith('chpc.utah.edu')
            );

            if (isValidHostname) {
                console.log('Access granted via reverse DNS');
                return next();
            }
        } catch (dnsError) {
            console.log('Reverse DNS lookup failed:', dnsError.message);
        }

        // Both methods failed
        console.log(`Access denied from ${clientIp}`);
        return res.status(403).json({
            success: false,
            message: 'Forbidden: Not from authorized CHPC system'
        });

    } catch (error) {
        console.error('Origin validation error:', error);
        return res.status(500).json({
            success: false,
            message: 'Server error during validation'
        });
    }
}

// Main upload route
router.post('/upload/:dataType', validateApiKey, validateCHPCOrigin, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const ext = path.extname(req.file.originalname).toLowerCase();
    const textExts = ['.md', '.txt'];
    const binaryExts = ['.png', '.pdf'];

    // Invalid type
    if (ext !== '.json' && !textExts.includes(ext) && !binaryExts.includes(ext)) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ success: false, message: 'Invalid file type' });
    }

    // Skip content validation for binary files (images, PDFs)
    if (!binaryExts.includes(ext)) {
      const contentBuffer = fs.readFileSync(req.file.path);
      const content = contentBuffer.toString('utf8');

      if (ext === '.json') {
        // JSON validation
        try {
          JSON.parse(content);
        } catch {
          fs.unlinkSync(req.file.path);
          return res.status(400).json({ success: false, message: 'Invalid JSON file' });
        }
      } else {
        // Text validation: accept UTF-8 markdown/plain text, reject binary-like payloads.
        if (content.includes('\u0000')) {
          fs.unlinkSync(req.file.path);
          return res.status(400).json({ success: false, message: 'Invalid text file' });
        }
      }
    }

    // Success
    const { dataType } = req.params;
    const { filename, size } = req.file;
    console.log(`[${new Date().toISOString()}] File uploaded: ${filename} (${size} bytes) - Type: ${dataType}`);
    logPipelineEvent({ dataType, filename, size, success: true });

    // Update file list for the observations directory (where obs files actually live)
    const observationsDir = path.join(process.cwd(), 'public', 'api', 'static', 'observations');
    updateFileList(observationsDir);

    // Copy road-forecast uploads to latest.json for easy access
    if (dataType === 'road-forecast') {
      const latestPath = path.join(process.cwd(), 'public', 'api', 'static', 'road-forecast', 'latest.json');
      fs.copyFileSync(req.file.path, latestPath);
      console.log(`[${new Date().toISOString()}] Road forecast latest.json updated`);
    }

    res.status(200).json({
      success: true,
      message: `${dataType} data uploaded successfully`,
      filename,
      size,
      path: `/api/static/${dataType}/${filename}`
    });
  } catch (error) {
    console.error('Error handling file upload:', error);
    logPipelineEvent({ dataType: req.params.dataType, filename: req.file?.originalname, size: 0, success: false, error: error.message });
    res.status(500).json({ success: false, message: 'Server error processing upload' });
  }
});

// Health check route for this API.
// version + manifestVersion ride along on the call producers already make before
// every upload, so brc-tools can check contract compatibility for free, and
// "which box am I talking to?" is answerable with one curl — dev carries a -dev
// suffix, ops does not.
router.get('/health', (req, res) => {
    res.status(200).json({
        success: true,
        message: 'Data upload API is running',
        version: SERVER_VERSION,
        manifestVersion: MANIFEST_VERSION,
        timestamp: new Date().toISOString()
    });
});

export default router;
