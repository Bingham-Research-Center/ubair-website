import fetch from 'node-fetch';
import NodeCache from 'node-cache';
import SnowDetectionService from './snowDetectionService.js';

const cache = new NodeCache({ stdTTL: 300 });

// Decode Google polyline encoding
function decodePolyline(encoded) {
    const points = [];
    let lat = 0, lng = 0;
    let index = 0;

    while (index < encoded.length) {
        let shift = 0, result = 0;
        let byte;
        do {
            byte = encoded.charCodeAt(index++) - 63;
            result |= (byte & 0x1f) << shift;
            shift += 5;
        } while (byte >= 0x20);
        lat += (result & 1) ? ~(result >> 1) : (result >> 1);

        shift = 0;
        result = 0;
        do {
            byte = encoded.charCodeAt(index++) - 63;
            result |= (byte & 0x1f) << shift;
            shift += 5;
        } while (byte >= 0x20);
        lng += (result & 1) ? ~(result >> 1) : (result >> 1);

        points.push([lat / 1e5, lng / 1e5]);
    }
    return points;
}

class RoadWeatherService {
    constructor() {
        this.udotApiKey = process.env.UDOT_API_KEY || '';
        this.nwsUserAgent = 'BasinWX/1.0 (basinwx.com)';
        this.snowDetectionService = new SnowDetectionService();
        this.uintahBasinBounds = {
            north: 41.0,    // Expanded north to include more mountain areas
            south: 39.5,    // Expanded south for broader coverage
            east: -108.5,   // Expanded east
            west: -111.5    // Expanded west to include Daniels Summit area and mountain passes
        };
    }

    async fetchUDOTRoadConditions() {
        const cacheKey = 'udot_road_conditions';
        const cached = cache.get(cacheKey);
        if (cached) return cached;

        try {
            const url = `https://www.udottraffic.utah.gov/api/v2/get/roadconditions?key=${this.udotApiKey}&format=json`;
            const response = await fetch(url, {
                headers: {
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`UDOT API error: ${response.status}`);
            }

            const data = await response.json();

            // Filter for Uintah Basin roads using geographic coordinates
            const basinRoads = data.filter(road => {
                if (!road.EncodedPolyline) return false;

                try {
                    const coordinates = decodePolyline(road.EncodedPolyline);

                    // Check if any part of the road passes through Uintah Basin bounds
                    const hasBasinSegment = coordinates.some(coord => {
                        const lat = coord[0];
                        const lng = coord[1];
                        return lat >= this.uintahBasinBounds.south &&
                               lat <= this.uintahBasinBounds.north &&
                               lng >= this.uintahBasinBounds.west &&
                               lng <= this.uintahBasinBounds.east;
                    });

                    return hasBasinSegment;
                } catch (error) {
                    console.warn(`Failed to decode polyline for ${road.RoadwayName}:`, error);
                    // Fallback to name-based filtering for roads we can't decode
                    const roadName = road.RoadwayName.toLowerCase();
                    return roadName.includes('vernal') || roadName.includes('roosevelt') ||
                           roadName.includes('duchesne') || roadName.includes('uintah');
                }
            });

            const processedRoads = basinRoads.map(road => {
                let coordinates = [];
                try {
                    coordinates = decodePolyline(road.EncodedPolyline);
                } catch (error) {
                    console.warn(`Failed to decode polyline for ${road.RoadwayName}:`, error);
                }

                return {
                    id: road.Id,
                    sourceId: road.SourceId,
                    name: road.RoadwayName,
                    roadCondition: road.RoadCondition,
                    weatherCondition: road.WeatherCondition,
                    restriction: road.Restriction,
                    encodedPolyline: road.EncodedPolyline,
                    coordinates: coordinates,
                    lastUpdated: new Date(road.LastUpdated * 1000).toISOString(),
                    condition: this.mapUDOTConditionToColor(road.RoadCondition, road.WeatherCondition, road.Restriction)
                };
            });

            cache.set(cacheKey, processedRoads);
            return processedRoads;
        } catch (error) {
            console.error('Error fetching UDOT road conditions:', error);
            return [];
        }
    }

    mapUDOTConditionToColor(roadCondition, weatherCondition, restriction) {
        const road = roadCondition.toLowerCase();
        const weather = weatherCondition.toLowerCase();
        const restrict = restriction.toLowerCase();

        // Red conditions - dangerous
        if (restrict.includes('closed') || restrict.includes('no travel') ||
            road.includes('icy') || road.includes('ice')) {
            return { condition: 'red', status: 'Dangerous', reason: `${roadCondition} - ${restriction}` };
        }

        // Yellow conditions - caution
        if (road.includes('wet') && weather.includes('snow') ||
            road.includes('slush') || road.includes('packed snow') ||
            weather.includes('snow') || weather.includes('storm') ||
            restrict.includes('chain') || restrict.includes('traction')) {
            return { condition: 'yellow', status: 'Use Caution', reason: `${roadCondition} - ${weatherCondition}` };
        }

        // Green conditions - good
        if (road.includes('dry') && weather.includes('fair')) {
            return { condition: 'green', status: 'Clear', reason: 'Normal conditions' };
        }

        // Default to yellow for wet conditions
        if (road.includes('wet')) {
            return { condition: 'yellow', status: 'Wet Roads', reason: 'Use caution on wet pavement' };
        }

        // Default green
        return { condition: 'green', status: 'Normal', reason: roadCondition };
    }

    async fetchNWSData(lat, lon) {
        const cacheKey = `nws_${lat}_${lon}`;
        const cached = cache.get(cacheKey);
        if (cached) return cached;

        try {
            const pointsUrl = `https://api.weather.gov/points/${lat},${lon}`;
            const pointsResponse = await fetch(pointsUrl, {
                headers: {
                    'User-Agent': this.nwsUserAgent,
                    'Accept': 'application/json'
                }
            });

            if (!pointsResponse.ok) {
                throw new Error(`NWS API error: ${pointsResponse.status}`);
            }

            const pointsData = await pointsResponse.json();
            const forecastUrl = pointsData.properties.forecast;

            const forecastResponse = await fetch(forecastUrl, {
                headers: {
                    'User-Agent': this.nwsUserAgent,
                    'Accept': 'application/json'
                }
            });

            if (!forecastResponse.ok) {
                throw new Error(`NWS Forecast error: ${forecastResponse.status}`);
            }

            const forecastData = await forecastResponse.json();
            const periods = forecastData.properties.periods;

            const processedForecast = {
                current: periods[0],
                upcoming: periods.slice(1, 5),
                warnings: []
            };

            cache.set(cacheKey, processedForecast);
            return processedForecast;
        } catch (error) {
            console.error('Error fetching NWS data:', error);
            return null;
        }
    }

    async fetchOpenMeteoData(lat, lon) {
        const cacheKey = `openmeteo_${lat}_${lon}`;
        const cached = cache.get(cacheKey);
        if (cached) return cached;

        try {
            const url = `https://api.open-meteo.com/v1/forecast?` +
                `latitude=${lat}&longitude=${lon}` +
                `&current=temperature_2m,relative_humidity_2m,precipitation,rain,showers,snowfall,visibility,wind_speed_10m,wind_direction_10m` +
                `&hourly=temperature_2m,precipitation,snowfall,visibility` +
                `&timezone=America/Denver`;

            const response = await fetch(url);

            if (!response.ok) {
                throw new Error(`Open-Meteo API error: ${response.status}`);
            }

            const data = await response.json();

            const processedData = {
                current: {
                    temperature: data.current.temperature_2m,
                    humidity: data.current.relative_humidity_2m,
                    precipitation: data.current.precipitation,
                    snowfall: data.current.snowfall,
                    visibility: data.current.visibility,
                    windSpeed: data.current.wind_speed_10m,
                    windDirection: data.current.wind_direction_10m
                },
                hourly: data.hourly
            };

            cache.set(cacheKey, processedData);
            return processedData;
        } catch (error) {
            console.error('Error fetching Open-Meteo data:', error);
            return null;
        }
    }

    determineRoadCondition(station, weatherData) {
        let condition = 'green';
        let status = 'Passable';
        let reason = '';

        if (!station) {
            return { condition: 'gray', status: 'No Data', reason: 'Station data unavailable' };
        }

        const surfaceStatus = (station.surfaceStatus || '').toLowerCase();
        const surfaceTemp = parseFloat(station.roadTemp) || parseFloat(station.airTemp);
        const visibility = parseFloat(station.visibility);
        const precipitation = station.precipitation || '';
        const windSpeed = parseFloat(station.windSpeed);

        if (surfaceStatus.includes('ice') || surfaceStatus.includes('icy')) {
            condition = 'red';
            status = 'Dangerous';
            reason = 'Icy conditions';
        } else if (surfaceStatus.includes('closed')) {
            condition = 'red';
            status = 'Closed';
            reason = 'Road closed';
        } else if (surfaceStatus.includes('snow') || precipitation.toLowerCase().includes('snow')) {
            if (surfaceTemp && surfaceTemp <= 32) {
                condition = 'yellow';
                status = 'Caution';
                reason = 'Snow on road';
            } else {
                condition = 'yellow';
                status = 'Caution';
                reason = 'Wet snow conditions';
            }
        } else if (visibility && visibility < 0.25) {
            condition = 'red';
            status = 'Dangerous';
            reason = 'Very low visibility';
        } else if (visibility && visibility < 1) {
            condition = 'yellow';
            status = 'Caution';
            reason = 'Reduced visibility';
        } else if (windSpeed && windSpeed > 40) {
            condition = 'yellow';
            status = 'Caution';
            reason = 'High wind advisory';
        } else if (surfaceStatus.includes('wet') || precipitation.toLowerCase().includes('rain')) {
            condition = 'green';
            status = 'Passable';
            reason = 'Wet roads';
        } else if (surfaceStatus.includes('dry') || surfaceStatus === '') {
            condition = 'green';
            status = 'Passable';
            reason = 'Normal conditions';
        }

        return { condition, status, reason };
    }

    async getRoadSegments() {
        const majorRoads = [
            {
                id: 'us40-vernal-roosevelt',
                name: 'US-40: Vernal to Roosevelt',
                route: 'US-40',
                coordinates: [
                    [40.4555, -109.5287],
                    [40.4500, -109.6000],
                    [40.4200, -109.7000],
                    [40.3800, -109.8000],
                    [40.3200, -109.9000],
                    [40.2999, -109.9890]
                ],
                nearestStations: []
            },
            {
                id: 'us191-vernal-duchesne',
                name: 'US-191: Vernal to Duchesne',
                route: 'US-191',
                coordinates: [
                    [40.4555, -109.5287],
                    [40.4000, -109.6500],
                    [40.3500, -109.8000],
                    [40.3000, -110.0000],
                    [40.2500, -110.2000],
                    [40.1632, -110.4026]
                ],
                nearestStations: []
            },
            {
                id: 'sr87-duchesne-roosevelt',
                name: 'SR-87: Duchesne to Roosevelt',
                route: 'SR-87',
                coordinates: [
                    [40.1632, -110.4026],
                    [40.2000, -110.3000],
                    [40.2500, -110.1500],
                    [40.2999, -109.9890]
                ],
                nearestStations: []
            },
            {
                id: 'sr121-vernal-manila',
                name: 'SR-121: Vernal to Manila',
                route: 'SR-121',
                coordinates: [
                    [40.4555, -109.5287],
                    [40.5500, -109.4500],
                    [40.6500, -109.4000]
                ],
                nearestStations: []
            }
        ];

        return majorRoads;
    }

    async getCompleteRoadData() {
        try {
            const [udotRoads, cameras, weatherStations] = await Promise.all([
                this.fetchUDOTRoadConditions(),
                this.fetchUDOTCameras(),
                this.fetchUDOTWeatherStations()
            ]);

            // Analyze cameras for snow conditions with temperature data from weather stations
            const cameraSnowDetections = await this.analyzeCamerasForSnow(cameras, weatherStations);

            // Convert ALL UDOT roads to map segments (no weather estimation, UDOT data only)
            const roadSegments = udotRoads.map(udotRoad => ({
                id: `udot-${udotRoad.id}`,
                name: udotRoad.name,
                route: this.extractRouteNumber(udotRoad.name),
                coordinates: udotRoad.coordinates,
                overallCondition: udotRoad.condition,
                type: 'monitored',
                lastUpdated: udotRoad.lastUpdated,
                roadCondition: udotRoad.roadCondition,
                weatherCondition: udotRoad.weatherCondition,
                restriction: udotRoad.restriction
            }));

            // Camera analysis will be shown as colored rings around camera icons instead of road segments
            const allRoadSegments = roadSegments;

            return {
                segments: allRoadSegments,
                cameras: cameras,
                stations: weatherStations,
                cameraDetections: cameraSnowDetections,
                totalRoads: allRoadSegments.length,
                totalCameras: cameras.length,
                totalStations: weatherStations.length,
                cameraAnalyzedLocations: cameraSnowDetections.length,
                monitoredRoads: roadSegments.length,
                lastUpdated: new Date().toISOString()
            };
        } catch (error) {
            console.error('Error getting complete road data:', error);
            throw error;
        }
    }

    async analyzeCamerasForSnow(cameras, weatherStations = []) {
        try {
            const detectionResults = await this.snowDetectionService.analyzeCamerasBatch(cameras, weatherStations);


            return detectionResults;
        } catch (error) {
            console.error('Error analyzing cameras for snow:', error);
            return []; // Return empty array on error to avoid breaking the main flow
        }
    }

    extractRouteNumber(roadName) {
        // Extract route designation from road name
        const name = roadName.toLowerCase();

        if (name.includes('us-40') || name.includes('us 40') || name.includes('highway 40')) return 'US-40';
        if (name.includes('us-191') || name.includes('us 191') || name.includes('highway 191')) return 'US-191';
        if (name.includes('sr-87') || name.includes('sr 87') || name.includes('state route 87')) return 'SR-87';
        if (name.includes('sr-121') || name.includes('sr 121') || name.includes('state route 121')) return 'SR-121';
        if (name.includes('i-80') || name.includes('interstate 80')) return 'I-80';

        // Extract generic route numbers
        const usMatch = name.match(/us[- ]?(\d+)/);
        if (usMatch) return `US-${usMatch[1]}`;

        const srMatch = name.match(/sr[- ]?(\d+)/);
        if (srMatch) return `SR-${srMatch[1]}`;

        const iMatch = name.match(/i[- ]?(\d+)/);
        if (iMatch) return `I-${iMatch[1]}`;

        // Default to road name if no pattern matches
        return roadName.split(' ')[0] || 'Local';
    }

    async fetchAdditionalRoadNetwork() {
        const cacheKey = 'additional_roads';
        const cached = cache.get(cacheKey);
        if (cached) return cached;

        try {
            // Main highways and important connecting roads in Uintah Basin
            const additionalRoads = [
                {
                    id: 'sr121',
                    name: 'SR-121 (Vernal to Manila)',
                    route: 'SR-121',
                    coordinates: [
                        [40.4555, -109.5287], // Vernal
                        [40.4900, -109.4600],
                        [40.5200, -109.4200],
                        [40.5500, -109.3900],
                        [40.5800, -109.3600],
                        [40.6100, -109.3300]  // Towards Manila
                    ]
                }
            ];

            // Add estimated conditions based on weather data
            const weatherCondition = await this.getCurrentWeatherCondition();
            const processedRoads = additionalRoads.map(road => ({
                ...road,
                estimatedCondition: this.estimateRoadCondition(road, weatherCondition)
            }));

            cache.set(cacheKey, processedRoads, 600); // Cache for 10 minutes
            return processedRoads;

        } catch (error) {
            console.error('Error fetching additional road network:', error);
            return [];
        }
    }

    async getCurrentWeatherCondition() {
        try {
            // Use Open-Meteo for current weather in basin center
            const lat = 40.3033;
            const lng = -109.7;
            const weather = await this.fetchOpenMeteoData(lat, lng);

            if (weather && weather.current) {
                return {
                    temperature: weather.current.temperature,
                    precipitation: weather.current.precipitation,
                    snowfall: weather.current.snowfall,
                    windSpeed: weather.current.windSpeed,
                    visibility: weather.current.visibility
                };
            }
        } catch (error) {
            console.warn('Could not fetch current weather for road estimation:', error);
        }

        return {
            temperature: 10, // Default mild conditions
            precipitation: 0,
            snowfall: 0,
            windSpeed: 5,
            visibility: 10000
        };
    }

    estimateRoadCondition(road, weather) {
        const temp = weather.temperature;
        const precip = weather.precipitation;
        const snow = weather.snowfall;
        const wind = weather.windSpeed;
        const visibility = weather.visibility;

        // Estimate based on weather conditions and road type
        let condition = 'green';
        let status = 'Normal';
        let reason = 'Estimated from regional weather';

        // Check for dangerous conditions
        if (temp <= 0 && (precip > 0 || snow > 0)) {
            condition = 'red';
            status = 'Likely Icy';
            reason = 'Below freezing with precipitation';
        }
        // Check for caution conditions
        else if (temp <= 2 && (precip > 0 || snow > 0)) {
            condition = 'yellow';
            status = 'Possible Ice';
            reason = 'Near freezing with precipitation';
        }
        else if (snow > 0.5) {
            condition = 'yellow';
            status = 'Snow Likely';
            reason = 'Snowfall in area';
        }
        else if (precip > 2 || visibility < 1000) {
            condition = 'yellow';
            status = 'Wet/Reduced Visibility';
            reason = 'Heavy rain or low visibility';
        }
        else if (wind > 15) {
            condition = 'yellow';
            status = 'Windy';
            reason = 'High winds possible';
        }

        // Mountain/forest roads are more susceptible
        if (road.route.toLowerCase().includes('forest') ||
            road.route.toLowerCase().includes('mountain') ||
            road.name.toLowerCase().includes('canyon')) {
            if (condition === 'green' && (temp < 5 || precip > 0)) {
                condition = 'yellow';
                status = 'Mountain Road Caution';
                reason = 'Higher elevation conditions may vary';
            }
        }

        return { condition, status, reason };
    }

    async fetchUDOTCameras() {
        const cacheKey = 'udot_cameras';
        const cached = cache.get(cacheKey);
        if (cached) return cached;

        try {
            const url = `https://www.udottraffic.utah.gov/api/v2/get/cameras?key=${this.udotApiKey}&format=json`;
            const response = await fetch(url, {
                headers: {
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`UDOT Cameras API error: ${response.status}`);
            }

            const data = await response.json();

            // Filter cameras for Uintah Basin area
            const basinCameras = data.filter(camera => {
                const lat = parseFloat(camera.Latitude);
                const lng = parseFloat(camera.Longitude);

                return lat >= this.uintahBasinBounds.south &&
                       lat <= this.uintahBasinBounds.north &&
                       lng >= this.uintahBasinBounds.west &&
                       lng <= this.uintahBasinBounds.east;
            });

            const processedCameras = basinCameras.map(camera => ({
                id: camera.Id,
                name: camera.Location,
                roadway: camera.Roadway,
                lat: parseFloat(camera.Latitude),
                lng: parseFloat(camera.Longitude),
                views: camera.Views.map(view => ({
                    url: view.Url,
                    status: view.Status,
                    description: view.Description || 'Live Camera Feed'
                }))
            }));

            cache.set(cacheKey, processedCameras);
            return processedCameras;
        } catch (error) {
            console.error('Error fetching UDOT cameras:', error);
            return [];
        }
    }

    async fetchUDOTWeatherStations() {
        const cacheKey = 'udot_weather_stations';
        const cached = cache.get(cacheKey);
        if (cached) return cached;

        try {
            const url = `https://www.udottraffic.utah.gov/api/v2/get/weatherstations?key=${this.udotApiKey}&format=json`;
            const response = await fetch(url, {
                headers: {
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`UDOT Weather Stations API error: ${response.status}`);
            }

            const data = await response.json();

            // Filter weather stations for Uintah Basin area
            const basinStations = data.filter(station => {
                const lat = parseFloat(station.Latitude);
                const lng = parseFloat(station.Longitude);

                // Only include stations with valid coordinates
                if (!lat || !lng || isNaN(lat) || isNaN(lng)) return false;

                return lat >= this.uintahBasinBounds.south &&
                       lat <= this.uintahBasinBounds.north &&
                       lng >= this.uintahBasinBounds.west &&
                       lng <= this.uintahBasinBounds.east;
            });

            const processedStations = basinStations.map(station => ({
                id: station.Id,
                name: station.StationName,
                lat: parseFloat(station.Latitude),
                lng: parseFloat(station.Longitude),
                airTemperature: station.AirTemperature,
                surfaceTemp: station.SurfaceTemp,
                subSurfaceTemp: station.SubSurfaceTemp,
                surfaceStatus: station.SurfaceStatus,
                relativeHumidity: station.RelativeHumidity,
                dewpointTemp: station.DewpointTemp,
                precipitation: station.Precipitation,
                windSpeedAvg: station.WindSpeedAvg,
                windSpeedGust: station.WindSpeedGust,
                windDirection: station.WindDirection,
                source: station.Source,
                lastUpdated: new Date(station.LastUpdated * 1000).toISOString(),
                condition: this.determineStationCondition(station)
            }));

            cache.set(cacheKey, processedStations);
            return processedStations;
        } catch (error) {
            console.error('Error fetching UDOT weather stations:', error);
            return [];
        }
    }

    async fetchUDOTRestAreas() {
        const cacheKey = 'udot_rest_areas';
        const cached = cache.get(cacheKey);
        if (cached) return cached;

        try {
            const url = `https://www.udottraffic.utah.gov/api/v2/get/restareas?key=${this.udotApiKey}&format=json`;
            const response = await fetch(url, {
                headers: {
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`UDOT Rest Areas API error: ${response.status}`);
            }

            const data = await response.json();

            // Filter rest areas for Uintah Basin area
            const basinRestAreas = data.filter(restArea => {
                const lat = parseFloat(restArea.Latitude);
                const lng = parseFloat(restArea.Longitude);

                // Only include rest areas with valid coordinates
                if (!lat || !lng || isNaN(lat) || isNaN(lng)) return false;

                return lat >= this.uintahBasinBounds.south &&
                       lat <= this.uintahBasinBounds.north &&
                       lng >= this.uintahBasinBounds.west &&
                       lng <= this.uintahBasinBounds.east;
            });

            const processedRestAreas = basinRestAreas.map(restArea => ({
                id: restArea.Id,
                name: restArea.Name,
                lat: parseFloat(restArea.Latitude),
                lng: parseFloat(restArea.Longitude),
                location: restArea.Location,
                yearBuilt: restArea.YearBuilt,
                carStalls: parseInt(restArea.CarStalls) || 0,
                truckStalls: parseInt(restArea.TruckStalls) || 0,
                nearestCommunities: restArea.NearestCommunities,
                imageUrl: restArea.ImageUrl,
                totalStalls: (parseInt(restArea.CarStalls) || 0) + (parseInt(restArea.TruckStalls) || 0)
            }));

            // Cache for 1 hour (rest areas don't change frequently)
            cache.set(cacheKey, processedRestAreas, 3600);
            return processedRestAreas;
        } catch (error) {
            console.error('Error fetching UDOT rest areas:', error);
            return [];
        }
    }

    determineStationCondition(station) {
        const surfaceStatus = (station.SurfaceStatus || '').toLowerCase();
        const surfaceTemp = parseFloat(station.SurfaceTemp);
        const airTemp = parseFloat(station.AirTemperature);
        const precipitation = (station.Precipitation || '').toLowerCase();
        const windSpeed = parseFloat(station.WindSpeedAvg);

        let condition = 'green';
        let status = 'Normal';
        let reason = 'Good conditions';

        // Check for dangerous conditions
        if (surfaceStatus.includes('ice') || surfaceStatus.includes('icy')) {
            condition = 'red';
            status = 'Icy Surface';
            reason = 'Icy road surface detected';
        } else if (surfaceStatus.includes('snow') || precipitation.includes('snow')) {
            if (surfaceTemp && surfaceTemp <= 32) {
                condition = 'red';
                status = 'Snow/Ice Risk';
                reason = 'Snow with freezing surface temperature';
            } else {
                condition = 'yellow';
                status = 'Snow Present';
                reason = 'Snow on road surface';
            }
        } else if (surfaceStatus.includes('wet') && surfaceTemp && surfaceTemp <= 32) {
            condition = 'red';
            status = 'Freezing Wet';
            reason = 'Wet surface at freezing temperature';
        } else if (surfaceStatus.includes('wet') || precipitation.includes('light') || precipitation.includes('moderate')) {
            condition = 'yellow';
            status = 'Wet Surface';
            reason = 'Wet road conditions';
        } else if (windSpeed && windSpeed > 25) {
            condition = 'yellow';
            status = 'High Winds';
            reason = `Strong winds at ${windSpeed} mph`;
        } else if (surfaceStatus.includes('dry') || !surfaceStatus) {
            condition = 'green';
            status = 'Clear';
            reason = 'Dry road surface';
        }

        return { condition, status, reason };
    }

    calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 3958.8;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    }

    getDistanceToSegment(station, coordinates) {
        let minDistance = Infinity;
        for (const coord of coordinates) {
            const distance = this.calculateDistance(
                station.lat, station.lng,
                coord[0], coord[1]
            );
            if (distance < minDistance) {
                minDistance = distance;
            }
        }
        return minDistance;
    }

    getWorstCondition(conditions) {
        if (!conditions || conditions.length === 0) {
            return { condition: 'gray', status: 'No Data', reason: 'No station data' };
        }

        const hasRed = conditions.some(c => c.condition === 'red');
        const hasYellow = conditions.some(c => c.condition === 'yellow');

        if (hasRed) {
            return conditions.find(c => c.condition === 'red');
        } else if (hasYellow) {
            return conditions.find(c => c.condition === 'yellow');
        } else {
            return conditions[0];
        }
    }

    async fetchSnowPlows() {
        const cacheKey = 'udot_snow_plows';
        const cached = cache.get(cacheKey);
        if (cached) return cached;

        try {
            const url = `https://www.udottraffic.utah.gov/api/v2/get/servicevehicles?key=${this.udotApiKey}&format=json`;
            const response = await fetch(url, {
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': this.nwsUserAgent
                }
            });

            if (!response.ok) {
                throw new Error(`UDOT Snow Plows API error: ${response.status}`);
            }

            const plows = await response.json();

            // Filter for Uintah Basin area
            const basinPlows = plows.filter(plow => {
                const lat = plow.Latitude;
                const lng = plow.Longitude;
                return lat >= this.uintahBasinBounds.south &&
                       lat <= this.uintahBasinBounds.north &&
                       lng >= this.uintahBasinBounds.west &&
                       lng <= this.uintahBasinBounds.east;
            });

            // Process plow data
            const processedPlows = basinPlows.map(plow => ({
                id: plow.Id,
                name: plow.Name || `Plow ${plow.Owner}`,
                fleetId: plow.Owner,
                bearing: plow.Bearing,
                bearingAngle: this.bearingToAngle(plow.Bearing),
                latitude: plow.Latitude,
                longitude: plow.Longitude,
                lastUpdated: new Date(plow.LastUpdated * 1000).toISOString(),
                lastUpdateMinutesAgo: Math.floor((Date.now() - plow.LastUpdated * 1000) / 60000),
                isActive: this.isPlowActive(plow.LastUpdated),
                route: plow.EncodedPolyline ? decodePolyline(plow.EncodedPolyline) : [],
                status: this.getPlowStatus(plow.LastUpdated)
            }));

            // Cache for 1 minute (snow plows update frequently)
            cache.set(cacheKey, processedPlows, 60);
            return processedPlows;
        } catch (error) {
            console.error('Error fetching snow plows:', error);
            return [];
        }
    }

    bearingToAngle(bearing) {
        const bearingMap = {
            'North': 0,
            'North East': 45,
            'East': 90,
            'South East': 135,
            'South': 180,
            'South West': 225,
            'West': 270,
            'North West': 315
        };
        return bearingMap[bearing] || 0;
    }

    isPlowActive(lastUpdatedUnix) {
        const lastUpdate = new Date(lastUpdatedUnix * 1000);
        const now = new Date();
        const minutesAgo = (now - lastUpdate) / 60000;
        return minutesAgo <= 15; // Consider active if updated within 15 minutes
    }

    getPlowStatus(lastUpdatedUnix) {
        const lastUpdate = new Date(lastUpdatedUnix * 1000);
        const now = new Date();
        const minutesAgo = (now - lastUpdate) / 60000;

        if (minutesAgo <= 5) return 'active';
        if (minutesAgo <= 15) return 'recent';
        if (minutesAgo <= 60) return 'idle';
        return 'inactive';
    }

    async fetchMountainPasses() {
        const cacheKey = 'udot_mountain_passes';
        const cached = cache.get(cacheKey);
        if (cached) return cached;

        try {
            const url = `https://www.udottraffic.utah.gov/api/v2/get/mountainpasses?key=${this.udotApiKey}&format=json`;
            const response = await fetch(url, {
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': this.nwsUserAgent
                }
            });

            if (!response.ok) {
                throw new Error(`UDOT Mountain Passes API error: ${response.status}`);
            }

            const passes = await response.json();

            // Filter for passes near or relevant to Uintah Basin
            // Include passes that affect access to the region
            const relevantPasses = passes.filter(pass => {
                const lat = pass.Latitude;
                const lng = pass.Longitude;

                // Extended bounds to include mountain passes that affect basin access
                const extendedBounds = {
                    north: 41.0,
                    south: 39.5,
                    east: -108.5,
                    west: -111.5
                };

                return lat >= extendedBounds.south &&
                       lat <= extendedBounds.north &&
                       lng >= extendedBounds.west &&
                       lng <= extendedBounds.east;
            });

            // Process pass data
            const processedPasses = relevantPasses.map(pass => ({
                id: pass.Id,
                name: pass.Name,
                roadway: pass.Roadway,
                latitude: pass.Latitude,
                longitude: pass.Longitude,
                elevation: pass.MaxElevation ? `${pass.MaxElevation} ft` : 'Unknown',
                elevationFeet: parseInt(pass.MaxElevation) || 0,

                // Weather conditions (raw values for client-side unit conversion)
                airTemperature: pass.AirTemperature ? parseFloat(pass.AirTemperature) : null,
                windSpeed: pass.WindSpeed ? parseFloat(pass.WindSpeed) : null,
                windGust: pass.WindGust ? parseFloat(pass.WindGust) : null,
                windDirection: pass.WindDirection || null,
                surfaceTemp: pass.SurfaceTemp ? parseFloat(pass.SurfaceTemp) : null,
                surfaceStatus: pass.SurfaceStatus || 'Unknown',
                visibility: pass.Visibility || null,

                // Seasonal closure info
                seasonalRoute: pass.SeasonalRouteName,
                seasonalClosureTitle: pass.SeasonalClosureTitle,
                seasonalInfo: this.processSeasonalInfo(pass.SeasonalInfo),

                // Additional info
                stationName: pass.StationName,
                cameraId: pass.CameraId,
                forecasts: pass.Forecasts,

                // Determine overall status
                status: this.determinePassStatus(pass),
                severity: this.determinePassSeverity(pass)
            }));

            // Sort by elevation (highest first)
            processedPasses.sort((a, b) => b.elevationFeet - a.elevationFeet);

            cache.set(cacheKey, processedPasses, 300); // Cache for 5 minutes
            return processedPasses;
        } catch (error) {
            console.error('Error fetching mountain passes:', error);
            return [];
        }
    }

    processSeasonalInfo(seasonalInfo) {
        if (!seasonalInfo || !Array.isArray(seasonalInfo)) return null;

        return seasonalInfo.map(info => ({
            description: info.SeasonalClosureDescription,
            status: info.SeasonalClosureStatus,
            isOpen: info.SeasonalClosureStatus === 'OPEN',
            isClosed: info.SeasonalClosureStatus === 'CLOSED'
        }));
    }

    determinePassStatus(pass) {
        // Check seasonal closure first
        if (pass.SeasonalInfo && pass.SeasonalInfo.length > 0) {
            const closureStatus = pass.SeasonalInfo[0].SeasonalClosureStatus;
            if (closureStatus === 'CLOSED') return 'closed';
        }

        // Check surface conditions
        const surfaceStatus = (pass.SurfaceStatus || '').toLowerCase();
        if (surfaceStatus.includes('ice') || surfaceStatus.includes('snow')) {
            return 'hazardous';
        }

        // Check temperature
        const temp = parseInt(pass.AirTemperature);
        if (!isNaN(temp) && temp <= 32) {
            return 'caution';
        }

        // Check wind
        const windGust = parseInt(pass.WindGust);
        if (!isNaN(windGust) && windGust > 40) {
            return 'windy';
        }

        return 'open';
    }

    determinePassSeverity(pass) {
        const status = this.determinePassStatus(pass);

        switch(status) {
            case 'closed': return 'severe';
            case 'hazardous': return 'high';
            case 'caution': return 'moderate';
            case 'windy': return 'moderate';
            default: return 'low';
        }
    }

    async fetchUDOTDigitalSigns() {
        const cacheKey = 'udot_digital_signs';
        const cached = cache.get(cacheKey);
        if (cached) return cached;

        try {
            const url = `https://www.udottraffic.utah.gov/api/v2/get/signs?key=${this.udotApiKey}&format=json`;
            const response = await fetch(url);

            if (!response.ok) {
                throw new Error(`UDOT Digital Signs API error: ${response.status}`);
            }

            const data = await response.json();

            // Filter for Uintah Basin area and process signs
            const basinSigns = data.filter(sign =>
                (sign.Latitude >= 40.0 && sign.Latitude <= 40.8 &&
                 sign.Longitude >= -111.0 && sign.Longitude <= -109.0)
            ).map(sign => ({
                id: sign.Id,
                name: sign.Name,
                location: {
                    lat: parseFloat(sign.Latitude),
                    lng: parseFloat(sign.Longitude)
                },
                message: sign.Message || 'No message',
                route: sign.Route || 'Unknown',
                direction: sign.Direction || '',
                milepost: sign.Milepost || null,
                lastUpdated: sign.LastUpdated || new Date().toISOString(),
                priority: this.getSignPriority(sign.Message),
                category: this.categorizeSignMessage(sign.Message)
            }));

            cache.set(cacheKey, basinSigns); // 5 minute cache (cache has default 5min TTL)
            return basinSigns;
        } catch (error) {
            console.error('Error fetching UDOT digital signs:', error);
            return [];
        }
    }

    categorizeSignMessage(message) {
        if (!message) return 'general';

        const msg = message.toLowerCase();

        if (msg.includes('construction') || msg.includes('work zone') || msg.includes('lane closure')) {
            return 'construction';
        } else if (msg.includes('accident') || msg.includes('crash') || msg.includes('incident')) {
            return 'incident';
        } else if (msg.includes('weather') || msg.includes('ice') || msg.includes('snow') || msg.includes('fog')) {
            return 'weather';
        } else if (msg.includes('closed') || msg.includes('closure')) {
            return 'closure';
        } else if (msg.includes('slow') || msg.includes('congestion') || msg.includes('delay')) {
            return 'traffic';
        }

        return 'advisory';
    }

    getSignPriority(message) {
        if (!message) return 1;

        const msg = message.toLowerCase();

        // High priority: road closures, severe weather
        if (msg.includes('closed') || msg.includes('severe') || msg.includes('dangerous')) {
            return 3;
        }
        // Medium priority: construction, accidents
        else if (msg.includes('construction') || msg.includes('accident') || msg.includes('caution')) {
            return 2;
        }
        // Low priority: general advisories
        return 1;
    }
}

export default RoadWeatherService;