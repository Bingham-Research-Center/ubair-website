/**
 * Data Pipeline Monitoring Service
 *
 * Tracks data freshness, upload frequency, and alerts on anomalies.
 * Uses DATA_MANIFEST.json to understand expected data flow.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Index files the *server* regenerates, not files a producer uploads.
 *
 * `filelist.json` is rewritten by `updateFileList()` on every observations/metadata
 * upload; `outlooks_list.json` is rewritten by `generateOutlooksList`. Their mtime is
 * therefore always ~now, which makes freshness report a dataType as "fresh" even when no
 * producer has ever uploaded to it — exactly what `outlooks` did on linode-dev (status
 * "fresh", ageMinutes 0, on a directory holding nothing but 2026-04 sample files).
 *
 * Freshness must be judged on producer-written files only.
 */
export const GENERATED_INDEX_FILES = new Set([
    'filelist.json',
    'outlooks_list.json',
]);

/**
 * Producers upload indexes too, and they trap freshness the same way.
 *
 * An exact-name Set was not enough. brc-tools uploads its forecast bundle as many ~1.5 MB
 * run files *plus* a small `<product>_index.json` listing them. On linode-dev the run files
 * were being rejected by nginx (413, `client_max_body_size` unset -> 1 MB default) while the
 * 3 KB index sailed through, so the index's mtime was refreshed hourly on a directory whose
 * newest *data* file was four months old. Freshness reported `forecasts` as "stale by 164
 * minutes" instead of "stale by four months", which is the difference between a blip and a
 * dead pipeline — and nobody looked.
 *
 * So: treat any `*_index.json` / `*_list.json` as an index regardless of who wrote it.
 * Producers name run/observation payloads with a timestamp, never with these suffixes.
 */
export function isGeneratedIndex(filename) {
    return GENERATED_INDEX_FILES.has(filename)
        || /_(index|list)\.json$/.test(filename);
}

class DataMonitor {
    constructor() {
        this.manifestPath = path.join(__dirname, '../../DATA_MANIFEST.json');
        this.staticDir = path.join(__dirname, '../../public/api/static');
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
     * Check data freshness for all data types
     */
    checkDataFreshness() {
        if (!this.manifest) return { error: 'Manifest not loaded' };

        const results = {};
        const now = Date.now();

        for (const [dataType, spec] of Object.entries(this.manifest.dataTypes || {})) {
            const subDir = spec.endpoint.split('/').pop();
            const dataDir = path.join(this.staticDir, subDir);

            if (!fs.existsSync(dataDir)) {
                // Report the public-relative path — these results are served over
                // /api/monitoring/*, so don't leak the server's absolute filesystem layout.
                results[dataType] = {
                    status: 'missing',
                    message: `No uploads received yet (public/api/static/${subDir} does not exist)`
                };
                continue;
            }

            try {
                const files = fs.readdirSync(dataDir)
                    .filter(f => f.endsWith('.json') || f.endsWith('.md') || f.endsWith('.png'))
                    // Indexes (server-regenerated or producer-uploaded) would otherwise pin
                    // ageMinutes to ~0 forever and mask a dead producer. See isGeneratedIndex.
                    .filter(f => !isGeneratedIndex(f))
                    .map(f => ({
                        name: f,
                        path: path.join(dataDir, f),
                        mtime: fs.statSync(path.join(dataDir, f)).mtime.getTime()
                    }))
                    .sort((a, b) => b.mtime - a.mtime);

                if (files.length === 0) {
                    results[dataType] = {
                        status: 'no_data',
                        message: 'No data files found (directory holds only index files)'
                    };
                    continue;
                }

                const latestFile = files[0];
                const ageMinutes = Math.floor((now - latestFile.mtime) / 60000);
                const expectedFreq = this.parseFrequency(spec.schedule?.frequency);

                const isStale = ageMinutes > expectedFreq * 2;

                results[dataType] = {
                    status: isStale ? 'stale' : 'fresh',
                    latestFile: latestFile.name,
                    ageMinutes,
                    expectedFreqMinutes: expectedFreq,
                    totalFiles: files.length,
                    lastUpdate: new Date(latestFile.mtime).toISOString()
                };

                if (isStale) {
                    this.addAlert(
                        'warning',
                        `${dataType} data is stale (${ageMinutes} minutes old, expected every ${expectedFreq} minutes)`
                    );
                }

            } catch (error) {
                results[dataType] = {
                    status: 'error',
                    message: error.message
                };
            }
        }

        this.stats.lastCheck = new Date().toISOString();
        return results;
    }

    /**
     * Parse cron frequency to minutes
     */
    parseFrequency(cronExpression) {
        if (!cronExpression) return 60; // default 60 minutes

        // Simple parser for common patterns
        if (cronExpression.startsWith('*/')) {
            const minutes = parseInt(cronExpression.split(' ')[0].substring(2));
            return minutes;
        }

        if (cronExpression.startsWith('0 */')) {
            const hours = parseInt(cronExpression.split(' ')[1].substring(2));
            return hours * 60;
        }

        // Default to hourly
        return 60;
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
    getStatusReport() {
        const freshness = this.checkDataFreshness();
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
                issues.push(`${dataType} data is stale`);
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
