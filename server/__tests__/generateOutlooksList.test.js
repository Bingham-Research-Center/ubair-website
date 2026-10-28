import { afterEach, beforeEach, describe, expect, test } from '@jest/globals';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { generateOutlooksList } from '../generateOutlooksList.js';

// Runs against a temp directory only — never the live public/api/static/outlooks.
let dir;

beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'outlooks-'));
    for (const name of [
        'outlook_20240205_1115.md',
        'outlook_20241230_1430.md',
        'outlook_20240315_0930.md',
        'template-2025-2026.md',
        'template.md',
        'UB_01_UStateLeft_Gray.png'
    ]) {
        await fs.writeFile(path.join(dir, name), '');
    }
});

afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
});

describe('generateOutlooksList', () => {
    test('lists only issued outlooks, newest first', async () => {
        const outlooks = await generateOutlooksList(dir);

        expect(outlooks.map(o => o.filename)).toEqual([
            'outlook_20241230_1430.md',
            'outlook_20240315_0930.md',
            'outlook_20240205_1115.md'
        ]);
    });

    test('keeps the formattedDate the homepage shows as "Issued:"', async () => {
        const [latest] = await generateOutlooksList(dir);

        expect(latest.formattedDate).toMatch(/^December 30, 2024 at \d{1,2}:\d{2}\s?[AP]M$/);
    });

    test('writes the same list to outlooks_list.json', async () => {
        const outlooks = await generateOutlooksList(dir);
        const written = JSON.parse(await fs.readFile(path.join(dir, 'outlooks_list.json'), 'utf8'));

        expect(written).toEqual(outlooks);
    });
});
