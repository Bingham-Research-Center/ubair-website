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

// Evict stale sessions every 10 minutes. unref() so this timer alone never keeps the event
// loop alive — otherwise merely importing this module stops a script (or a test runner) from
// exiting on its own.
const sessionSweep = setInterval(() => {
    const cutoff = Date.now() - SESSION_TTL_MS;
    for (const [id, s] of activeSessions) {
        if (s.lastSeen < cutoff) activeSessions.delete(id);
    }
}, 10 * 60 * 1000);
sessionSweep.unref();

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

// The daily summary is a read-modify-write against a single file, driven concurrently by
// every request. Two hazards, both of which silently destroyed a day's counters in
// production:
//   1. fs.writeFile is not atomic, so a concurrent reader can observe a truncated file,
//      JSON.parse throws, and the old `catch {}` returned a *fresh* summary — zeroing the day.
//   2. Even with valid reads, interleaved read-modify-write loses whichever update lands first.
// Serialising the whole cycle through one promise chain fixes both. Writes also go via
// temp-file + rename so a reader never sees a partial file.
let summaryQueue = Promise.resolve();

function withSummaryLock(fn) {
    const run = summaryQueue.then(fn, fn);
    // Keep the chain alive regardless of outcome; callers handle their own errors.
    summaryQueue = run.then(() => undefined, () => undefined);
    return run;
}

/**
 * Reconcile a summary read off disk with the shape the current build expects.
 *
 * A summary written by an older build is missing whatever counters that build didn't have
 * (botPaths, referrerSources, hourlyDistribution, ...), and every call site does
 * `summary.<counter>[key]++` — so a missing key is a TypeError, not a zero. That crashed
 * production on 2026-08-13. A key that is present but null or wrong-typed is equally fatal,
 * so anything whose shape doesn't match the template falls back to the template's container.
 *
 * Exported for testing; not part of the module's runtime API.
 */
export function normalizeDailySummary(existing, today) {
    const base = emptySummary(today);
    if (!existing || typeof existing !== 'object' || Array.isArray(existing)) return base;

    const merged = { ...base, ...existing };
    for (const [key, template] of Object.entries(base)) {
        const value = merged[key];
        if (Array.isArray(template)) {
            // NB: typeof [] === 'object', so arrays must be handled before the plain-object
            // branch — otherwise they get rewritten into {} and every
            // `new Set(summary.uniqueVisitors)` throws "object is not iterable".
            if (!Array.isArray(value)) merged[key] = [...template];
        } else if (template !== null && typeof template === 'object') {
            if (value === null || typeof value !== 'object' || Array.isArray(value)) {
                merged[key] = { ...template };
            }
        } else if (typeof template === 'number' && typeof value !== 'number') {
            merged[key] = template;
        }
    }
    merged.date = today;
    return merged;
}

async function loadDailySummary(today) {
    try {
        const data = await fs.readFile(DAILY_SUMMARY_FILE, 'utf-8');
        const existing = JSON.parse(data);
        if (existing.date === today) {
            return normalizeDailySummary(existing, today);
        }
    } catch (err) {
        // ENOENT on the first request of the day is expected. Anything else means we are
        // about to discard real counters, so make that visible rather than silent.
        if (err.code !== 'ENOENT') {
            console.error('[Analytics] daily summary unreadable, starting fresh:', err.message);
        }
    }
    return emptySummary(today);
}

function updateDailySummary(entry) {
    return withSummaryLock(() => updateDailySummaryLocked(entry));
}

async function updateDailySummaryLocked(entry) {
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

    // Temp-file + rename: rename is atomic within a filesystem, so a concurrent reader
    // sees either the old file or the new one, never a half-written one.
    const tmp = `${DAILY_SUMMARY_FILE}.tmp`;
    try {
        await fs.writeFile(tmp, JSON.stringify(toSave, null, 2));
        await fs.rename(tmp, DAILY_SUMMARY_FILE);
    } catch (err) {
        console.error('[Analytics] Failed to update summary:', err.message);
        await fs.unlink(tmp).catch(() => {});
    }
}

// ── Engagement beacon endpoint ─────────────────────────────────────────

// This endpoint is unauthenticated by necessity — it is called by every visitor's browser —
// and it appends to disk, so it is the one piece of analytics an outsider can drive directly.
// Everything below exists to bound what a hostile caller can write: per-IP rate limit,
// length caps on every field, and a whitelist on the shape of `path`.
const BEACON_RATE = { windowMs: 60_000, maxPerWindow: 30 };
const beaconHits = new Map(); // ip -> { count, windowStart }

function beaconRateLimited(ip) {
    const now = Date.now();
    const rec = beaconHits.get(ip);
    if (!rec || now - rec.windowStart > BEACON_RATE.windowMs) {
        beaconHits.set(ip, { count: 1, windowStart: now });
        // Opportunistic sweep so the map can't grow without bound.
        if (beaconHits.size > 5000) {
            for (const [k, v] of beaconHits) {
                if (now - v.windowStart > BEACON_RATE.windowMs) beaconHits.delete(k);
            }
        }
        return false;
    }
    rec.count++;
    return rec.count > BEACON_RATE.maxPerWindow;
}

export async function handleEngagementBeacon(req, res) {
    try {
        const ip = req.ip || req.socket?.remoteAddress || 'unknown';
        if (beaconRateLimited(ip)) return res.status(429).end();

        const { path: pagePath, duration_s, visitor_id } = req.body || {};
        if (typeof pagePath !== 'string' || !pagePath || duration_s == null) {
            return res.status(400).json({ error: 'Missing path or duration_s' });
        }
        // Same-origin page paths only — no absolute URLs, no traversal, no log injection.
        if (!/^\/[\w\-./]{0,200}$/.test(pagePath) || pagePath.includes('..')) {
            return res.status(400).json({ error: 'Invalid path' });
        }
        const duration = Number(duration_s);
        if (!Number.isFinite(duration) || duration < 0) {
            return res.status(400).json({ error: 'Invalid duration_s' });
        }

        const entry = {
            timestamp: new Date().toISOString(),
            type: 'engagement',
            visitor_id: String(visitor_id || 'unknown').slice(0, 64),
            path: pagePath,
            duration_s: Math.min(duration, 3600),
        };
        await writeLog(entry);
        res.status(204).end();
    } catch (err) {
        console.error('[Analytics] Beacon error:', err.message);
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

        // Fire-and-forget, but never unhandled: an async throw here becomes an
        // unhandledRejection, which terminates the process under Node 15+. Analytics
        // must never be able to take the site down.
        writeLog(entry).catch(err =>
            console.error('[Analytics] writeLog failed:', err.message));
        updateDailySummary(entry).catch(err =>
            console.error('[Analytics] updateDailySummary failed:', err.message));
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
