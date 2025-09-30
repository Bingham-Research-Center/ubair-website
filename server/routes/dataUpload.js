import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { promisify } from 'util';
import dns from 'dns';

const reverseLookup = promisify(dns.reverse);

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
            'images': 'images',
            'timeseries': 'timeseries'
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

// Middleware to validate API key
function validateApiKey(req, res, next) {
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

    // Invalid type
    if (ext !== '.json' && !textExts.includes(ext)) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ success: false, message: 'Invalid file type' });
    }

    const content = fs.readFileSync(req.file.path, 'utf8');

    if (ext === '.json') {
      // JSON validation
      try {
        JSON.parse(content);
      } catch {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ success: false, message: 'Invalid JSON file' });
      }
    } else {
      // Plain-text validation (ASCII only)
      if (!/^[\x00-\x7F]*$/.test(content)) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ success: false, message: 'Invalid text file' });
      }
    }

    // Success
    const { dataType } = req.params;
    const { filename, size } = req.file;
    console.log(`[${new Date().toISOString()}] File uploaded: ${filename} (${size} bytes) - Type: ${dataType}`);

    // Update file list for the base static directory
    const staticDir = path.join(process.cwd(), 'public', 'api', 'static');
    updateFileList(staticDir);

    res.status(200).json({
      success: true,
      message: `${dataType} data uploaded successfully`,
      filename,
      size,
      path: `/api/static/${dataType}/${filename}`
    });
  } catch (error) {
    console.error('Error handling file upload:', error);
    res.status(500).json({ success: false, message: 'Server error processing upload' });
  }
});

// Health check route for this API
router.get('/health', (req, res) => {
    res.status(200).json({
        success: true,
        message: 'Data upload API is running',
        timestamp: new Date().toISOString()
    });
});

export default router;