/**
 * What has been uploaded, kept in memory: for each dataType, the newest file of each product.
 *
 * A product is a family of files that differ only in their time stamp:
 * `map_obs_20261121_0755Z.json` belongs to `map_obs_*.json`. The upload route tells the index
 * about every file it accepts, so "which file is newest?" and "when did this product last
 * arrive?" are answered without listing a directory.
 *
 * Why: until 1.7.9 every one of those questions listed a whole directory. Measured on
 * 2026-11-21, with 99,000 observation files on .com and 59,000 on .dev:
 *   - GET /api/monitoring/freshness stat-ed every file, synchronously: 3.1 s on .com, 1.4 s on
 *     .dev, with the whole site waiting.
 *   - every upload rebuilt observations/filelist.json: about 100 ms of the same waiting on
 *     .dev, 165 times in under a minute when a Clyfar run arrived.
 *   - every map load sent the browser the full list of names (255 KB gzipped on .com, twice)
 *     to find one file.
 *
 * The directories stay the source of truth. The index is built from them at startup and again
 * when it is more than an hour old (files copied in or pruned by hand are then seen); nothing
 * is written to disk. Building it lists each directory once, off the event loop, and stats
 * only the newest file of each product.
 */

import fs, { promises as fsp } from 'fs';
import path from 'path';
import { UPLOAD_DATA_TYPES } from './uploadPolicy.js';

const defaultStaticRoot = () => path.resolve(process.cwd(), 'public', 'api', 'static');

/** The upload route writes each file under a name like this first, then renames it. */
export const TEMP_PREFIX = '.upload-';
export const TEMP_SUFFIX = '.part';
// A temp file this old belongs to a process that died mid-upload.
const ORPHAN_AFTER_MS = 60 * 60 * 1000;

// What a producer may send (uploadPolicy.js DEFAULT_EXTENSIONS). Anything else in an upload
// directory was put there by hand and is not a product.
const TRACKED_EXTENSIONS = new Set(['.json', '.md', '.txt', '.png', '.pdf']);

/**
 * Index files the *server* regenerates, not files a producer uploads.
 *
 * `outlooks_list.json` is rewritten by `generateOutlooksList`; `filelist.json` was rewritten on
 * every upload until 1.7.9. Their mtime is always about now, which made freshness report a
 * dataType as "fresh" when no producer had ever uploaded to it: `outlooks` on linode-dev said
 * "fresh, 0 minutes old" over a directory holding nothing but 2026-04 sample files.
 */
export const GENERATED_INDEX_FILES = new Set([
    'filelist.json',
    'outlooks_list.json',
]);

/**
 * Producers upload indexes too, and they trap freshness the same way.
 *
 * brc-tools uploads its forecast bundle as many ~1.5 MB run files *plus* a small
 * `<product>_index.json` listing them. On linode-dev the run files were being rejected by nginx
 * (413, `client_max_body_size` unset -> 1 MB default) while the 3 KB index sailed through, so
 * the index's mtime was refreshed on a directory whose newest *data* file was four months old.
 * Freshness reported `forecasts` as "stale by 164 minutes" instead of "stale by four months",
 * the difference between a blip and a dead pipeline, and nobody looked.
 *
 * So: any `*_index.json` / `*_list.json` is an index, whoever wrote it. Producers name run and
 * observation payloads with a time stamp, never with these suffixes.
 */
export function isGeneratedIndex(filename) {
    return GENERATED_INDEX_FILES.has(filename)
        || /_(index|list)\.json$/.test(filename);
}

/** `latest.json` and `latest_<persona>.json`: copies the upload route makes of a file it just took. */
export function isPointerCopy(filename) {
    return /^latest(_[a-z0-9]+)?\.json$/.test(filename);
}

// 20261121_0755Z, 20261120-1800, 20261112_0337: every stamp a producer uses.
const STAMP_RE = /(\d{8})[_-](\d{4})Z?/;

/**
 * `{ product, stamp }` for a filename. The product is the name with its time stamp replaced by
 * `*`; the stamp is `YYYYMMDDHHMM`, which sorts as text. A name with no stamp is a product of
 * its own, with an empty stamp.
 */
export function productOf(filename) {
    const match = STAMP_RE.exec(filename);
    if (!match) return { product: filename, stamp: '' };
    return {
        product: `${filename.slice(0, match.index)}*${filename.slice(match.index + match[0].length)}`,
        stamp: match[1] + match[2],
    };
}

/** Is this a file the index keeps: a producer's payload, not an index, a copy or a temp file? */
export function isTrackedFile(filename) {
    return !filename.startsWith('.')
        && TRACKED_EXTENSIONS.has(path.extname(filename).toLowerCase())
        && !isGeneratedIndex(filename)
        && !isPointerCopy(filename);
}

const isOrphanCandidate = (name) => name.startsWith(TEMP_PREFIX) && name.endsWith(TEMP_SUFFIX);

const emptyState = (exists, scannedAtMs = null) => ({ exists, scannedAtMs, error: null, products: new Map() });

function newerThan(stamp, name, entry) {
    return stamp > entry.latestStamp || (stamp === entry.latestStamp && name > entry.latestName);
}

async function inBatches(items, size, fn) {
    for (let i = 0; i < items.length; i += size) {
        await Promise.all(items.slice(i, i + size).map(fn));
    }
}

export class UploadIndex {
    constructor(staticRoot = defaultStaticRoot(), dataTypes = UPLOAD_DATA_TYPES) {
        this.staticRoot = staticRoot;
        this.dataTypes = dataTypes;
        this.state = new Map();     // dataType -> { exists, scannedAtMs, error, products }
        this.scanning = new Map();  // dataType -> Promise, while a scan runs
        this.seeded = null;
    }

    /** Resolves once every directory has been read for the first time. Never rejects. */
    ready() {
        this.seeded ??= (async () => {
            // One at a time: a listing of 99,000 names is about 10 MB while it is held.
            for (const dataType of this.dataTypes) await this.scan(dataType);
        })();
        return this.seeded;
    }

    /** Has this directory been read at least once? */
    has(dataType) {
        return this.state.has(dataType);
    }

    /** Read one directory again and fold the result in. Shared if a scan is already running. */
    scan(dataType) {
        if (!this.scanning.has(dataType)) {
            const run = this.readDirectory(dataType)
                .then((scanned) => this.adopt(dataType, scanned))
                .catch((error) => {
                    console.error(`upload index: could not read ${dataType} (${error.message})`);
                    const state = emptyState(true, Date.now());
                    state.error = error.message;
                    this.state.set(dataType, state);
                })
                .finally(() => this.scanning.delete(dataType));
            this.scanning.set(dataType, run);
        }
        return this.scanning.get(dataType);
    }

    /** Start a new scan of every directory last read more than `maxAgeMs` ago. Does not wait. */
    refreshOlderThan(maxAgeMs, now = Date.now()) {
        for (const dataType of this.dataTypes) {
            const scannedAtMs = this.state.get(dataType)?.scannedAtMs;
            if (scannedAtMs != null && now - scannedAtMs > maxAgeMs) this.scan(dataType);
        }
    }

    async readDirectory(dataType) {
        const dir = path.join(this.staticRoot, dataType);
        const startedAtMs = Date.now();
        let names;
        try {
            names = await fsp.readdir(dir);
        } catch (error) {
            if (error.code === 'ENOENT') return emptyState(false, startedAtMs);
            throw error;
        }

        const state = emptyState(true, startedAtMs);
        const orphans = [];
        for (let i = 0; i < names.length; i++) {
            // Let requests in between slices of a very long listing.
            if (i > 0 && i % 20000 === 0) await new Promise((resolve) => setImmediate(resolve));
            const name = names[i];
            if (isOrphanCandidate(name)) orphans.push(name);
            if (!isTrackedFile(name)) continue;
            const { product, stamp } = productOf(name);
            const entry = state.products.get(product);
            if (!entry) {
                state.products.set(product, { count: 1, latestName: name, latestStamp: stamp, receivedAtMs: null, receivedName: null });
            } else {
                entry.count += 1;
                if (newerThan(stamp, name, entry)) {
                    entry.latestName = name;
                    entry.latestStamp = stamp;
                }
            }
        }

        // Arrival time is known only for the newest file of each product: one stat per product,
        // not one per file.
        await inBatches([...state.products.values()], 16, async (entry) => {
            try {
                const info = await fsp.stat(path.join(dir, entry.latestName));
                entry.receivedAtMs = info.mtimeMs;
                entry.receivedName = entry.latestName;
            } catch {
                // Gone between the listing and the stat: the next scan sorts it out.
            }
        });

        await inBatches(orphans, 16, async (name) => {
            try {
                const file = path.join(dir, name);
                if (startedAtMs - (await fsp.stat(file)).mtimeMs > ORPHAN_AFTER_MS) await fsp.unlink(file);
            } catch {
                // Finished or removed meanwhile.
            }
        });
        return state;
    }

    /** Replace what is known about a dataType with a scan, keeping uploads noted while it ran. */
    adopt(dataType, scanned) {
        const before = this.state.get(dataType);
        if (before) {
            for (const [product, old] of before.products) {
                if (old.receivedAtMs == null || old.receivedAtMs <= scanned.scannedAtMs) continue;
                const now = scanned.products.get(product);
                if (!now) {
                    scanned.products.set(product, old);
                    continue;
                }
                now.count = Math.max(now.count, old.count);
                now.receivedAtMs = old.receivedAtMs;
                now.receivedName = old.receivedName;
                if (newerThan(old.latestStamp, old.latestName, now)) {
                    now.latestName = old.latestName;
                    now.latestStamp = old.latestStamp;
                }
            }
            if (before.exists) scanned.exists = true;
        }
        this.state.set(dataType, scanned);
    }

    /**
     * The upload route calls this once a file is in place under its final name.
     * @param isNew false when the upload replaced a file of the same name
     */
    noteUpload(dataType, filename, { isNew = true, atMs = Date.now() } = {}) {
        let state = this.state.get(dataType);
        if (!state) {
            state = emptyState(true);
            this.state.set(dataType, state);
        }
        state.exists = true;
        if (!isTrackedFile(filename)) return;

        const { product, stamp } = productOf(filename);
        let entry = state.products.get(product);
        if (!entry) {
            entry = { count: 0, latestName: filename, latestStamp: stamp, receivedAtMs: null, receivedName: null };
            state.products.set(product, entry);
        }
        if (isNew) entry.count += 1;
        entry.receivedAtMs = atMs;
        entry.receivedName = filename;
        // A re-sent or back-filled older run is noted as received, but is not the newest.
        if (stamp >= entry.latestStamp) {
            entry.latestName = filename;
            entry.latestStamp = stamp;
        }
    }

    /** The newest file named `<prefix><stamp><ext>` in a dataType, or null. */
    latest(dataType, prefix, ext = '.json') {
        const entry = this.state.get(dataType)?.products.get(`${prefix}*${ext}`);
        return entry ? { filename: entry.latestName, stamp: entry.latestStamp } : null;
    }

    /** `{ exists, error, scannedAtMs, products: [{ product, count, latestName, ... }] }`. */
    overview(dataType) {
        const state = this.state.get(dataType) ?? emptyState(false);
        return {
            exists: state.exists,
            error: state.error,
            scannedAtMs: state.scannedAtMs,
            products: [...state.products].map(([product, entry]) => ({ product, ...entry })),
        };
    }

    /** When anything last arrived, in any dataType, or null. */
    newestReceivedAtMs() {
        let newest = null;
        for (const state of this.state.values()) {
            for (const entry of state.products.values()) {
                if (entry.receivedAtMs != null && (newest === null || entry.receivedAtMs > newest)) newest = entry.receivedAtMs;
            }
        }
        return newest;
    }
}

const instances = new Map();

/** The index for an upload root: one per directory, so the route and the monitor share it. */
export function getUploadIndex(staticRoot = defaultStaticRoot()) {
    const root = path.resolve(staticRoot);
    if (!instances.has(root)) instances.set(root, new UploadIndex(root));
    return instances.get(root);
}

/**
 * observations/filelist.json was rewritten on every upload until 1.7.9 and nothing writes it
 * now. Left in place it would be served as a list that stopped on the day of the deploy, which
 * is the trap the old /api/filelist.json route was removed for in 2026-04.
 */
export function removeLegacyFilelist(staticRoot = defaultStaticRoot()) {
    const file = path.join(staticRoot, 'observations', 'filelist.json');
    try {
        fs.unlinkSync(file);
        console.log('Removed observations/filelist.json: the upload index replaces it');
        return true;
    } catch (error) {
        if (error.code !== 'ENOENT') console.warn(`Could not remove observations/filelist.json (${error.message})`);
        return false;
    }
}

/** Test hook. */
export function _resetUploadIndexForTests() {
    instances.clear();
}
