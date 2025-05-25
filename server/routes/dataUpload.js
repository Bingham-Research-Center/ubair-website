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

    if (!providedKey) {
        return res.status(401).json({
            success: false,
            message: 'Missing API key in X-API-Key header'
        });
    }

    if (!validKey) {
        console.error('Server configuration error: DATA_UPLOAD_API_KEY not set');
        return res.status(500).json({
            success: false,
            message: 'Server configuration error'
        });
    }

    if (providedKey !== validKey) {
        console.log(`Invalid API key attempt from ${req.ip}`);
        return res.status(401).json({
            success: false,
            message: 'Invalid API key'
        });
    }

    next();
}

// Middleward to check IP against whitelisting
function validateIpAddress(req, res, next) {
    // Get the real client IP (handles proxies/load balancers)
    const clientIp = req.headers['x-forwarded-for']?.split(',')[0] ||
        req.headers['x-real-ip'] ||
        req.connection.remoteAddress ||
        req.ip;

    const allowedIps = ['155.101.26.78', '155.101.26.79'];

    if (!allowedIps.includes(clientIp)) {
        console.log(`Access denied from IP: ${clientIp}`);
        return res.status(403).json({
            success: false,
            message: `Forbidden: Access denied from IP ${clientIp}`
        });
    }

    console.log(`Access granted to IP: ${clientIp}`);
    next();
}


// Main upload route
router.post('/upload/:dataType', validateIpAddress, validateApiKey, upload.single('file'), (req, res) => {
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