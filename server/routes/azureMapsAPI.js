import express from 'express';
import AzureMapsService from '../azureMapsService.js';

const router = express.Router();
const azureService = new AzureMapsService();

/**
 * Azure Maps Comprehensive API Routes
 * All Azure Maps REST API services integrated
 */

// ============= WEATHER SERVICES =============

/**
 * Get current weather conditions
 * GET /api/azure/weather/current?lat=40.4&lon=-111.5
 */
router.get('/azure/weather/current', async (req, res) => {
    try {
        const { lat, lon } = req.query;

        if (!lat || !lon) {
            return res.status(400).json({
                success: false,
                error: 'Missing required parameters: lat, lon'
            });
        }

        const weather = await azureService.getCurrentWeather(parseFloat(lat), parseFloat(lon));

        res.json({
            success: true,
            location: { lat: parseFloat(lat), lon: parseFloat(lon) },
            weather
        });
    } catch (error) {
        console.error('Error fetching current weather:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch current weather',
            message: error.message
        });
    }
});

/**
 * Get hourly weather forecast
 * GET /api/azure/weather/forecast/hourly?lat=40.4&lon=-111.5&duration=12
 */
router.get('/azure/weather/forecast/hourly', async (req, res) => {
    try {
        const { lat, lon, duration = 12 } = req.query;

        if (!lat || !lon) {
            return res.status(400).json({
                success: false,
                error: 'Missing required parameters: lat, lon'
            });
        }

        const forecast = await azureService.getHourlyForecast(
            parseFloat(lat),
            parseFloat(lon),
            parseInt(duration)
        );

        res.json({
            success: true,
            location: { lat: parseFloat(lat), lon: parseFloat(lon) },
            duration: parseInt(duration),
            forecast
        });
    } catch (error) {
        console.error('Error fetching hourly forecast:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch hourly forecast',
            message: error.message
        });
    }
});

/**
 * Get daily weather forecast
 * GET /api/azure/weather/forecast/daily?lat=40.4&lon=-111.5&duration=5
 */
router.get('/azure/weather/forecast/daily', async (req, res) => {
    try {
        const { lat, lon, duration = 5 } = req.query;

        if (!lat || !lon) {
            return res.status(400).json({
                success: false,
                error: 'Missing required parameters: lat, lon'
            });
        }

        const forecast = await azureService.getDailyForecast(
            parseFloat(lat),
            parseFloat(lon),
            parseInt(duration)
        );

        res.json({
            success: true,
            location: { lat: parseFloat(lat), lon: parseFloat(lon) },
            duration: parseInt(duration),
            forecast
        });
    } catch (error) {
        console.error('Error fetching daily forecast:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch daily forecast',
            message: error.message
        });
    }
});

/**
 * Get severe weather alerts
 * GET /api/azure/weather/alerts?lat=40.4&lon=-111.5
 */
router.get('/azure/weather/alerts', async (req, res) => {
    try {
        const { lat, lon } = req.query;

        if (!lat || !lon) {
            return res.status(400).json({
                success: false,
                error: 'Missing required parameters: lat, lon'
            });
        }

        const alerts = await azureService.getSevereWeatherAlerts(
            parseFloat(lat),
            parseFloat(lon)
        );

        res.json({
            success: true,
            location: { lat: parseFloat(lat), lon: parseFloat(lon) },
            alertCount: alerts.length,
            alerts
        });
    } catch (error) {
        console.error('Error fetching weather alerts:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch weather alerts',
            message: error.message
        });
    }
});

/**
 * Get Provo Canyon weather summary
 * GET /api/azure/weather/provo-canyon
 */
router.get('/azure/weather/provo-canyon', async (req, res) => {
    try {
        // Provo Canyon center coordinates
        const lat = 40.4;
        const lon = -111.5;

        const [current, hourly, daily, alerts] = await Promise.all([
            azureService.getCurrentWeather(lat, lon),
            azureService.getHourlyForecast(lat, lon, 24),
            azureService.getDailyForecast(lat, lon, 7),
            azureService.getSevereWeatherAlerts(lat, lon)
        ]);

        res.json({
            success: true,
            location: {
                name: 'Provo Canyon (US-189)',
                lat,
                lon
            },
            current,
            hourly,
            daily,
            alerts
        });
    } catch (error) {
        console.error('Error fetching Provo Canyon weather:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch Provo Canyon weather',
            message: error.message
        });
    }
});

// ============= TRAFFIC SERVICES =============

/**
 * Get traffic incidents in bounding box
 * GET /api/azure/traffic/incidents?bbox=-111.7,40.2,-111.3,40.6
 */
router.get('/azure/traffic/incidents', async (req, res) => {
    try {
        const { bbox } = req.query;

        if (!bbox) {
            return res.status(400).json({
                success: false,
                error: 'Missing required parameter: bbox (format: minLon,minLat,maxLon,maxLat)'
            });
        }

        const boundingBox = bbox.split(',').map(parseFloat);

        if (boundingBox.length !== 4) {
            return res.status(400).json({
                success: false,
                error: 'Invalid bbox format. Expected: minLon,minLat,maxLon,maxLat'
            });
        }

        const incidents = await azureService.getTrafficIncidents(boundingBox);

        res.json({
            success: true,
            boundingBox: {
                minLon: boundingBox[0],
                minLat: boundingBox[1],
                maxLon: boundingBox[2],
                maxLat: boundingBox[3]
            },
            incidentCount: incidents.length,
            incidents
        });
    } catch (error) {
        console.error('Error fetching traffic incidents:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch traffic incidents',
            message: error.message
        });
    }
});

// ============= ROUTING SERVICES =============

/**
 * Calculate route between waypoints
 * POST /api/azure/route/directions
 * Body: { "waypoints": [{"lat": 40.2, "lon": -111.7}, {"lat": 40.6, "lon": -111.3}], "options": {} }
 */
router.post('/azure/route/directions', async (req, res) => {
    try {
        const { waypoints, options = {} } = req.body;

        if (!waypoints || waypoints.length < 2) {
            return res.status(400).json({
                success: false,
                error: 'At least 2 waypoints required'
            });
        }

        const route = await azureService.calculateRoute(waypoints, options);

        res.json({
            success: true,
            waypoints,
            route
        });
    } catch (error) {
        console.error('Error calculating route:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to calculate route',
            message: error.message
        });
    }
});

/**
 * Get reachable range (isochrone)
 * GET /api/azure/route/reachable-range?lat=40.4&lon=-111.5&timeBudget=1800
 */
router.get('/azure/route/reachable-range', async (req, res) => {
    try {
        const { lat, lon, timeBudget, travelMode = 'car' } = req.query;

        if (!lat || !lon || !timeBudget) {
            return res.status(400).json({
                success: false,
                error: 'Missing required parameters: lat, lon, timeBudget (seconds)'
            });
        }

        const range = await azureService.getReachableRange(
            parseFloat(lat),
            parseFloat(lon),
            parseInt(timeBudget),
            { travelMode }
        );

        res.json({
            success: true,
            origin: { lat: parseFloat(lat), lon: parseFloat(lon) },
            timeBudgetInSeconds: parseInt(timeBudget),
            timeBudgetInMinutes: parseInt(timeBudget) / 60,
            travelMode,
            range
        });
    } catch (error) {
        console.error('Error getting reachable range:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get reachable range',
            message: error.message
        });
    }
});

// ============= SEARCH SERVICES =============

/**
 * Search for points of interest
 * GET /api/azure/search/poi?query=gas%20station&lat=40.4&lon=-111.5&radius=10000
 */
router.get('/azure/search/poi', async (req, res) => {
    try {
        const { query, lat, lon, radius = 10000, categorySet, limit = 20 } = req.query;

        if (!query || !lat || !lon) {
            return res.status(400).json({
                success: false,
                error: 'Missing required parameters: query, lat, lon'
            });
        }

        const results = await azureService.searchPOI(
            query,
            parseFloat(lat),
            parseFloat(lon),
            parseInt(radius),
            { categorySet, limit: parseInt(limit) }
        );

        res.json({
            success: true,
            query,
            location: { lat: parseFloat(lat), lon: parseFloat(lon) },
            radius: parseInt(radius),
            resultCount: results.length,
            results
        });
    } catch (error) {
        console.error('Error searching POI:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to search POI',
            message: error.message
        });
    }
});

/**
 * Reverse geocode coordinates to address
 * GET /api/azure/search/reverse-geocode?lat=40.4&lon=-111.5
 */
router.get('/azure/search/reverse-geocode', async (req, res) => {
    try {
        const { lat, lon } = req.query;

        if (!lat || !lon) {
            return res.status(400).json({
                success: false,
                error: 'Missing required parameters: lat, lon'
            });
        }

        const address = await azureService.reverseGeocode(
            parseFloat(lat),
            parseFloat(lon)
        );

        res.json({
            success: true,
            location: { lat: parseFloat(lat), lon: parseFloat(lon) },
            address
        });
    } catch (error) {
        console.error('Error reverse geocoding:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to reverse geocode',
            message: error.message
        });
    }
});

/**
 * Search nearby services (gas, food, rest stops)
 * GET /api/azure/search/nearby-services?lat=40.4&lon=-111.5
 */
router.get('/azure/search/nearby-services', async (req, res) => {
    try {
        const { lat, lon, radius = 25000 } = req.query;

        if (!lat || !lon) {
            return res.status(400).json({
                success: false,
                error: 'Missing required parameters: lat, lon'
            });
        }

        const [gasStations, restaurants, restAreas] = await Promise.all([
            azureService.searchPOI('gas station', parseFloat(lat), parseFloat(lon), parseInt(radius), {
                categorySet: '7311',
                limit: 10
            }),
            azureService.searchPOI('restaurant', parseFloat(lat), parseFloat(lon), parseInt(radius), {
                categorySet: '7315',
                limit: 10
            }),
            azureService.searchPOI('rest area', parseFloat(lat), parseFloat(lon), parseInt(radius), {
                limit: 5
            })
        ]);

        res.json({
            success: true,
            location: { lat: parseFloat(lat), lon: parseFloat(lon) },
            radius: parseInt(radius),
            services: {
                gasStations: {
                    count: gasStations.length,
                    results: gasStations
                },
                restaurants: {
                    count: restaurants.length,
                    results: restaurants
                },
                restAreas: {
                    count: restAreas.length,
                    results: restAreas
                }
            }
        });
    } catch (error) {
        console.error('Error searching nearby services:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to search nearby services',
            message: error.message
        });
    }
});

// ============= ELEVATION SERVICES =============

/**
 * Get elevation data for coordinates
 * POST /api/azure/elevation
 * Body: { "coordinates": [{"lat": 40.4, "lon": -111.5}, ...] }
 */
router.post('/azure/elevation', async (req, res) => {
    try {
        const { coordinates } = req.body;

        if (!coordinates || !Array.isArray(coordinates)) {
            return res.status(400).json({
                success: false,
                error: 'Missing or invalid coordinates array'
            });
        }

        const elevations = await azureService.getElevation(coordinates);

        res.json({
            success: true,
            pointCount: elevations.length,
            elevations
        });
    } catch (error) {
        console.error('Error fetching elevation:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch elevation data',
            message: error.message
        });
    }
});

// ============= TIMEZONE SERVICES =============

/**
 * Get timezone for coordinates
 * GET /api/azure/timezone?lat=40.4&lon=-111.5
 */
router.get('/azure/timezone', async (req, res) => {
    try {
        const { lat, lon } = req.query;

        if (!lat || !lon) {
            return res.status(400).json({
                success: false,
                error: 'Missing required parameters: lat, lon'
            });
        }

        const timezone = await azureService.getTimezone(
            parseFloat(lat),
            parseFloat(lon)
        );

        res.json({
            success: true,
            location: { lat: parseFloat(lat), lon: parseFloat(lon) },
            timezone
        });
    } catch (error) {
        console.error('Error fetching timezone:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch timezone',
            message: error.message
        });
    }
});

// ============= SPATIAL / GEOFENCING SERVICES =============

/**
 * Check if point is within polygon (geofencing)
 * POST /api/azure/spatial/point-in-polygon
 * Body: { "lat": 40.4, "lon": -111.5, "polygon": [...] }
 */
router.post('/azure/spatial/point-in-polygon', async (req, res) => {
    try {
        const { lat, lon, polygon } = req.body;

        if (!lat || !lon || !polygon) {
            return res.status(400).json({
                success: false,
                error: 'Missing required parameters: lat, lon, polygon'
            });
        }

        const isInside = await azureService.checkPointInPolygon(
            parseFloat(lat),
            parseFloat(lon),
            polygon
        );

        res.json({
            success: true,
            point: { lat: parseFloat(lat), lon: parseFloat(lon) },
            isInside
        });
    } catch (error) {
        console.error('Error checking point in polygon:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to check point in polygon',
            message: error.message
        });
    }
});

// ============= COMPREHENSIVE DATA ENDPOINT =============

/**
 * Get all relevant data for Provo Canyon
 * GET /api/azure/provo-canyon/complete
 */
router.get('/azure/provo-canyon/complete', async (req, res) => {
    try {
        const lat = 40.4;
        const lon = -111.5;
        const bbox = [-111.7, 40.2, -111.3, 40.6];

        const [weather, incidents, nearbyServices] = await Promise.all([
            azureService.getCurrentWeather(lat, lon),
            azureService.getTrafficIncidents(bbox),
            Promise.all([
                azureService.searchPOI('gas station', lat, lon, 25000, { categorySet: '7311', limit: 5 }),
                azureService.searchPOI('restaurant', lat, lon, 25000, { categorySet: '7315', limit: 5 })
            ])
        ]);

        res.json({
            success: true,
            location: {
                name: 'Provo Canyon (US-189)',
                lat,
                lon
            },
            weather,
            traffic: {
                incidentCount: incidents.length,
                incidents
            },
            nearbyServices: {
                gasStations: nearbyServices[0],
                restaurants: nearbyServices[1]
            },
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error fetching complete Provo Canyon data:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch complete data',
            message: error.message
        });
    }
});

// Health check
router.get('/azure/health', (req, res) => {
    res.json({
        success: true,
        service: 'Azure Maps Comprehensive API',
        version: '1.0.0',
        categories: {
            weather: ['current', 'forecast/hourly', 'forecast/daily', 'alerts'],
            traffic: ['incidents'],
            routing: ['directions', 'reachable-range'],
            search: ['poi', 'reverse-geocode', 'nearby-services'],
            elevation: ['elevation'],
            timezone: ['timezone'],
            spatial: ['point-in-polygon']
        }
    });
});

export default router;
