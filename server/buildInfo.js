/**
 * Build info for /api/health: which commit is running, on which branch, since when,
 * and whether the vendor assets the roads page serves out of node_modules are present.
 *
 * Read once at startup and cached. Producers call /api/health before every upload, so
 * nothing here may touch git or disk per request.
 *
 * Why this exists: on 2026-09-23 prod was still on 1.5.3 after v1.5.4 shipped, and the
 * only way to tell from outside was to notice that /vendor/leaflet.markercluster/... 404ed.
 * The version string alone does not say whether `git pull` ran, whether `npm install`
 * ran, or whether pm2 actually restarted.
 */

import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..');

// Must match the express.static mounts in server/server.js. If a mount is added there,
// add its directory here so /api/health can report it missing after a deploy that
// skipped `npm install`.
export const VENDOR_ASSET_DIRS = [
    'node_modules/leaflet/dist',
    'node_modules/leaflet.markercluster/dist',
    'node_modules/@fortawesome/fontawesome-free',
];

function git(args, cwd) {
    try {
        return execFileSync('git', args, {
            cwd,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
            timeout: 3000,
        }).trim() || null;
    } catch {
        return null;
    }
}

/** Commit + branch of the working tree at `repoRoot`. Nulls when git or the repo is absent. */
export function readGitInfo(repoRoot = REPO_ROOT) {
    return {
        commit: git(['rev-parse', '--short', 'HEAD'], repoRoot),
        branch: git(['rev-parse', '--abbrev-ref', 'HEAD'], repoRoot),
    };
}

/** Which vendor asset directories are missing under `repoRoot` (empty list = all present). */
export function checkVendorAssets(repoRoot = REPO_ROOT) {
    const missing = VENDOR_ASSET_DIRS.filter(rel => !fs.existsSync(path.join(repoRoot, rel)));
    return { ok: missing.length === 0, missing };
}

let cached = null;

/** The block /api/health embeds. Computed on first call, then frozen for the process lifetime. */
export function getBuildInfo(repoRoot = REPO_ROOT) {
    if (!cached) {
        cached = Object.freeze({
            ...readGitInfo(repoRoot),
            startedAt: new Date().toISOString(),
            vendorAssets: checkVendorAssets(repoRoot),
        });
    }
    return cached;
}

/** Test hook. */
export function _resetBuildInfoForTests() {
    cached = null;
}
