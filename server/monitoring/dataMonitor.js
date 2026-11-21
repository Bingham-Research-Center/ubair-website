/**
 * Data Pipeline Monitoring Service
 *
 * Tracks data freshness, upload frequency, and alerts on anomalies.
 * Uses DATA_MANIFEST.json to understand expected data flow.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GENERATED_INDEX_FILES, getUploadIndex, isGeneratedIndex } from '../uploadIndex.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// What counts as an index rather than a producer's payload is decided in uploadIndex.js, which
// builds the list of files this monitor judges. Re-exported for callers that imported it here.
export { GENERATED_INDEX_FILES, isGeneratedIndex };

// A product is stale once it is this many of its own intervals old: one missed cycle.
export const STALE_AFTER_INTERVALS = 2;
// A seasonal product (schedule.seasonal in the manifest: Clyfar and what it draws) that has
// sent nothing for this long is switched off for the season, not late. It reads "dormant".
export const DORMANT_AFTER_MINUTES = 7 * 24 * 60;
// The upload index is rebuilt from the directories when a check finds it older than this, so
// files copied in or removed by hand are seen within the hour.
const INDEX_MAX_AGE_MS = 60 * 60 * 1000;
// What freshness has always counted: .pdf and .txt arrive beside an .md or not at all.
const COUNTED_EXTENSIONS = ['.json', '.md', '.png'];

/**
 * Expand one cron field into the sorted list of values it fires on.
 *
 * Handles `*`, `N`, `A-B`, comma lists, and any of those with a `/step`.
 * Returns null if the field is not parseable, so callers can fall back.
 */
function expandCronField(field, min, max) {
    const values = new Set();

    for (const part of field.split(',')) {
        let body = part;
        let step = 1;

        const slash = part.indexOf('/');
        if (slash !== -1) {
            body = part.slice(0, slash);
            step = Number.parseInt(part.slice(slash + 1), 10);
            if (!Number.isInteger(step) || step < 1) return null;
        }

        let lo;
        let hi;
        if (body === '*') {
            lo = min;
            hi = max;
        } else if (body.includes('-')) {
            const [a, b] = body.split('-');
            lo = Number.parseInt(a, 10);
            hi = Number.parseInt(b, 10);
        } else {
            lo = Number.parseInt(body, 10);
            // `N/step` means "from N onwards", e.g. 5/15 -> 5,20,35,50
            hi = slash === -1 ? lo : max;
        }

        if (!Number.isInteger(lo) || !Number.isInteger(hi)) return null;
        if (lo < min || hi > max || lo > hi) return null;

        for (let v = lo; v <= hi; v += step) values.add(v);
    }

    return values.size ? [...values].sort((a, b) => a - b) : null;
}

/**
 * Shortest gap, in minutes, between two consecutive fires of a 5-field cron expression.
 *
 * The old implementation only recognised `*\/N ...` and `0 *\/N ...` and returned a flat 60
 * for everything else. That silently mis-read the manifest's forecasts schedule,
 * `30 3,9,15,21 * * *` — a genuinely 6-hourly job — as hourly, so once forecasts started
 * flowing again the monitor would have called them "stale" for roughly four hours out of
 * every six and raised a warning on every check. Alert noise on a monitor we had just
 * finished making trustworthy is worse than no alert at all.
 *
 * Non-cron values ('ad-hoc', 'ad-hoc (proof-of-concept)') and anything unparseable fall back
 * to 60 minutes, matching the previous default.
 *
 * Day-of-month/month/day-of-week restrictions are deliberately not modelled: they only make
 * a job fire *less* often, so ignoring them yields a shorter interval — a conservative bound
 * that can make staleness fire early, never late.
 */
export function parseCronIntervalMinutes(cronExpression) {
    return scheduleIntervalMinutes(cronExpression) ?? 60;
}

/**
 * The same, but null when the frequency is not a cron expression ('ad-hoc', 'manual', nothing).
 *
 * Freshness uses this one. Reading 'ad-hoc' as "hourly" made `outlooks`, which a person writes
 * when there is something to say, and `llm_outlooks` warn "stale" on both boxes nearly all the
 * time: a warning that is always on is not read. A product with no schedule is "unscheduled":
 * its age is reported and never judged.
 */
export function scheduleIntervalMinutes(cronExpression) {
    const DEFAULT_MINUTES = null;
    if (!cronExpression || typeof cronExpression !== 'string') return DEFAULT_MINUTES;

    const fields = cronExpression.trim().split(/\s+/);
    if (fields.length < 5) return DEFAULT_MINUTES;

    const minutes = expandCronField(fields[0], 0, 59);
    const hours = expandCronField(fields[1], 0, 23);
    if (!minutes || !hours) return DEFAULT_MINUTES;

    const fires = [];
    for (const h of hours) {
        for (const m of minutes) fires.push(h * 60 + m);
    }
    fires.sort((a, b) => a - b);

    if (fires.length === 1) return 1440; // once a day

    // Wrap from the last fire of one day to the first of the next.
    let smallest = 1440 - fires[fires.length - 1] + fires[0];
    for (let i = 1; i < fires.length; i++) {
        smallest = Math.min(smallest, fires[i] - fires[i - 1]);
    }

    return smallest > 0 ? smallest : DEFAULT_MINUTES;
}

/**
 * A manifest filename pattern (`forecast_possibility_heatmap_{member}_YYYYMMDD_HHMMZ.json`) as
 * a test for the upload index's product names (`forecast_possibility_heatmap_clyfar028_*.json`).
 */
export function productPatternToRegExp(pattern) {
    const source = String(pattern)
        .split(/(YYYYMMDD[_-]HHMMZ?|\{[^}]+\})/)
        .map((part, i) => {
            if (i % 2 === 0) return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            return part.startsWith('{') ? '[^*]+' : '\\*';
        })
        .join('');
    return new RegExp(`^${source}$`);
}

/** fresh, stale, dormant or unscheduled for something `ageMinutes` old on this schedule. */
export function judgeAge(ageMinutes, schedule) {
    const interval = scheduleIntervalMinutes(schedule?.frequency);
    if (interval === null) return { status: 'unscheduled', expectedFreqMinutes: null };
    if (ageMinutes <= interval * STALE_AFTER_INTERVALS) return { status: 'fresh', expectedFreqMinutes: interval };
    if (schedule?.seasonal === true && ageMinutes > DORMANT_AFTER_MINUTES) {
        return { status: 'dormant', expectedFreqMinutes: interval };
    }
    return { status: 'stale', expectedFreqMinutes: interval };
}

class DataMonitor {
    constructor() {
        this.manifestPath = path.join(__dirname, '../../DATA_MANIFEST.json');
        // Null means "where the upload route writes": public/api/static under the working
        // directory, resolved at each check. Until 1.7.9 this was fixed relative to this file,
        // the same place on a box but not the place a test's scratch box uploads to.
        this.staticDir = null;
        this.manifest = this.loadManifest();
        this.stats = {
            uploads: {},
            lastCheck: null,
            alerts: []
        };
    }

    loadManifest() {
        try {
            const content = fs.readFileSync(this.manifestPath, 'utf8');
            return JSON.parse(content);
        } catch (error) {
            console.error('Failed to load manifest:', error);
            return null;
        }
    }

    /**
     * Check data freshness for all data types.
     *
     * Read from the upload index, never from the directories: until 1.7.9 this stat-ed every
     * uploaded file on every call, synchronously (3.1 s on .com with 275,000 files).
     *
     * A dataType whose manifest entry lists `products` is judged product by product, each on
     * its own schedule, and is as stale as its stalest one. Judged as one directory,
     * `forecasts` could not go stale: the hourly HRRR point files kept it "fresh" whether or
     * not the six-hourly surface layers or the Clyfar run had arrived.
     */
    async checkDataFreshness() {
        if (!this.manifest) return { error: 'Manifest not loaded' };

        const index = getUploadIndex(this.staticDir ?? undefined);
        await index.ready();
        index.refreshOlderThan(INDEX_MAX_AGE_MS);

        const results = {};
        const now = Date.now();

        for (const [dataType, spec] of Object.entries(this.manifest.dataTypes || {})) {
            const subDir = spec.endpoint.split('/').pop();
            try {
                // A manifest may name a directory the upload route does not: read it on demand.
                if (!index.has(subDir)) await index.scan(subDir);
                results[dataType] = this.freshnessOf(index.overview(subDir), subDir, spec, now);
            } catch (error) {
                results[dataType] = { status: 'error', message: error.message };
            }

            const result = results[dataType];
            if (result.status === 'stale') {
                const which = result.staleProducts?.length ? `: ${result.staleProducts.join(', ')}` : '';
                this.addAlert(
                    'warning',
                    `${dataType} data is stale${which} (${result.ageMinutes} minutes old, expected every ${result.expectedFreqMinutes} minutes)`
                );
            }
        }

        this.stats.lastCheck = new Date().toISOString();
        return results;
    }

    /** One dataType's entry in the freshness answer, from the upload index's view of it. */
    freshnessOf(view, subDir, spec, now) {
        if (!view.exists) {
            // Report the public-relative path: these results are served over
            // /api/monitoring/*, so don't leak the server's absolute filesystem layout.
            return {
                status: 'missing',
                message: `No uploads received yet (public/api/static/${subDir} does not exist)`
            };
        }
        if (view.error) return { status: 'error', message: view.error };

        const products = view.products.filter((entry) => entry.receivedAtMs != null
            && COUNTED_EXTENSIONS.some((ext) => entry.product.toLowerCase().endsWith(ext)));
        if (products.length === 0) {
            return {
                status: 'no_data',
                message: 'No data files found (directory holds only index files)'
            };
        }

        const describe = (group, schedule) => {
            const newest = group.reduce((a, b) => (b.receivedAtMs > a.receivedAtMs ? b : a));
            const ageMinutes = Math.floor((now - newest.receivedAtMs) / 60000);
            const { status, expectedFreqMinutes } = judgeAge(ageMinutes, schedule);
            return {
                status,
                latestFile: newest.receivedName,
                ageMinutes,
                expectedFreqMinutes,
                totalFiles: group.reduce((sum, entry) => sum + entry.count, 0),
                lastUpdate: new Date(newest.receivedAtMs).toISOString()
            };
        };

        const result = describe(products, spec.schedule);

        const declared = Object.entries(spec.products || {})
            .filter(([, product]) => typeof product?.filename?.pattern === 'string');
        if (declared.length === 0) return result;

        const claimed = new Set();
        result.products = {};
        for (const [name, product] of declared) {
            const pattern = productPatternToRegExp(product.filename.pattern);
            const group = products.filter((entry) => pattern.test(entry.product));
            group.forEach((entry) => claimed.add(entry.product));
            result.products[name] = group.length > 0
                ? describe(group, product.schedule ?? spec.schedule)
                : { status: 'no_data', message: 'No file of this product on this box' };
        }

        // The directory is as stale as its stalest product, and as fresh as its freshest only
        // if none is late.
        const judged = Object.entries(result.products);
        const stale = judged.filter(([, entry]) => entry.status === 'stale').map(([name]) => name);
        const intervals = judged.map(([, entry]) => entry.expectedFreqMinutes).filter(Number.isFinite);
        if (stale.length > 0) {
            result.status = 'stale';
            result.staleProducts = stale;
        } else if (judged.some(([, entry]) => entry.status === 'fresh')) {
            result.status = 'fresh';
        } else if (judged.some(([, entry]) => entry.status === 'dormant')) {
            result.status = 'dormant';
        }
        if (intervals.length > 0) result.expectedFreqMinutes = Math.min(...intervals);

        // Files arriving that the manifest does not list: the contract is behind the feed.
        // Member and run numbers are folded so 31 ensemble members read as one line.
        const undeclared = [...new Set(products
            .filter((entry) => !claimed.has(entry.product))
            .map((entry) => entry.product.replace(/\d{2,}/g, '#')))].sort();
        if (undeclared.length > 0) result.undeclared = undeclared.slice(0, 20);

        return result;
    }

    /**
     * Parse cron frequency to minutes
     */
    parseFrequency(cronExpression) {
        return parseCronIntervalMinutes(cronExpression);
    }

    /**
     * Get upload statistics from logs
     */
    getUploadStats(logPath = '/tmp/basinwx_upload.log') {
        if (!fs.existsSync(logPath)) {
            return { error: 'Log file not found' };
        }

        try {
            const logContent = fs.readFileSync(logPath, 'utf8');
            const lines = logContent.split('\n');

            const stats = {
                total: 0,
                success: 0,
                failed: 0,
                byDataType: {},
                recentUploads: []
            };

            // Parse last 1000 lines
            for (const line of lines.slice(-1000)) {
                if (line.includes('Upload successful')) {
                    stats.success++;
                    stats.total++;

                    // Extract data type if possible
                    const match = line.match(/Type: (\w+)/);
                    if (match) {
                        const dataType = match[1];
                        stats.byDataType[dataType] = (stats.byDataType[dataType] || 0) + 1;
                    }
                }

                if (line.includes('Upload failed')) {
                    stats.failed++;
                    stats.total++;
                }
            }

            stats.successRate = stats.total > 0
                ? ((stats.success / stats.total) * 100).toFixed(1)
                : 0;

            return stats;

        } catch (error) {
            return { error: error.message };
        }
    }

    /**
     * Add alert
     */
    addAlert(level, message) {
        this.stats.alerts.push({
            level,
            message,
            timestamp: new Date().toISOString()
        });

        // Keep only last 50 alerts
        if (this.stats.alerts.length > 50) {
            this.stats.alerts = this.stats.alerts.slice(-50);
        }

        console.log(`[ALERT:${level.toUpperCase()}] ${message}`);
    }

    /**
     * Get comprehensive status report
     */
    async getStatusReport() {
        const freshness = await this.checkDataFreshness();
        const uploadStats = this.getUploadStats();

        return {
            timestamp: new Date().toISOString(),
            manifest: {
                version: this.manifest?.version,
                loaded: !!this.manifest
            },
            dataFreshness: freshness,
            uploadStats,
            alerts: this.stats.alerts,
            summary: this.generateSummary(freshness, uploadStats)
        };
    }

    /**
     * Generate summary of pipeline health
     */
    generateSummary(freshness, uploadStats) {
        const issues = [];
        const dataTypes = Object.keys(this.manifest?.dataTypes || {});

        // Check each data type
        for (const dataType of dataTypes) {
            const status = freshness[dataType];
            if (!status) continue;

            if (status.status === 'stale') {
                const which = status.staleProducts?.length ? ` (${status.staleProducts.join(', ')})` : '';
                issues.push(`${dataType} data is stale${which}`);
            } else if (status.status === 'missing' || status.status === 'no_data') {
                issues.push(`${dataType} data missing`);
            }
        }

        // Check upload success rate
        if (uploadStats.successRate && parseFloat(uploadStats.successRate) < 90) {
            issues.push(`Upload success rate is low: ${uploadStats.successRate}%`);
        }

        return {
            overallHealth: issues.length === 0 ? 'healthy' : 'degraded',
            issues,
            dataTypesMonitored: dataTypes.length,
            lastCheck: this.stats.lastCheck
        };
    }

    /**
     * Clear old alerts
     */
    clearAlerts() {
        this.stats.alerts = [];
    }
}

// Singleton instance
let monitorInstance = null;

export function getMonitor() {
    if (!monitorInstance) {
        monitorInstance = new DataMonitor();
    }
    return monitorInstance;
}

export default DataMonitor;
