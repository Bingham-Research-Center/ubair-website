import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Every local file a page asks for must exist. Deleting an image or stylesheet that a page
// still links (as happened to icons and logos more than once) fails here instead of as a 404
// on the live site. Uploaded data under /public/api/static is not in the repo and is skipped.

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function pages() {
    const list = [];
    for (const dir of ['views', 'public/partials']) {
        for (const name of fs.readdirSync(path.join(repoRoot, dir))) {
            if (name.endsWith('.html')) list.push(`${dir}/${name}`);
        }
    }
    return list;
}

describe('local assets', () => {
    test.each(pages())('%s links only files that exist', (page) => {
        const html = fs.readFileSync(path.join(repoRoot, page), 'utf8')
            .replace(/<!--[\s\S]*?-->/g, '');
        const missing = [...html.matchAll(/(?:src|href)="(\/public\/[^"?#]+)/g)]
            .map((match) => match[1])
            .filter((url) => !url.startsWith('/public/api/static/'))
            .filter((url) => !fs.existsSync(path.join(repoRoot, url)));
        expect(missing).toEqual([]);
    });
});
