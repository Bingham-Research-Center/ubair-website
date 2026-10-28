import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import {
    readGitInfo,
    checkVendorAssets,
    getBuildInfo,
    VENDOR_ASSET_DIRS,
    _resetBuildInfoForTests,
} from '../buildInfo.js';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');

beforeEach(() => _resetBuildInfoForTests());

test('reports the commit and branch git itself reports for this checkout', () => {
    const expected = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim();
    const info = readGitInfo(repoRoot);
    expect(info.commit).toBe(expected);
    expect(typeof info.branch).toBe('string');
});

test('degrades to nulls outside a git repository instead of throwing', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'buildinfo-'));
    expect(readGitInfo(tmp)).toEqual({ commit: null, branch: null });
});

test('vendor check names every missing directory', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'buildinfo-'));
    expect(checkVendorAssets(tmp)).toEqual({ ok: false, missing: VENDOR_ASSET_DIRS });

    fs.mkdirSync(path.join(tmp, VENDOR_ASSET_DIRS[1]), { recursive: true });
    const partial = checkVendorAssets(tmp);
    expect(partial.ok).toBe(false);
    expect(partial.missing).not.toContain(VENDOR_ASSET_DIRS[1]);
});

test('getBuildInfo is computed once and frozen', () => {
    const a = getBuildInfo(repoRoot);
    const b = getBuildInfo(repoRoot);
    expect(b).toBe(a);
    expect(Object.isFrozen(a)).toBe(true);
    expect(a.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(a.vendorAssets).toHaveProperty('ok');
});
