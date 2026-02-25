# API Rate Calculations - PR #51 Current Implementation

## Cron Schedules (from code)
```
Essential:   */1 * * * *     (every 1 minute)
Frequent:    */5 * * * *     (every 5 minutes)  
Infrequent:  */15 * * * *    (every 15 minutes)
```

## API Calls Per Job
```
Essential:   3 calls (roads + cameras + weather stations)
Frequent:    3 calls (snow plows + alerts + events)
Infrequent:  2 calls (rest areas + mountain passes)
                      [digital signs removed - was 404]
```

---

## PER-HOUR CALCULATION

### Essential (every 1 minute):
- Runs: 60 times per hour (at :00, :01, :02... :59)
- Calls: 3 × 60 = **180 calls/hour**

### Frequent (every 5 minutes):
- Runs: 12 times per hour (at :00, :05, :10, :15, :20, :25, :30, :35, :40, :45, :50, :55)
- Calls: 3 × 12 = **36 calls/hour**

### Infrequent (every 15 minutes):
- Runs: 4 times per hour (at :00, :15, :30, :45)
- Calls: 2 × 4 = **8 calls/hour**

### TOTAL PER HOUR:
**180 + 36 + 8 = 224 calls/hour**

### AVERAGE PER MINUTE:
**224 ÷ 60 = 3.733 calls/minute**

---

## WORST-CASE MINUTE-BY-MINUTE ANALYSIS

### Collision Points (when multiple jobs fire simultaneously):

| Minute | Essential | Frequent | Infrequent | Total | Notes |
|--------|-----------|----------|------------|-------|-------|
| :00 | 3 | 3 | 2 | **8** | 🔴 Worst case |
| :01-:04 | 3 | - | - | **3** | |
| :05 | 3 | 3 | - | **6** | |
| :06-:09 | 3 | - | - | **3** | |
| :10 | 3 | 3 | - | **6** | |
| :11-:14 | 3 | - | - | **3** | |
| :15 | 3 | 3 | 2 | **8** | 🔴 Worst case |
| :16-:19 | 3 | - | - | **3** | |
| :20 | 3 | 3 | - | **6** | |
| :21-:24 | 3 | - | - | **3** | |
| :25 | 3 | 3 | - | **6** | |
| :26-:29 | 3 | - | - | **3** | |
| :30 | 3 | 3 | 2 | **8** | 🔴 Worst case |
| :31-:34 | 3 | - | - | **3** | |
| :35 | 3 | 3 | - | **6** | |
| :36-:39 | 3 | - | - | **3** | |
| :40 | 3 | 3 | - | **6** | |
| :41-:44 | 3 | - | - | **3** | |
| :45 | 3 | 3 | 2 | **8** | 🔴 Worst case |
| :46-:49 | 3 | - | - | **3** | |
| :50 | 3 | 3 | - | **6** | |
| :51-:54 | 3 | - | - | **3** | |
| :55 | 3 | 3 | - | **6** | |
| :56-:59 | 3 | - | - | **3** | |

---

## SUMMARY STATISTICS

### Distribution per hour:
- **8 calls/min:** 4 occurrences (at :00, :15, :30, :45) = 6.67% of time
- **6 calls/min:** 8 occurrences (at :05, :10, :20, :25, :35, :40, :50, :55) = 13.33% of time
- **3 calls/min:** 48 occurrences (all other minutes) = 80% of time

### Key Metrics:

| Metric | Value | vs UDOT Limit (10/min) |
|--------|-------|------------------------|
| **Worst case** | 8 calls/min | 80% of limit (20% margin) |
| **Average** | 3.733 calls/min | 37.33% of limit (62.67% margin) |
| **Per hour** | 224 calls | N/A |
| **Per day** | 5,376 calls | N/A |

### UDOT Rate Limit Compliance:
- ✅ **Never exceeds** 10 calls/minute
- ✅ **Worst case:** 8 calls = 80% of limit (2 call buffer)
- ✅ **Average:** 3.7 calls = 37% of limit (6.3 call buffer)
- ⚠️ **Tight margin** at collision points (:00, :15, :30, :45)
- ✅ **Predictable** and deterministic schedule

---

## SAFETY ANALYSIS

### Headroom Calculation:

**Worst-case headroom:**
```
(10 - 8) / 10 = 0.20 = 20% headroom
```

**Average headroom:**
```
(10 - 3.733) / 10 = 0.6267 = 62.67% headroom
```

### Risk Assessment:

| Risk Level | Condition | Status |
|------------|-----------|--------|
| 🔴 Critical | >10 calls/min | ✅ Never occurs |
| 🟡 Warning | >9 calls/min (90% limit) | ✅ Never occurs |
| 🟢 Safe | <8 calls/min (80% limit) | ✅ 93.33% of time |

### Collision Analysis:

**15-minute pattern repeats:**
```
:00 → 8 calls (collision: E+F+I)
:01 → 3 calls
:02 → 3 calls
:03 → 3 calls
:04 → 3 calls
:05 → 6 calls (collision: E+F)
:06-:09 → 3 calls each
:10 → 6 calls (collision: E+F)
:11-:14 → 3 calls each
:15 → 8 calls (collision: E+F+I)
[pattern repeats]
```

**4 worst-case spikes per hour** at quarter-hour marks

---

## STARTUP BEHAVIOR

### Initial Fetch (on server start):
```javascript
await Promise.all([
    refreshEssentialData(),   // 3 calls
    refreshFrequentData(),    // 3 calls
    refreshInfrequentData()   // 2 calls
]);
```

**Startup spike:** 8 calls distributed over ~2 seconds (parallelized)
- Still under 10/minute limit
- Same as worst-case regular operation
- ✅ Safe

---

## COMPARISON TO HYBRID SCHEDULE

| Metric | Current (PR #51) | Hybrid (Proposed) | Improvement |
|--------|------------------|-------------------|-------------|
| Worst case/min | 8 calls | 6 calls | -25% |
| Average/min | 3.733 calls | 3.733 calls | 0% |
| Safety margin (worst) | 20% | 40% | +100% |
| Safety margin (avg) | 62.67% | 62.67% | 0% |
| Collision frequency | 4/hour (8-call) | 0/hour (8-call) | -100% |
| Predictability | High | Medium-High | Slight decrease |

---

## VERDICT

**Current PR #51 Implementation:**
- ✅ **Compliant** with UDOT 10 calls/60s limit
- ✅ **Safe** with 20% worst-case margin
- ✅ **Conservative** with 62.67% average margin
- ⚠️ **Tight** during 4 quarterly spikes per hour
- ✅ **Acceptable** for production deployment

**Recommendation:** 
- Current implementation is **SAFE TO MERGE**
- Hybrid schedule provides **additional safety margin** if desired
- Both approaches are production-ready
