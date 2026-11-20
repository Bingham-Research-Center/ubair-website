// Times in Mountain time, the way a person says them. Shared by the server's status lights and
// the weather page, so "Fri 5 PM" means the same thing in both. Pure functions only.

const TIME_ZONE = 'America/Denver';

const dayKey = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
const clock = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, hour: 'numeric', minute: '2-digit', hour12: true });
const weekday = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, weekday: 'short' });
const utcHour = (ms) => `${String(new Date(ms).getUTCHours()).padStart(2, '0')}Z`;

/** "5 PM" or "5:30 PM". */
export function mountainClock(ms) {
    const parts = Object.fromEntries(clock.formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
    return `${parts.hour}${parts.minute === '00' ? '' : `:${parts.minute}`} ${parts.dayPeriod}`;
}

/** "Fri". */
export function mountainWeekday(ms) {
    return weekday.format(new Date(ms));
}

/** True when the two instants fall on the same calendar day in Mountain time. */
export function sameMountainDay(a, b) {
    return dayKey.format(new Date(a)) === dayKey.format(new Date(b));
}

/** "5 PM", "5:30 PM", or "Fri 5 PM" when that is not today. */
export function mountainTime(ms, now) {
    return sameMountainDay(ms, now) ? mountainClock(ms) : `${mountainWeekday(ms)} ${mountainClock(ms)}`;
}

/** "Thu 8 PM (03Z)": a model run, for readers who think in either clock. */
export function modelRunLabel(ms) {
    return `${mountainWeekday(ms)} ${mountainClock(ms)} (${utcHour(ms)})`;
}

/**
 * Index of the first of `validTimes` that is not yet past: the hour under way (one that began
 * up to half an hour ago) or the next one. For a run whose hours are all past, the last index.
 * A model run reaches the site hours after it starts, so its first hours are already history.
 */
export function firstHourFromNow(validTimes, now) {
    const times = Array.isArray(validTimes) ? validTimes.map((time) => Date.parse(time)) : [];
    const index = times.findIndex((time) => Number.isFinite(time) && time >= now - 30 * 60 * 1000);
    return index === -1 ? Math.max(0, times.length - 1) : index;
}
