import { beforeEach, afterEach, describe, expect, it, jest } from '@jest/globals';

const fetch = jest.fn();
jest.unstable_mockModule('node-fetch', () => ({ default: fetch }));
let service;
let RoadWeatherService;

beforeEach(async () => {
    jest.resetModules();
    fetch.mockReset();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    ({ default: RoadWeatherService } = await import('../roadWeatherService.js'));
    service = new RoadWeatherService({ getCachedResults: () => [] });
    jest.spyOn(service, 'loadHRRRForecast').mockReturnValue(null);
});

afterEach(() => jest.restoreAllMocks());

const updated = '2026-09-29T12:00:00.000Z';
const road = { id: 'real-road', name: 'US-40', coordinates: [[40.3, -110], [40.4, -110]],
    source: 'UDOT', cached: false, lastUpdated: updated, condition: { condition: 'gray', status: 'No Data' } };

function otherFeeds() {
    jest.spyOn(service, 'fetchUDOTCameras').mockResolvedValue([{ id: 'camera', lastUpdated: updated }]);
    jest.spyOn(service, 'fetchUDOTWeatherStations').mockResolvedValue([{ id: 'station', lastUpdated: updated }]);
}

describe('road weather availability', () => {
    it('keeps successful camera refreshes when the background road fetch fails', async () => {
        const { default: BackgroundRefreshService } = await import('../backgroundRefresh.js');
        otherFeeds();
        jest.spyOn(service, 'fetchUDOTRoadConditions').mockRejectedValue(new Error('offline'));
        const background = { roadWeatherService: service,
            cameraAnalysisScheduler: { updateCameraList: jest.fn() },
            stats: { errors: { essential: 0 }, lastRefresh: {}, refreshCount: { essential: 0 } } };
        await BackgroundRefreshService.prototype.refreshEssentialData.call(background);
        expect(background.cameraAnalysisScheduler.updateCameraList).toHaveBeenCalledWith(
            [{ id: 'camera', lastUpdated: updated }], [{ id: 'station', lastUpdated: updated }]);
        expect(background.stats.errors.essential).toBe(1);
    });
    it.each(['fetchUDOTRoadConditions', 'fetchUDOTCameras', 'fetchUDOTWeatherStations'])(
        '%s reports HTTP and network failures instead of empty success', async method => {
            fetch.mockResolvedValueOnce({ ok: false, status: 503 }).mockRejectedValueOnce(new Error('offline'));
            await expect(service[method]()).rejects.toThrow('503');
            await expect(service[method]()).rejects.toThrow('offline');
        }
    );

    it.each(['failure', 'empty'])('preserves other feeds on road %s and never fabricates roads', async mode => {
        otherFeeds();
        const roads = jest.spyOn(service, 'fetchUDOTRoadConditions');
        if (mode === 'failure') roads.mockRejectedValue(new Error('offline'));
        else roads.mockResolvedValue([]);
        // Even a real forecast must not fill an unavailable observed road layer.
        service.loadHRRRForecast.mockReturnValue({ init_time: updated });
        jest.spyOn(service, 'buildAdditionalRoadSegmentsFromHRRR').mockReturnValue([{ id: 'hrrr-road' }]);
        const data = await service.getCompleteRoadData();
        expect(data).toMatchObject({ status: 'unavailable', lastUpdated: null, segments: [],
            cameras: [{ id: 'camera' }], stations: [{ id: 'station' }], sources: { roads: { status: 'unavailable' } } });
        expect(service.buildAdditionalRoadSegmentsFromHRRR).not.toHaveBeenCalled();
    });

    it('keeps the original road timestamp after a failed refresh', async () => {
        otherFeeds();
        jest.spyOn(service, 'fetchUDOTRoadConditions').mockResolvedValueOnce([road]).mockRejectedValueOnce(new Error('offline'));
        const first = await service.getCompleteRoadData();
        expect(first).toMatchObject({ status: 'available', lastUpdated: updated });
        expect(first.segments[0]).toMatchObject({ source: 'UDOT', cached: false, lastUpdated: updated });
        expect(await service.getCompleteRoadData()).toMatchObject({ status: 'unavailable', lastUpdated: updated, segments: [] });
    });

    it('does not lose roads when the camera or station feed fails', async () => {
        jest.spyOn(service, 'fetchUDOTRoadConditions').mockResolvedValue([{ ...road, cached: true }]);
        jest.spyOn(service, 'fetchUDOTCameras').mockRejectedValue(new Error('offline'));
        jest.spyOn(service, 'fetchUDOTWeatherStations').mockRejectedValue(new Error('offline'));
        const data = await service.getCompleteRoadData();
        expect(data.status).toBe('cached');
        expect(data.segments).toHaveLength(1);
        expect(data.sources.cameras.status).toBe('unavailable');
        expect(data.sources.stations.status).toBe('unavailable');
    });

    it('labels a real UDOT cache read and preserves its timestamp', async () => {
        fetch.mockResolvedValue({ ok: true, json: async () => [{
            Id: 'udot-test', RoadwayName: 'US-40', EncodedPolyline: '_||tF~vkbT_pR~oR',
            LastUpdated: Date.parse(updated) / 1000, RoadCondition: 'Dry', WeatherCondition: 'Fair', Restriction: ''
        }] });
        const fresh = await service.fetchUDOTRoadConditions();
        expect(fresh).toHaveLength(1);
        expect(fresh[0]).toMatchObject({ source: 'UDOT', cached: false, lastUpdated: updated });
        const cached = await service.fetchUDOTRoadConditions();
        expect(cached[0]).toMatchObject({ source: 'UDOT', cached: true, lastUpdated: updated });
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('returns a 503 with availability and last-good time when assembly fails', async () => {
        const { default: router, setRoadWeatherService } = await import('../routes/roadWeather.js');
        setRoadWeatherService({ lastRoadConditionsUpdate: updated,
            getCompleteRoadData: jest.fn().mockRejectedValue(new Error('assembly failed')) });
        const response = { status: jest.fn().mockReturnThis(), json: jest.fn() };
        await router.stack.find(layer => layer.route?.path === '/road-weather').route.stack[0].handle({}, response);
        expect(response.status).toHaveBeenCalledWith(503);
        expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ status: 'unavailable', lastUpdated: updated, segments: [] }));
    });
});

describe('missing readings', () => {
    it.each([
        [{ temperature: -2, precipitation: 1 }, 'red'],
        [{ temperature: 1, precipitation: 1 }, 'yellow'],
        [{ snowfall: 1 }, 'yellow'],
        [{ visibility: 0 }, 'yellow'],
        [{ windSpeed: 20 }, 'yellow']
    ])('retains hazards supported by partial weather: %j', (readings, color) => {
        const weather = { temperature: null, precipitation: null, snowfall: null, windSpeed: null, visibility: null, ...readings };
        expect(service.estimateRoadCondition({ route: 'US-40', name: 'US-40' }, weather).condition).toBe(color);
    });

    it('keeps a freezing HRRR contribution when visibility is missing', () => {
        const forecast = { points: [{ lat: 40.3, lon: -110, temp_2m: -2, precip_1hr: 1, precip_type: 'rain', wind_speed_10m: 0 }] };
        expect(service.gatherSourcesForSegment(road, forecast, [], [])).toContainEqual(
            expect.objectContaining({ name: 'hrrr', condition: 'red' }));
    });

    it('does not interpret missing temperature or visibility as zero', () => {
        const weather = { temperature: null, precipitation: 1, snowfall: 0, windSpeed: 0, visibility: null };
        expect(service.estimateRoadCondition({ route: 'US-40', name: 'US-40' }, weather).condition).toBe('gray');
        expect(service.estimateRoadCondition({ route: 'US-40', name: 'US-40' }, { ...weather, temperature: 10, visibility: 10000 }).condition).toBe('green');
    });

    it('does not turn missing rest-area capacity into zero or an invented total', async () => {
        fetch.mockResolvedValue({ ok: true, json: async () => [
            { Id: 1, Latitude: 40.3, Longitude: -110, CarStalls: null, TruckStalls: '4' },
            { Id: 2, Latitude: 40.3, Longitude: -110, CarStalls: '0', TruckStalls: '4' }
        ] });
        const areas = await service.fetchUDOTRestAreas();
        expect(areas[0]).toMatchObject({ carStalls: null, truckStalls: 4, totalStalls: null });
        expect(areas[1]).toMatchObject({ carStalls: 0, truckStalls: 4, totalStalls: 4 });
    });
    it('never substitutes mild weather after both weather providers fail', async () => {
        jest.spyOn(service, 'fetchOpenMeteoData').mockResolvedValue(null);
        expect(await service.getCurrentWeatherCondition()).toBeNull();
        expect(service.estimateRoadCondition({}, null)).toMatchObject({ condition: 'gray', status: 'No Data' });
    });

    it('leaves missing and unknown road and station reports unknown', () => {
        expect(service.mapUDOTConditionToColor(null, null, null).condition).toBe('gray');
        expect(service.mapUDOTConditionToColor('Unknown', 'Unknown', '').condition).toBe('gray');
        expect(service.determineStationCondition({}).condition).toBe('gray');
        expect(service.determineStationCondition({ SurfaceStatus: 'Unknown' }).condition).toBe('gray');
        expect(service.determineRoadCondition({}).condition).toBe('gray');
        expect(service.determineStationCondition({ SurfaceStatus: 'Dry' }).condition).toBe('green');
        expect(service.cameraSnowLevelToCondition('unknown').condition).toBe('gray');
        expect(service.cameraSnowLevelToCondition('none').condition).toBe('green');
    });

    it('requires a reported pass status or surface before reporting open', () => {
        expect(service.determinePassStatus({})).toBe('unknown');
        expect(service.determinePassStatus({ SurfaceStatus: 'Unknown', AirTemperature: 50 })).toBe('unknown');
        expect(service.determinePassStatus({ SurfaceStatus: 'Dry' })).toBe('open');
        expect(service.determinePassStatus({ SeasonalInfo: [{ SeasonalClosureStatus: 'CLOSED' }] })).toBe('closed');
    });

    it('does not invent HRRR wind, precipitation or visibility and preserves zero visibility', () => {
        const forecast = { points: [{ lat: 40, lon: -110, temp_2m: 10 }] };
        const partial = service.getHRRRConditionAtPoint(40, -110, forecast);
        expect(partial).toMatchObject({ precipitation: null, windSpeed: null, visibility: null });
        expect(service.estimateRoadCondition({}, partial).condition).toBe('gray');
        forecast.points[0].visibility = 0;
        expect(service.getHRRRConditionAtPoint(40, -110, forecast).visibility).toBe(0);
    });
});
