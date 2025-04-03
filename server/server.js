import express from 'express';
import path from 'path';
import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';

const app = express();
const PORT = process.env.PORT || 3000;

// Single static files middleware with all headers
app.use('/public', express.static('public', {
    setHeaders: (res, path) => {
        if (path.endsWith('.js')) {
            res.setHeader('Content-Type', 'application/javascript');
            res.setHeader('Cache-Control', 'no-cache');
        }
    }
}));

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

app.get('/api/live-observations', async (req, res) => {
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
// Add this function to server.js
async function generateOutlookFileList() {
    try {
        const directory = path.join(__dirname, '../public/data/outlooks');
        const files = await fs.readdir(directory);

        // Filter for markdown files and sort by name (assuming names include dates)
        const markdownFiles = files
            .filter(file => file.endsWith('.md') && file !== 'template.md')
            .sort((a, b) => b.localeCompare(a)); // Sort in reverse alphabetical order (newest first)

        // Write the file list to a JSON file
        await fs.writeFile(
            path.join(directory, 'file_list.json'),
            JSON.stringify(markdownFiles)
        );

        console.log('Outlook file list generated successfully');
    } catch (error) {
        console.error('Error generating outlook file list:', error);
    }
}

// Call this function when the server starts and set up a periodic refresh
checkDirectoryStructure()
    .then(() => {
        generateOutlookFileList(); // Generate initial file list
        setInterval(generateOutlookFileList, 60 * 60 * 1000); // Refresh every hour

        app.listen(PORT, () => {
            console.log(`Server running at http://localhost:${PORT}`);
            console.log('Directory structure verified');
        });
    })
    .catch(err => {
        console.error('Failed to verify directory structure:', err);
        process.exit(1);
    });

// In server.js, add:
import { generateOutlooksList } from './generateOutlooksList.js';

// Run initially when server starts
generateOutlooksList();
// generateOutlookFileList()

// Schedule to run every hour
// setInterval(generateOutlookFileList, 60 * 60 * 1000);
setInterval(generateOutlooksList, 60 * 60 * 1000);