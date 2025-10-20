import fetch from 'node-fetch';
import NodeCache from 'node-cache';

/**
 * Azure Maps Service
 * Comprehensive integration with all Azure Maps REST APIs
 *
 * Features:
 * - Weather: Current conditions, forecasts, radar, severe alerts
 * - Traffic: Incidents, flow, congestion
 * - Routing: Directions, matrix, reachable range (isochrone)
 * - Search: Address, POI, reverse geocoding
 * - Geofencing: Spatial operations
 * - Elevation: Terrain data
 * - Timezone: Location-based timezone info
 */

const cache = new NodeCache({ stdTTL: 300 }); // 5 minutes default

class AzureMapsService {
    constructor() {
        this.subscriptionKey = process.env.AZURE_MAPS_KEY || '';
        this.baseUrl = 'https://atlas.microsoft.com';

        // API versions
        this.apiVersions = {
            weather: '1.1',
            traffic: '1.0',
            route: '1.0',
            search: '1.0',
            spatial: '2.0',
            elevation: '1.0',
            timezone: '1.0'
        };
    }

    /**
     * WEATHER SERVICES
     */

    /**
     * Get current weather conditions for a location
     */
    async getCurrentWeather(lat, lon) {
        const cacheKey = `weather_current_${lat}_${lon}`;
        const cached = cache.get(cacheKey);
        if (cached) return cached;

        try {
            const url = `${this.baseUrl}/weather/currentConditions/json`;
            const params = new URLSearchParams({
                'api-version': this.apiVersions.weather,
                'subscription-key': this.subscriptionKey,
                'query': `${lat},${lon}`,
                'unit': 'imperial',
                'details': 'true'
            });

            const response = await fetch(`${url}?${params}`);
            if (!response.ok) throw new Error(`Azure Maps Weather API error: ${response.status}`);

            const data = await response.json();

            const formatted = {
                temperature: data.results[0]?.temperature?.value,
                temperatureUnit: 'F',
                realFeel: data.results[0]?.realFeelTemperature?.value,
                condition: data.results[0]?.phrase,
                iconCode: data.results[0]?.iconCode,
                hasPrecipitation: data.results[0]?.hasPrecipitation,
                precipitationType: data.results[0]?.precipitationType,
                windSpeed: data.results[0]?.wind?.speed?.value,
                windDirection: data.results[0]?.wind?.direction?.degrees,
                visibility: data.results[0]?.visibility?.value,
                cloudCover: data.results[0]?.cloudCover,
                relativeHumidity: data.results[0]?.relativeHumidity,
                dewPoint: data.results[0]?.dewPoint?.value,
                uvIndex: data.results[0]?.uvIndex,
                uvIndexPhrase: data.results[0]?.uvIndexPhrase,
                timestamp: data.results[0]?.dateTime
            };

            cache.set(cacheKey, formatted);
            return formatted;
        } catch (error) {
            console.error('Error fetching current weather:', error);
            throw error;
        }
    }

    /**
     * Get hourly weather forecast
     */
    async getHourlyForecast(lat, lon, duration = 12) {
        const cacheKey = `weather_hourly_${lat}_${lon}_${duration}`;
        const cached = cache.get(cacheKey);
        if (cached) return cached;

        try {
            const url = `${this.baseUrl}/weather/forecast/hourly/json`;
            const params = new URLSearchParams({
                'api-version': this.apiVersions.weather,
                'subscription-key': this.subscriptionKey,
                'query': `${lat},${lon}`,
                'duration': duration.toString(),
                'unit': 'imperial'
            });

            const response = await fetch(`${url}?${params}`);
            if (!response.ok) throw new Error(`Azure Maps Weather API error: ${response.status}`);

            const data = await response.json();

            const forecasts = data.forecasts.map(f => ({
                dateTime: f.date,
                temperature: f.temperature?.value,
                realFeel: f.realFeelTemperature?.value,
                condition: f.iconPhrase,
                iconCode: f.iconCode,
                hasPrecipitation: f.hasPrecipitation,
                precipitationProbability: f.precipitationProbability,
                precipitationType: f.precipitationType,
                precipitationIntensity: f.precipitationIntensity,
                windSpeed: f.wind?.speed?.value,
                windDirection: f.wind?.direction?.degrees,
                cloudCover: f.cloudCover
            }));

            cache.set(cacheKey, forecasts);
            return forecasts;
        } catch (error) {
            console.error('Error fetching hourly forecast:', error);
            throw error;
        }
    }

    /**
     * Get daily weather forecast
     */
    async getDailyForecast(lat, lon, duration = 5) {
        const cacheKey = `weather_daily_${lat}_${lon}_${duration}`;
        const cached = cache.get(cacheKey);
        if (cached) return cached;

        try {
            const url = `${this.baseUrl}/weather/forecast/daily/json`;
            const params = new URLSearchParams({
                'api-version': this.apiVersions.weather,
                'subscription-key': this.subscriptionKey,
                'query': `${lat},${lon}`,
                'duration': duration.toString(),
                'unit': 'imperial'
            });

            const response = await fetch(`${url}?${params}`);
            if (!response.ok) throw new Error(`Azure Maps Weather API error: ${response.status}`);

            const data = await response.json();

            const forecasts = data.forecasts.map(f => ({
                date: f.date,
                temperatureMax: f.temperature?.maximum?.value,
                temperatureMin: f.temperature?.minimum?.value,
                realFeelMax: f.realFeelTemperature?.maximum?.value,
                realFeelMin: f.realFeelTemperature?.minimum?.value,
                dayCondition: f.day?.iconPhrase,
                dayIconCode: f.day?.iconCode,
                dayPrecipitationProbability: f.day?.precipitationProbability,
                nightCondition: f.night?.iconPhrase,
                nightIconCode: f.night?.iconCode,
                hoursOfSun: f.hoursOfSun,
                degreeDayCooling: f.degreeDaySummary?.cooling?.value,
                degreeDayHeating: f.degreeDaySummary?.heating?.value
            }));

            cache.set(cacheKey, forecasts);
            return forecasts;
        } catch (error) {
            console.error('Error fetching daily forecast:', error);
            throw error;
        }
    }

    /**
     * Get severe weather alerts
     */
    async getSevereWeatherAlerts(lat, lon) {
        const cacheKey = `weather_alerts_${lat}_${lon}`;
        const cached = cache.get(cacheKey);
        if (cached) return cached;

        try {
            const url = `${this.baseUrl}/weather/severe/alerts/json`;
            const params = new URLSearchParams({
                'api-version': this.apiVersions.weather,
                'subscription-key': this.subscriptionKey,
                'query': `${lat},${lon}`
            });

            const response = await fetch(`${url}?${params}`);
            if (!response.ok) throw new Error(`Azure Maps Weather API error: ${response.status}`);

            const data = await response.json();

            const alerts = (data.results || []).map(alert => ({
                alertId: alert.alertId,
                description: alert.description?.localized,
                category: alert.category,
                severity: alert.severity,
                urgency: alert.urgency,
                certainty: alert.certainty,
                source: alert.source,
                sourceId: alert.sourceId,
                alertAreas: alert.alertAreas,
                startTime: alert.startTime,
                endTime: alert.endTime
            }));

            cache.set(cacheKey, alerts, 600); // Cache for 10 minutes
            return alerts;
        } catch (error) {
            console.error('Error fetching severe weather alerts:', error);
            return []; // Return empty array instead of throwing
        }
    }

    /**
     * TRAFFIC SERVICES
     */

    /**
     * Get traffic incident details
     */
    async getTrafficIncidents(boundingBox) {
        const cacheKey = `traffic_incidents_${boundingBox.join('_')}`;
        const cached = cache.get(cacheKey);
        if (cached) return cached;

        try {
            const url = `${this.baseUrl}/traffic/incident/detail/json`;
            const params = new URLSearchParams({
                'api-version': this.apiVersions.traffic,
                'subscription-key': this.subscriptionKey,
                'bbox': boundingBox.join(','),
                'trafficmodelid': '-1' // Get real-time incidents
            });

            const response = await fetch(`${url}?${params}`);
            if (!response.ok) throw new Error(`Azure Maps Traffic API error: ${response.status}`);

            const data = await response.json();

            const incidents = (data.incidents || []).map(incident => ({
                id: incident.id,
                type: incident.properties?.iconCategory,
                magnitude: incident.properties?.magnitudeOfDelay,
                description: incident.properties?.description,
                roadway: incident.properties?.roadNumber,
                from: incident.properties?.from,
                to: incident.properties?.to,
                delay: incident.properties?.delay,
                length: incident.properties?.length,
                geometry: incident.geometry,
                startTime: incident.properties?.startTime,
                endTime: incident.properties?.endTime
            }));

            cache.set(cacheKey, incidents);
            return incidents;
        } catch (error) {
            console.error('Error fetching traffic incidents:', error);
            throw error;
        }
    }

    /**
     * ROUTING SERVICES
     */

    /**
     * Calculate route between two points
     */
    async calculateRoute(waypoints, options = {}) {
        try {
            const url = `${this.baseUrl}/route/directions/json`;
            const params = new URLSearchParams({
                'api-version': this.apiVersions.route,
                'subscription-key': this.subscriptionKey,
                'query': waypoints.map(w => `${w.lat},${w.lon}`).join(':'),
                'traffic': options.considerTraffic !== false ? 'true' : 'false',
                'travelMode': options.travelMode || 'car',
                'routeType': options.routeType || 'fastest',
                'computeBestOrder': options.optimizeOrder ? 'true' : 'false',
                'instructionsType': 'text'
            });

            if (options.avoid) {
                params.append('avoid', options.avoid.join(','));
            }

            const response = await fetch(`${url}?${params}`);
            if (!response.ok) throw new Error(`Azure Maps Route API error: ${response.status}`);

            const data = await response.json();

            const route = data.routes[0];
            return {
                summary: {
                    lengthInMeters: route.summary.lengthInMeters,
                    lengthInMiles: route.summary.lengthInMeters * 0.000621371,
                    travelTimeInSeconds: route.summary.travelTimeInSeconds,
                    trafficDelayInSeconds: route.summary.trafficDelayInSeconds,
                    departureTime: route.summary.departureTime,
                    arrivalTime: route.summary.arrivalTime
                },
                legs: route.legs.map(leg => ({
                    summary: leg.summary,
                    points: leg.points
                })),
                guidance: route.guidance,
                encodedPolyline: route.legs[0]?.points
            };
        } catch (error) {
            console.error('Error calculating route:', error);
            throw error;
        }
    }

    /**
     * Calculate reachable range (isochrone)
     */
    async getReachableRange(lat, lon, timeBudgetInSec, options = {}) {
        try {
            const url = `${this.baseUrl}/route/range/json`;
            const params = new URLSearchParams({
                'api-version': this.apiVersions.route,
                'subscription-key': this.subscriptionKey,
                'query': `${lat},${lon}`,
                'timeBudgetInSec': timeBudgetInSec.toString(),
                'traffic': options.considerTraffic !== false ? 'true' : 'false',
                'travelMode': options.travelMode || 'car'
            });

            if (options.routeType) {
                params.append('routeType', options.routeType);
            }

            const response = await fetch(`${url}?${params}`);
            if (!response.ok) throw new Error(`Azure Maps Route Range API error: ${response.status}`);

            const data = await response.json();

            return {
                center: data.reachableRange.center,
                boundary: data.reachableRange.boundary
            };
        } catch (error) {
            console.error('Error getting reachable range:', error);
            throw error;
        }
    }

    /**
     * SEARCH SERVICES
     */

    /**
     * Search for points of interest
     */
    async searchPOI(query, lat, lon, radius = 10000, options = {}) {
        try {
            const url = `${this.baseUrl}/search/poi/json`;
            const params = new URLSearchParams({
                'api-version': this.apiVersions.search,
                'subscription-key': this.subscriptionKey,
                'query': query,
                'lat': lat.toString(),
                'lon': lon.toString(),
                'radius': radius.toString(),
                'limit': (options.limit || 20).toString()
            });

            if (options.categorySet) {
                params.append('categorySet', options.categorySet);
            }

            const response = await fetch(`${url}?${params}`);
            if (!response.ok) throw new Error(`Azure Maps Search API error: ${response.status}`);

            const data = await response.json();

            return data.results.map(result => ({
                type: result.type,
                id: result.id,
                name: result.poi?.name || result.address?.freeformAddress,
                category: result.poi?.categories?.[0],
                phone: result.poi?.phone,
                address: result.address?.freeformAddress,
                position: result.position,
                distance: result.dist,
                entryPoints: result.entryPoints
            }));
        } catch (error) {
            console.error('Error searching POI:', error);
            throw error;
        }
    }

    /**
     * Reverse geocoding (get address from coordinates)
     */
    async reverseGeocode(lat, lon) {
        const cacheKey = `reverse_geocode_${lat}_${lon}`;
        const cached = cache.get(cacheKey);
        if (cached) return cached;

        try {
            const url = `${this.baseUrl}/search/address/reverse/json`;
            const params = new URLSearchParams({
                'api-version': this.apiVersions.search,
                'subscription-key': this.subscriptionKey,
                'query': `${lat},${lon}`
            });

            const response = await fetch(`${url}?${params}`);
            if (!response.ok) throw new Error(`Azure Maps Search API error: ${response.status}`);

            const data = await response.json();

            const result = data.addresses[0];
            const address = {
                formattedAddress: result.address.freeformAddress,
                streetNumber: result.address.streetNumber,
                streetName: result.address.streetName,
                municipality: result.address.municipality,
                countrySubdivision: result.address.countrySubdivision,
                postalCode: result.address.postalCode,
                country: result.address.country
            };

            cache.set(cacheKey, address, 3600); // Cache for 1 hour
            return address;
        } catch (error) {
            console.error('Error reverse geocoding:', error);
            throw error;
        }
    }

    /**
     * ELEVATION SERVICES
     */

    /**
     * Get elevation data for coordinates
     */
    async getElevation(coordinates) {
        try {
            const url = `${this.baseUrl}/elevation/point/json`;
            const params = new URLSearchParams({
                'api-version': this.apiVersions.elevation,
                'subscription-key': this.subscriptionKey,
                'points': coordinates.map(c => `${c.lat},${c.lon}`).join('|')
            });

            const response = await fetch(`${url}?${params}`);
            if (!response.ok) throw new Error(`Azure Maps Elevation API error: ${response.status}`);

            const data = await response.json();

            return data.data.map((point, index) => ({
                lat: coordinates[index].lat,
                lon: coordinates[index].lon,
                elevationInMeters: point.elevationInMeter,
                elevationInFeet: point.elevationInMeter * 3.28084
            }));
        } catch (error) {
            console.error('Error fetching elevation:', error);
            throw error;
        }
    }

    /**
     * TIMEZONE SERVICES
     */

    /**
     * Get timezone for coordinates
     */
    async getTimezone(lat, lon) {
        const cacheKey = `timezone_${lat}_${lon}`;
        const cached = cache.get(cacheKey);
        if (cached) return cached;

        try {
            const url = `${this.baseUrl}/timezone/byCoordinates/json`;
            const params = new URLSearchParams({
                'api-version': this.apiVersions.timezone,
                'subscription-key': this.subscriptionKey,
                'query': `${lat},${lon}`
            });

            const response = await fetch(`${url}?${params}`);
            if (!response.ok) throw new Error(`Azure Maps Timezone API error: ${response.status}`);

            const data = await response.json();

            const timezone = {
                id: data.TimeZones[0].Id,
                name: data.TimeZones[0].Names.Generic,
                abbreviation: data.TimeZones[0].Names.Standard,
                utcOffset: data.TimeZones[0].ReferenceTime.StandardOffset,
                isDaylightSaving: data.TimeZones[0].ReferenceTime.DaylightSavings !== '00:00:00'
            };

            cache.set(cacheKey, timezone, 86400); // Cache for 24 hours
            return timezone;
        } catch (error) {
            console.error('Error fetching timezone:', error);
            throw error;
        }
    }

    /**
     * GEOFENCING / SPATIAL OPERATIONS
     */

    /**
     * Check if point is within polygon
     */
    async checkPointInPolygon(lat, lon, polygon) {
        try {
            const url = `${this.baseUrl}/spatial/pointInPolygon/json`;
            const params = new URLSearchParams({
                'api-version': this.apiVersions.spatial,
                'subscription-key': this.subscriptionKey
            });

            const body = {
                type: 'Point',
                coordinates: [lon, lat],
                polygon: polygon
            };

            const response = await fetch(`${url}?${params}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            if (!response.ok) throw new Error(`Azure Maps Spatial API error: ${response.status}`);

            const data = await response.json();
            return data.result;
        } catch (error) {
            console.error('Error checking point in polygon:', error);
            throw error;
        }
    }
}

export default AzureMapsService;
