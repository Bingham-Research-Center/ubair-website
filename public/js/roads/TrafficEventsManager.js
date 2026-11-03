/**
 * Traffic Events Tab System
 * Manages traffic events and alerts
 * Provides tabbed interface for active, upcoming, and all events
 * Auto-refreshes every 5 minutes
 * Extracted from roads.js as part of refactoring
 */

/**
 * Traffic Events Manager Class
 * Handles loading, displaying, and managing traffic events and alerts
 */
class TrafficEventsManager {
    constructor() {
        this.currentTab = 'active';
        this.alertsData = [];
        this.alertsStatus = 'loading';
        this.eventsStatus = { active: 'loading', upcoming: 'loading', all: 'loading' };
        this.eventsData = {
            active: [],
            upcoming: [],
            all: []
        };
        this.init();
    }

    init() {
        this.initTabButtons();
        this.loadAllEventsData();
        this.loadAlerts();
        this.startAutoRefresh();
    }

    initTabButtons() {
        const tabButtons = document.querySelectorAll('.tab-btn');
        tabButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tabName = e.currentTarget.dataset.tab;
                this.switchTab(tabName);
            });
        });
    }

    switchTab(tabName) {
        // Update active tab button
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

        // Update active tab content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(`${tabName}-events`).classList.add('active');

        this.currentTab = tabName;
        this.displayEvents(tabName);
    }

    async loadAllEventsData() {
        const tabs = ['active', 'upcoming', 'all'];
        const responses = await Promise.allSettled(tabs.map(async tab => {
            const response = await fetch(`/api/traffic-events${tab === 'all' ? '' : `/${tab}`}`);
            if (!response.ok) throw new Error(`Traffic events HTTP ${response.status}`);
            const data = await response.json();
            if (!data.success || !Array.isArray(data.events)) throw new Error('Invalid traffic events response');
            return data.events;
        }));
        responses.forEach((result, index) => {
            const tab = tabs[index];
            this.eventsStatus[tab] = result.status === 'fulfilled' ? 'ready' : 'error';
            if (result.status === 'fulfilled') this.eventsData[tab] = result.value;
            else console.error(`Error loading ${tab} traffic events:`, result.reason);
        });
        this.displayEvents(this.currentTab);
    }

    displayEvents(tabName) {
        const container = document.getElementById(`${tabName}-events`);
        const events = this.eventsData[tabName];

        if (!container) {
            console.error(`TrafficEventsManager: Container not found for tab: ${tabName}`);
            return;
        }

        let alertsHtml = '';
        if (tabName !== 'upcoming') {
            const now = Date.now();
            const severityOrder = { high: 3, medium: 2, low: 1 };
            const alerts = this.alertsData.filter(alert =>
                (!alert.startTime || Date.parse(alert.startTime) <= now) &&
                (!alert.endTime || Date.parse(alert.endTime) >= now)
            ).sort((a, b) => (severityOrder[b.severity] || 0) - (severityOrder[a.severity] || 0));
            alertsHtml = alerts.map(alert => this.createAlertCard(alert)).join('');
            if (this.alertsStatus === 'loading') alertsHtml += '<p class="advisories-status">Loading UDOT alerts…</p>';
            else if (this.alertsStatus === 'error') alertsHtml += '<p class="advisories-status" role="status">UDOT alerts could not be updated. Please try again later.</p>';
            else if (!alerts.length) alertsHtml = '<p class="advisories-status">No UDOT alerts for the Basin right now.</p>';
        }

        let eventsHtml = events.map(event => this.createEventCard(event)).join('');
        if (this.eventsStatus[tabName] === 'loading') eventsHtml += '<p class="advisories-status">Loading travel advisories…</p>';
        else if (this.eventsStatus[tabName] === 'error') eventsHtml += '<p class="advisories-status" role="status">Travel advisories could not be updated. Please try again later.</p>';
        else if (!events.length) eventsHtml = `<p class="advisories-status">No ${tabName === 'all' ? '' : `${tabName} `}travel advisories.</p>`;
        container.innerHTML = `<div class="events-list advisories-list">${alertsHtml}${eventsHtml}</div>`;
    }

    createEventCard(event) {
        const startDate = new Date(event.startDate);
        const endDate = event.plannedEndDate ? new Date(event.plannedEndDate) : null;
        const now = new Date();

        let statusClass = 'status-info';
        let statusText = 'Scheduled';

        if (startDate <= now && (!endDate || endDate >= now)) {
            statusClass = 'status-active';
            statusText = 'Active';
        } else if (endDate && endDate < now) {
            statusClass = 'status-completed';
            statusText = 'Completed';
        }

        const descriptionText = typeof event.description === 'string' ? event.description : '';
        const titleText = event.name || (descriptionText ? descriptionText.substring(0, 60) : 'Traffic Event');
        const safeDisplayColor = sanitizeHexColor(event.displayColor, '#6c757d');
        const safeDisplayIcon = escapeHtml(event.displayIcon || '🚧');
        const safeTitleText = escapeHtml(titleText);
        const safeRoadwayName = escapeHtml(event.roadwayName || 'Unknown roadway');
        const safeDescriptionText = escapeHtml(descriptionText || 'No description available.');
        const safeEventType = escapeHtml((event.eventType || 'Unknown').replace(/([A-Z])/g, ' $1').trim());
        const safeSeverity = escapeHtml(event.severity || 'Unknown');
        const safeComment = escapeHtml(event.comment || '');

        return `
            <div class="event-card" style="
                border: 1px solid #e5e7eb;
                border-radius: 8px;
                padding: 16px;
                margin-bottom: 16px;
                background: white;
                box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            ">
                <div class="event-header" style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
                    <div class="event-title" style="flex: 1;">
                        <h4 style="margin: 0 0 4px 0; color: ${safeDisplayColor}; display: flex; align-items: center; gap: 8px;">
                            ${safeDisplayIcon} ${safeTitleText}
                            ${event.isFullClosure ? '<span style="background: #dc2626; color: white; font-size: 10px; padding: 2px 6px; border-radius: 12px; margin-left: 8px;">CLOSURE</span>' : ''}
                        </h4>
                        <p style="margin: 0; color: #666; font-size: 14px;">${safeRoadwayName}</p>
                    </div>
                    <div class="event-status">
                        <span class="${statusClass}" style="
                            padding: 4px 8px;
                            border-radius: 12px;
                            font-size: 12px;
                            font-weight: 500;
                        ">${statusText}</span>
                    </div>
                </div>

                <div class="event-description" style="margin-bottom: 12px;">
                    <p style="margin: 0; font-size: 14px; line-height: 1.4;">${safeDescriptionText}</p>
                </div>

                <div class="event-details" style="
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 12px;
                    font-size: 12px;
                    color: #666;
                ">
                    <div>
                        <strong>Type:</strong> ${safeEventType}
                    </div>
                    <div>
                        <strong>Severity:</strong> ${safeSeverity}
                    </div>
                    <div>
                        <strong>Start:</strong> ${startDate.toLocaleDateString()} ${startDate.toLocaleTimeString()}
                    </div>
                    <div>
                        <strong>End:</strong> ${endDate ? `${endDate.toLocaleDateString()} ${endDate.toLocaleTimeString()}` : 'TBD'}
                    </div>
                </div>

                ${event.comment ? `
                    <div class="event-comment" style="
                        margin-top: 12px;
                        padding: 8px;
                        background: #f8f9fa;
                        border-radius: 4px;
                        font-size: 13px;
                        color: #555;
                    ">
                        <strong>Additional Info:</strong> ${safeComment}
                    </div>
                ` : ''}
            </div>
        `;
    }

    async loadAlerts() {
        try {
            const alertsResponse = await fetch('/api/alerts');

            if (!alertsResponse.ok) {
                throw new Error(`Alerts HTTP ${alertsResponse.status}`);
            }

            const alertsData = await alertsResponse.json();

            if (alertsData.success && Array.isArray(alertsData.alerts)) {
                this.displayAlerts(alertsData.alerts);
            } else {
                throw new Error('Invalid response format');
            }
        } catch (error) {
            console.error('Error loading alerts:', error);
            this.showAlertsError('Failed to load alerts');
        }
    }

    displayAlerts(alerts) {
        this.alertsData = alerts;
        this.alertsStatus = 'ready';
        this.displayEvents(this.currentTab);
    }

    createAlertCard(alert) {
        const dateFormat = new Intl.DateTimeFormat('en-US', {
            timeZone: 'America/Denver', month: 'short', day: 'numeric', year: 'numeric'
        });
        const formatDate = value => value && Number.isFinite(Date.parse(value)) ? dateFormat.format(new Date(value)) : '';
        const startDate = formatDate(alert.startTime);
        const endDate = formatDate(alert.endTime);
        const severityToken = sanitizeClassToken(alert.severity || 'unknown');
        const safeSeverity = escapeHtml(alert.severity || 'unknown');
        const safeMessage = escapeHtml(alert.message || '');
        const safeNotes = escapeHtml(alert.notes || '');
        const safeRegions = Array.isArray(alert.regions) ? alert.regions.map(region => escapeHtml(region)).join(', ') : '';

        return `
            <div class="alert-card ${severityToken}-importance">
                <div class="alert-header">
                    <div class="alert-info">
                        <span class="alert-source">UDOT alert</span>
                        <span class="alert-severity ${severityToken}">${safeSeverity}</span>
                    </div>
                </div>

                <div class="alert-message">
                    ${safeMessage}
                </div>

                ${alert.notes ? `
                    <div class="alert-notes">
                        <strong>Additional Info:</strong> ${safeNotes}
                    </div>
                ` : ''}

                <div class="alert-times">
                    ${startDate ? `<span><strong>Started:</strong> ${startDate}</span>` : ''}
                    ${endDate ? `<span><strong>Ends:</strong> ${endDate}</span>` : ''}
                </div>

                ${alert.regions && alert.regions.length > 0 ? `
                    <div class="alert-regions">
                        <strong>Regions:</strong> ${safeRegions}
                    </div>
                ` : ''}
            </div>
        `;
    }

    showAlertsError(message) {
        console.error(message);
        this.alertsStatus = 'error';
        this.displayEvents(this.currentTab);
    }

    startAutoRefresh() {
        // Refresh every 5 minutes
        setInterval(() => {
            this.loadAllEventsData();
            this.loadAlerts();
        }, 300000);
    }
}
