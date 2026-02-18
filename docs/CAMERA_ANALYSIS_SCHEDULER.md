# Camera Analysis Scheduler Implementation

## Problem Statement

Camera snow detection was analyzing all 20-30 cameras (with 3 views each = 60-90 API calls) on every `/api/road-weather` request. With auto-refresh every 5 minutes and multiple users, this caused:

- **~1,000 API calls per hour per user**
- **UDOT API rate limit warnings** (limit: 600 calls/hour)
- Poor user experience due to slow responses

## Solution

Implemented a staggered camera analysis scheduler that:

1. **Analyzes cameras in background** - 1 camera every 30 seconds
2. **Caches results for 10 minutes** - All user requests served from cache
3. **Maintains quality** - Still analyzes all 3 views per camera for multi-view consensus
4. **Stays under rate limit** - ~360 calls/hour (60% of UDOT limit)

## Architecture

### Files Created/Modified

1. **NEW**: `server/cameraAnalysisScheduler.js`
   - Main scheduler class
   - Manages staggered camera analysis queue
   - Handles batch-level caching (10 min TTL)
   - Provides cache hit statistics

2. **MODIFIED**: `server/roadWeatherService.js`
   - Constructor accepts optional `cameraAnalysisScheduler` parameter
   - `getCompleteRoadData()` now fetches from cache instead of analyzing on-demand
   - Falls back to direct analysis if scheduler not available (backwards compatibility)

3. **MODIFIED**: `server/backgroundRefresh.js`
   - Creates and manages `CameraAnalysisScheduler` instance
   - Passes scheduler to `RoadWeatherService` constructor
   - Updates camera list on every essential data refresh (60s interval)
   - Starts/stops scheduler with background refresh service

4. **MODIFIED**: `server/routes/roadWeather.js`
   - Exports `setRoadWeatherService()` function
   - Allows server.js to inject shared service instance
   - Ensures all routes use same scheduler

5. **MODIFIED**: `server/server.js`
   - Initializes `BackgroundRefreshService` early
   - Calls `setRoadWeatherService()` to share instance with routes
   - Single source of truth for service instances

6. **NEW**: `server/__tests__/cameraAnalysisScheduler.test.js`
   - 21 comprehensive tests
   - Tests initialization, caching, rate limits, statistics
   - All tests passing ✅

## How It Works

### Initialization Flow

```
server.js startup
  ↓
BackgroundRefreshService created
  ↓
CameraAnalysisScheduler created
  ↓
RoadWeatherService created (with scheduler)
  ↓
Service shared with routes
  ↓
Background refresh starts
  ↓
Scheduler starts
```

### Analysis Cycle

```
Every 60 seconds (Essential Data Refresh):
  ↓
Fetch cameras & weather stations from UDOT
  ↓
Update scheduler camera queue
  ↓
  
Every 30 seconds (Scheduler Cycle):
  ↓
Pick next 1 camera from queue
  ↓
Analyze all 3 views (3 API calls)
  ↓
Calculate multi-view consensus
  ↓
Cache individual result
  ↓
Update batch cache when rotation complete
```

### User Request Flow

```
User: GET /api/road-weather
  ↓
roadWeatherService.getCompleteRoadData()
  ↓
cameraAnalysisScheduler.getCachedResults()
  ↓
Return cached data (instant, no API calls)
  ↓
Response sent to user
```

## API Call Reduction

### Before (Old Behavior)

- **Per Request**: 60-90 API calls (20-30 cameras × 3 views)
- **User Requests**: ~12 requests/hour (5 min auto-refresh)
- **Total**: ~1,000 calls/hour per user
- **Problem**: Exceeds UDOT rate limit (600 calls/hour)

### After (New Behavior)

- **Per Request**: 0 API calls (served from cache)
- **Background Analysis**: 1 camera × 3 views every 30 seconds
- **Total**: ~360 calls/hour (all users combined)
- **Result**: 60% of UDOT limit, instant responses

## Configuration

### Scheduler Settings

Located in `server/cameraAnalysisScheduler.js`:

```javascript
this.config = {
    batchSize: 1,           // Analyze 1 camera per cycle
    intervalSeconds: 30,    // Run every 30 seconds
    maxRetries: 3           // Retry failed analyses
};
```

### Cache Settings

```javascript
// 10 minute TTL for camera results
this.cache = new NodeCache({ stdTTL: 600, checkperiod: 60 });
```

## Statistics & Monitoring

The scheduler tracks:

- Total analyses performed
- Failed analyses
- Cache hits/misses
- Cache hit rate
- Average analysis time
- Estimated API calls per hour

Access via:

```javascript
const stats = cameraAnalysisScheduler.getStats();
cameraAnalysisScheduler.printStats(); // Console output
```

## Testing

Run tests:

```bash
npm test -- cameraAnalysisScheduler.test.js
```

Test coverage:
- ✅ Initialization
- ✅ Camera list updates
- ✅ Cache operations
- ✅ API call rate calculation
- ✅ Statistics tracking
- ✅ Start/stop operations
- ✅ Rate limit compliance

## Future Considerations

### If Rate Limits Become an Issue

1. **Increase interval**: Change `intervalSeconds` from 30 to 60
2. **Reduce views**: Analyze 1-2 views instead of all 3 (may reduce accuracy)
3. **Intelligent skipping**: Skip cameras with no recent changes

### If Faster Updates Needed

1. **Increase batch size**: Change `batchSize` from 1 to 2
2. **Decrease interval**: Change `intervalSeconds` from 30 to 20
3. **Watch rate limit**: Monitor `estimatedApiCallsPerHour` in stats

### Adding New Routes

If adding new routes that need camera data:

```javascript
// DON'T: Create new instance
const service = new RoadWeatherService(); // ❌

// DO: Use shared instance
import { setRoadWeatherService } from './routes/roadWeather.js';
// Service injected by server.js ✅
```

## Troubleshooting

### Camera data not updating

Check:
1. Is background refresh running?
2. Is scheduler running? (check logs for "Camera analysis scheduler started")
3. Are cameras in the queue? (check stats: `cameraQueue` count)
4. Any failed analyses? (check stats: `failedAnalyses` count)

### High cache miss rate

Possible causes:
1. Cache TTL too short (default 10 min)
2. Cameras changing faster than analysis cycle
3. Not enough time for full rotation through all cameras

### Rate limit warnings

Check `estimatedApiCallsPerHour` in stats. Should be <600.
If too high:
- Increase `intervalSeconds`
- Decrease `batchSize`

## References

- Issue: "Camera analysis hitting UDOT API rate limits"
- UDOT API Documentation: Rate limit is 10 calls/60 seconds
- Implementation PR: #[PR_NUMBER]
