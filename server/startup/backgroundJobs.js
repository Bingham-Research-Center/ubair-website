export const OUTLOOKS_REFRESH_INTERVAL_MS = 300000;

export function isPreviewMode(env = process.env) {
    return env.PREVIEW_MODE === 'true';
}

export function getPreviewSkipLog() {
    return 'PREVIEW_MODE=true — skipped background refresh, report emails, and outlook list refresh.';
}

export function startRuntimeBackgroundJobs({
    backgroundRefresh,
    reportEmailService,
    env = process.env
}) {
    if (isPreviewMode(env)) {
        return false;
    }

    backgroundRefresh.start();
    reportEmailService.start();
    return true;
}

export async function initializeOutlookRefresh({
    generateOutlooksList,
    setIntervalFn = setInterval,
    env = process.env
}) {
    if (isPreviewMode(env)) {
        return false;
    }

    await generateOutlooksList();
    setIntervalFn(generateOutlooksList, OUTLOOKS_REFRESH_INTERVAL_MS);
    return true;
}
