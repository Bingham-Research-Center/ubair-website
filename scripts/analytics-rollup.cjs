#!/usr/bin/env node
/**
 * Analytics rollup script — aggregates daily summaries into weekly/monthly files.
 *
 * Run daily via cron (or manually):
 *   node scripts/analytics-rollup.cjs
 *
 * Reads:  logs/analytics/daily_summary.json
 * Writes: logs/analytics/rollups/YYYY-MM.json  (monthly)
 *         logs/analytics/rollups/weekly.json    (rolling 12 weeks)
 *
 * Safe to run multiple times per day — it upserts the current day's entry.
 */

const fs = require('fs');
const path = require('path');

const ANALYTICS_DIR = path.join(__dirname, '..', 'logs', 'analytics');
const ROLLUP_DIR = path.join(ANALYTICS_DIR, 'rollups');
const DAILY_SUMMARY = path.join(ANALYTICS_DIR, 'daily_summary.json');

// Ensure rollup directory exists
fs.mkdirSync(ROLLUP_DIR, { recursive: true });

function loadJSON(filepath) {
    try {
        return JSON.parse(fs.readFileSync(filepath, 'utf-8'));
    } catch {
        return null;
    }
}

function saveJSON(filepath, data) {
    fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
}

// ── Monthly rollup ─────────────────────────────────────────────────────

function updateMonthlyRollup(daily) {
    if (!daily || !daily.date) return;

    const month = daily.date.substring(0, 7); // YYYY-MM
    const monthFile = path.join(ROLLUP_DIR, `${month}.json`);

    let monthly = loadJSON(monthFile) || {
        month,
        days: {},
        totals: {
            pageViews: 0,
            uniqueVisitorIDs: [],
            sessionsStarted: 0,
            botRequests: 0,
            referrerSources: {},
            pages: {},
            browsers: {},
        },
    };

    // Upsert this day's data
    const prev = monthly.days[daily.date];

    // Store a compact per-day snapshot
    monthly.days[daily.date] = {
        pageViews: daily.pageViews || 0,
        uniqueVisitors: daily.uniqueVisitorCount || 0,
        sessionsStarted: daily.sessionsStarted || 0,
        avgPagesPerSession: daily.avgPagesPerSession || 0,
        avgResponseTime: daily.avgResponseTime || 0,
        botRequests: daily.botRequests || 0,
    };

    // Recompute totals from all days
    const totals = monthly.totals;
    totals.pageViews = 0;
    totals.sessionsStarted = 0;
    totals.botRequests = 0;
    totals.referrerSources = {};
    totals.pages = {};
    totals.browsers = {};
    const allVisitors = new Set();

    for (const [date, day] of Object.entries(monthly.days)) {
        totals.pageViews += day.pageViews;
        totals.sessionsStarted += day.sessionsStarted;
        totals.botRequests += day.botRequests;
    }

    // For detailed breakdowns, use today's data to accumulate
    // (we can't perfectly reconstruct from snapshots, but this is good enough)
    if (daily.uniqueVisitors) {
        for (const vid of daily.uniqueVisitors) allVisitors.add(vid);
    }
    // Merge with previously accumulated visitors
    if (totals.uniqueVisitorIDs) {
        for (const vid of totals.uniqueVisitorIDs) allVisitors.add(vid);
    }
    totals.uniqueVisitorIDs = Array.from(allVisitors);
    totals.uniqueVisitorCount = allVisitors.size;

    // Merge referrer sources from daily
    if (daily.referrerSources) {
        for (const [src, count] of Object.entries(daily.referrerSources)) {
            // If we're re-running today, subtract previous day's contribution
            totals.referrerSources[src] = (totals.referrerSources[src] || 0) + count
                - ((prev && daily.date === Object.keys(monthly.days).pop()) ? (prev._refSources?.[src] || 0) : 0);
        }
    }

    // Merge page counts
    if (daily.pages) {
        for (const [pg, count] of Object.entries(daily.pages)) {
            totals.pages[pg] = (totals.pages[pg] || 0) + count;
        }
    }

    saveJSON(monthFile, monthly);
    console.log(`[Rollup] Updated monthly: ${monthFile} (${Object.keys(monthly.days).length} days)`);
}

// ── Weekly rollup (rolling 12 weeks) ───────────────────────────────────

function getISOWeek(dateStr) {
    const d = new Date(dateStr + 'T00:00:00Z');
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function updateWeeklyRollup(daily) {
    if (!daily || !daily.date) return;

    const weeklyFile = path.join(ROLLUP_DIR, 'weekly.json');
    let weekly = loadJSON(weeklyFile) || { weeks: {} };

    const weekKey = getISOWeek(daily.date);

    if (!weekly.weeks[weekKey]) {
        weekly.weeks[weekKey] = {
            pageViews: 0,
            uniqueVisitorCount: 0,
            sessionsStarted: 0,
            botRequests: 0,
            days: [],
        };
    }

    const w = weekly.weeks[weekKey];
    if (!w.days.includes(daily.date)) {
        w.days.push(daily.date);
        w.pageViews += daily.pageViews || 0;
        w.uniqueVisitorCount += (daily.uniqueVisitorCount || 0);
        w.sessionsStarted += daily.sessionsStarted || 0;
        w.botRequests += daily.botRequests || 0;
    }

    // Keep only last 12 weeks
    const sortedWeeks = Object.keys(weekly.weeks).sort();
    if (sortedWeeks.length > 12) {
        for (const old of sortedWeeks.slice(0, sortedWeeks.length - 12)) {
            delete weekly.weeks[old];
        }
    }

    saveJSON(weeklyFile, weekly);
    console.log(`[Rollup] Updated weekly: ${weeklyFile} (${Object.keys(weekly.weeks).length} weeks)`);
}

// ── Main ───────────────────────────────────────────────────────────────

const daily = loadJSON(DAILY_SUMMARY);
if (!daily) {
    console.log('[Rollup] No daily summary found, nothing to roll up.');
    process.exit(0);
}

console.log(`[Rollup] Processing daily summary for ${daily.date}`);
updateMonthlyRollup(daily);
updateWeeklyRollup(daily);
console.log('[Rollup] Done.');
