import express from 'express';

const router = express.Router();

// Note: fetch is built-in in Node.js 18+, no import needed

/**
 * Synoptic API Time Series Proxy
 * GET /api/synoptic/timeseries
 *
 * Query params:
 * - stations: Comma-separated station IDs (e.g., "UBHSP,KVEL,K74V")
 * - variables: Comma-separated variable names (e.g., "air_temp,ozone_concentration")
 * - start: Start datetime in ISO format or YYYYMMDDHHMM
 * - end: End datetime in ISO format or YYYYMMDDHHMM
 */
router.get('/synoptic/timeseries', async (req, res) => {
    try {
        const { stations, variables, start, end } = req.query;

        // Validate required parameters
        if (!stations || !variables || !start || !end) {
            return res.status(400).json({
                success: false,
                error: 'Missing required parameters. Need: stations, variables, start, end'
            });
        }

        // Validate API token exists
        let apiToken = process.env.SYNOPTIC_API_KEY || process.env.SYNOPTIC_API_TOKEN;
        if (!apiToken) {
            console.error('SYNOPTIC_API_KEY/SYNOPTIC_API_TOKEN not configured');
            return res.status(500).json({
                success: false,
                error: 'Synoptic API token not configured on server'
            });
        }

        // Remove quotes if present (from .env file)
        apiToken = apiToken.replace(/^["']|["']$/g, '').trim();

        // Validate date range is <= 7 days
        const startDate = new Date(start);
        const endDate = new Date(end);
        const daysDiff = (endDate - startDate) / (1000 * 60 * 60 * 24);

        if (daysDiff > 7) {
            return res.status(400).json({
                success: false,
                error: 'Date range cannot exceed 7 days. Please select a shorter period.'
            });
        }

        if (daysDiff < 0) {
            return res.status(400).json({
                success: false,
                error: 'Start date must be before end date'
            });
        }

        // Convert to Synoptic API format (YYYYMMDDHHMM)
        const formatDate = (date) => {
            const year = date.getUTCFullYear();
            const month = String(date.getUTCMonth() + 1).padStart(2, '0');
            const day = String(date.getUTCDate()).padStart(2, '0');
            const hour = String(date.getUTCHours()).padStart(2, '0');
            const minute = String(date.getUTCMinutes()).padStart(2, '0');
            return `${year}${month}${day}${hour}${minute}`;
        };

        const startFormatted = formatDate(startDate);
        const endFormatted = formatDate(endDate);

        // Build Synoptic API URL
        const synopticUrl = new URL('https://api.synopticdata.com/v2/stations/timeseries');
        synopticUrl.searchParams.set('token', apiToken);
        synopticUrl.searchParams.set('stid', stations);
        synopticUrl.searchParams.set('vars', variables);
        synopticUrl.searchParams.set('start', startFormatted);
        synopticUrl.searchParams.set('end', endFormatted);
        synopticUrl.searchParams.set('units', 'metric,speed|mps'); // Use metric units
        synopticUrl.searchParams.set('obtimezone', 'UTC');

        console.log(`Fetching Synoptic data: ${stations} | ${variables} | ${startFormatted} - ${endFormatted}`);

        // Fetch each station individually to handle inactive/unavailable stations gracefully
        const stationList = stations.split(',');
        const allStationData = [];
        const failedStations = [];
        const skippedStations = [];

        for (const stid of stationList) {
            try {
                const stationUrl = new URL('https://api.synopticdata.com/v2/stations/timeseries');
                stationUrl.searchParams.set('token', apiToken);
                stationUrl.searchParams.set('stid', stid);
                stationUrl.searchParams.set('vars', variables);
                stationUrl.searchParams.set('start', startFormatted);
                stationUrl.searchParams.set('end', endFormatted);
                stationUrl.searchParams.set('units', 'metric,speed|mps');
                stationUrl.searchParams.set('obtimezone', 'UTC');

                const response = await fetch(stationUrl.toString());

                if (!response.ok) {
                    console.warn(`Station ${stid} returned ${response.status}, skipping...`);
                    failedStations.push(stid);
                    continue;
                }

                const data = await response.json();

                // Check if station returned successfully
                if (data.SUMMARY && data.SUMMARY.RESPONSE_CODE === 1 && data.STATION && data.STATION.length > 0) {
                    allStationData.push(...data.STATION);
                    console.log(`✓ Station ${stid} fetched successfully`);
                } else {
                    console.warn(`Station ${stid} unavailable: ${data.SUMMARY?.RESPONSE_MESSAGE || 'No data'}`);
                    skippedStations.push(stid);
                }
            } catch (error) {
                console.error(`Error fetching station ${stid}:`, error.message);
                failedStations.push(stid);
            }
        }

        // Check if we got any data
        if (allStationData.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'No data available for the requested stations in this time range',
                failedStations: failedStations,
                skippedStations: skippedStations
            });
        }

        // Combine all station data into single response format
        const combinedData = {
            STATION: allStationData,
            SUMMARY: {
                RESPONSE_CODE: 1,
                RESPONSE_MESSAGE: 'OK',
                NUMBER_OF_OBJECTS: allStationData.length
            }
        };

        // Process and return data
        const processedData = processTimeSeriesData(combinedData);

        res.json({
            success: true,
            data: processedData,
            metadata: {
                stations: stations.split(','),
                variables: variables.split(','),
                start: start,
                end: end,
                dataPoints: processedData.totalDataPoints || 0,
                queriedAt: new Date().toISOString(),
                successfulStations: allStationData.length,
                failedStations: failedStations,
                skippedStations: skippedStations
            },
            warnings: failedStations.length > 0 || skippedStations.length > 0 ?
                `Some stations were unavailable: ${[...failedStations, ...skippedStations].join(', ')}` : null
        });

    } catch (error) {
        console.error('Error fetching Synoptic data:', error);
        res.status(500).json({
            success: false,
            error: 'Server error while fetching data from Synoptic API',
            details: error.message
        });
    }
});

/**
 * Process raw Synoptic API response into time series format
 * Output format: { stationId: { variable: { times: [], values: [], units: '' } } }
 */
function processTimeSeriesData(synopticData) {
    const result = {
        stations: {},
        totalDataPoints: 0
    };

    if (!synopticData.STATION || synopticData.STATION.length === 0) {
        return result;
    }

    synopticData.STATION.forEach(station => {
        const stid = station.STID;
        result.stations[stid] = {
            name: station.NAME,
            elevation: station.ELEVATION,
            latitude: station.LATITUDE,
            longitude: station.LONGITUDE,
            timezone: station.TIMEZONE,
            variables: {}
        };

        // Process observations
        if (station.OBSERVATIONS) {
            Object.keys(station.OBSERVATIONS).forEach(varKey => {
                // Skip metadata fields
                if (varKey === 'date_time') return;

                const observations = station.OBSERVATIONS[varKey];

                if (Array.isArray(observations)) {
                    // Get corresponding timestamps
                    const timestamps = station.OBSERVATIONS.date_time || [];

                    result.stations[stid].variables[varKey] = {
                        times: timestamps,
                        values: observations,
                        units: station.UNITS?.[varKey] || '',
                        count: observations.length
                    };

                    result.totalDataPoints += observations.length;
                }
            });
        }
    });

    return result;
}

/**
 * Get list of available stations
 * GET /api/synoptic/stations
 */
router.get('/synoptic/stations', async (req, res) => {
    try {
        let apiToken = process.env.SYNOPTIC_API_KEY || process.env.SYNOPTIC_API_TOKEN;
        if (!apiToken) {
            return res.status(500).json({
                success: false,
                error: 'Synoptic API token not configured'
            });
        }

        // Remove quotes if present (from .env file)
        apiToken = apiToken.replace(/^["']|["']$/g, '').trim();

        // Fetch metadata for Uintah Basin stations
        const stationIds = 'UBHSP,UBCSP,UB7ST,KVEL,K74V,UTMYT,UCC34,BUNUT,UTDAN,UTICS,UTSLD,UTSTV,K40U';

        const synopticUrl = new URL('https://api.synopticdata.com/v2/stations/metadata');
        synopticUrl.searchParams.set('token', apiToken);
        synopticUrl.searchParams.set('stid', stationIds);

        const response = await fetch(synopticUrl.toString());
        const data = await response.json();

        if (data.SUMMARY?.RESPONSE_CODE === 1 && data.STATION) {
            const stations = data.STATION.map(s => ({
                stid: s.STID,
                name: s.NAME,
                elevation: s.ELEVATION,
                latitude: s.LATITUDE,
                longitude: s.LONGITUDE,
                timezone: s.TIMEZONE
            }));

            res.json({
                success: true,
                stations: stations
            });
        } else {
            res.status(400).json({
                success: false,
                error: 'Failed to fetch station metadata'
            });
        }

    } catch (error) {
        console.error('Error fetching stations:', error);
        res.status(500).json({
            success: false,
            error: 'Server error fetching station list'
        });
    }
});

export default router;
