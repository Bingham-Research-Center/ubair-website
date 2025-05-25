import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const router = express.Router();

// Configure file storage
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(process.cwd(), 'public', 'data');

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
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    },
    fileFilter: function (req, file, cb) {
        // Only allow JSON files
        if (file.mimetype === 'application/json' || file.originalname.endsWith('.json')) {
            cb(null, true);
        } else {
            cb(new Error('Only JSON files are allowed'));
        }
    }
});

// Middleware to validate API key
function validateApiKey(req, res, next) {
    const providedKey = req.headers['x-api-key'];
    const validKey = process.env.DATA_UPLOAD_API_KEY;

    // Debug logging (remove in production)
    console.log('API Key validation:');
    console.log('- Valid key exists:', !!validKey);
    console.log('- Valid key length:', validKey ? validKey.length : 0);
    console.log('- Provided key exists:', !!providedKey);
    console.log('- Provided key length:', providedKey ? providedKey.length : 0);
    console.log('- Keys match:', providedKey === validKey);

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

        console.log(`Validating request from IP: ${clientIp}, Hostname: ${clientHostname}`);

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
router.post('/upload/:dataType', validateApiKey, validateCHPCOrigin, upload.single('file'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No file uploaded'
            });
        }

        const { dataType } = req.params;
        const filename = req.file.filename;
        const fileSize = req.file.size;

        console.log(`[${new Date().toISOString()}] File uploaded: ${filename} (${fileSize} bytes) - Type: ${dataType}`);

        // Validate JSON content
        try {
            const fileContent = fs.readFileSync(req.file.path, 'utf8');
            JSON.parse(fileContent); // This will throw if invalid JSON
        } catch (jsonError) {
            // Delete the invalid file
            fs.unlinkSync(req.file.path);
            return res.status(400).json({
                success: false,
                message: 'Invalid JSON file'
            });
        }

        // Success response
        res.status(200).json({
            success: true,
            message: `${dataType} data uploaded successfully`,
            filename: filename,
            size: fileSize
        });

    } catch (error) {
        console.error('Error handling file upload:', error);
        res.status(500).json({
            success: false,
            message: 'Server error processing upload'
        });
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