import fetch from 'node-fetch';
import NodeCache from 'node-cache';

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
        this.uintahBasinBounds = {
            north: 40.8,    // Slightly expanded north
            south: 39.7,    // Slightly expanded south  
            east: -108.8,   // Slightly expanded east
            west: -110.7    // Slightly expanded west
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
            const [udotRoads, additionalRoads, cameras] = await Promise.all([
                this.fetchUDOTRoadConditions(),
                this.fetchAdditionalRoadNetwork(),
                this.fetchUDOTCameras()
            ]);

            // Convert UDOT roads to map segments (monitored roads)
            const udotSegments = udotRoads.map(udotRoad => ({
                id: `udot-${udotRoad.id}`,
                name: udotRoad.name,
                route: this.extractRouteNumber(udotRoad.name),
                coordinates: udotRoad.coordinates,
                overallCondition: udotRoad.condition,
                udotData: udotRoad,
                type: 'monitored',
                stations: []
            }));

            // Convert additional roads to map segments (estimated conditions)
            const additionalSegments = additionalRoads.map(road => ({
                id: `local-${road.id}`,
                name: road.name,
                route: road.route,
                coordinates: road.coordinates,
                overallCondition: road.estimatedCondition,
                type: 'estimated',
                stations: []
            }));

            const allSegments = [...udotSegments, ...additionalSegments];

            return {
                segments: allSegments,
                cameras: cameras,
                udotRoads: udotRoads,
                additionalRoads: additionalRoads,
                totalRoads: allSegments.length,
                monitoredRoads: udotSegments.length,
                estimatedRoads: additionalSegments.length,
                totalCameras: cameras.length,
                lastUpdated: new Date().toISOString()
            };
        } catch (error) {
            console.error('Error getting complete road data:', error);
            throw error;
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
}

export default RoadWeatherService;