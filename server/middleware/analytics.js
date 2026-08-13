/**
 * Anonymous analytics middleware for BasinWx website
 *
 * Tracks:
 * - Page visits with bot filtering (URL, timestamp, referrer)
 * - Session journeys (pages-per-session, entry page)
 * - Referrer sources (search, government, university, direct, etc.)
 * - Hourly traffic distribution
 * - Response times (server performance)
 * - User agent (browser/OS for compatibility)
 * - Client engagement beacons (time-on-page)
 *
 * Does NOT track:
 * - IP addresses (hashed with daily salt)
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

await fs.mkdir(LOG_DIR, { recursive: true });

// ── Bot / scanner detection ────────────────────────────────────────────

const BOT_UA_PATTERNS = [
    /bot\b/i, /crawl/i, /spider/i, /slurp/i, /mediapartners/i,
    /wget/i, /curl/i, /python-requests/i, /go-http-client/i,
    /scrapy/i, /httpclient/i, /java\//i, /libwww/i, /nutch/i,
    /apache-httpclient/i, /okhttp/i, /node-fetch/i, /axios/i,
    /headlesschrome/i, /phantomjs/i, /selenium/i,
];

// Paths that only scanners/bots hit — never real users
const SCANNER_PATHS = [
    /^\/wp-/, /^\/wordpress/i, /\.php$/i, /\.asp$/i, /\.aspx$/i,
    /\.cgi$/i, /\.env$/i, /\.git/i, /\/admin\b/i, /\/login/i,
    /\/owa\//i, /\/cgi-bin/i, /\/config/i, /\.xml$/i, /\.exe$/i,
    /^\/\./, /\/{3,}/,
];

function isBot(ua, rawUA, method, pathStr) {
    if (!rawUA) return true;
    if (ua.browser === 'unknown' && ua.os === 'unknown') return true;
    if (BOT_UA_PATTERNS.some(p => p.test(rawUA))) return true;
    if (SCANNER_PATHS.some(p => p.test(pathStr))) return true;
    // POST to page routes is almost always a scanner
    if (method === 'POST' && !pathStr.startsWith('/api')) return true;
    return false;
}

// ── Session tracking (in-memory, resets on restart) ────────────────────

// Map<visitorID, { pageCount, entryPage, firstSeen }>
const activeSessions = new Map();
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes

function getSessionInfo(visitorID, pagePath) {
    const now = Date.now();
    let session = activeSessions.get(visitorID);

    if (!session || (now - session.lastSeen) > SESSION_TTL_MS) {
        session = { pageCount: 0, entryPage: pagePath, firstSeen: now, lastSeen: now };
        activeSessions.set(visitorID, session);
    }

    session.pageCount++;
    session.lastSeen = now;
    return { page_number: session.pageCount, entry_page: session.entryPage };
}

// Evict stale sessions every 10 minutes
setInterval(() => {
    const cutoff = Date.now() - SESSION_TTL_MS;
    for (const [id, s] of activeSessions) {
        if (s.lastSeen < cutoff) activeSessions.delete(id);
    }
}, 10 * 60 * 1000);

// ── Referrer parsing ───────────────────────────────────────────────────

const REFERRER_CATEGORIES = [
    { pattern: /google\./i,                source: 'search',     label: 'Google' },
    { pattern: /bing\./i,                  source: 'search',     label: 'Bing' },
    { pattern: /duckduckgo\./i,            source: 'search',     label: 'DuckDuckGo' },
    { pattern: /yahoo\./i,                 source: 'search',     label: 'Yahoo' },
    { pattern: /\.gov($|\/)/i,             source: 'government', label: 'Government' },
    { pattern: /udot/i,                    source: 'government', label: 'UDOT' },
    { pattern: /deq\.utah/i,              source: 'government', label: 'Utah DEQ' },
    { pattern: /\.edu($|\/)/i,             source: 'university', label: 'University' },
    { pattern: /usu\.edu/i,               source: 'university', label: 'USU' },
    { pattern: /utah\.edu/i,              source: 'university', label: 'U of U' },
    { pattern: /facebook|fb\.com/i,        source: 'social',     label: 'Facebook' },
    { pattern: /twitter|x\.com/i,          source: 'social',     label: 'Twitter/X' },
    { pattern: /linkedin/i,               source: 'social',     label: 'LinkedIn' },
    { pattern: /basinwx\.com/i,            source: 'internal',   label: 'BasinWx' },
];

function parseReferrer(referrer) {
    if (!referrer || referrer === 'direct') {
        return { source: 'direct', label: 'Direct', domain: null };
    }
    try {
        const url = new URL(referrer);
        const domain = url.hostname;
        for (const cat of REFERRER_CATEGORIES) {
            if (cat.pattern.test(referrer)) {
                return { source: cat.source, label: cat.label, domain };
            }
        }
        return { source: 'other', label: domain, domain };
    } catch {
        return { source: 'other', label: 'Unknown', domain: null };
    }
}

// ── IP anonymization ───────────────────────────────────────────────────

function anonymizeIP(ip) {
    const salt = new Date().toISOString().split('T')[0];
    const hash = crypto.createHash('sha256').update(ip + salt).digest('hex');
    return hash.substring(0, 16);
}

// ── User-agent parsing ─────────────────────────────────────────────────

function parseUserAgent(ua) {
    if (!ua) return { browser: 'unknown', os: 'unknown', mobile: false };

    const mobile = /mobile|android|iphone|ipad/i.test(ua);

    let browser = 'other';
    if (/edg/i.test(ua)) browser = 'edge';
    else if (/chrome/i.test(ua)) browser = 'chrome';
    else if (/firefox/i.test(ua)) browser = 'firefox';
    else if (/safari/i.test(ua)) browser = 'safari';

    let os = 'other';
    if (/iphone|ipad/i.test(ua)) os = 'ios';
    else if (/android/i.test(ua)) os = 'android';
    else if (/windows/i.test(ua)) os = 'windows';
    else if (/mac/i.test(ua)) os = 'macos';
    else if (/linux/i.test(ua)) os = 'linux';

    return { browser, os, mobile };
}

// ── Log file management ────────────────────────────────────────────────

async function getFileSizeMB(filepath) {
    try {
        const stats = await fs.stat(filepath);
        return stats.size / (1024 * 1024);
    } catch {
        return 0;
    }
}

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

async function writeLog(entry) {
    try {
        await fs.appendFile(LOG_FILE, JSON.stringify(entry) + '\n');
        await rotateLogIfNeeded();
    } catch (err) {
        console.error('[Analytics] Failed to write log:', err);
    }
}

// ── Daily summary ──────────────────────────────────────────────────────

function emptySummary(date) {
    return {
        date,
        // Human traffic only (bots excluded)
        pageViews: 0,
        uniqueVisitors: [],
        pages: {},
        browsers: {},
        referrerSources: {},
        hourlyDistribution: {},
        avgResponseTime: 0,
        totalResponseTime: 0,
        requestCount: 0,
        sessionsStarted: 0,
        avgPagesPerSession: 0,
        _sessionPageCounts: [],
        // Bot traffic (separate bucket)
        botRequests: 0,
        botPaths: {},
    };
}

async function loadDailySummary(today) {
    try {
        const data = await fs.readFile(DAILY_SUMMARY_FILE, 'utf-8');
        const existing = JSON.parse(data);
        if (existing.date === today) {
            existing.uniqueVisitors = existing.uniqueVisitors || [];
            existing._sessionPageCounts = existing._sessionPageCounts || [];
            return existing;
        }
    } catch { /* file missing or corrupt — start fresh */ }
    return emptySummary(today);
}

async function updateDailySummary(entry) {
    const today = new Date().toISOString().split('T')[0];
    const summary = await loadDailySummary(today);

    if (entry.is_bot) {
        summary.botRequests++;
        const bp = entry.path || 'unknown';
        summary.botPaths[bp] = (summary.botPaths[bp] || 0) + 1;
    } else {
        summary.pageViews++;
        const visitorSet = new Set(summary.uniqueVisitors);
        const isNewVisitor = !visitorSet.has(entry.visitor_id);
        visitorSet.add(entry.visitor_id);
        summary.uniqueVisitors = Array.from(visitorSet);

        const page = entry.path || 'unknown';
        summary.pages[page] = (summary.pages[page] || 0) + 1;

        const browser = entry.user_agent?.browser || 'unknown';
        summary.browsers[browser] = (summary.browsers[browser] || 0) + 1;

        // Referrer source
        const src = entry.referrer_source || 'direct';
        summary.referrerSources[src] = (summary.referrerSources[src] || 0) + 1;

        // Hourly bucket (UTC hour)
        const hour = new Date(entry.timestamp).getUTCHours().toString().padStart(2, '0');
        summary.hourlyDistribution[hour] = (summary.hourlyDistribution[hour] || 0) + 1;

        // Response time
        if (entry.response_time_ms != null) {
            summary.totalResponseTime += entry.response_time_ms;
            summary.requestCount++;
            summary.avgResponseTime = Math.round(summary.totalResponseTime / summary.requestCount);
        }

        // Session tracking for summary
        if (entry.session?.page_number === 1) {
            summary.sessionsStarted++;
        }
        if (isNewVisitor && entry.session?.page_number) {
            summary._sessionPageCounts.push(entry.session.page_number);
        }
        if (summary._sessionPageCounts.length > 0) {
            const total = summary._sessionPageCounts.reduce((a, b) => a + b, 0);
            summary.avgPagesPerSession = +(total / summary._sessionPageCounts.length).toFixed(1);
        }
    }

    const toSave = { ...summary, uniqueVisitorCount: summary.uniqueVisitors.length };

    try {
        await fs.writeFile(DAILY_SUMMARY_FILE, JSON.stringify(toSave, null, 2));
    } catch (err) {
        console.error('[Analytics] Failed to update summary:', err);
    }
}

// ── Engagement beacon endpoint ─────────────────────────────────────────

export async function handleEngagementBeacon(req, res) {
    try {
        const { path: pagePath, duration_s, visitor_id } = req.body || {};
        if (!pagePath || !duration_s) {
            return res.status(400).json({ error: 'Missing path or duration_s' });
        }
        const entry = {
            timestamp: new Date().toISOString(),
            type: 'engagement',
            visitor_id: visitor_id || 'unknown',
            path: pagePath,
            duration_s: Math.min(Number(duration_s) || 0, 3600),
        };
        await writeLog(entry);
        res.status(204).end();
    } catch (err) {
        console.error('[Analytics] Beacon error:', err);
        res.status(500).end();
    }
}

// ── Main middleware ─────────────────────────────────────────────────────

export default function analyticsMiddleware(req, res, next) {
    // Skip static assets (CSS/JS/images are not interesting for page analytics)
    if (req.path.startsWith('/public') ||
        req.path.includes('.css') ||
        req.path.includes('.js') ||
        req.path.includes('.png') ||
        req.path.includes('.jpg') ||
        req.path.includes('.ico') ||
        req.path.includes('.woff') ||
        req.path.includes('.svg')) {
        return next();
    }

    // Skip analytics-own endpoints and data API (pipeline has its own logger)
    if (req.path.startsWith('/api/analytics') ||
        req.path.startsWith('/api/upload')) {
        return next();
    }

    const startTime = Date.now();

    res.on('finish', async () => {
        const responseTime = Date.now() - startTime;
        const rawUA = req.headers['user-agent'] || '';
        const ua = parseUserAgent(rawUA);

        const rawIP = req.ip ||
                      req.headers['x-forwarded-for']?.split(',')[0] ||
                      req.connection.remoteAddress ||
                      'unknown';
        const visitorID = anonymizeIP(rawIP);

        const rawReferrer = req.headers['referer'] || req.headers['referrer'] || 'direct';
        const referrer = parseReferrer(rawReferrer);
        const bot = isBot(ua, rawUA, req.method, req.path);

        const entry = {
            timestamp: new Date().toISOString(),
            visitor_id: visitorID,
            path: req.path,
            method: req.method,
            status: res.statusCode,
            response_time_ms: responseTime,
            is_bot: bot,
            referrer: rawReferrer,
            referrer_source: referrer.source,
            referrer_label: referrer.label,
            referrer_domain: referrer.domain,
            user_agent: ua,
        };

        // Only track sessions for real humans on page routes
        if (!bot && req.method === 'GET') {
            entry.session = getSessionInfo(visitorID, req.path);
        }

        writeLog(entry);
        updateDailySummary(entry);
    });

    next();
}

// ── Stats API endpoint ─────────────────────────────────────────────────

export async function getAnalyticsStats(req, res) {
    try {
        const data = await fs.readFile(DAILY_SUMMARY_FILE, 'utf-8');
        const summary = JSON.parse(data);

        res.json({
            date: summary.date,
            pageViews: summary.pageViews,
            uniqueVisitors: summary.uniqueVisitorCount,
            avgResponseTime: summary.avgResponseTime,
            sessionsStarted: summary.sessionsStarted,
            avgPagesPerSession: summary.avgPagesPerSession,
            pages: summary.pages,
            browsers: summary.browsers,
            referrerSources: summary.referrerSources,
            hourlyDistribution: summary.hourlyDistribution,
            botRequests: summary.botRequests,
        });
    } catch {
        res.status(404).json({ error: 'No analytics data available' });
    }
}
