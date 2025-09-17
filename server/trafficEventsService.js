import fetch from 'node-fetch';
import NodeCache from 'node-cache';
import fs from 'fs/promises';
import path from 'path';

// Aggressive caching: 2 hours for API data
const cache = new NodeCache({ stdTTL: 7200 }); // 2 hours instead of 5 minutes

// File-based persistent cache for backup
const CACHE_DIR = path.join(process.cwd(), '.cache');
const ensureCacheDir = async () => {
    try {
        await fs.mkdir(CACHE_DIR, { recursive: true });
    } catch (err) {
        // Directory might already exist
    }
};

class TrafficEventsService {
    constructor() {
        this.udotApiKey = process.env.UDOT_API_KEY || '';
        this.uintahBasinBounds = {
            north: 40.8,    // Northern boundary (above Vernal)
            south: 40.0,    // Southern boundary (below Duchesne) - more restrictive
            east: -108.8,   // Eastern boundary (Colorado border)
            west: -110.5    // Western boundary (tighter to exclude Carbon County)
        };
        this.uintahBasinCounties = ['duchesne', 'uintah'];

        // Rate limiting - track last API call times
        this.lastApiCalls = new Map();
        this.minCallInterval = 60000; // Minimum 1 minute between API calls of same type
    }

    async fetchUDOTAlerts() {
        const cacheKey = 'udot_alerts';

        // Check memory cache first
        const cached = cache.get(cacheKey);
        if (cached) return cached;

        // Check persistent file cache
        const diskCached = await this.loadFromDiskCache(cacheKey, 2 * 60 * 60 * 1000); // 2 hours
        if (diskCached) {
            cache.set(cacheKey, diskCached); // Restore to memory
            return diskCached;
        }

        // Rate limiting check
        const apiCallKey = 'alerts';
        const lastCall = this.lastApiCalls.get(apiCallKey);
        if (lastCall && (Date.now() - lastCall) < this.minCallInterval) {
            console.log('Rate limiting: Skipping UDOT alerts API call (too recent)');
            return this.loadFromDiskCache(cacheKey, 24 * 60 * 60 * 1000) || []; // Fallback to 24h old cache
        }

        try {
            console.log('Making UDOT alerts API call...');
            this.lastApiCalls.set(apiCallKey, Date.now());

            const url = `https://www.udottraffic.utah.gov/api/v2/get/alerts?key=${this.udotApiKey}&format=json`;
            const response = await fetch(url, {
                headers: {
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`UDOT Alerts API error: ${response.status}`);
            }

            const data = await response.json();
            
            // Process alerts
            const processedAlerts = data.map(alert => ({
                id: alert.Id,
                message: alert.Message,
                notes: alert.Notes,
                startTime: new Date(alert.StartTime * 1000).toISOString(),
                endTime: alert.EndTime ? new Date(alert.EndTime * 1000).toISOString() : null,
                regions: alert.Regions || [],
                highImportance: alert.HighImportance,
                sendNotification: alert.SendNotification,
                isActive: this.isAlertActive(alert),
                severity: this.getAlertSeverity(alert)
            }));

            // Filter for active alerts relevant to Uintah Basin
            const relevantAlerts = processedAlerts.filter(alert =>
                alert.isActive && this.isAlertRelevantToBasin(alert)
            );

            // Save to both memory and disk cache
            cache.set(cacheKey, relevantAlerts);
            await this.saveToDiskCache(cacheKey, relevantAlerts);
            return relevantAlerts;
        } catch (error) {
            console.error('Error fetching UDOT alerts:', error);
            return [];
        }
    }

    isAlertRelevantToBasin(alert) {
        // Check if alert regions contain Uintah Basin counties or cities
        const regions = alert.regions || [];
        const message = (alert.message || '').toLowerCase();
        const notes = (alert.notes || '').toLowerCase();
        
        // Uintah Basin regions and cities to check for
        const basinKeywords = [
            'duchesne', 'uintah', 'vernal', 'roosevelt', 'ballard', 
            'manila', 'altamont', 'us-40', 'us-191', 'sr-87', 'sr-121',
            'uintah basin', 'duchesne county', 'uintah county'
        ];

        // Check regions array
        const hasBasinRegion = regions.some(region => 
            basinKeywords.some(keyword => 
                region.toLowerCase().includes(keyword)
            )
        );

        // Check message and notes content
        const mentionsBasin = basinKeywords.some(keyword => 
            message.includes(keyword) || notes.includes(keyword)
        );

        // Also check for major highways that pass through the basin
        const basinHighways = ['us-40', 'us-191', 'highway 40', 'highway 191', 'route 40', 'route 191'];
        const mentionsBasinHighway = basinHighways.some(highway => 
            message.includes(highway) || notes.includes(highway)
        );

        return hasBasinRegion || mentionsBasin || mentionsBasinHighway;
    }

    isAlertActive(alert) {
        const now = Date.now() / 1000; // Convert to Unix timestamp
        const startTime = alert.StartTime;
        const endTime = alert.EndTime;
        
        if (startTime && startTime > now) return false; // Not started yet
        if (endTime && endTime < now) return false; // Already ended
        
        return true;
    }

    getAlertSeverity(alert) {
        if (alert.HighImportance) return 'high';
        if (alert.SendNotification) return 'medium';
        return 'low';
    }

    async fetchUDOTTrafficEvents() {
        const cacheKey = 'udot_traffic_events';

        // Check memory cache first
        const cached = cache.get(cacheKey);
        if (cached) return cached;

        // Check persistent file cache
        const diskCached = await this.loadFromDiskCache(cacheKey, 2 * 60 * 60 * 1000); // 2 hours
        if (diskCached) {
            cache.set(cacheKey, diskCached); // Restore to memory
            return diskCached;
        }

        // Rate limiting check
        const apiCallKey = 'events';
        const lastCall = this.lastApiCalls.get(apiCallKey);
        if (lastCall && (Date.now() - lastCall) < this.minCallInterval) {
            console.log('Rate limiting: Skipping UDOT events API call (too recent)');
            return this.loadFromDiskCache(cacheKey, 24 * 60 * 60 * 1000) || []; // Fallback to 24h old cache
        }

        try {
            console.log('Making UDOT events API call...');
            this.lastApiCalls.set(apiCallKey, Date.now());

            const url = `https://www.udottraffic.utah.gov/api/v2/get/event?key=${this.udotApiKey}&format=json`;
            const response = await fetch(url, {
                headers: {
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`UDOT Events API error: ${response.status}`);
            }

            const data = await response.json();
            
            // Filter events for Uintah Basin region
            const basinEvents = data.filter(event => this.isInUintahBasin(event));

            const processedEvents = basinEvents.map(event => ({
                id: event.ID,
                sourceId: event.SourceId,
                organization: event.Organization,
                roadwayName: event.RoadwayName,
                directionOfTravel: event.DirectionOfTravel,
                description: event.Description,
                reported: new Date(event.Reported * 1000).toISOString(),
                lastUpdated: new Date(event.LastUpdated * 1000).toISOString(),
                startDate: new Date(event.StartDate * 1000).toISOString(),
                plannedEndDate: event.PlannedEndDate ? new Date(event.PlannedEndDate * 1000).toISOString() : null,
                lanesAffected: event.LanesAffected,
                latitude: event.Latitude,
                longitude: event.Longitude,
                latitudeSecondary: event.LatitudeSecondary,
                longitudeSecondary: event.LongitudeSecondary,
                eventType: event.EventType,
                eventSubType: event.EventSubType,
                isFullClosure: event.IsFullClosure,
                severity: event.Severity,
                comment: event.Comment,
                encodedPolyline: event.EncodedPolyline,
                detourPolyline: event.DetourPolyline,
                detourInstructions: event.DetourInstructions,
                recurrence: event.Recurrence,
                recurrenceSchedules: event.RecurrenceSchedules,
                name: event.Name,
                eventCategory: event.EventCategory,
                location: event.Location,
                county: event.County,
                mpStart: event.MPStart,
                mpEnd: event.MPEnd,
                priority: this.calculateEventPriority(event),
                displayIcon: this.getEventIcon(event),
                displayColor: this.getEventColor(event)
            }));

            // Sort by priority (highest first) then by start date (newest first)
            const sortedEvents = processedEvents.sort((a, b) => {
                if (a.priority !== b.priority) {
                    return b.priority - a.priority;
                }
                return new Date(b.startDate) - new Date(a.startDate);
            });

            // Save to both memory and disk cache
            cache.set(cacheKey, sortedEvents);
            await this.saveToDiskCache(cacheKey, sortedEvents);
            return sortedEvents;
        } catch (error) {
            console.error('Error fetching UDOT traffic events:', error);
            return [];
        }
    }

    isInUintahBasin(event) {
        const lat = parseFloat(event.Latitude);
        const lng = parseFloat(event.Longitude);
        
        // Primary check: Geographic bounds
        const inGeographicBounds = lat >= this.uintahBasinBounds.south && 
                                 lat <= this.uintahBasinBounds.north &&
                                 lng >= this.uintahBasinBounds.west && 
                                 lng <= this.uintahBasinBounds.east;

        // Secondary check: County name (if provided)
        const county = (event.County || '').toLowerCase();
        const inTargetCounty = this.uintahBasinCounties.some(targetCounty => 
            county.includes(targetCounty)
        );

        // Tertiary check: Road name or location mentions basin cities
        const roadway = (event.RoadwayName || '').toLowerCase();
        const location = (event.Location || '').toLowerCase();
        const description = (event.Description || '').toLowerCase();
        
        const basinCities = ['vernal', 'roosevelt', 'duchesne', 'ballard', 'manila', 'altamont'];
        const mentionsBasinCity = basinCities.some(city => 
            roadway.includes(city) || location.includes(city) || description.includes(city)
        );

        // Return true if any of the checks pass
        return inGeographicBounds || inTargetCounty || mentionsBasinCity;
    }

    calculateEventPriority(event) {
        let priority = 0;

        // High priority for full closures
        if (event.IsFullClosure) priority += 10;

        // High priority for current/active events
        const now = new Date();
        const startDate = new Date(event.StartDate * 1000);
        const endDate = event.PlannedEndDate ? new Date(event.PlannedEndDate * 1000) : null;
        
        if (startDate <= now && (!endDate || endDate >= now)) {
            priority += 8; // Currently active
        } else if (startDate > now) {
            const daysUntilStart = (startDate - now) / (1000 * 60 * 60 * 24);
            if (daysUntilStart <= 7) priority += 6; // Starting within a week
            else if (daysUntilStart <= 30) priority += 3; // Starting within a month
        }

        // Event type priorities
        const eventType = (event.EventType || '').toLowerCase();
        if (eventType === 'accidentsandincidents') priority += 9;
        else if (eventType === 'closures') priority += 8;
        else if (eventType === 'roadwork') priority += 5;

        // Severity priorities
        const severity = (event.Severity || '').toLowerCase();
        if (severity.includes('major') || severity.includes('high')) priority += 5;
        else if (severity.includes('moderate') || severity.includes('medium')) priority += 3;
        else if (severity.includes('minor') || severity.includes('low')) priority += 1;

        // Major highway bonus
        const roadway = (event.RoadwayName || '').toLowerCase();
        if (roadway.includes('us-40') || roadway.includes('us-191') || 
            roadway.includes('i-80') || roadway.includes('interstate')) {
            priority += 4;
        }

        return Math.max(0, priority);
    }

    getEventIcon(event) {
        const eventType = (event.EventType || '').toLowerCase();
        const eventCategory = (event.EventCategory || '').toLowerCase();

        if (eventType === 'accidentsandincidents') return '🚨';
        if (eventType === 'closures' || event.IsFullClosure) return '🚫';
        if (eventType === 'roadwork' || eventCategory.includes('construction')) return '🚧';
        if (eventCategory.includes('weather')) return '🌨️';
        if (eventCategory.includes('maintenance')) return '🔧';
        
        return '⚠️'; // Default warning icon
    }

    getEventColor(event) {
        if (event.IsFullClosure) return '#dc2626'; // Red for closures
        
        const eventType = (event.EventType || '').toLowerCase();
        const severity = (event.Severity || '').toLowerCase();
        
        if (eventType === 'accidentsandincidents') return '#dc2626'; // Red for accidents
        if (severity.includes('major') || severity.includes('high')) return '#dc2626'; // Red for major
        if (eventType === 'closures') return '#dc2626'; // Red for closures
        if (severity.includes('moderate') || severity.includes('medium')) return '#f59e0b'; // Yellow for moderate
        if (eventType === 'roadwork') return '#f59e0b'; // Yellow for roadwork
        
        return '#10b981'; // Green for minor/info
    }

    async getActiveEvents() {
        try {
            const allEvents = await this.fetchUDOTTrafficEvents();
            
            // Filter for currently active events
            const now = new Date();
            const activeEvents = allEvents.filter(event => {
                const startDate = new Date(event.startDate);
                const endDate = event.plannedEndDate ? new Date(event.plannedEndDate) : null;
                
                return startDate <= now && (!endDate || endDate >= now);
            });

            return activeEvents;
        } catch (error) {
            console.error('Error getting active events:', error);
            return [];
        }
    }

    async getUpcomingEvents(days = 7) {
        try {
            const allEvents = await this.fetchUDOTTrafficEvents();
            
            // Filter for events starting within specified days
            const now = new Date();
            const futureDate = new Date(now.getTime() + (days * 24 * 60 * 60 * 1000));
            
            const upcomingEvents = allEvents.filter(event => {
                const startDate = new Date(event.startDate);
                return startDate > now && startDate <= futureDate;
            });

            return upcomingEvents;
        } catch (error) {
            console.error('Error getting upcoming events:', error);
            return [];
        }
    }

    async getEventsByType(eventType) {
        try {
            const allEvents = await this.fetchUDOTTrafficEvents();
            
            const filteredEvents = allEvents.filter(event => 
                event.eventType.toLowerCase() === eventType.toLowerCase()
            );

            return filteredEvents;
        } catch (error) {
            console.error('Error getting events by type:', error);
            return [];
        }
    }

    async getAllTrafficData() {
        try {
            const [allEvents, alerts] = await Promise.all([
                this.fetchUDOTTrafficEvents(),
                this.fetchUDOTAlerts()
            ]);

            const activeEvents = await this.getActiveEvents();
            const upcomingEvents = await this.getUpcomingEvents();

            return {
                allEvents,
                activeEvents,
                upcomingEvents,
                alerts,
                totalEvents: allEvents.length,
                activeCount: activeEvents.length,
                upcomingCount: upcomingEvents.length,
                alertsCount: alerts.length,
                eventTypes: this.getEventTypeSummary(allEvents),
                lastUpdated: new Date().toISOString()
            };
        } catch (error) {
            console.error('Error getting complete traffic data:', error);
            throw error;
        }
    }

    getEventTypeSummary(events) {
        const summary = {
            accidentsAndIncidents: 0,
            roadwork: 0,
            closures: 0,
            other: 0
        };

        events.forEach(event => {
            const type = event.eventType.toLowerCase();
            if (type === 'accidentsandincidents') {
                summary.accidentsAndIncidents++;
            } else if (type === 'roadwork') {
                summary.roadwork++;
            } else if (type === 'closures') {
                summary.closures++;
            } else {
                summary.other++;
            }
        });

        return summary;
    }

    // Disk cache helper methods
    async saveToDiskCache(key, data) {
        try {
            await ensureCacheDir();
            const filePath = path.join(CACHE_DIR, `${key}.json`);
            const cacheData = {
                timestamp: Date.now(),
                data: data
            };
            await fs.writeFile(filePath, JSON.stringify(cacheData), 'utf8');
        } catch (error) {
            console.warn('Failed to save to disk cache:', error.message);
        }
    }

    async loadFromDiskCache(key, maxAge) {
        try {
            const filePath = path.join(CACHE_DIR, `${key}.json`);
            const fileContent = await fs.readFile(filePath, 'utf8');
            const cacheData = JSON.parse(fileContent);

            const now = Date.now();
            const age = now - cacheData.timestamp;

            if (age < maxAge) {
                console.log(`Loading ${key} from disk cache (age: ${Math.round(age / 1000 / 60)} minutes)`);
                return cacheData.data;
            } else {
                console.log(`Disk cache for ${key} expired (age: ${Math.round(age / 1000 / 60)} minutes)`);
                // Clean up expired cache file
                await fs.unlink(filePath).catch(() => {});
                return null;
            }
        } catch (error) {
            // File doesn't exist or is corrupted - not a problem
            return null;
        }
    }
}

export default TrafficEventsService;