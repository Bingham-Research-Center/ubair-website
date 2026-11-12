import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { logPipelineEvent } from '../middleware/pipelineAnalytics.js';

// On 12 Nov 2026 a test run in the production checkout added two uploads, one of them failed,
// to that day's real pipeline record: ingestReadiness.test.js drives the upload route, and
// this module wrote to logs/analytics whatever the environment. Page analytics already kept
// its test output in a temp dir; the pipeline log now does the same.

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const liveLog = path.join(repoRoot, 'logs/analytics/pipeline.log');
const sizeOf = (file) => (fs.existsSync(file) ? fs.statSync(file).size : null);

describe('pipeline analytics under test', () => {
    test('an upload event lands in the temp dir, not in the checkout', async () => {
        const before = sizeOf(liveLog);
        const marker = `isolation_probe_${process.pid}_${Date.now()}.json`;

        await logPipelineEvent({ dataType: 'observations', filename: marker, size: 1, success: false, error: 'test' });

        expect(sizeOf(liveLog)).toBe(before);
        const tempLog = path.join(
            process.env.ANALYTICS_LOG_DIR || path.join(os.tmpdir(), `ubair-analytics-test-${process.pid}`),
            'pipeline.log',
        );
        expect(fs.readFileSync(tempLog, 'utf8')).toContain(marker);
    });
});
