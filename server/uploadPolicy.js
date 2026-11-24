/**
 * Upload policy: which dataTypes exist, which hosts may send them, and which files each takes.
 *
 * Pure functions and constants only, so the rules can be tested without a server. The API key
 * (routes/dataUpload.js validateApiKey) is the authentication. The hostname list is a filter:
 * `x-client-hostname` is a header the client writes, so it stops a misconfigured producer, not
 * an attacker who already holds the key.
 */

// Every dataType POST /api/upload/:dataType accepts. Each is also the name of its directory
// under public/api/static, so nothing but a name on this list ever becomes part of a path.
// ingestReadiness.js checks the same directories are writable. A new dataType also needs an
// entry in DATA_MANIFEST.json and a section in docs/WEBSITE-BRCTOOLS-CONTRACT.md.
export const UPLOAD_DATA_TYPES = Object.freeze([
    'observations',
    'metadata',
    'outlooks',
    'llm_outlooks',
    'images',
    'forecasts',
    'road-forecast',
    'llm_forecasts', // tiered LLM forecast text, one JSON file per run per persona
    'aircraft',      // aircraft-derived products from the ADS-B hub
]);

export function isKnownDataType(dataType) {
    return typeof dataType === 'string' && UPLOAD_DATA_TYPES.includes(dataType);
}

// What the route took before per-dataType rules existed. The seven older dataTypes keep it, so
// no producer that works today is turned away.
const DEFAULT_EXTENSIONS = Object.freeze(['.json', '.md', '.txt', '.png', '.pdf']);

// Narrower lists for the dataTypes added in 1.7.3. forecast_air_quality.js links the newest
// .pdf in llm_outlooks; keeping llm_forecasts JSON-only (and separate) means no new file family
// can take over that button.
const EXTENSIONS_BY_DATA_TYPE = Object.freeze({
    llm_forecasts: Object.freeze(['.json']),
    aircraft: Object.freeze(['.json', '.png']),
});

export function allowedExtensions(dataType) {
    return Object.hasOwn(EXTENSIONS_BY_DATA_TYPE, dataType)
        ? EXTENSIONS_BY_DATA_TYPE[dataType]
        : DEFAULT_EXTENSIONS;
}

/** `ext` as path.extname gives it: lower case, with the dot. */
export function extensionAllowed(dataType, ext) {
    return allowedExtensions(dataType).includes(ext);
}

// UPLOAD_ALLOWED_HOSTS in .env overrides this. An entry that starts with a dot is a suffix
// ("any host under chpc.utah.edu"); any other entry is one exact hostname.
export const DEFAULT_ALLOWED_HOSTS = '.chpc.utah.edu';

const HOSTNAME_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/;

function normaliseHost(value) {
    if (typeof value !== 'string') return null;
    const host = value.trim().toLowerCase().replace(/\.$/, '');
    return HOSTNAME_RE.test(host) ? host : null;
}

/**
 * Rules from a comma- or space-separated list. Unset, blank or wholly invalid falls back to
 * the CHPC suffix, so a typo in .env cannot lock CHPC out or let everyone in.
 */
export function parseAllowedHosts(value) {
    const parse = (text) => String(text ?? '')
        .split(/[\s,]+/)
        .map((entry) => {
            // "*.example.org" means the same as ".example.org".
            const trimmed = entry.trim().toLowerCase().replace(/^\*(?=\.)/, '');
            const suffix = trimmed.startsWith('.');
            const host = normaliseHost(suffix ? trimmed.slice(1) : trimmed);
            return host ? { suffix, host } : null;
        })
        .filter(Boolean);

    const rules = parse(value);
    return rules.length > 0 ? rules : parse(DEFAULT_ALLOWED_HOSTS);
}

/** True when `hostname` is one of the exact names, or sits at or under one of the suffixes. */
export function isAllowedHost(hostname, rules) {
    const host = normaliseHost(hostname);
    if (!host) return false;
    return rules.some((rule) => (
        host === rule.host || (rule.suffix && host.endsWith(`.${rule.host}`))
    ));
}
