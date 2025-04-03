import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Export as default (not named)
async function generateOutlooksList() {
    try {
        const outlooksDir = path.join(__dirname, '..', 'public/data/outlooks');
        const files = await fs.readdir(outlooksDir);

        // Filter for only markdown files with our naming convention
        const outlookFiles = files.filter(file =>
            file.match(/outlook_\d{8}.*\.md/) ||
            file.endsWith('.md') && !file.includes('template')
        );

        // Extract metadata and sort by date (newest first)
        const outlooks = outlookFiles.map(filename => {
            // Try to extract date from filename
            let date;
            const dateMatch = filename.match(/(\d{4})(\d{2})(\d{2})/);

            if (dateMatch) {
                const [_, year, month, day] = dateMatch;
                date = new Date(`${year}-${month}-${day}`);
            } else {
                // If no date in filename, use file stats
                date = new Date(); // Fallback to current date
            }

            return {
                filename,
                date: date.toISOString(),
                displayDate: date.toLocaleString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                })
            };
        })
            .sort((a, b) => new Date(b.date) - new Date(a.date));

        // Write the JSON file
        await fs.writeFile(
            path.join(outlooksDir, 'file_list.json'),
            JSON.stringify(outlooks, null, 2)
        );

        console.log(`Generated outlooks list with ${outlooks.length} files`);
        return outlooks;
    } catch (error) {
        console.error('Error generating outlooks list:', error);
        return [];
    }
}

// This exports the function as default
export default generateOutlooksList;