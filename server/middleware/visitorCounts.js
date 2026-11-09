/**
 * Unique visitors, counted under several stated definitions at once (issue #340).
 *
 * Without a persistent identifier there is no single correct "unique visitor" count, and this
 * site sets none. So every request is tallied under three identity keys (what makes two
 * requests the same visitor) and five nested audience tiers (who counts as a person), and each
 * definition says what it assumes. A reader picks the row that fits the question; nobody has to
 * trust one number that hides its assumptions.
 *
 * Three layers, so the counting can be tested and replayed without a server:
 *   - pure helpers: addressKeys(), classifyRequest()
 *   - VisitorTally: counts over opaque ids; knows nothing about salts, files or dates
 *   - VisitorStore: daily secret salt, persistence, UTC-midnight rollover into a history file
 *
 * Everything is per UTC day. The salt is random, rotated at midnight, and the old one is
 * overwritten, so a stored hash cannot be linked back to an address once its day is over. The
 * same property makes cross-day uniques impossible by design: summing daily counts overstates
 * weekly ones, and no weekly figure is offered.
 */

import crypto from 'crypto';
import net from 'net';
import path from 'path';
import { promises as fs, mkdirSync, readFileSync, writeFileSync, renameSync, appendFileSync } from 'fs';

// Bump when any rule below changes meaning, so a history series can be split at the change.
export const DEFINITIONS_VERSION = 1;

// An address with this many 404/405 answers in one day is probing, not reading. Real browsing
// almost never asks for this many missing paths; the scanners in our own logs ask for hundreds.
export const MISS_THRESHOLD = 10;

export const IDENTITIES = {
    network: 'One IPv4 /24 or IPv6 /48. A lower bound: a campus, office or mobile-carrier block counts once.',
    address: 'One IPv4 address or IPv6 /64. Merges everyone behind one NAT (household, school, office); splits a phone that moves between Wi-Fi and cellular.',
    address_ua: 'The address plus the exact User-Agent string, the cookieless convention used by privacy-first analytics tools. Splits one person using two browsers, or a browser that updates mid-day; merges identical devices behind one NAT.',
};

// Nested: each tier keeps only visitors that passed every tier above it.
export const TIERS = [
    { key: 'any', rule: 'Made any request the analytics middleware sees (static assets excluded).' },
    { key: 'not_declared_bot', rule: 'Sent a User-Agent that does not announce a bot, crawler or script.' },
    { key: 'page_viewer', rule: 'Received at least one HTML page (GET answered 2xx or 304).' },
    { key: 'clean', rule: `Its address sent no scanner probe, no POST to a page route, and fewer than ${MISS_THRESHOLD} requests answered 404/405 that day.` },
    { key: 'js_confirmed', rule: 'Also sent the engagement beacon: ran page JavaScript, stayed 2 s or more, then left or hid the page. Undercounts visitors who block beacons and quick bounces.' },
];

const TIER_KEYS = TIERS.map(t => t.key);
const IDENTITY_KEYS = Object.keys(IDENTITIES);

export function describeDefinitions() {
    return {
        version: DEFINITIONS_VERSION,
        period: 'UTC day; no cross-day identity, so daily counts cannot be summed into weekly uniques',
        identities: IDENTITIES,
        tiers: TIERS,
    };
}

// ── Request classification ─────────────────────────────────────────────

export const BOT_UA_PATTERNS = [
    /bot\b/i, /crawl/i, /spider/i, /slurp/i, /mediapartners/i,
    /wget/i, /curl/i, /python-requests/i, /go-http-client/i,
    /scrapy/i, /httpclient/i, /java\//i, /libwww/i, /nutch/i,
    /apache-httpclient/i, /okhttp/i, /node-fetch/i, /axios/i,
    /headlesschrome/i, /phantomjs/i, /selenium/i,
];

// Paths that only scanners/bots hit — never real users
export const SCANNER_PATHS = [
    /^\/wp-/, /^\/wordpress/i, /\.php$/i, /\.asp$/i, /\.aspx$/i,
    /\.cgi$/i, /\.env$/i, /\.git/i, /\/admin\b/i, /\/login/i,
    /\/owa\//i, /\/cgi-bin/i, /\/config/i, /\.xml$/i, /\.exe$/i,
    /^\/\./, /\/{3,}/,
];

/**
 * What one request says about its sender.
 *   declaredBot: no User-Agent, or one that names a bot or script
 *   probe:       asked for a scanner path, or POSTed to a page route
 *   page:        received an HTML page
 *   miss:        answered 404 or 405 (asked for something that is not there)
 */
export function classifyRequest({ userAgent, method, path: reqPath, status, contentType }) {
    const ua = userAgent || '';
    const p = reqPath || '';
    return {
        declaredBot: !ua || BOT_UA_PATTERNS.some(re => re.test(ua)),
        probe: SCANNER_PATHS.some(re => re.test(p)) || (method === 'POST' && !p.startsWith('/api')),
        page: isPageResponse({ method, path: p, status, contentType }),
        miss: status === 404 || status === 405,
    };
}

function isPageResponse({ method, path: p, status, contentType }) {
    if (method !== 'GET' || p.startsWith('/api/')) return false;
    if (status >= 200 && status < 300) return /^text\/html/i.test(String(contentType || ''));
    // `send` strips Content-Type from a 304, so a revalidated page is recognised by its path:
    // the HTML routes are extensionless, every static file has an extension.
    if (status === 304) return !/\.[a-z0-9]+$/i.test(p);
    return false;
}

// ── Address canonicalisation ───────────────────────────────────────────

/**
 * Canonical address and network strings for one client IP, or null when the IP tells us
 * nothing about the visitor (loopback: a local tool, or a proxy that dropped X-Forwarded-For).
 *
 * IPv6 is keyed by /64 rather than the full address: privacy extensions rotate the low 64 bits
 * as often as daily, so one device would otherwise count as several.
 */
export function addressKeys(ip) {
    let s = String(ip || '').trim();
    if (/^::ffff:/i.test(s) && net.isIPv4(s.slice(7))) s = s.slice(7);

    if (net.isIPv4(s)) {
        if (s.startsWith('127.')) return null;
        const [a, b, c] = s.split('.');
        return { address: s, network: `${a}.${b}.${c}.0/24` };
    }
    if (net.isIPv6(s)) {
        const g = expandIPv6(s);
        if (g.slice(0, 7).every(x => x === '0') && (g[7] === '1' || g[7] === '0')) return null;
        return { address: `${g.slice(0, 4).join(':')}::/64`, network: `${g.slice(0, 3).join(':')}::/48` };
    }
    return null;
}

// Eight hextets without leading zeros. Input has already passed net.isIPv6.
function expandIPv6(input) {
    let s = input.split('%')[0].toLowerCase();
    const v4 = s.match(/(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
    if (v4) {
        const [o1, o2, o3, o4] = v4.slice(1).map(Number);
        s = s.slice(0, -v4[0].length) + `${((o1 << 8) | o2).toString(16)}:${((o3 << 8) | o4).toString(16)}`;
    }
    const [head, tail] = s.split('::');
    const h = head ? head.split(':') : [];
    let groups = h;
    if (tail !== undefined) {
        const t = tail ? tail.split(':') : [];
        groups = [...h, ...Array(8 - h.length - t.length).fill('0'), ...t];
    }
    return groups.map(x => parseInt(x, 16).toString(16));
}

// ── Tally over opaque ids ──────────────────────────────────────────────

const F_DECLARED_BOT = 1;
const F_PAGE = 2;
const F_PROBE = 4;
const F_BEACON = 8;

/**
 * Counts for one day. Keyed by the address+UA id (the finest identity); each record carries
 * the coarser ids so every identity can be counted from the same records.
 *
 * Bounded: past maxRecords, new visitors are dropped and `truncated` is set, so a flood of
 * spoofed User-Agents cannot grow memory without limit.
 */
export class VisitorTally {
    constructor({ maxRecords = 50_000 } = {}) {
        this.maxRecords = maxRecords;
        this.records = new Map();   // addressUa -> { a, n, f, p, m }
        this.requests = 0;
        this.unresolved = 0;
        this.truncated = false;
    }

    _record(ids) {
        let r = this.records.get(ids.addressUa);
        if (!r) {
            if (this.records.size >= this.maxRecords) {
                this.truncated = true;
                return null;
            }
            r = { a: ids.address, n: ids.network, f: 0, p: 0, m: 0 };
            this.records.set(ids.addressUa, r);
        }
        return r;
    }

    /** ids: { address, network, addressUa }, or null for an unresolvable client address. */
    addRequest(ids, cls) {
        this.requests++;
        if (!ids) {
            this.unresolved++;
            return;
        }
        const r = this._record(ids);
        if (!r) return;
        if (cls.declaredBot) r.f |= F_DECLARED_BOT;
        if (cls.probe) r.f |= F_PROBE;
        if (cls.page) {
            r.f |= F_PAGE;
            r.p++;
        }
        if (cls.miss) r.m++;
    }

    // A beacon proves JavaScript ran, but not that a page was served: a caller can POST one
    // directly. So it never sets the page flag; js_confirmed needs both.
    addBeacon(ids) {
        if (!ids) return;
        const r = this._record(ids);
        if (r) r.f |= F_BEACON;
    }

    _taintedAddresses() {
        const misses = new Map();
        const tainted = new Set();
        for (const r of this.records.values()) {
            if (r.f & F_PROBE) tainted.add(r.a);
            misses.set(r.a, (misses.get(r.a) || 0) + r.m);
        }
        for (const [a, m] of misses) if (m >= MISS_THRESHOLD) tainted.add(a);
        return tainted;
    }

    // How many tiers this record passes, in order; tiers are nested, so stop at the first miss.
    static _level(r, tainted) {
        if (r.f & F_DECLARED_BOT) return 1;
        if (!(r.f & F_PAGE)) return 2;
        if (tainted.has(r.a)) return 3;
        if (!(r.f & F_BEACON)) return 4;
        return 5;
    }

    counts() {
        const tainted = this._taintedAddresses();
        const sets = TIER_KEYS.map(() => ({ network: new Set(), address: new Set(), address_ua: new Set() }));
        const pageViews = TIER_KEYS.map(() => 0);
        const userAgentsPerAddress = new Map();   // among page viewers

        for (const [addressUa, r] of this.records) {
            const level = VisitorTally._level(r, tainted);
            for (let i = 0; i < level; i++) {
                sets[i].network.add(r.n);
                sets[i].address.add(r.a);
                sets[i].address_ua.add(addressUa);
                pageViews[i] += r.p;
            }
            if (level >= 3) userAgentsPerAddress.set(r.a, (userAgentsPerAddress.get(r.a) || 0) + 1);
        }

        const uniqueVisitors = {};
        const views = {};
        TIER_KEYS.forEach((tier, i) => {
            uniqueVisitors[tier] = Object.fromEntries(IDENTITY_KEYS.map(k => [k, sets[i][k].size]));
            views[tier] = pageViews[i];
        });

        const perAddress = [...userAgentsPerAddress.values()];
        return {
            uniqueVisitors,
            pageViews: views,
            addressSharing: {
                pageViewerAddresses: perAddress.length,
                withSeveralUserAgents: perAddress.filter(n => n > 1).length,
                mostUserAgentsAtOneAddress: perAddress.length ? Math.max(...perAddress) : 0,
            },
            clientAddress: {
                requests: this.requests,
                unresolved: this.unresolved,
                // Near 1 means the proxy is not passing X-Forwarded-For and every count is wrong.
                unresolvedShare: this.requests ? +(this.unresolved / this.requests).toFixed(3) : null,
            },
            truncated: this.truncated,
        };
    }

    toJSON() {
        return {
            requests: this.requests,
            unresolved: this.unresolved,
            truncated: this.truncated,
            records: [...this.records].map(([k, r]) => [k, r.a, r.n, r.f, r.p, r.m]),
        };
    }

    static fromJSON(obj, opts) {
        const t = new VisitorTally(opts);
        if (!obj || typeof obj !== 'object') return t;
        t.requests = Number.isFinite(obj.requests) ? obj.requests : 0;
        t.unresolved = Number.isFinite(obj.unresolved) ? obj.unresolved : 0;
        t.truncated = obj.truncated === true;
        for (const row of Array.isArray(obj.records) ? obj.records : []) {
            if (!Array.isArray(row) || row.length < 6) continue;
            const [k, a, n, f, p, m] = row;
            t.records.set(k, { a, n, f: f | 0, p: p | 0, m: m | 0 });
        }
        return t;
    }
}

// ── Store: salt, persistence, rollover ─────────────────────────────────

export function utcDate(d) {
    return d.toISOString().slice(0, 10);
}

const SALT_FILE = '.visitor-salt.json';
const TODAY_FILE = 'visitors_today.json';
const HISTORY_FILE = 'visitors_history.jsonl';

// Distinct from the async flush's `.tmp`, so a shutdown flush cannot rename the file out from
// under an async flush that is still writing.
function writeFileAtomicSync(file, data, mode) {
    const tmp = `${file}.sync.tmp`;
    writeFileSync(tmp, data, { mode });
    renameSync(tmp, file);
}

function readJsonSync(file) {
    try {
        return JSON.parse(readFileSync(file, 'utf-8'));
    } catch {
        return null;
    }
}

/**
 * One day's tally plus what it takes to keep it honest across restarts and midnights.
 *
 * Files in `dir`:
 *   .visitor-salt.json      today's salt, mode 0600; overwritten at rollover so yesterday's
 *                           hashes can no longer be linked to an address
 *   visitors_today.json     the live tally, flushed every flushMs and at shutdown
 *   visitors_history.jsonl  one line of counts per finished day; no hashes
 *
 * Analytics must never take the site down, so every file operation here swallows its error
 * and logs it; the worst outcome is a lost or partial count.
 */
export class VisitorStore {
    constructor({ dir, now = () => new Date(), flushMs = 30_000, maxRecords } = {}) {
        this.dir = dir;
        this.now = now;
        this.maxRecords = maxRecords;
        this.dirty = false;
        this.flushing = null;
        try {
            mkdirSync(dir, { recursive: true });
        } catch (err) {
            console.error('[Visitors] Could not create log dir:', err.message);
        }

        this.lastHistoryDate = this._readLastHistoryDate();
        this.date = utcDate(this.now());
        this.salt = this._loadOrCreateSalt(this.date);

        const saved = readJsonSync(path.join(dir, TODAY_FILE));
        if (saved?.date === this.date) {
            this.tally = VisitorTally.fromJSON(saved.tally, { maxRecords });
        } else {
            // A tally from a day that ended while the server was down: finish it now.
            if (saved?.date && saved.date < this.date) {
                this._appendHistory(saved.date, VisitorTally.fromJSON(saved.tally, { maxRecords }));
            }
            this.tally = new VisitorTally({ maxRecords });
            this.dirty = true;
        }

        if (flushMs > 0) {
            this.timer = setInterval(() => {
                this.flush().catch(err => console.error('[Visitors] flush failed:', err.message));
            }, flushMs);
            this.timer.unref();
        }
    }

    _loadOrCreateSalt(date) {
        const file = path.join(this.dir, SALT_FILE);
        const saved = readJsonSync(file);
        if (saved?.date === date && typeof saved.salt === 'string' && saved.salt.length >= 32) {
            return Buffer.from(saved.salt, 'hex');
        }
        const salt = crypto.randomBytes(32);
        try {
            writeFileAtomicSync(file, JSON.stringify({ date, salt: salt.toString('hex') }), 0o600);
        } catch (err) {
            // Still usable in memory; a restart today would just split the day's counts.
            console.error('[Visitors] Could not persist salt:', err.message);
        }
        return salt;
    }

    _readLastHistoryDate() {
        try {
            const lines = readFileSync(path.join(this.dir, HISTORY_FILE), 'utf-8').trim().split('\n');
            return JSON.parse(lines[lines.length - 1]).date || null;
        } catch {
            return null;
        }
    }

    _appendHistory(date, tally) {
        // Idempotent: a restart or a late flush must not record the same day twice.
        if (this.lastHistoryDate && this.lastHistoryDate >= date) return;
        const line = { date, definitionsVersion: DEFINITIONS_VERSION, ...tally.counts() };
        try {
            appendFileSync(path.join(this.dir, HISTORY_FILE), JSON.stringify(line) + '\n');
            this.lastHistoryDate = date;
        } catch (err) {
            console.error('[Visitors] Could not append history:', err.message);
        }
    }

    _roll() {
        const today = utcDate(this.now());
        if (today === this.date) return;
        this._appendHistory(this.date, this.tally);
        this.date = today;
        this.salt = this._loadOrCreateSalt(today);
        this.tally = new VisitorTally({ maxRecords: this.maxRecords });
        this.dirty = true;
    }

    _hash(kind, value) {
        return crypto.createHmac('sha256', this.salt).update(`${kind}\n${value}`).digest('hex').slice(0, 16);
    }

    /**
     * Today's ids for one client. `visitorId` is always set (the address id, or a hash of the
     * raw value when the address is unresolvable) so the legacy access-log field keeps a value.
     */
    idsFor(ip, userAgent) {
        this._roll();
        const k = addressKeys(ip);
        if (!k) return { resolved: false, visitorId: this._hash('raw', String(ip)), ids: null };
        const address = this._hash('address', k.address);
        return {
            resolved: true,
            visitorId: address,
            ids: {
                address,
                network: this._hash('network', k.network),
                addressUa: this._hash('address_ua', `${k.address}\n${userAgent || ''}`),
            },
        };
    }

    recordRequest(who, cls) {
        this.tally.addRequest(who.ids, cls);
        this.dirty = true;
    }

    recordBeacon(who) {
        this.tally.addBeacon(who.ids);
        this.dirty = true;
    }

    snapshot() {
        this._roll();
        return { date: this.date, definitionsVersion: DEFINITIONS_VERSION, ...this.tally.counts() };
    }

    async history(days) {
        if (days <= 0) return [];
        try {
            const text = await fs.readFile(path.join(this.dir, HISTORY_FILE), 'utf-8');
            return text.trim().split('\n').slice(-days).flatMap(line => {
                try { return [JSON.parse(line)]; } catch { return []; }
            });
        } catch {
            return [];
        }
    }

    _payload() {
        return JSON.stringify({ date: this.date, tally: this.tally });
    }

    async flush() {
        this._roll();
        if (!this.dirty || this.flushing) return this.flushing;
        this.dirty = false;
        const file = path.join(this.dir, TODAY_FILE);
        const tmp = `${file}.tmp`;
        this.flushing = (async () => {
            try {
                await fs.writeFile(tmp, this._payload());
                await fs.rename(tmp, file);
            } catch (err) {
                this.dirty = true;
                console.error('[Visitors] Could not save tally:', err.message);
            } finally {
                this.flushing = null;
            }
        })();
        return this.flushing;
    }

    // For shutdown: pm2 sends SIGKILL 1.6 s after SIGINT, too soon for anything async.
    flushSync() {
        try {
            this._roll();
            writeFileAtomicSync(path.join(this.dir, TODAY_FILE), this._payload(), 0o644);
            this.dirty = false;
        } catch (err) {
            console.error('[Visitors] Could not save tally at shutdown:', err.message);
        }
    }

    stop() {
        if (this.timer) clearInterval(this.timer);
    }
}
