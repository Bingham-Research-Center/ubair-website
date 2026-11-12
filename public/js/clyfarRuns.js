// public/js/clyfarRuns.js
// Pure helpers for Clyfar run times: which run a file belongs to, how to label it, and how old
// it is. Clyfar only runs during the winter ozone season, so for most of the year the newest
// run on the server is months old. The page must say so rather than present it as current.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// In season a run arrives every six hours. Three days without one is not a late upload.
export const STALE_RUN_DAYS = 3;

// "heatmap_UB-dailymax_ozone_20251129-1200_clyfar017.png" → "20251129-1200"
export function extractInitTime(filename) {
    const match = String(filename ?? '').match(/(\d{8}-\d{4})/);
    return match ? match[1] : null;
}

// "LLM-OUTLOOK-20260330_0600Z.pdf" → "20260330-0600"
export function outlookFilenameToInit(filename) {
    const match = String(filename ?? '').match(/(\d{8})_(\d{4})Z\.[a-z]+$/i);
    return match ? `${match[1]}-${match[2]}` : null;
}

// "20251129-1200" → Date (UTC), or null for anything that is not a real date and time.
export function initTimeToDate(initTime) {
    const match = String(initTime ?? '').match(/^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})$/);
    if (!match) return null;
    const [year, month, day, hour, minute] = match.slice(1).map(Number);
    const date = new Date(Date.UTC(year, month - 1, day, hour, minute));
    const roundTrips = date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 &&
        date.getUTCDate() === day && date.getUTCHours() === hour && date.getUTCMinutes() === minute;
    return roundTrips ? date : null;
}

// "20260330-0600" → "Mar 30, 2026". The year is always shown: a run can be from last season.
export function formatInitDate(initTime) {
    const date = initTimeToDate(initTime);
    if (!date) return 'Unknown';
    return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}`;
}

// "20260330-0600" → "Mar 30, 2026, 06:00 UTC"
export function formatInitTime(initTime) {
    const date = initTimeToDate(initTime);
    if (!date) return 'Unknown';
    const hh = String(date.getUTCHours()).padStart(2, '0');
    const mm = String(date.getUTCMinutes()).padStart(2, '0');
    return `${formatInitDate(initTime)}, ${hh}:${mm} UTC`;
}

// Whole days since the run started, or null when the init time cannot be read.
export function runAgeDays(initTime, now = new Date()) {
    const date = initTimeToDate(initTime);
    if (!date) return null;
    return Math.floor((now.getTime() - date.getTime()) / MS_PER_DAY);
}

// What the page says about the newest run. `stale` means the forecast below it no longer
// describes the days ahead. The text states only what the files show: when the last run was,
// never why there has been none since.
export function describeLatestRun(initTime, now = new Date()) {
    const age = runAgeDays(initTime, now);
    if (age === null) return null;
    const label = formatInitTime(initTime);
    if (age < STALE_RUN_DAYS) {
        return { stale: false, ageDays: age, text: `Latest run: ${label}.` };
    }
    return {
        stale: true,
        ageDays: age,
        text: `No new Clyfar run since ${label} (${age} days ago). Clyfar runs during the winter ` +
            'ozone season. The forecast below is from that run and does not describe current conditions.',
    };
}
