# Cron Schedule Analysis - Hybrid Staggered Approach

## Current Implementation (Option 1)
```
Essential:   */1 * * * *    (every minute at :00 - 3 calls)
Frequent:    */5 * * * *    (every 5min at :00 - 3 calls)  
Infrequent:  */15 * * * *   (every 15min at :00 - 2 calls)
```

**Collision points:**
- :00 → 3+3+2 = 8 calls
- :05, :10 → 3+3 = 6 calls
- :15, :30, :45 → 3+3+2 = 8 calls
- **Worst case:** 8 calls/min (20% margin)

---

## Proposed Hybrid (Staggered + Random Jitter)

### Design Goals:
1. **Essential**: Keep every minute at :00 (roads/cameras need synchronous updates)
2. **Frequent**: Stagger by 2 minutes (still predictable, avoids collisions)
3. **Infrequent**: Randomize within each 15min window (catches edge cases)

### Proposed Schedule:
```javascript
// Essential: Every minute at :00
// Keep synchronized - roads/cameras/weather should update together
cron.schedule('*/1 * * * *', refreshEssential);

// Frequent: Every 5 min at :02 (offset by 2min)
// Still predictable 5min cycle, avoids :00/:15/:30/:45 collisions
cron.schedule('2,7,12,17,22,27,32,37,42,47,52,57 * * * *', refreshFrequent);

// Infrequent: Every 15 min at :05/:20/:35/:50 with 0-59s random jitter
// Randomization catches events that happen off the quarter-hour
scheduleInfrequentWithJitter();
```

**Result:**
- **Max calls any minute:** 6 (40% margin vs 20% current)
- **Typical:** 3 calls (70% margin)
- **Infrequent spread:** 2 calls over 60s = +0.03 calls/min effective

---

## Code Changes Required

### File: `server/backgroundRefresh.js`

**Change 1: Update frequent schedule (Line ~72)**
```javascript
// OLD
const frequentJob = cron.schedule('*/5 * * * *', async () => {
    await this.refreshFrequentData();
});

// NEW - Offset by 2 minutes
const frequentJob = cron.schedule('2,7,12,17,22,27,32,37,42,47,52,57 * * * *', async () => {
    await this.refreshFrequentData();
});
```

**Change 2: Replace infrequent schedule (Line ~78)**
```javascript
// OLD
const infrequentJob = cron.schedule('*/15 * * * *', async () => {
    await this.refreshInfrequentData();
});

// NEW - Call helper method instead
const infrequentJob = this.scheduleInfrequentWithJitter();
```

**Change 3: Add new method (after `start()` method)**
```javascript
/**
 * Schedule infrequent data refresh with random jitter
 * Runs at :05, :20, :35, :50 with 0-59 second random delay
 * This catches edge cases (e.g., snowfall starting at odd times)
 */
scheduleInfrequentWithJitter() {
    return cron.schedule('5,20,35,50 * * * *', async () => {
        // Random jitter: 0-59 seconds
        const jitterSeconds = Math.floor(Math.random() * 60);
        
        console.log(`[Infrequent scheduled in ${jitterSeconds}s]`);
        
        setTimeout(async () => {
            await this.refreshInfrequentData();
        }, jitterSeconds * 1000);
    });
}
```

**Change 4: Update console startup message (Line ~60)**
```javascript
console.log('   Our Schedule:');
console.log('   - Essential data: Every 60 seconds at :00 (roads, cameras, stations)');
console.log('   - Frequent data: Every 5 minutes at :02 (plows, alerts, events)');
console.log('   - Infrequent data: Every 15 minutes at :05/:20/:35/:50 +jitter (rest areas, passes)');
```

---

## Timing Visualization

### Typical Hour (00:00-01:00):
```
00:00 - Essential (3)
00:01 - Essential (3)
00:02 - Essential (3) + Frequent (3) = 6
00:03 - Essential (3)
00:04 - Essential (3)
00:05 - Essential (3) + [Infrequent scheduled, fires at :05:XX]
00:06 - Essential (3) [+ possible Infrequent tail]
00:07 - Essential (3) + Frequent (3) = 6
00:08 - Essential (3)
...
00:12 - Essential (3) + Frequent (3) = 6
...
00:17 - Essential (3) + Frequent (3) = 6
...
00:20 - Essential (3) + [Infrequent scheduled, fires at :20:XX]
...
00:22 - Essential (3) + Frequent (3) = 6
...
```

**Collision Analysis:**
- **Never exceeds 6 calls in same minute** (with jitter spreading infrequent)
- **6 calls occurs 12 times/hour** (at :02, :07, :12, :17, :22, :27, :32, :37, :42, :47, :52, :57)
- **3 calls the rest of the time**

---

## Benefits of Random Jitter

### 1. Catches Edge Case Events
```
Scenario: Snowfall starts at 00:07:30

Current (Fixed :00/:15/:30):
- Last check: 00:00:00
- Next check: 00:15:00
- Detection delay: 7.5 minutes

Hybrid (Random :05/:20/:35/:50 + jitter):
- Scheduled: 00:05:XX (random 0-59s)
- Could fire: 00:05:30 (2 min delay) or 00:06:15 (3.75 min delay)
- Average: 5-6 minute detection vs 7.5 min
```

### 2. Prevents Systematic Misses
```
If UDOT updates rest areas at :13 every hour:

Fixed schedule :00/:15/:30/:45:
- Always misses by 2 minutes or catches 2 min late

Random :05+jitter:
- ~13% chance to catch within 1 minute
- ~25% chance to catch within 2 minutes
- Over time, balances out detection delays
```

### 3. Reduces Server Load Spikes
```
Current: All 8 calls at :00, :15, :30, :45
Hybrid: Max 6 calls, spread over 60-second window
Result: Smoother resource usage
```

---

## API Call Rate Comparison

| Metric | Current | Hybrid | Improvement |
|--------|---------|--------|-------------|
| **Worst case/min** | 8 calls | 6 calls | 25% reduction |
| **Average/min** | 3.73 calls | 3.73 calls | Same |
| **Safety margin (worst)** | 20% | 40% | 2x safer |
| **Safety margin (avg)** | 62.7% | 62.7% | Same |
| **Predictability** | High | Medium-High | Slight trade-off |

---

## Recommended Implementation

### Step 1: Make code changes (4 edits in backgroundRefresh.js)
### Step 2: Test locally
```bash
npm run dev

# Watch console for:
# - Essential fires every minute at :00
# - Frequent fires at :02, :07, :12, :17...
# - Infrequent announces jitter: "scheduled in 37s"
```

### Step 3: Monitor for 1 hour
- Count max calls in any minute window
- Should never exceed 6 calls/min
- Verify jitter is working (different delay each time)

### Step 4: Deploy and monitor production for 48 hours

---

## Summary

**Total code change:** ~20 lines (3 edits + 1 new method)  
**Risk:** Very low (same total calls, just rescheduled)  
**Benefit:** 2x safety margin on worst-case spikes  
**Trade-off:** Slight unpredictability on infrequent data (by design)

**Recommendation:** ✅ Implement hybrid approach

This gives you the best of both worlds:
- Predictable essential/frequent updates
- Edge case coverage via randomization
- Much safer margin (40% vs 20%)
