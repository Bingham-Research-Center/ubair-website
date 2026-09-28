import { jest } from '@jest/globals';
import {
    getPreviewSkipLog,
    initializeOutlookRefresh,
    OUTLOOKS_REFRESH_INTERVAL_MS,
    startRuntimeBackgroundJobs
} from '../startup/backgroundJobs.js';

const ORIGINAL_PREVIEW_MODE = process.env.PREVIEW_MODE;

afterEach(() => {
    if (ORIGINAL_PREVIEW_MODE === undefined) {
        delete process.env.PREVIEW_MODE;
    } else {
        process.env.PREVIEW_MODE = ORIGINAL_PREVIEW_MODE;
    }
    jest.restoreAllMocks();
});

describe('preview-mode background job gating', () => {
    test('PREVIEW_MODE=true skips background starts and outlook refresh timers', async () => {
        process.env.PREVIEW_MODE = 'true';
        const backgroundRefresh = { start: jest.fn() };
        const reportEmailService = { start: jest.fn() };
        const generateOutlooksList = jest.fn();
        const setIntervalFn = jest.fn();

        expect(startRuntimeBackgroundJobs({ backgroundRefresh, reportEmailService })).toBe(false);
        await expect(initializeOutlookRefresh({ generateOutlooksList, setIntervalFn })).resolves.toBe(false);

        expect(backgroundRefresh.start).not.toHaveBeenCalled();
        expect(reportEmailService.start).not.toHaveBeenCalled();
        expect(generateOutlooksList).not.toHaveBeenCalled();
        expect(setIntervalFn).not.toHaveBeenCalled();
        expect(getPreviewSkipLog()).toBe(
            'PREVIEW_MODE=true — skipped background refresh, report emails, and outlook list refresh.'
        );
    });

    test('default startup behavior is unchanged', async () => {
        delete process.env.PREVIEW_MODE;
        const backgroundRefresh = { start: jest.fn() };
        const reportEmailService = { start: jest.fn() };
        const generateOutlooksList = jest.fn().mockResolvedValue([]);
        const setIntervalFn = jest.fn();

        expect(startRuntimeBackgroundJobs({ backgroundRefresh, reportEmailService })).toBe(true);
        await expect(initializeOutlookRefresh({ generateOutlooksList, setIntervalFn })).resolves.toBe(true);

        expect(backgroundRefresh.start).toHaveBeenCalledTimes(1);
        expect(reportEmailService.start).toHaveBeenCalledTimes(1);
        expect(generateOutlooksList).toHaveBeenCalledTimes(1);
        expect(setIntervalFn).toHaveBeenCalledWith(generateOutlooksList, OUTLOOKS_REFRESH_INTERVAL_MS);
    });
});
