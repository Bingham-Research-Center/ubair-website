/**
 * Anonymous analytics middleware for BasinWx website
 *
 * Tracks:
 * - Page visits (URL, timestamp, referrer)
 * - Response times (server performance)
 * - User agent (browser/OS for compatibility)
 * - Session duration estimates
 *
 * Does NOT track:
 * - IP addresses (anonymized)
 * - Personal information
 * - Cookies or persistent identifiers
 *
 * Logs to: /logs/analytics/
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOG_DIR = path.join(__dirname, '../../logs/analytics');
const LOG_FILE = path.join(LOG_DIR, 'access.log');
const DAILY_SUMMARY_FILE = path.join(LOG_DIR, 'daily_summary.json');

// Ensure log directory exists
await fs.mkdir(LOG_DIR, { recursive: true });

/**
 * Anonymize IP address by hashing with daily salt
 * This allows counting unique visitors per day without storing actual IPs
 */
function anonymizeIP(ip) {
    // Use date as salt so same visitor gets different hash each day
    const salt = new Date().toISOString().split('T')[0];
    const hash = crypto.createHash('sha256').update(ip + salt).digest('hex');
    return hash.substring(0, 16); // First 16 chars is enough
}

/**
 * Extract useful info from user agent without tracking
 */
function parseUserAgent(ua) {
    if (!ua) return { browser: 'unknown', os: 'unknown', mobile: false };

    // Very basic parsing - just enough for stats
    const mobile = /mobile|android|iphone|ipad/i.test(ua);

    let browser = 'other';
    if (/chrome/i.test(ua) && !/edge/i.test(ua)) browser = 'chrome';
    else if (/firefox/i.test(ua)) browser = 'firefox';
    else if (/safari/i.test(ua) && !/chrome/i.test(ua)) browser = 'safari';
    else if (/edge/i.test(ua)) browser = 'edge';

    let os = 'other';
    if (/windows/i.test(ua)) os = 'windows';
    else if (/mac/i.test(ua)) os = 'macos';
    else if (/linux/i.test(ua)) os = 'linux';
    else if (/android/i.test(ua)) os = 'android';
    else if (/iphone|ipad/i.test(ua)) os = 'ios';

    return { browser, os, mobile };
}

/**
 * Get file size in MB
 */
async function getFileSizeMB(filepath) {
    try {
        const stats = await fs.stat(filepath);
        return stats.size / (1024 * 1024);
    } catch (err) {
        return 0;
    }
}

/**
 * Rotate log file if it exceeds 10MB
 */
async function rotateLogIfNeeded() {
    const sizeMB = await getFileSizeMB(LOG_FILE);

    if (sizeMB > 10) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const archiveFile = path.join(LOG_DIR, `access_${timestamp}.log`);

        try {
            await fs.rename(LOG_FILE, archiveFile);
            console.log(`[Analytics] Rotated log file: ${archiveFile}`);
        } catch (err) {
            console.error('[Analytics] Failed to rotate log:', err);
        }
    }
}

/**
 * Write log entry (append to file)
 */
async function writeLog(entry) {
    const logLine = JSON.stringify(entry) + '\n';

    try {
        await fs.appendFile(LOG_FILE, logLine);
        await rotateLogIfNeeded();
    } catch (err) {
        console.error('[Analytics] Failed to write log:', err);
    }
}

/**
 * Update daily summary stats
 */
async function updateDailySummary(entry) {
    let summary = {
        date: new Date().toISOString().split('T')[0],
        pageViews: 0,
        uniqueVisitors: new Set(),
        pages: {},
        browsers: {},
        avgResponseTime: 0,
        totalResponseTime: 0,
        requestCount: 0
    };

    // Load existing summary if available
    try {
        const data = await fs.readFile(DAILY_SUMMARY_FILE, 'utf-8');
        const existing = JSON.parse(data);

        // If same day, merge; otherwise reset
        if (existing.date === summary.date) {
            summary = existing;
            summary.uniqueVisitors = new Set(existing.uniqueVisitors || []);
        }
    } catch (err) {
        // File doesn't exist or corrupt, use defaults
    }

    // Update with new entry
    summary.pageViews++;
    summary.uniqueVisitors.add(entry.visitor_id);

    const page = entry.path || 'unknown';
    summary.pages[page] = (summary.pages[page] || 0) + 1;

    const browser = entry.user_agent?.browser || 'unknown';
    summary.browsers[browser] = (summary.browsers[browser] || 0) + 1;

    if (entry.response_time_ms) {
        summary.totalResponseTime += entry.response_time_ms;
        summary.requestCount++;
        summary.avgResponseTime = summary.totalResponseTime / summary.requestCount;
    }

    // Save updated summary (convert Set to Array for JSON)
    const toSave = {
        ...summary,
        uniqueVisitors: Array.from(summary.uniqueVisitors),
        uniqueVisitorCount: summary.uniqueVisitors.size
    };

    try {
        await fs.writeFile(DAILY_SUMMARY_FILE, JSON.stringify(toSave, null, 2));
    } catch (err) {
        console.error('[Analytics] Failed to update summary:', err);
    }
}

/**
 * Analytics middleware
 */
export default function analyticsMiddleware(req, res, next) {
    // Skip analytics for API routes and static assets
    if (req.path.startsWith('/api') ||
        req.path.startsWith('/public') ||
        req.path.includes('.css') ||
        req.path.includes('.js') ||
        req.path.includes('.png') ||
        req.path.includes('.jpg')) {
        return next();
    }

    const startTime = Date.now();

    // Capture response time when request completes
    res.on('finish', async () => {
        const responseTime = Date.now() - startTime;

        // Get IP and anonymize
        const rawIP = req.ip ||
                      req.headers['x-forwarded-for']?.split(',')[0] ||
                      req.connection.remoteAddress ||
                      'unknown';
        const visitorID = anonymizeIP(rawIP);

        // Parse user agent
        const ua = parseUserAgent(req.headers['user-agent']);

        // Build log entry
        const entry = {
            timestamp: new Date().toISOString(),
            visitor_id: visitorID, // Anonymized
            path: req.path,
            method: req.method,
            status: res.statusCode,
            response_time_ms: responseTime,
            referrer: req.headers['referer'] || req.headers['referrer'] || 'direct',
            user_agent: ua
        };

        // Write log asynchronously (don't block response)
        writeLog(entry);
        updateDailySummary(entry);
    });

    next();
}

/**
 * Get analytics stats endpoint
 */
export async function getAnalyticsStats(req, res) {
    try {
        const data = await fs.readFile(DAILY_SUMMARY_FILE, 'utf-8');
        const summary = JSON.parse(data);

        // Return sanitized stats (no visitor IDs)
        res.json({
            date: summary.date,
            pageViews: summary.pageViews,
            uniqueVisitors: summary.uniqueVisitorCount,
            avgResponseTime: Math.round(summary.avgResponseTime),
            pages: summary.pages,
            browsers: summary.browsers
        });
    } catch (err) {
        res.status(404).json({ error: 'No analytics data available' });
    }
}
