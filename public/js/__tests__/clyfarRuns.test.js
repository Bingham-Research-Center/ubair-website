import { describe, it, expect } from '@jest/globals';
import {
    STALE_RUN_DAYS,
    extractInitTime,
    outlookFilenameToInit,
    initTimeToDate,
    formatInitDate,
    formatInitTime,
    runAgeDays,
    describeLatestRun,
} from '../clyfarRuns.js';

// On release day (12 Nov 2026) the newest Clyfar run on the server was from 30 Mar 2026 and the
// page offered it as "Forecast Run: Mar 30, 06:00 UTC" with nothing to say it was last season's.
const LAST_SPRING_RUN = '20260330-0600';
const RELEASE_DAY = new Date('2026-11-12T14:00:00Z');

describe('reading run times out of filenames', () => {
    it('finds the init time in a heatmap name', () => {
        expect(extractInitTime('heatmap_UB-dailymax_ozone_20260330-0600_clyfar030.png')).toBe(LAST_SPRING_RUN);
    });

    it('finds the init time in an LLM outlook name', () => {
        expect(outlookFilenameToInit('LLM-OUTLOOK-20260330_0600Z.pdf')).toBe(LAST_SPRING_RUN);
    });

    it('returns null rather than guessing', () => {
        expect(extractInitTime('meteogram_latest.png')).toBeNull();
        expect(extractInitTime(undefined)).toBeNull();
        expect(outlookFilenameToInit('template-2025-2026.md')).toBeNull();
    });

    it('rejects an init time that is not a real date', () => {
        expect(initTimeToDate('20261345-0600')).toBeNull();
        expect(initTimeToDate('20260330-2500')).toBeNull();
        expect(initTimeToDate('20260330')).toBeNull();
        expect(initTimeToDate(LAST_SPRING_RUN).toISOString()).toBe('2026-03-30T06:00:00.000Z');
    });
});

describe('labelling a run', () => {
    it('always carries the year', () => {
        expect(formatInitTime(LAST_SPRING_RUN)).toBe('Mar 30, 2026, 06:00 UTC');
        expect(formatInitDate(LAST_SPRING_RUN)).toBe('Mar 30, 2026');
        expect(formatInitTime('20251129-1200')).toBe('Nov 29, 2025, 12:00 UTC');
    });

    it('says Unknown for a time it cannot read', () => {
        expect(formatInitTime(null)).toBe('Unknown');
        expect(formatInitTime('garbage')).toBe('Unknown');
        expect(formatInitDate('')).toBe('Unknown');
    });
});

describe('how old the newest run is', () => {
    it('counts whole days', () => {
        expect(runAgeDays(LAST_SPRING_RUN, RELEASE_DAY)).toBe(227);
        expect(runAgeDays('20261112-0600', RELEASE_DAY)).toBe(0);
        expect(runAgeDays('nope', RELEASE_DAY)).toBeNull();
    });

    it('describes a run from this morning as the latest run and nothing more', () => {
        const status = describeLatestRun('20261112-0600', RELEASE_DAY);
        expect(status.stale).toBe(false);
        expect(status.text).toBe('Latest run: Nov 12, 2026, 06:00 UTC.');
    });

    it('does not cry stale over a late upload', () => {
        const twoDaysOn = new Date('2026-11-14T12:00:00Z');
        expect(describeLatestRun('20261112-0600', twoDaysOn).stale).toBe(false);
    });

    it('says plainly when the run is from last season', () => {
        const status = describeLatestRun(LAST_SPRING_RUN, RELEASE_DAY);
        expect(status.stale).toBe(true);
        expect(status.ageDays).toBe(227);
        expect(status.text).toContain('No new Clyfar run since Mar 30, 2026, 06:00 UTC (227 days ago)');
        expect(status.text).toContain('does not describe current conditions');
    });

    it('turns stale exactly at the threshold', () => {
        const init = '20261201-0000';
        const justUnder = new Date(Date.UTC(2026, 11, 1 + STALE_RUN_DAYS) - 1);
        const atThreshold = new Date(Date.UTC(2026, 11, 1 + STALE_RUN_DAYS));
        expect(describeLatestRun(init, justUnder).stale).toBe(false);
        expect(describeLatestRun(init, atThreshold).stale).toBe(true);
    });

    it('says nothing when there is no readable run', () => {
        expect(describeLatestRun(null, RELEASE_DAY)).toBeNull();
        expect(describeLatestRun('garbage', RELEASE_DAY)).toBeNull();
    });
});
