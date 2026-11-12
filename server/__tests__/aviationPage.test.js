import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import request from 'supertest';
import app from '../server.js';

// Aviation came back to dev in 1.6.1 as a finished page: KVEL runway winds, observed and
// HRRR-forecast. The placeholder panels it was parked with (METAR, TAF, icing, ...) stay parked.

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (file) => fs.readFileSync(path.join(repoRoot, file), 'utf8');

describe('aviation page', () => {
    test('is served', async () => {
        const res = await request(app).get('/aviation').expect(200);
        expect(res.text).toContain('id="crosswindTable"');
        expect(res.text).toContain('/public/js/aviation.js');
    });

    test('is in the sidebar and carries a disclaimer', () => {
        expect(read('public/partials/sidebar.html')).toContain('href="/aviation"');
        expect(read('public/js/loadSidebar.js')).toMatch(/'\/aviation':\s*`DISCLAIMER/);
    });

    test('has no placeholder panels', () => {
        expect(read('views/aviation.html')).not.toMatch(/placeholder|coming soon|TAF\b.*coming/i);
    });
});
