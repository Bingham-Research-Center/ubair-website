import cron from 'node-cron';

function parseBoolean(value, fallback = false) {
    if (value === undefined || value === null || value === '') {
        return fallback;
    }

    return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

class ReportEmailService {
    constructor(options = {}) {
        this.getStatusReport = options.getStatusReport || (() => ({}));
        this.getBackgroundStats = options.getBackgroundStats || (() => null);
        this.getCameraStats = options.getCameraStats || (() => null);

        this.job = null;
        this.transporter = null;

        this.config = {
            enabled: parseBoolean(process.env.REPORT_EMAIL_ENABLED, false),
            smtpHost: process.env.REPORT_EMAIL_SMTP_HOST || '',
            smtpPort: Number.parseInt(process.env.REPORT_EMAIL_SMTP_PORT || '587', 10),
            smtpSecure: parseBoolean(process.env.REPORT_EMAIL_SMTP_SECURE, false),
            smtpUser: process.env.REPORT_EMAIL_SMTP_USER || '',
            smtpPass: process.env.REPORT_EMAIL_SMTP_PASS || '',
            from: process.env.REPORT_EMAIL_FROM || process.env.REPORT_EMAIL_SMTP_USER || '',
            to: process.env.REPORT_EMAIL_TO || '',
            scheduleEnabled: parseBoolean(process.env.REPORT_EMAIL_SCHEDULE_ENABLED, false),
            cron: process.env.REPORT_EMAIL_CRON || '0 8 * * *',
            timezone: process.env.REPORT_EMAIL_TIMEZONE || 'America/Denver',
            notifyOnStartup: parseBoolean(
                process.env.REPORT_EMAIL_NOTIFY_ON_STARTUP,
                parseBoolean(process.env.REPORT_EMAIL_SEND_ON_STARTUP, true)
            ),
            notifyOnShutdown: parseBoolean(process.env.REPORT_EMAIL_NOTIFY_ON_SHUTDOWN, true),
            subjectPrefix: process.env.REPORT_EMAIL_SUBJECT_PREFIX || 'BasinWx Status Report'
        };
    }

    start() {
        if (!this.config.enabled) {
            console.log('✉️  Report email service disabled (set REPORT_EMAIL_ENABLED=true to enable)');
            return;
        }

        if (this.job) {
            console.log('⚠️  Report email service already running');
            return;
        }

        const missingConfig = this.getMissingConfig();
        if (missingConfig.length > 0) {
            console.warn(`⚠️  Report email service missing configuration: ${missingConfig.join(', ')}`);
            return;
        }

        if (this.config.notifyOnStartup) {
            this.sendLifecycleNotification('startup', {
                signal: 'process_start',
                pid: process.pid,
                uptimeSeconds: Math.round(process.uptime())
            }).catch((error) => {
                console.error(`✗ Startup report email failed: ${error.message}`);
            });
        }

        if (!this.config.scheduleEnabled) {
            console.log('✉️  Report email schedule disabled (set REPORT_EMAIL_SCHEDULE_ENABLED=true to enable cron)');
            return;
        }

        if (!cron.validate(this.config.cron)) {
            console.warn(`⚠️  Invalid REPORT_EMAIL_CRON: ${this.config.cron}`);
            return;
        }

        this.job = cron.schedule(this.config.cron, async () => {
            try {
                await this.sendReportEmail('scheduled');
            } catch (error) {
                console.error(`✗ Scheduled report email failed: ${error.message}`);
            }
        }, {
            timezone: this.config.timezone
        });

        console.log(`✉️  Report email schedule enabled (${this.config.cron}, timezone ${this.config.timezone})`);
    }

    stop() {
        if (!this.job) {
            return;
        }

        this.job.stop();
        this.job = null;

        console.log('✉️  Report email service stopped');
    }

    async sendReportEmail(trigger = 'manual') {
        return this.sendReportEmailWithContext(trigger, {});
    }

    async sendReportEmailWithContext(trigger = 'manual', context = {}) {
        if (!this.config.enabled) {
            return { sent: false, reason: 'disabled' };
        }

        const missingConfig = this.getMissingConfig();
        if (missingConfig.length > 0) {
            throw new Error(`Missing report email config: ${missingConfig.join(', ')}`);
        }

        const transporter = await this.getTransporter();
        const report = this.safeCall(this.getStatusReport, {});
        const backgroundStats = this.safeCall(this.getBackgroundStats, null);
        const cameraStats = this.safeCall(this.getCameraStats, null);

        const generatedAt = new Date();
        const subjectDate = generatedAt.toISOString().slice(0, 10);
        const subject = `${this.config.subjectPrefix} - ${subjectDate}`;

        const text = this.buildReportText({
            generatedAt,
            trigger,
            context,
            report,
            backgroundStats,
            cameraStats
        });

        const message = await transporter.sendMail({
            from: this.config.from,
            to: this.parseRecipients(this.config.to).join(','),
            subject,
            text
        });

        console.log(`✓ Report email sent (${trigger}) to ${this.config.to} [${message.messageId}]`);

        return {
            sent: true,
            messageId: message.messageId
        };
    }

    async sendLifecycleNotification(eventName, details = {}) {
        const trigger = `lifecycle:${eventName}`;
        return this.sendReportEmailWithContext(trigger, {
            eventName,
            ...details
        });
    }

    async sendShutdownNotification(details = {}) {
        if (!this.config.enabled || !this.config.notifyOnShutdown) {
            return { sent: false, reason: 'shutdown_notification_disabled' };
        }

        return this.sendLifecycleNotification('shutdown', details);
    }

    safeCall(fn, fallback) {
        try {
            return fn();
        } catch (error) {
            console.warn(`⚠️  Report email data source failed: ${error.message}`);
            return fallback;
        }
    }

    getMissingConfig() {
        const required = [
            ['REPORT_EMAIL_SMTP_HOST', this.config.smtpHost],
            ['REPORT_EMAIL_SMTP_PORT', Number.isFinite(this.config.smtpPort)],
            ['REPORT_EMAIL_SMTP_USER', this.config.smtpUser],
            ['REPORT_EMAIL_SMTP_PASS', this.config.smtpPass],
            ['REPORT_EMAIL_TO', this.config.to],
            ['REPORT_EMAIL_FROM', this.config.from]
        ];

        return required
            .filter(([, value]) => !value)
            .map(([name]) => name);
    }

    parseRecipients(value) {
        return String(value)
            .split(',')
            .map((recipient) => recipient.trim())
            .filter(Boolean);
    }

    async getTransporter() {
        if (this.transporter) {
            return this.transporter;
        }

        let nodemailerModule;
        try {
            nodemailerModule = await import('nodemailer');
        } catch (error) {
            throw new Error('nodemailer dependency is missing. Run npm install to enable report emails.');
        }

        const nodemailer = nodemailerModule.default || nodemailerModule;

        this.transporter = nodemailer.createTransport({
            host: this.config.smtpHost,
            port: this.config.smtpPort,
            secure: this.config.smtpSecure,
            auth: {
                user: this.config.smtpUser,
                pass: this.config.smtpPass
            }
        });

        await this.transporter.verify();
        return this.transporter;
    }

    buildReportText({ generatedAt, trigger, context, report, backgroundStats, cameraStats }) {
        const lines = [
            'BasinWx Monitoring Report',
            `Generated: ${generatedAt.toISOString()}`,
            `Trigger: ${trigger}`,
            ''
        ];

        const contextEntries = Object.entries(context || {})
            .filter(([, value]) => value !== undefined && value !== null && value !== '');

        if (contextEntries.length > 0) {
            lines.push('Event Context');
            contextEntries.forEach(([key, value]) => {
                const formattedValue = value instanceof Error
                    ? (value.stack || value.message)
                    : String(value);

                lines.push(`- ${key}: ${formattedValue}`);
            });
            lines.push('');
        }

        const summary = report?.summary || {};
        lines.push('Summary');
        lines.push(`- Overall Health: ${summary.overallHealth || 'unknown'}`);
        lines.push(`- Data Types Monitored: ${summary.dataTypesMonitored || 0}`);
        lines.push(`- Last Check: ${summary.lastCheck || 'unknown'}`);

        const issues = Array.isArray(summary.issues) ? summary.issues : [];
        lines.push(`- Issues: ${issues.length > 0 ? issues.join('; ') : 'none'}`);
        lines.push('');

        const freshnessEntries = Object.entries(report?.dataFreshness || {});
        lines.push('Data Freshness');
        if (freshnessEntries.length === 0) {
            lines.push('- No freshness data available');
        } else {
            freshnessEntries.forEach(([dataType, data]) => {
                const status = data?.status || 'unknown';
                const age = Number.isFinite(data?.ageMinutes) ? `${data.ageMinutes} min old` : 'age unknown';
                const latest = data?.latestFile ? `latest=${data.latestFile}` : '';
                lines.push(`- ${dataType}: ${status} (${age}) ${latest}`.trim());
            });
        }
        lines.push('');

        if (backgroundStats) {
            lines.push('Background Refresh');
            lines.push(`- Service Status: ${backgroundStats.isRunning ? 'running' : 'stopped'}`);
            lines.push(`- Essential Refresh Count: ${backgroundStats.refreshCount?.essential ?? 'n/a'}`);
            lines.push(`- Frequent Refresh Count: ${backgroundStats.refreshCount?.frequent ?? 'n/a'}`);
            lines.push(`- Infrequent Refresh Count: ${backgroundStats.refreshCount?.infrequent ?? 'n/a'}`);
            lines.push(`- Estimated API Calls/Minute: ${backgroundStats.estimatedApiCallsPerMinute ?? 'n/a'}`);
            lines.push('');
        }

        if (cameraStats) {
            lines.push('Camera Analysis Scheduler');
            lines.push(`- Running: ${cameraStats.isRunning ? 'yes' : 'no'}`);
            lines.push(`- Camera Queue: ${cameraStats.cameraQueue ?? 'n/a'}`);
            lines.push(`- Cached Cameras: ${cameraStats.cachedCameras ?? 'n/a'}`);
            lines.push(`- Cache Hit Rate: ${cameraStats.cacheHitRate ?? 'n/a'}`);
            lines.push(`- Total Analyses: ${cameraStats.totalAnalyses ?? 'n/a'}`);
            lines.push(`- Failed Analyses: ${cameraStats.failedAnalyses ?? 'n/a'}`);
            lines.push(`- Last Analysis Time: ${cameraStats.lastAnalysisTime || 'n/a'}`);
            if (cameraStats.warmRestore) {
                lines.push(`- Warm Restore Count: ${cameraStats.warmRestore.restoredDetectionsCount ?? 0}`);
                lines.push(`- Warm Restore Snapshot Age: ${cameraStats.warmRestore.restoredSnapshotAgeMinutes ?? 'n/a'} min`);
                lines.push(`- Warm Restored From Disk: ${cameraStats.warmRestore.restoredFromDisk ? 'yes' : 'no'}`);
            }
            lines.push('');
        }

        const alerts = Array.isArray(report?.alerts) ? report.alerts.slice(-10) : [];
        lines.push('Recent Alerts');
        if (alerts.length === 0) {
            lines.push('- None');
        } else {
            alerts.forEach((alert) => {
                lines.push(`- [${alert.level || 'info'}] ${alert.message || 'No message'} (${alert.timestamp || 'unknown time'})`);
            });
        }
        lines.push('');
        lines.push('Generated automatically by BasinWx report email service.');

        return lines.join('\n');
    }
}

export default ReportEmailService;
