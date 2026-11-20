// Outlook filenames, issue times and seasons, shared by the homepage, /forecast_outlooks and
// server/generateOutlooksList.js so the three never disagree.
//
// An outlook is named outlook_YYYYMMDD_HHMM.md, and HHMM is Mountain wall-clock time: the file
// outlook_20260306_1300.md says "Issued: 1.00pm Mountain Time, 6 Mar 2026". Reading HHMM as UTC
// printed that outlook as issued at 6:00 AM MT.
//
// A season runs July to June and is named for both winters' years ("2025–26"): the ozone
// season is roughly December to March, so one season's outlooks never straddle two labels.

export const OUTLOOK_FILE_RE = /^outlook_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})\.md$/;

const TIME_ZONE = 'America/Denver';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** { year, month (1–12), day, hour, minute } in Mountain time, or null for any other file. */
export function parseOutlookFilename(filename) {
    const match = OUTLOOK_FILE_RE.exec(filename ?? '');
    if (!match) return null;
    const [year, month, day, hour, minute] = match.slice(1).map(Number);
    return { year, month, day, hour, minute };
}

/** "2025–26" for any date from July 2025 to June 2026. */
export function seasonOf({ year, month }) {
    const start = month >= 7 ? year : year - 1;
    return `${start}–${String((start + 1) % 100).padStart(2, '0')}`;
}

// Minutes Mountain time is ahead of UTC at this instant (negative: -420 in winter, -360 in summer).
function mountainOffsetMinutes(ms) {
    const parts = {};
    for (const { type, value } of new Intl.DateTimeFormat('en-US', {
        timeZone: TIME_ZONE, hourCycle: 'h23',
        year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric'
    }).formatToParts(new Date(ms))) {
        parts[type] = Number(value);
    }
    const wall = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
    return Math.round((wall - Math.floor(ms / 60000) * 60000) / 60000);
}

/** The UTC instant of a Mountain wall-clock time, daylight saving included. */
export function mountainToDate({ year, month, day, hour, minute }) {
    const wall = Date.UTC(year, month - 1, day, hour, minute);
    let utc = wall - mountainOffsetMinutes(wall) * 60000;
    // A second pass settles times within a few hours of a daylight-saving change.
    utc = wall - mountainOffsetMinutes(utc) * 60000;
    return new Date(utc);
}

/** Today's season in Mountain time. */
export function currentSeason(now = new Date()) {
    const [month, year] = new Intl.DateTimeFormat('en-US', {
        timeZone: TIME_ZONE, month: 'numeric', year: 'numeric'
    }).formatToParts(now).filter((p) => p.type !== 'literal').map((p) => Number(p.value));
    return seasonOf({ year, month });
}

/** "6 Mar 2026" and "1:00 pm MT", straight from the filename's own wall-clock time. */
export function formatIssued({ year, month, day, hour, minute }) {
    const h12 = hour % 12 || 12;
    return {
        date: `${day} ${MONTHS[month - 1]} ${year}`,
        time: `${h12}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'am' : 'pm'} MT`
    };
}

/**
 * Everything a page shows about one outlook file, or null if the name is not an outlook's.
 * `issued` is the UTC instant, for working out how old the outlook is.
 */
export function describeOutlook(filename) {
    const parts = parseOutlookFilename(filename);
    if (!parts) return null;
    return { filename, season: seasonOf(parts), issued: mountainToDate(parts), ...formatIssued(parts) };
}

/**
 * Group outlooks (anything with a `filename`) by season, newest season first and newest
 * outlook first within each. Files that are not outlooks are left out.
 */
export function groupBySeason(outlooks) {
    const described = outlooks
        .map((outlook) => ({ outlook, info: describeOutlook(outlook.filename) }))
        .filter(({ info }) => info)
        .sort((a, b) => b.info.issued - a.info.issued);

    const groups = [];
    for (const { outlook, info } of described) {
        let group = groups.find((g) => g.season === info.season);
        if (!group) {
            group = { season: info.season, outlooks: [] };
            groups.push(group);
        }
        group.outlooks.push({ ...outlook, ...info });
    }
    return groups;
}
