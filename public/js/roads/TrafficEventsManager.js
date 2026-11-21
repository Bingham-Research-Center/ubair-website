/**
 * Traffic Events Tab System
 * Manages traffic events and alerts
 * Provides tabbed interface for active, upcoming, and all events
 * Auto-refreshes every 5 minutes
 * Extracted from roads.js as part of refactoring
 */

const advisoryDateFormat = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Denver', month: 'short', day: 'numeric'
});
const advisoryFullDateFormat = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Denver', month: 'short', day: 'numeric', year: 'numeric'
});

function parseAdvisoryDate(value) {
    if (value === null || value === undefined || value === '') return null;
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
}

function formatAdvisoryDates(startValue, endValue) {
    const start = parseAdvisoryDate(startValue);
    const end = parseAdvisoryDate(endValue);
    if (start && end) {
        if (advisoryFullDateFormat.format(start) === advisoryFullDateFormat.format(end)) {
            return advisoryFullDateFormat.format(end);
        }
        return `${advisoryDateFormat.format(start)} to ${advisoryFullDateFormat.format(end)}`;
    }
    if (start) return `${advisoryFullDateFormat.format(start)} · End date not provided`;
    if (end) return `Until ${advisoryFullDateFormat.format(end)}`;
    return 'Dates not provided';
}

function selectAdvisories(events, tabName, now = Date.now()) {
    return (Array.isArray(events) ? events : []).map(event => ({
        event,
        start: parseAdvisoryDate(event.startDate)?.getTime() ?? null,
        end: parseAdvisoryDate(event.plannedEndDate)?.getTime() ?? null,
        priority: Number.isFinite(Number(event.priority)) ? Number(event.priority) : 0
    })).filter(item => {
        if (item.end !== null && item.end < now) return false;
        if (tabName === 'active') return item.start === null || item.start <= now;
        if (tabName === 'upcoming') return item.start !== null && item.start > now;
        return true;
    }).sort((a, b) => {
        const aUpcoming = a.start !== null && a.start > now;
        const bUpcoming = b.start !== null && b.start > now;
        return Number(aUpcoming) - Number(bUpcoming) || b.priority - a.priority ||
            (aUpcoming ? (a.start ?? 0) - (b.start ?? 0) : (b.start ?? 0) - (a.start ?? 0));
    }).map(item => item.event);
}

function advisoryTitle(event) {
    return String(event.roadwayName || event.name || 'Road advisory').trim() || 'Road advisory';
}

function advisoryKey(event) {
    return String(event.id ?? event.sourceId ?? [advisoryTitle(event), event.startDate, event.description].join('|'));
}

function normalizeAdvisoryFragment(text) {
    return String(text || '').normalize('NFKC').toLowerCase()
        .replace(/^(?:road(?:way)?(?: name)?|title)\s*:\s*/, '')
        .replace(/[^a-z0-9]/g, '');
}

/** Escape the feed as text, then add only http(s), email, and telephone links. */
function linkAdvisoryContacts(text) {
    const tokens = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}|https?:\/\/[^\s<>"|]+|(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(?::\d+)?(?:\/[^\s<>"|]*)?|(?<!\d)(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}(?:\s*(?:ext\.?|x)\s*\d+)?(?!\d)/gi;
    let html = '';
    let cursor = 0;
    for (const match of text.matchAll(tokens)) {
        const prefix = text.slice(cursor, match.index);
        let token = match[0];
        html += escapeHtml(prefix);
        if (/^[a-z0-9._%+-]+@/i.test(token)) {
            const label = /\be-?mail\s*:\s*$/i.test(prefix) ? '' : 'Email: ';
            const address = encodeURIComponent(token).replace(/%40/gi, '@');
            html += `${label}<a href="mailto:${escapeHtml(address)}">${escapeHtml(token)}</a>`;
        } else if (/^(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}/.test(token)) {
            const label = /\b(?:phone|telephone|tel|hotline)\s*:\s*$/i.test(prefix) ? '' : 'Phone: ';
            const extension = token.match(/\s*(?:ext\.?|x)\s*(\d+)$/i);
            const digits = token.replace(/\s*(?:ext\.?|x)\s*\d+$/i, '').replace(/\D/g, '');
            const number = `+${digits.length === 10 ? '1' : ''}${digits}${extension ? `;ext=${extension[1]}` : ''}`;
            html += `${label}<a href="tel:${number}">${escapeHtml(token)}</a>`;
        } else {
            token = token.replace(/[.,;!?]+$/, '');
            for (const [open, close] of [['(', ')'], ['[', ']']]) {
                while (token.endsWith(close) && token.split(close).length > token.split(open).length) token = token.slice(0, -1);
            }
            const href = /^https?:\/\//i.test(token) ? token : `https://${token}`;
            html += `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(token)}</a>`;
            html += escapeHtml(match[0].slice(token.length));
        }
        cursor = match.index + match[0].length;
    }
    return html + escapeHtml(text.slice(cursor));
}

function formatAdvisoryInfo(event) {
    const seen = new Set([advisoryTitle(event), event.name, event.description].map(normalizeAdvisoryFragment));
    return String(event.comment || '').split('|').map(part => part.trim()).filter(part => {
        const normalized = normalizeAdvisoryFragment(part);
        if (!normalized || seen.has(normalized)) return false;
        seen.add(normalized);
        return true;
    }).map(part => `<li>${linkAdvisoryContacts(part)}</li>`).join('');
}

/**
 * Traffic Events Manager Class
 * Handles loading, displaying, and managing traffic events and alerts
 */
function trafficFeedNotice(state, label, hasRecords = false) {
    if (!state || (state.status !== 'cached' && state.status !== 'unavailable' && !state.feedUnavailable)) return '';
    const unavailable = state.status === 'unavailable' || state.feedUnavailable;
    const message = unavailable ? `${label} feed unavailable.` : `${label}: showing cached reports.`;
    const provenance = state.status === 'cached' || state.lastUpdated
        ? formatUDOTReportAge({ cached: true, lastUpdated: state.lastUpdated }) : '';
    return `<p class="advisories-status" role="status">${escapeHtml(message)}${unavailable && hasRecords ? ' Showing last received reports.' : ''} ${escapeHtml(provenance)}</p>`;
}

class TrafficEventsManager {
    constructor() {
        this.currentTab = 'active';
        this.eventsFeedStatus = {};
        this.alertsFeedStatus = null;
        this.expandedLists = new Set();
        this.expandedDescriptions = new Set();
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
        this.initAdvisoryToggles();
        this.loadAllEventsData();
        this.loadAlerts();
        this.startAutoRefresh();
    }

    initAdvisoryToggles() {
        const section = document.getElementById('travel-advisories');
        if (!section) return;
        section.addEventListener('click', event => {
            const button = event.target.closest('button');
            if (!button) return;
            if (button.hasAttribute('data-advisory-more')) {
                const description = document.getElementById(button.getAttribute('aria-controls'));
                const key = button.closest('[data-advisory-key]').dataset.advisoryKey;
                const expanded = button.getAttribute('aria-expanded') !== 'true';
                description.classList.toggle('is-collapsed', !expanded);
                button.setAttribute('aria-expanded', String(expanded));
                button.textContent = expanded ? 'less' : 'more';
                button.setAttribute('aria-label', `${expanded ? 'Show less' : 'Show more'} about ${button.closest('.event-card').querySelector('.event-title').textContent}`);
                if (expanded) this.expandedDescriptions.add(key);
                else this.expandedDescriptions.delete(key);
            } else if (button.hasAttribute('data-show-advisories')) {
                const tabName = button.dataset.showAdvisories;
                const expanded = button.getAttribute('aria-expanded') !== 'true';
                const rest = document.getElementById(button.getAttribute('aria-controls'));
                rest.hidden = !expanded;
                button.setAttribute('aria-expanded', String(expanded));
                button.textContent = expanded ? 'Show fewer advisories' : 'Show all advisories';
                button.nextElementSibling.hidden = expanded;
                if (expanded) this.expandedLists.add(tabName);
                else this.expandedLists.delete(tabName);
                this.updateDescriptionToggles();
            }
        });
        window.addEventListener('resize', () => {
            cancelAnimationFrame(this.descriptionFrame);
            this.descriptionFrame = requestAnimationFrame(() => this.updateDescriptionToggles());
        });
        document.fonts?.ready.then(() => this.updateDescriptionToggles());
    }

    updateDescriptionToggles() {
        const container = document.getElementById(`${this.currentTab}-events`);
        if (!container) return;
        container.querySelectorAll('[data-advisory-more]').forEach(button => {
            const description = document.getElementById(button.getAttribute('aria-controls'));
            if (!description?.getClientRects().length) return;
            const expanded = button.getAttribute('aria-expanded') === 'true';
            description.classList.add('is-collapsed');
            const overflows = description.scrollHeight > description.clientHeight + 1;
            description.classList.toggle('is-collapsed', !expanded);
            button.hidden = !expanded && !overflows;
        });
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
        this.eventsFeedStatus ??= {};
        const tabs = ['active', 'upcoming', 'all'];
        const responses = await Promise.allSettled(tabs.map(async tab => {
            const response = await fetch(`/api/traffic-events${tab === 'all' ? '' : `/${tab}`}`);
            if (!response.ok) throw new Error(`Traffic events HTTP ${response.status}`);
            const data = await response.json();
            if (!data.success || !Array.isArray(data.events)) throw new Error('Invalid traffic events response');
            return data;
        }));
        responses.forEach((result, index) => {
            const tab = tabs[index];
            this.eventsStatus[tab] = result.status === 'fulfilled' ? 'ready' : 'error';
            if (result.status === 'fulfilled') {
                this.eventsData[tab] = result.value.events;
                this.eventsFeedStatus[tab] = result.value;
            }
            else console.error(`Error loading ${tab} traffic events:`, result.reason);
        });
        this.displayEvents(this.currentTab);
    }

    displayEvents(tabName) {
        const container = document.getElementById(`${tabName}-events`);
        const events = selectAdvisories(this.eventsData[tabName], tabName);

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
            else if (trafficFeedNotice(this.alertsFeedStatus, 'UDOT alerts', alerts.length > 0)) alertsHtml += trafficFeedNotice(this.alertsFeedStatus, 'UDOT alerts', alerts.length > 0);
            else if (!alerts.length) alertsHtml = '<p class="advisories-status">No UDOT alerts for the Basin right now.</p>';
        }

        // Travel advisories: the three highest-priority first, the rest behind "Show all" (#334).
        let statusHtml = trafficFeedNotice(this.eventsFeedStatus?.[tabName], 'Traffic events', events.length > 0);
        if (this.eventsStatus[tabName] === 'loading') statusHtml = '<p class="advisories-status">Loading travel advisories…</p>';
        else if (this.eventsStatus[tabName] === 'error') statusHtml = '<p class="advisories-status" role="status">Travel advisories could not be updated. Please try again later.</p>';
        else if (!events.length && !statusHtml) statusHtml = `<p class="advisories-status no-events">${tabName === 'all' ? 'No current or upcoming advisories.' : `No ${tabName} advisories.`}</p>`;

        const cards = events.map((event, index) => this.createEventCard(event, `${tabName}-${index}`));
        const expanded = this.expandedLists.has(tabName);
        const restId = `${tabName}-remaining-advisories`;
        container.innerHTML = `<div class="events-list advisories-list">
            ${alertsHtml}
            ${cards.slice(0, 3).join('')}
            ${cards.length > 3 ? `
                <div class="advisory-list-toggle">
                    <button type="button" class="advisory-link" data-show-advisories="${tabName}"
                            aria-expanded="${expanded}" aria-controls="${restId}">${expanded ? 'Show fewer advisories' : 'Show all advisories'}</button>
                    <span ${expanded ? 'hidden' : ''}>${cards.length - 3} more ${tabName === 'all' ? '' : `${tabName} `}advisories</span>
                </div>
                <div class="advisory-rest" id="${restId}" ${expanded ? '' : 'hidden'}>${cards.slice(3).join('')}</div>
            ` : ''}
            ${statusHtml}
        </div>`;
        requestAnimationFrame(() => this.updateDescriptionToggles());
    }

    createEventCard(event, id = 'advisory') {
        const key = advisoryKey(event);
        const expanded = this.expandedDescriptions.has(key);
        const severity = String(event.severity || '').trim();
        const type = String(event.eventType || '').replace(/([a-z])([A-Z])/g, '$1 $2').trim();
        const info = formatAdvisoryInfo(event);
        const descriptionId = `${id}-description`;
        return `<article class="event-card" data-advisory-key="${escapeHtml(key)}">
            <h3 class="event-title">${escapeHtml(advisoryTitle(event))}</h3>
            <p class="advisory-dates">${formatAdvisoryDates(event.startDate, event.plannedEndDate)}</p>
            <p class="data-source">${escapeHtml(formatUDOTReportAge(event))}</p>
            <div class="event-details">
                ${event.isFullClosure ? '<span><strong>Full closure</strong></span>' : ''}
                ${type && !/^unknown$/i.test(type) ? `<span><strong>Type:</strong> ${escapeHtml(type)}</span>` : ''}
                ${severity && !/^unknown$/i.test(severity) ? `<span><strong>Severity:</strong> ${escapeHtml(severity)}</span>` : ''}
            </div>
            <div class="event-description">
                <p class="advisory-description ${expanded ? '' : 'is-collapsed'}" id="${descriptionId}">${escapeHtml(event.description || 'No description available.')}</p>
                <button type="button" class="advisory-link" data-advisory-more aria-expanded="${expanded}"
                        aria-controls="${descriptionId}" aria-label="${expanded ? 'Show less' : 'Show more'} about ${escapeHtml(advisoryTitle(event))}" hidden>${expanded ? 'less' : 'more'}</button>
            </div>
            ${info ? `<div class="event-comment"><h4>Additional info</h4><ul>${info}</ul></div>` : ''}
        </article>`;
    }

    async loadAlerts() {
        try {
            const alertsResponse = await fetch('/api/alerts');

            if (!alertsResponse.ok) {
                throw new Error(`Alerts HTTP ${alertsResponse.status}`);
            }

            const alertsData = await alertsResponse.json();

            if (alertsData.success && Array.isArray(alertsData.alerts)) {
                this.alertsFeedStatus = alertsData;
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
            <p class="data-source">${escapeHtml(formatUDOTReportAge(alert))}</p>
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
