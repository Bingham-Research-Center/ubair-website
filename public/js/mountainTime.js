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
