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
                const tabName = e.target.dataset.tab;
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
        try {
            const [activeResponse, upcomingResponse, allResponse] = await Promise.all([
                fetch('/api/traffic-events/active'),
                fetch('/api/traffic-events/upcoming'),
                fetch('/api/traffic-events')
            ]);

            if (activeResponse.ok) {
                const activeData = await activeResponse.json();
                this.eventsData.active = activeData.events || [];
            }

            if (upcomingResponse.ok) {
                const upcomingData = await upcomingResponse.json();
                this.eventsData.upcoming = upcomingData.events || [];
            }

            if (allResponse.ok) {
                const allData = await allResponse.json();
                this.eventsData.all = allData.events || [];
            }

            this.displayEvents(this.currentTab);
        } catch (error) {
            console.error('Error loading traffic events data:', error);
            this.showError('Failed to load traffic events');
        }
    }

    displayEvents(tabName) {
        const container = document.getElementById(`${tabName}-events`);
        const events = this.eventsData[tabName];

        if (!container) {
            console.error(`TrafficEventsManager: Container not found for tab: ${tabName}`);
            return;
        }

        if (events.length === 0) {
            container.innerHTML = `
                <div class="no-events" style="text-align: center; padding: 40px; color: #666;">
                    <i class="fas fa-check-circle" style="font-size: 48px; margin-bottom: 16px; color: #10b981;"></i>
                    <h3 style="margin: 0 0 8px 0;">No ${tabName} events</h3>
                    <p style="margin: 0;">All clear on Uintah Basin roads!</p>
                </div>
            `;
            return;
        }

        const eventsHtml = events.map(event => this.createEventCard(event)).join('');
        container.innerHTML = `<div class="events-list">${eventsHtml}</div>`;
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
        const titleText = escapeHtml(event.name || (descriptionText ? descriptionText.substring(0, 60) : 'Traffic Event'));
        const safeRoadwayName = escapeHtml(event.roadwayName || 'Unknown roadway');
        const safeDescription = escapeHtml(descriptionText || 'No description available.');
        const safeEventType = escapeHtml((event.eventType || 'Unknown').replace(/([A-Z])/g, ' $1').trim());
        const safeSeverity = escapeHtml(event.severity || 'Unknown');
        const safePriority = Number.isFinite(Number(event.priority)) ? Number(event.priority) : 0;
        const safeColor = sanitizeHexColor(event.displayColor, '#1f2937');
        const safeIcon = escapeHtml(event.displayIcon || '🚧');
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
                        <h4 style="margin: 0 0 4px 0; color: ${safeColor}; display: flex; align-items: center; gap: 8px;">
                            ${safeIcon} ${titleText}
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
                        <div style="text-align: right; margin-top: 4px; font-size: 11px; color: #999;">
                            Priority: ${safePriority}/10
                        </div>
                    </div>
                </div>

                <div class="event-description" style="margin-bottom: 12px;">
                    <p style="margin: 0; font-size: 14px; line-height: 1.4;">${safeDescription}</p>
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

    showError(message) {
        const activeContainer = document.getElementById('active-events');
        if (activeContainer) {
            activeContainer.innerHTML = `
                <div class="events-error" style="text-align: center; padding: 40px; color: #dc2626;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 48px; margin-bottom: 16px;"></i>
                    <h3 style="margin: 0 0 8px 0;">Error Loading Events</h3>
                    <p style="margin: 0;">${escapeHtml(message)}</p>
                    <button onclick="trafficEventsManager.loadAllEventsData()"
                            style="margin-top: 16px; padding: 8px 16px; background: #dc2626; color: white; border: none; border-radius: 4px; cursor: pointer;">
                        Retry
                    </button>
                </div>
            `;
        }
    }

    async loadAlerts() {
        try {
            const alertsResponse = await fetch('/api/alerts');

            if (!alertsResponse.ok) {
                throw new Error(`Alerts HTTP ${alertsResponse.status}`);
            }

            const alertsData = await alertsResponse.json();

            if (alertsData.success && alertsData.alerts) {
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
        const container = document.getElementById('alerts-container');
        if (!container) {
            console.error('TrafficEventsManager: Alerts container not found');
            return;
        }

        if (alerts.length === 0) {
            container.innerHTML = `
                <div class="no-alerts">
                    <i class="fas fa-check-circle"></i>
                    <h4>No Active Alerts</h4>
                    <p>All clear - no UDOT alerts for the region.</p>
                </div>
            `;
            return;
        }

        const alertsHtml = alerts.map(alert => this.createAlertCard(alert)).join('');
        container.innerHTML = `<div class="alerts-list">${alertsHtml}</div>`;
    }

    createAlertCard(alert) {
        const startDate = new Date(alert.startTime);
        const endDate = alert.endTime ? new Date(alert.endTime) : null;
        const severityToken = String(alert.severity || 'unknown').toLowerCase().replace(/[^a-z0-9_-]/g, '') || 'unknown';
        const safeSeverity = escapeHtml(alert.severity || 'unknown');
        const safeMessage = escapeHtml(alert.message || '');
        const safeNotes = escapeHtml(alert.notes || '');
        const safeRegions = Array.isArray(alert.regions) ? alert.regions.map(region => escapeHtml(region)).join(', ') : '';

        return `
            <div class="alert-card ${severityToken}-importance">
                <div class="alert-header">
                    <div class="alert-info">
                        <span class="alert-severity ${severityToken}">${safeSeverity}</span>
                        ${alert.highImportance ? '<i class="fas fa-exclamation-triangle" style="color: #dc2626; margin-left: 8px;" title="High Importance"></i>' : ''}
                        ${alert.sendNotification ? '<i class="fas fa-bell" style="color: #f59e0b; margin-left: 4px;" title="Notification Alert"></i>' : ''}
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
                    <span><strong>Started:</strong> ${startDate.toLocaleString()}</span>
                    ${endDate ? `<span><strong>Ends:</strong> ${endDate.toLocaleString()}</span>` : '<span><strong>End:</strong> TBD</span>'}
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
        const container = document.getElementById('alerts-container');
        if (container) {
            container.innerHTML = `
                <div style="text-align: center; padding: 2rem; color: #dc2626;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 2rem; margin-bottom: 1rem;"></i>
                    <h4 style="margin: 0 0 0.5rem 0;">Error Loading Alerts</h4>
                    <p style="margin: 0;">${escapeHtml(message)}</p>
                </div>
            `;
        }
    }

    startAutoRefresh() {
        // Refresh every 5 minutes
        setInterval(() => {
            this.loadAllEventsData();
            this.loadAlerts();
        }, 300000);
    }
}
