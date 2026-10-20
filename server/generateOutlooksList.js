// server/generateOutlooksList.js
// This script scans the outlooks directory and generates a JSON index file
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_OUTLOOKS_DIR = path.join(__dirname, '../public/api/static/outlooks');

// Only issued outlooks count. Anything else in the folder (template-2025-2026.md,
// images) must never reach the list: index 0 is shown as "the latest outlook".
const OUTLOOK_FILE_RE = /^outlook_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})\.md$/;

export async function generateOutlooksList(outlooksDir = DEFAULT_OUTLOOKS_DIR) {
    try {
        // Ensure directory exists
        try {
            await fs.access(outlooksDir);
        } catch (error) {
            await fs.mkdir(outlooksDir, { recursive: true });
            console.log('Created outlooks directory');
        }

        const files = await fs.readdir(outlooksDir);

        const outlooks = files
            .filter(file => OUTLOOK_FILE_RE.test(file))
            .map(filename => {
                const [, year, month, day, hour, minute] = filename.match(OUTLOOK_FILE_RE);
                const date = new Date(`${year}-${month}-${day}T${hour}:${minute}:00`).toISOString();
                // Shown as "Issued: …" on the homepage (public/js/index_outlook.js)
                const formattedDate = new Date(date).toLocaleString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true
                });
                return { filename, date, formattedDate };
            })
            .sort((a, b) => new Date(b.date) - new Date(a.date)); // Sort newest first

        // Write the index file
        await fs.writeFile(
            path.join(outlooksDir, 'outlooks_list.json'),
            JSON.stringify(outlooks, null, 2)
        );

        return outlooks;
    } catch (error) {
        console.error('Error generating outlooks list:', error);
        return [];
    }
}

// Run this script directly if called from command line
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    generateOutlooksList()
        .then(outlooks => console.log(`Generated outlooks list with ${outlooks.length} entries`))
        .catch(console.error);
}
