import express from 'express';
import path from 'path';
import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_PATH = '/dev';

// Single static files middleware with all headers
app.use(`${BASE_PATH}/public`, express.static('public', {
    setHeaders: (res, path) => {
        if (path.endsWith('.js')) {
            res.setHeader('Content-Type', 'application/javascript');
            res.setHeader('Cache-Control', 'no-cache');
        }
    }
}));

// HTML Routes
app.get(`${BASE_PATH}/`, (req, res) => {
    res.sendFile(path.join(__dirname, '../views/index.html'));
});

app.get(`${BASE_PATH}/locations`, (req, res) => {
    res.sendFile(path.join(__dirname, '../views/locations.html'));
});

app.get(`${BASE_PATH}/forecast_outlooks`, (req, res) => {
    res.sendFile(path.join(__dirname, '../views/forecast_outlooks.html'));
});

app.get(`${BASE_PATH}/forecast_data`, (req, res) => {
    res.sendFile(path.join(__dirname, '../views/forecast_data.html'));
});

app.get(`${BASE_PATH}/api/live-observations`, async (req, res) => {
    try {
        const data = await fs.readFile('./public/data/liveobs.json');
        res.json(JSON.parse(data));
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch data' });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function checkDirectoryStructure() {
    const dirs = [
        '../../public/css',
        '../../public/data',
        '../../public/data/outlooks',
        '../../public/images',
        '../../public/js',
        '../../public/partials',
    ];

    for (const dir of dirs) {
        try {
            await fs.access(path.join(__dirname, dir));
        } catch {
            console.log(`Creating directory: ${dir}`);
            await fs.mkdir(path.join(__dirname, dir), { recursive: true });
        }
    }
}

// Start server
checkDirectoryStructure()
    .then(() => {
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`Server running on port ${PORT}`);
            console.log('Directory structure verified');
        });
    })
    .catch(err => {
        console.error('Failed to verify directory structure:', err);
        process.exit(1);
    });