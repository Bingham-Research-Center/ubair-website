// server/generateOutlooksList.js
// This script scans the outlooks directory and generates a JSON index file
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function generateOutlooksList() {
    try {
        // Path to outlooks directory
        const outlooksDir = path.join(__dirname, '../public/api/static/outlooks');

        // Ensure directory exists
        try {
            await fs.access(outlooksDir);
        } catch (error) {
            await fs.mkdir(outlooksDir, { recursive: true });
            console.log('Created outlooks directory');
        }

        // Read all files in the directory
        const files = await fs.readdir(outlooksDir);

        // Filter for markdown files and extract metadata
        const outlooks = files
            .filter(file => file.endsWith('.md') && file !== 'template.md')
            .map(filename => {
                // Extract date from filename (assuming format: outlook_YYYYMMDD_HHMM.md)
                const match = filename.match(/outlook_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})\.md/);
                if (match) {
                    const [_, year, month, day, hour, minute] = match;
                    const date = new Date(`${year}-${month}-${day}T${hour}:${minute}:00`).toISOString();
                    return { filename, date };
                }
                // Fallback for differently named files - use file stats
                return { filename, date: new Date().toISOString() };
            })
            .sort((a, b) => new Date(b.date) - new Date(a.date)); // Sort newest first

        // Write the index file
        const indexPath = path.join(outlooksDir, 'outlooks_list.json');
        await fs.writeFile(indexPath, JSON.stringify(outlooks, null, 2));

        console.log(`Generated outlooks list with ${outlooks.length} entries`);
        return outlooks;
    } catch (error) {
        console.error('Error generating outlooks list:', error);
        return [];
    }
}

// Run this script directly if called from command line
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    generateOutlooksList().catch(console.error);
}