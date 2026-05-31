import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';
import NodeCache from 'node-cache';
import { UINTA_BASIN_BBOX } from './fireWeatherService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const cache = new NodeCache({ stdTTL: 30 * 60 });

const ARCGIS_FIRE_RESTRICTIONS_URL =
    'https://services.arcgis.com/ZzrwjTRez6FJiOq4/arcgis/rest/services/Fire_Restrictions/FeatureServer/0/query';

// Mirror of the Agency coded-value domain on the FeatureLayer. Values are
// stored as short codes; this maps them to the human-readable name.
const AGENCY_NAMES = {
    '1-FFSL': 'Utah FFSL',
    '2-USFS': 'US Forest Service',
    '3-BLM': 'Bureau of Land Management',
    '4-NPS': 'National Park Service',
    '5-Navajo': 'Navajo Nation',
    '6-Ute': 'Ute Indian Tribe'
};

// Hand-written compact summaries keyed by OrderNum. Loaded once at startup;
// edit the JSON and restart the server to refresh. Missing file or invalid
// JSON degrades gracefully — cards render the "no summary" fallback.
const SUMMARIES = loadSummaries();

function loadSummaries() {
    const summariesPath = path.join(__dirname, 'data', 'fireRestrictionsSummaries.json');
    try {
        const raw = fs.readFileSync(summariesPath, 'utf8');
        const parsed = JSON.parse(raw);
        delete parsed._meta;
        return parsed;
    } catch (err) {
        console.warn(`fireRestrictionsService: could not load summaries (${err.message}); proceeding without`);
        return {};
    }
}

function isoFromEpochMs(ms) {
    if (ms == null || !Number.isFinite(ms)) return null;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function normalizeFeature(feature) {
    const a = feature?.attributes || {};
    const agencyCode = a.Agency || null;
    const orderNum = a.OrderNum || null;
    const entry = (orderNum && SUMMARIES[orderNum]) || null;
    return {
        orderNum,
        agency: AGENCY_NAMES[agencyCode] || agencyCode,
        type: a.RestrictionType || null,
        status: a.Status || null,
        areaDescription: a.AreaDescription || null,
        shortArea: a.Short_AreaDescription || null,
        effectiveAt: isoFromEpochMs(a.EffectiveDate),
        rescindedAt: isoFromEpochMs(a.RescindedDate),
        link: a.Link || null,
        hasCampfire: Number(a.Campfire_etc) === 1,
        hasFireworks: Number(a.Fireworks) === 1,
        summary: entry?.summary || null,
        highlights: Array.isArray(entry?.highlights) ? entry.highlights : null
    };
}

class FireRestrictionsService {
    async fetchActiveRestrictions(bbox = UINTA_BASIN_BBOX) {
        const cacheKey = `fire_restrictions_${bbox.west}_${bbox.south}_${bbox.east}_${bbox.north}`;
        const cached = cache.get(cacheKey);
        if (cached) return cached;

        const geometry = JSON.stringify({
            xmin: bbox.west,
            ymin: bbox.south,
            xmax: bbox.east,
            ymax: bbox.north,
            spatialReference: { wkid: 4326 }
        });

        const params = new URLSearchParams({
            where: "Status='Active'",
            geometry,
            geometryType: 'esriGeometryEnvelope',
            inSR: '4326',
            spatialRel: 'esriSpatialRelIntersects',
            outFields: [
                'OrderNum', 'Agency', 'EffectiveDate', 'RescindedDate',
                'AreaDescription', 'Short_AreaDescription', 'Link',
                'RestrictionType', 'Status', 'Campfire_etc', 'Fireworks'
            ].join(','),
            returnGeometry: 'false',
            f: 'json'
        });

        try {
            const response = await fetch(`${ARCGIS_FIRE_RESTRICTIONS_URL}?${params}`);
            if (!response.ok) throw new Error(`ArcGIS Fire_Restrictions ${response.status}`);
            const data = await response.json();
            const features = Array.isArray(data?.features) ? data.features : [];
            const restrictions = features
                .map(normalizeFeature)
                .sort((a, b) => {
                    const aT = a.effectiveAt ? Date.parse(a.effectiveAt) : 0;
                    const bT = b.effectiveAt ? Date.parse(b.effectiveAt) : 0;
                    if (aT !== bT) return bT - aT;
                    return (a.agency || '').localeCompare(b.agency || '');
                });
            cache.set(cacheKey, restrictions);
            return restrictions;
        } catch (error) {
            console.error('Error fetching Utah fire restrictions:', error.message);
            return [];
        }
    }
}

export default FireRestrictionsService;
