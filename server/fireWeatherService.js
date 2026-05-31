import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';
import NodeCache from 'node-cache';
import { fetchNWSGridpointForecast, nwsFetch, NWS_USER_AGENT } from './nwsHelpers.js';
import { clusterDetections, categorizeAndConfirm } from './fireClustering.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const cache = new NodeCache({ stdTTL: 300 });

export const UINTA_BASIN_BBOX = { west: -111.5, south: 39.5, east: -108.5, north: 41.0 };
export const UINTA_BASIN_CENTROID = { lat: 40.3033, lon: -109.7 };

// HDW thresholds derived from Srock, Charney, Potter, Goodrick (2018),
// "The Hot-Dry-Windy Index: A New Fire Weather Index", Atmosphere 9(7), 279.
// Surface implementation: HDW = VPD_kPa * max(wind, gust) in m/s.
export const HDW_THRESHOLDS = {
    low: 5,         // < 5
    moderate: 15,   // 5 - 14.99
    high: 30,       // 15 - 29.99
    very_high: 50,  // 30 - 49.99
    extreme: Infinity
};

let firmsKeyWarned = false;

function classifyHDW(hdw) {
    if (hdw == null || !Number.isFinite(hdw)) return null;
    if (hdw < HDW_THRESHOLDS.low) return 'low';
    if (hdw < HDW_THRESHOLDS.moderate) return 'moderate';
    if (hdw < HDW_THRESHOLDS.high) return 'high';
    if (hdw < HDW_THRESHOLDS.very_high) return 'very_high';
    return 'extreme';
}

function saturationVaporPressureKpa(tempC) {
    return 0.6108 * Math.exp((17.27 * tempC) / (tempC + 237.3));
}

function rhFromTempAndDewpoint(tempC, dewpointC) {
    if (tempC == null || dewpointC == null) return null;
    const es = saturationVaporPressureKpa(tempC);
    const e = saturationVaporPressureKpa(dewpointC);
    if (es <= 0) return null;
    const rh = (e / es) * 100;
    return Math.max(0, Math.min(100, rh));
}

class FireWeatherService {
    constructor() {
        this.nwsUserAgent = NWS_USER_AGENT;
        this.firmsKey = process.env.FIRMS_MAP_KEY || null;
    }

    // ── Hot-Dry-Windy Index ────────────────────────────────────────────
    /**
     * Compute HDW from surface variables.
     *
     * @param {number} tempC - air temperature, °C
     * @param {number} rhPercent - relative humidity, %
     * @param {number} windMs - wind speed (or max(speed, gust)) in m/s
     * @returns {{hdw:number, vpdKpa:number, level:string} | null}
     *
     * Citation: Srock et al. 2018, Atmosphere 9(7), 279. doi:10.3390/atmos9070279.
     * Surface approximation: VPD at 2m * 10m wind (Srock §2.2).
     */
    computeHDW(tempC, rhPercent, windMs) {
        if (tempC == null || rhPercent == null || windMs == null) return null;
        if (!Number.isFinite(tempC) || !Number.isFinite(rhPercent) || !Number.isFinite(windMs)) return null;
        const es = saturationVaporPressureKpa(tempC);
        const e = es * (rhPercent / 100);
        const vpd = Math.max(0, es - e);
        const hdw = vpd * windMs;
        return { hdw, vpdKpa: vpd, level: classifyHDW(hdw) };
    }

    // ── NWS Red Flag Warnings + Fire Weather Watches ───────────────────
    async fetchRedFlagAlerts() {
        const cacheKey = 'nws_fire_alerts_ut';
        const cached = cache.get(cacheKey);
        if (cached) return cached;

        try {
            const [redFlag, watch] = await Promise.all([
                nwsFetch('https://api.weather.gov/alerts/active?event=Red+Flag+Warning&area=UT').catch(() => ({ features: [] })),
                nwsFetch('https://api.weather.gov/alerts/active?event=Fire+Weather+Watch&area=UT').catch(() => ({ features: [] }))
            ]);
            const features = [...(redFlag.features || []), ...(watch.features || [])];
            const basinKeywords = /(uinta|uintah|duchesne)/i;
            const alerts = features
                .filter(f => basinKeywords.test(f.properties?.areaDesc || ''))
                .map(f => ({
                    id: f.properties?.id || f.id,
                    event: f.properties?.event || 'Fire Weather',
                    headline: f.properties?.headline || '',
                    description: f.properties?.description || '',
                    instruction: f.properties?.instruction || '',
                    effective: f.properties?.effective || null,
                    expires: f.properties?.expires || null,
                    areaDesc: f.properties?.areaDesc || '',
                    severity: f.properties?.severity || null,
                    urgency: f.properties?.urgency || null
                }))
                .sort((a, b) => (new Date(b.effective || 0)) - (new Date(a.effective || 0)));
            cache.set(cacheKey, alerts);
            return alerts;
        } catch (error) {
            console.error('Error fetching NWS fire alerts:', error.message);
            return [];
        }
    }

    // ── NWS gridpoint forecast (delegates to shared helper) ────────────
    async fetchNWSFireWeatherForecast(lat, lon) {
        const cacheKey = `fire_nws_${lat}_${lon}`;
        const cached = cache.get(cacheKey);
        if (cached) return cached;
        try {
            const data = await fetchNWSGridpointForecast(lat, lon);
            cache.set(cacheKey, data);
            return data;
        } catch (error) {
            console.error('Error fetching NWS fire forecast:', error.message);
            return null;
        }
    }

    // ── Open-Meteo fire-weather variables ──────────────────────────────
    async fetchOpenMeteoFireVars(lat, lon) {
        const cacheKey = `fire_openmeteo_${lat}_${lon}`;
        const cached = cache.get(cacheKey);
        if (cached) return cached;
        try {
            const url = 'https://api.open-meteo.com/v1/forecast?' +
                `latitude=${lat}&longitude=${lon}` +
                '&current=temperature_2m,relative_humidity_2m,dew_point_2m,' +
                'wind_speed_10m,wind_gusts_10m,wind_direction_10m,' +
                'vapor_pressure_deficit,precipitation' +
                '&hourly=temperature_2m,relative_humidity_2m,dew_point_2m,' +
                'wind_speed_10m,wind_gusts_10m,vapor_pressure_deficit' +
                '&forecast_hours=48&wind_speed_unit=ms&timezone=America/Denver';
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Open-Meteo error: ${response.status}`);
            const data = await response.json();
            cache.set(cacheKey, data);
            return data;
        } catch (error) {
            console.error('Error fetching Open-Meteo fire vars:', error.message);
            return null;
        }
    }

    // ── NASA FIRMS active-fire hotspots ────────────────────────────────
    async fetchFIRMSHotspots(bbox = UINTA_BASIN_BBOX, dayRange = 3) {
        if (!this.firmsKey) {
            if (!firmsKeyWarned) {
                console.warn('FIRMS_MAP_KEY not set — FIRMS hotspot layer disabled. Set FIRMS_MAP_KEY in .env to enable.');
                firmsKeyWarned = true;
            }
            return [];
        }
        const cacheKey = `firms_${bbox.west}_${bbox.south}_${bbox.east}_${bbox.north}_${dayRange}`;
        const cached = cache.get(cacheKey);
        if (cached) return cached;
        try {
            const coords = `${bbox.west},${bbox.south},${bbox.east},${bbox.north}`;
            const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${this.firmsKey}/VIIRS_NOAA20_NRT/${coords}/${dayRange}`;
            const response = await fetch(url);
            if (!response.ok) throw new Error(`FIRMS API error: ${response.status}`);
            const text = await response.text();
            const hotspots = parseFIRMSCsv(text);
            cache.set(cacheKey, hotspots, 1800);
            return hotspots;
        } catch (error) {
            console.error('Error fetching FIRMS hotspots:', error.message);
            return [];
        }
    }

    // ── Clustered fires from FIRMS hotspots ────────────────────────────
    async getBasinFires(bbox = UINTA_BASIN_BBOX) {
        const hotspots = await this.fetchFIRMSHotspots(bbox);
        const clusters = clusterDetections(hotspots);
        return categorizeAndConfirm(clusters, Date.now());
    }

    // ── Live basin observations (read from local static file) ─────────
    async readLatestBasinObservations() {
        try {
            const staticDir = path.join(__dirname, '../public/api/static');
            const obsDir = path.join(staticDir, 'observations');
            const metaDir = path.join(staticDir, 'metadata');

            const obsFiles = fs.readdirSync(obsDir).filter(f => f.startsWith('map_obs_') && f.endsWith('.json') && !f.includes('meta'));
            if (obsFiles.length === 0) return { observations: [], metadata: {} };
            const latestObs = obsFiles.sort().reverse()[0];
            const obsData = JSON.parse(fs.readFileSync(path.join(obsDir, latestObs), 'utf8'));

            const metaFiles = fs.readdirSync(metaDir).filter(f => f.startsWith('map_obs_meta_') && f.endsWith('.json'));
            const metaData = metaFiles.length > 0
                ? JSON.parse(fs.readFileSync(path.join(metaDir, metaFiles.sort().reverse()[0]), 'utf8'))
                : [];
            const metaByStid = {};
            for (const m of metaData) {
                metaByStid[m.stid] = m;
            }
            return { observations: obsData, metadata: metaByStid };
        } catch (error) {
            console.error('Error reading basin observations:', error.message);
            return { observations: [], metadata: {} };
        }
    }

    // ── Per-station HDW computation ────────────────────────────────────
    computeStationHDW(observations, metadata) {
        const byStid = {};
        for (const row of observations) {
            if (!byStid[row.stid]) byStid[row.stid] = {};
            byStid[row.stid][row.variable] = row.value;
            byStid[row.stid]._date = row.date_time;
        }
            const stations = [];
        for (const [stid, vars] of Object.entries(byStid)) {
            const meta = metadata[stid];
            if (!meta) continue;
            const lat = meta.latitude;
            const lon = meta.longitude;
            if (lat == null || lon == null) continue;
            if (lat < UINTA_BASIN_BBOX.south || lat > UINTA_BASIN_BBOX.north) continue;
            if (lon < UINTA_BASIN_BBOX.west || lon > UINTA_BASIN_BBOX.east) continue;

            const tempC = vars.air_temp;
            const dewC = vars.dew_point_temperature;
            const windMs = vars.wind_speed;
            const rh = rhFromTempAndDewpoint(tempC, dewC);
            const hdwResult = this.computeHDW(tempC, rh, windMs);

            stations.push({
                stid,
                name: meta.name || stid,
                lat,
                lng: lon,
                elevation: meta.elevation || null,
                tempC,
                dewC,
                rh,
                windMs,
                date: vars._date || null,
                hdw: hdwResult ? hdwResult.hdw : null,
                hdwLevel: hdwResult ? hdwResult.level : null
            });
        }
        return stations;
    }

    // ── Aggregated snapshot for the /fire page ─────────────────────────
    async getBasinFireWeatherSnapshot() {
        const cacheKey = 'fire_basin_snapshot';
        const cached = cache.get(cacheKey);
        if (cached) return cached;

        const [openMeteo, alerts, hotspots, forecast, obsBundle] = await Promise.all([
            this.fetchOpenMeteoFireVars(UINTA_BASIN_CENTROID.lat, UINTA_BASIN_CENTROID.lon),
            this.fetchRedFlagAlerts(),
            this.fetchFIRMSHotspots(),
            this.fetchNWSFireWeatherForecast(UINTA_BASIN_CENTROID.lat, UINTA_BASIN_CENTROID.lon),
            Promise.resolve(this.readLatestBasinObservations())
        ]);

        const stations = this.computeStationHDW(obsBundle.observations, obsBundle.metadata);

        let stationMax = null;
        for (const s of stations) {
            if (s.hdw != null && (stationMax == null || s.hdw > stationMax.hdw)) {
                stationMax = s;
            }
        }

        let basin = null;
        if (openMeteo && openMeteo.current) {
            const c = openMeteo.current;
            const wind = Math.max(c.wind_speed_10m ?? 0, c.wind_gusts_10m ?? 0);
            const centroidHdw = this.computeHDW(c.temperature_2m, c.relative_humidity_2m, wind);
            const stationHdw = stationMax?.hdw ?? null;
            const overallHdw = stationHdw != null && centroidHdw
                ? Math.max(stationHdw, centroidHdw.hdw)
                : (centroidHdw?.hdw ?? stationHdw);
            basin = {
                tempC: c.temperature_2m,
                rhPercent: c.relative_humidity_2m,
                dewPointC: c.dew_point_2m,
                windMs: c.wind_speed_10m,
                gustMs: c.wind_gusts_10m,
                windDirDeg: c.wind_direction_10m,
                vpdKpa: c.vapor_pressure_deficit,
                hdw: overallHdw,
                hdwLevel: classifyHDW(overallHdw),
                hdwSource: stationHdw != null && stationHdw >= (centroidHdw?.hdw ?? -Infinity)
                    ? `station ${stationMax.name}`
                    : 'basin centroid (Open-Meteo)',
                observedAt: new Date().toISOString()
            };
        }

        const clusters = clusterDetections(hotspots);
        const fires = categorizeAndConfirm(clusters, Date.now());

        const snapshot = {
            success: true,
            timestamp: new Date().toISOString(),
            basin,
            stations,
            stationMax,
            hotspots,
            fires,
            alerts,
            forecast: forecast?.periods || [],
            hourly: openMeteo?.hourly || null
        };
        cache.set(cacheKey, snapshot, 300);
        return snapshot;
    }
}

// ── CSV parser for FIRMS responses ─────────────────────────────────────
function parseFIRMSCsv(text) {
    if (!text || typeof text !== 'string') return [];
    const lines = text.split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) return [];
    const header = lines[0].split(',').map(h => h.trim());
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',');
        if (cols.length !== header.length) continue;
        const obj = {};
        for (let j = 0; j < header.length; j++) {
            obj[header[j]] = cols[j];
        }
        const lat = parseFloat(obj.latitude);
        const lon = parseFloat(obj.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
        rows.push({
            lat,
            lon,
            brightness: parseFloat(obj.bright_ti4 || obj.brightness) || null,
            scan: parseFloat(obj.scan) || null,
            track: parseFloat(obj.track) || null,
            acqDate: obj.acq_date || null,
            acqTime: obj.acq_time || null,
            satellite: obj.satellite || null,
            instrument: obj.instrument || null,
            confidence: obj.confidence || null,
            version: obj.version || null,
            brightT31: parseFloat(obj.bright_ti5 || obj.bright_t31) || null,
            frp: parseFloat(obj.frp) || null,
            daynight: obj.daynight || null
        });
    }
    return rows;
}

export default FireWeatherService;
