import express from 'express';
import path from 'path';
import { promises as fs } from 'fs';

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files from the public directory
app.use('/public', express.static('public'));

// HTML Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../views/index.html'));
});

app.get('/locations', (req, res) => {
    res.sendFile(path.join(__dirname, '../views/locations.html'));
});

app.get('/forecast_outlooks', (req, res) => {
    res.sendFile(path.join(__dirname, '../views/forecast_outlooks.html'));
});

app.get('/forecast_data', (req, res) => {
    res.sendFile(path.join(__dirname, '../views/forecast_data.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function checkDirectoryStructure() {
    const dirs = [
        '../public/css',
        '../public/data',
        '../public/data/outlooks',
        '../public/images',
        '../public/js',
        '../public/partials',
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
        app.listen(PORT, () => {
            console.log(`Server running at http://localhost:${PORT}`);
            console.log('Directory structure verified');
        });
    })
    .catch(err => {
        console.error('Failed to verify directory structure:', err);
        process.exit(1);
    });