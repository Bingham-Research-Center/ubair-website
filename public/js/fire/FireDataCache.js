/* Small client-side cache for the fire-weather snapshot. 60-second TTL,
   used to avoid re-fetching when the user toggles map layers or revisits
   tabs within a short window. */

class FireDataCache {
    constructor(ttlMs = 60 * 1000) {
        this.ttlMs = ttlMs;
        this.snapshot = null;
        this.ts = 0;
    }
    isValid() {
        return this.snapshot && (Date.now() - this.ts) < this.ttlMs;
    }
    set(snapshot) {
        this.snapshot = snapshot;
        this.ts = Date.now();
    }
    get() {
        return this.isValid() ? this.snapshot : null;
    }
    clear() {
        this.snapshot = null;
        this.ts = 0;
    }
}

window.FireDataCache = FireDataCache;
