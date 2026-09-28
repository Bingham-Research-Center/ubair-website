import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from '@jest/globals';

const agriculturePage = new URL('../agriculture.html', import.meta.url);

describe('Agriculture page', () => {
    it('includes a clearly labelled first-frost HRRR holding area', async () => {
        const page = await readFile(fileURLToPath(agriculturePage), 'utf8');

        expect(page).toContain('id="first-frost-heading"');
        expect(page).toContain('First Frost');
        expect(page).toContain('HRRR data holding area');
        expect(page).toContain('not yet a first-frost forecast');
    });
});
