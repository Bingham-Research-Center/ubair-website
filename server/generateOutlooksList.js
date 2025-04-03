// server/generateOutlooksList.js
import { promises as fs } from 'fs';
import path from 'path';

/**
 * Scans the outlooks directory and creates a JSON file with the list of available outlook files.
 * @returns {Promise<string[]>} Array of outlook filenames
 */
export async function generateOutlooksList() {
    try {
        const outlooksDir = path.join(process.cwd(), 'public', 'data', 'outlooks');

        // Ensure the directory exists
        await fs.mkdir(outlooksDir, { recursive: true });

        // Read the directory
        const files = await fs.readdir(outlooksDir);

        // Filter for markdown files and sort by name (reverse chronological if named by date)
        const outlookFiles = files
            .filter(file => file.endsWith('.md') && file !== 'template.md')
            .sort((a, b) => b.localeCompare(a)); // Newest first

        // Write to a JSON file
        await fs.writeFile(
            path.join(outlooksDir, 'file_list.json'),
            JSON.stringify(outlookFiles, null, 2)
        );

        console.log(`Generated outlook file list with ${outlookFiles.length} files`);
        return outlookFiles;
    } catch (error) {
        console.error('Error generating outlooks list:', error);
        return [];
    }
}

// Allow importing as a default export too for flexibility
export default { generateOutlooksList };