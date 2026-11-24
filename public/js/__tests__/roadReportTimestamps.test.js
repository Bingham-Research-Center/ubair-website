import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { afterEach, describe, expect, it, jest } from '@jest/globals';

afterEach(() => jest.useRealTimers());
function browser() {
    const notice = { textContent: '', dataset: {} };
    const context = vm.createContext({ Date, document: { getElementById: () => notice } });
    for (const file of ['utils', 'RoadWeatherMap']) vm.runInContext(readFileSync(new URL(`../roads/${file}.js`, import.meta.url), 'utf8'), context);
    return { notice, format: vm.runInContext('formatUDOTReportAge', context),
        map: vm.runInContext('new RoadWeatherMap("road-map")', context) };
}
const updated = '2026-11-03T18:00:00Z';
const absolute = 'Nov 3, 2026, 11:00 AM MST';

describe('road report timestamps on a page left open', () => {
    it('keeps the map notice truthful without another fetch', () => {
        jest.useFakeTimers().setSystemTime(new Date('2026-11-03T18:05:00Z'));
        const { map, notice } = browser();
        map.lastGoodRoadData = { lastUpdated: updated };
        map.updateRoadFeedStatus();
        const original = notice.textContent;
        jest.advanceTimersByTime(3 * 60 * 60 * 1000);
        expect(notice.textContent).toBe(original);
        expect(notice.textContent).toContain(absolute);
        expect(notice.textContent).not.toContain('min ago');
    });

    it.each(['lastUpdated', 'retrievedAt'])('keeps frozen popup HTML truthful for %s', field => {
        jest.useFakeTimers().setSystemTime(new Date(updated));
        const { format } = browser();
        const record = { cached: true, [field]: updated };
        const popup = `<p>${format(record)}</p>`;
        jest.advanceTimersByTime(3 * 60 * 60 * 1000);
        expect(popup).toContain(absolute);
        expect(popup).toContain(field === 'lastUpdated' ? 'updated' : 'retrieved');
        expect(format(record)).toBe(popup.slice(3, -4));
    });

    it('preserves unavailable timestamps and accepts camera millisecond timestamps', () => {
        const { map, format } = browser();
        expect(format({ lastUpdated: 'invalid' })).toContain('update time unavailable');
        expect(format({})).toContain('update time unavailable');
        expect(map.formatRoadDataAge(Date.parse(updated))).toContain(absolute);
    });
});
