import fs from 'fs';
import {
    COLD_AMBER_F,
    COLD_RED_F,
    FLOOR_BOX,
    FORECAST_GUST_AMBER_MPH,
    FORECAST_GUST_RED_MPH,
    GUST_MPH,
    NEW_SNOW_AMBER_IN,
    NEW_SNOW_RED_IN,
    OUTLOOK_CURRENT_DAYS,
    PRECIP_BANDS,
    SUSTAINED_MPH,
    bandType,
    forecastLight,
    forecastPeriod,
    largestRise,
    mountainTime,
    outlookRisk,
    ozoneLight,
    precipBands,
    roadsLight,
    shortRoadName,
    strongestObservedWind,
    strongestRoadStationGust,
    weatherLight,
} from '../statusLights.js';
import {
    classifyUdotRoad,
    isMajorBasinPoint,
    isMajorBasinRoute,
    routeOf,
} from '../roadConditionRules.js';

// The homepage status lights (issue #403): every light, every colour, grey included. The
// road and forecast fixtures are real, taken on the evening of 19 Nov 2026 (MST) as the
// season's first snow reached the Basin.

const fixture = (name) => JSON.parse(fs.readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
const SEGMENTS = fixture('udot_roads_20261120.json');
const STATIONS = fixture('udot_stations_20261120.json');
const FORECAST = fixture('road_forecast_20261120.json');
const NOW = Date.parse('2026-11-20T05:25:00Z'); // 10:25 PM MST on 19 Nov

describe('mountainTime', () => {
    test('says the time as a person would, with the day only when it is not today', () => {
        expect(mountainTime(Date.parse('2026-11-20T00:00:00Z'), NOW)).toBe('5 PM');
        expect(mountainTime(Date.parse('2026-11-20T04:09:00Z'), NOW)).toBe('9:09 PM');
        expect(mountainTime(Date.parse('2026-11-21T00:00:00Z'), NOW)).toBe('Fri 5 PM');
    });
});

// ── Roads ─────────────────────────────────────────────────────────────────────────────────

describe('which roads are the Basin\'s major routes', () => {
    test('a segment is named for the route its name starts with', () => {
        expect(routeOf('US-40 Through Daniels Canyon')).toBe('US-40');
        expect(routeOf('US 6 Colton to Helper')).toBe('US-6');
        expect(routeOf('SR-87 Duchesne to Altamont')).toBe('SR-87');
        // It ends at US 40; it is not US 40.
        expect(routeOf('I-80 Jeremy Ranch to US 40 at Silver Ck Jct')).toBe('I-80');
        expect(routeOf('Dinosaur Diamond Prehistoric Highway')).toBeNull();
    });

    test('US-40 east of Heber and US-191 north of Helper, and nothing on the Wasatch Back', () => {
        expect(SEGMENTS.filter(isMajorBasinRoute).map((segment) => segment.name).sort()).toEqual([
            'US-191 Duchesne to Helper through Indian Canyon',
            'US-191 Greendale Jct to Wyoming Stateline',
            'US-191 Vernal to Greendale Jct',
            'US-40 Through Daniels Canyon',
            'US-40 Through Duchesne',
            'US-40 Through Roosevelt',
            'US-40 Through Vernal to Colorado Stateline',
        ]);
        const names = SEGMENTS.map((segment) => segment.name);
        for (const outside of ['US-40 Mayflower Summit to Heber', 'US-40 Silver Ck Jct to Mayflower Summit',
            'I-80 US 40 Jct at Silver Ck to Wanship', 'US-6/191 Price to Green River']) {
            expect(names).toContain(outside);
            expect(isMajorBasinRoute(SEGMENTS.find((segment) => segment.name === outside))).toBe(false);
        }
    });

    test('a traffic event counts by its roadway and where it is', () => {
        expect(isMajorBasinPoint('US 191', 39.92, -110.68)).toBe(true);   // Indian Canyon
        expect(isMajorBasinPoint('US 40', 40.65, -111.46)).toBe(false);   // Mayflower
        expect(isMajorBasinPoint('SR 121', 40.42, -109.67)).toBe(false);
    });
});

describe('classifyUdotRoad', () => {
    test.each([
        ['snow covered', 'Fair', 'none', 'red', 'snow-covered'],
        ['Packed Snow', 'Overcast', '', 'red', 'snow-covered'],
        ['icy', 'Fair', 'none', 'red', 'ice'],
        ['Dry', 'Fair', 'Closed', 'red', 'closed'],
        ['slushy', 'Fair', 'Traction devices required for all vehicles', 'yellow', 'restriction'],
        ['patchy snow', 'Fair', 'none', 'yellow', 'snow'],
        ['slushy', 'Fair', 'none', 'yellow', 'snow'],
        ['wet', 'Fair', 'none', 'yellow', 'wet'],
        ['Dry', 'Fair', 'none', 'green', 'dry'],
        ['None', null, 'None', 'gray', 'unknown'],
    ])('on a major route: %s / %s / %s is %s (%s)', (road, weather, restriction, condition, kind) => {
        expect(classifyUdotRoad(road, weather, restriction, { major: true })).toMatchObject({ condition, kind });
    });

    test('snow covered is red only on a major route; elsewhere it stays caution', () => {
        expect(classifyUdotRoad('snow covered', 'Fair', 'none', { major: false })).toMatchObject({ condition: 'yellow' });
        expect(classifyUdotRoad('snow covered', 'Fair', 'none')).toMatchObject({ condition: 'yellow' });
        // Ice and closures are red everywhere.
        expect(classifyUdotRoad('icy', 'Fair', 'none')).toMatchObject({ condition: 'red' });
    });
});

describe('roadsLight', () => {
    const roads = (segments) => ({ status: 'ok', segments, lastUpdated: '2026-11-20T04:09:58Z' });
    const major = (overrides) => ({
        name: 'US-40 Through Roosevelt', coordinates: [[40.3, -110.0]],
        roadCondition: 'Dry', weatherCondition: 'Fair', restriction: 'none', ...overrides,
    });

    test('red on the real evening: snow covers US-191 north of Vernal', () => {
        const result = roadsLight({ roads: roads(SEGMENTS), events: [], now: NOW });
        expect(result).toMatchObject({
            key: 'roads', label: 'Roads now', href: '/roads', level: 'red',
            line: 'Snow covered: US-191 north of Vernal',
        });
        expect(result.detail).toMatch(/^US-191 north of Vernal: snow covered\. US-40 Daniels Canyon: slushy, traction devices required for all vehicles\./);
        expect(result.detail).toMatch(/UDOT reports, last changed 9:09 PM\.$/);
        // Wet roads on the Wasatch Back are not the Basin's business.
        expect(result.detail).not.toMatch(/Mayflower|I-80|Park City|Price/);
    });

    test('red for ice, and for a full closure reported as a traffic event', () => {
        expect(roadsLight({ roads: roads([major({ roadCondition: 'icy' })]), events: [], now: NOW }))
            .toMatchObject({ level: 'red', line: 'Icy: US-40 Roosevelt' });
        const closure = { isFullClosure: true, roadwayName: 'US 191', latitude: 39.92, longitude: -110.68 };
        expect(roadsLight({ roads: roads([major({})]), events: [closure], now: NOW }))
            .toMatchObject({ level: 'red', line: 'Closed: US-191' });
        // A closure on I-80 at Echo is not a Basin closure.
        const elsewhere = { isFullClosure: true, roadwayName: 'I-80', latitude: 40.97, longitude: -111.43 };
        expect(roadsLight({ roads: roads([major({})]), events: [elsewhere], now: NOW }).level).toBe('green');
    });

    test('amber for traction devices, slush, patchy snow and wet, naming the most serious', () => {
        const result = roadsLight({ roads: roads([
            major({ roadCondition: 'wet' }),
            major({ name: 'US-40 Through Daniels Canyon', coordinates: [[40.3, -111.25]], roadCondition: 'slushy',
                restriction: 'Traction devices required for all vehicles' }),
            major({ name: 'US-191 Duchesne to Helper through Indian Canyon', coordinates: [[39.9, -110.7]], roadCondition: 'patchy snow' }),
        ]), events: [], now: NOW });
        expect(result).toMatchObject({
            level: 'amber', line: 'Traction devices required for all vehicles: US-40 Daniels Canyon',
        });
        expect(result.detail).toMatch(/US-191 Indian Canyon: patchy snow\. US-40 Roosevelt: wet\./);

        expect(roadsLight({ roads: roads([major({ roadCondition: 'wet' }), major({ name: 'US-40 Through Duchesne', roadCondition: 'wet' })]),
            events: [], now: NOW })).toMatchObject({ level: 'amber', line: 'Wet: US-40 Roosevelt, and 1 more' });
    });

    test('green only when every reporting major route is dry', () => {
        expect(roadsLight({ roads: roads([major({}), major({ name: 'US-40 Through Duchesne' })]), events: [], now: NOW }))
            .toMatchObject({ level: 'green', line: 'Major routes dry' });
        // A stretch with no report does not stop the others being dry, and is said.
        const partly = roadsLight({ roads: roads([major({}), major({ name: 'US-40 Through Duchesne', roadCondition: 'None' })]),
            events: null, now: NOW });
        expect(partly.level).toBe('green');
        expect(partly.detail).toMatch(/^1 of 2 stretches of US-40, US-191 and SR-87 are reporting, all dry\./);
    });

    test('grey when UDOT is down or has no report for a major route: never green', () => {
        for (const down of [null, { status: 'unavailable' }, { status: 'ok' }]) {
            expect(roadsLight({ roads: down, events: [], now: NOW }))
                .toMatchObject({ level: 'grey', line: 'Road reports unavailable' });
        }
        expect(roadsLight({ roads: roads([major({ roadCondition: 'None' })]), events: [], now: NOW }))
            .toMatchObject({ level: 'grey', line: 'No road reports' });
        // Only roads outside the Basin reporting is the same as none.
        const outside = SEGMENTS.filter((segment) => !isMajorBasinRoute(segment));
        expect(roadsLight({ roads: roads(outside), events: [], now: NOW }).level).toBe('grey');
    });

    test('shortens the names people know and leaves the rest as UDOT wrote them', () => {
        expect(shortRoadName('US-40 Through Daniels Canyon')).toBe('US-40 Daniels Canyon');
        expect(shortRoadName('US-191 Duchesne to Helper through Indian Canyon')).toBe('US-191 Indian Canyon');
        expect(shortRoadName('SR-87 Duchesne to Altamont')).toBe('SR-87 Duchesne to Altamont');
    });
});

// ── Weather ───────────────────────────────────────────────────────────────────────────────

describe('weatherLight', () => {
    const alert = (overrides) => ({
        event: 'Winter Weather Advisory', level: 'advisory', scope: 'floor',
        areaDesc: 'Eastern Uinta Basin', ends: '2026-11-21T00:00:00Z', ...overrides,
    });
    const nws = (alerts) => ({ status: 'ok', fetchedAt: '2026-11-20T05:21:00Z', alerts });
    const DOWN = { status: 'unavailable', alerts: null, fetchedAt: null };
    const meta = [
        { stid: 'KVEL', name: 'Vernal Airport', elevation: 5262 },
        { stid: 'CHPU1', name: 'Chepeta', elevation: 12120 },
        { stid: 'ODD', name: 'Elevation in metres', elevation: 1600 },
    ];
    const wind = (stid, mps, minutesAgo = 5) => ({
        stid, variable: 'wind_speed', value: mps, units: 'm/s', date_time: new Date(NOW - minutesAgo * 60000).toISOString(),
    });
    const obs = (rows = [wind('KVEL', 3)], minutesOld = 4) => ({ rows, meta, fileTimeMs: NOW - minutesOld * 60000 });
    const station = (overrides) => ({
        name: 'US-40 @ MP 105 Myton', lat: 40.199, lng: -110.068, windSpeedGust: '6.58',
        lastUpdated: new Date(NOW - 10 * 60000).toISOString(), ...overrides,
    });

    test('red for a warning on the floor', () => {
        const result = weatherLight({
            alerts: nws([alert({}), alert({ event: 'Winter Storm Warning', level: 'warning', areaDesc: 'Western Uinta Basin' })]),
            obs: obs(), rwis: [station({})], now: NOW,
        });
        expect(result).toMatchObject({
            key: 'weather', label: 'Weather now', href: '/forecast_weather', level: 'red',
            line: 'Winter Storm Warning until Fri 5 PM, and 1 more',
        });
        expect(result.detail).toMatch(/^National Weather Service: Winter Storm Warning for Western Uinta Basin until Fri 5 PM; Winter Weather Advisory/);
        expect(result.detail).toMatch(/Alerts checked 10:21 PM\.$/);
    });

    test('amber for an advisory, watch or statement on the floor', () => {
        for (const [event, level] of [['Wind Advisory', 'advisory'], ['Winter Storm Watch', 'watch'], ['Special Weather Statement', 'statement']]) {
            expect(weatherLight({ alerts: nws([alert({ event, level })]), obs: obs(), rwis: [], now: NOW }))
                .toMatchObject({ level: 'amber', line: `${event} until Fri 5 PM` });
        }
    });

    test('the mountains do not colour it: on the real evening it is green', () => {
        const mountains = nws([
            alert({ scope: 'nearby', areaDesc: 'Eastern Uinta Mountains' }),
            alert({ scope: 'nearby', areaDesc: 'Western Uinta Mountains' }),
        ]);
        expect(weatherLight({ alerts: mountains, obs: obs(), rwis: STATIONS, now: NOW })).toMatchObject({
            level: 'green', line: 'No alerts',
            detail: 'No National Weather Service alerts for the Basin floor. No floor station is gusting 40 mph or more. Alerts checked 10:21 PM.',
        });
    });

    test('amber on its own for a 40 mph gust at a floor road station, saying the NWS has no wind alert', () => {
        const result = weatherLight({ alerts: nws([]), obs: obs(), rwis: [station({ windSpeedGust: '46.2' })], now: NOW });
        expect(result).toMatchObject({ level: 'amber', line: 'Gusts 46 mph at US-40 @ MP 105 Myton' });
        expect(result.detail).toBe('Observed gusts of 46 mph at US-40 @ MP 105 Myton. '
            + 'There is no National Weather Service wind alert for the Basin floor. Alerts checked 10:21 PM.');
        expect(GUST_MPH).toBe(40);
        expect(weatherLight({ alerts: nws([]), obs: obs(), rwis: [station({ windSpeedGust: '39.4' })], now: NOW }).level).toBe('green');
    });

    test('amber on its own for a sustained 30 mph in our own observations', () => {
        const result = weatherLight({ alerts: nws([]), obs: obs([wind('KVEL', 14)]), rwis: [], now: NOW });
        expect(result).toMatchObject({ level: 'amber', line: 'Wind 31 mph at Vernal Airport' });
        expect(SUSTAINED_MPH).toBe(30);
        expect(weatherLight({ alerts: nws([]), obs: obs([wind('KVEL', 13)]), rwis: [], now: NOW }).level).toBe('green');
    });

    test('a wind reading must be fresh, plausible and on the floor to count', () => {
        const quiet = (rwis, rows) => weatherLight({ alerts: nws([]), obs: obs(rows), rwis, now: NOW }).level;
        // Old: Charleston was still serving a June reading in November.
        expect(quiet([station({ windSpeedGust: '55', lastUpdated: '2026-06-24T19:00:00.000Z' })])).toBe('green');
        expect(quiet([station({ windSpeedGust: '55', lastUpdated: new Date(NOW - 50 * 60000).toISOString() })])).toBe('green');
        // A broken sensor.
        expect(quiet([station({ windSpeedGust: '400' })])).toBe('green');
        expect(quiet([station({ windSpeedGust: null })])).toBe('green');
        // A pass: Bald Mountain is 10,700 ft, and sits outside the floor box.
        expect(quiet([station({ name: 'SR-150 @ Bald Mountain Pass', lat: 40.687, lng: -110.904, windSpeedGust: '60' })])).toBe('green');
        // Our own feed: a summit, a station whose elevation is not in feet, an old reading.
        expect(quiet([], [wind('CHPU1', 25)])).toBe('green');
        expect(quiet([], [wind('ODD', 25)])).toBe('green');
        expect(quiet([], [wind('KVEL', 25, 45)])).toBe('green');
    });

    test('the real station list: every floor station is inside the box, no pass is', () => {
        const inBox = (s) => s.lat >= FLOOR_BOX.south && s.lat <= FLOOR_BOX.north && s.lng >= FLOOR_BOX.west && s.lng <= FLOOR_BOX.east;
        expect(STATIONS.filter(inBox).map((s) => s.name).sort()).toEqual([
            'SR-121 @ MP 31.5 East Lapoint',
            'SR-87 @ MP 16 Mountain Home',
            'US-40 @ MP 105 Myton',
            'US-40 @ MP 140 Asphalt Ridge',
            'US-40 @ MP 66 Fruitland',
            'US-40 @ MP 81.5 Starvation',
        ]);
        expect(strongestRoadStationGust(STATIONS, NOW)).toMatchObject({ where: 'US-40 @ MP 66 Fruitland' });
    });

    test('an alert and an observed wind together: the alert leads, the wind is noted', () => {
        const result = weatherLight({
            alerts: nws([alert({ event: 'Wind Advisory' })]), obs: obs(), rwis: [station({ windSpeedGust: '52' })], now: NOW,
        });
        expect(result.level).toBe('amber');
        expect(result.line).toBe('Wind Advisory until Fri 5 PM');
        expect(result.detail).toMatch(/Observed: gusts of 52 mph at US-40 @ MP 105 Myton\./);
    });

    test('grey when the NWS cannot be asked and nothing is observed: never green', () => {
        expect(weatherLight({ alerts: DOWN, obs: obs(), rwis: [station({})], now: NOW }))
            .toMatchObject({ level: 'grey', line: 'Alerts unavailable' });
        expect(weatherLight({ alerts: null, obs: obs(), rwis: null, now: NOW }).level).toBe('grey');
    });

    test('but an observed wind still shows when the NWS is down, and says so', () => {
        const result = weatherLight({ alerts: DOWN, obs: obs(), rwis: [station({ windSpeedGust: '48' })], now: NOW });
        expect(result.level).toBe('amber');
        expect(result.detail).toBe('Observed gusts of 48 mph at US-40 @ MP 105 Myton. '
            + 'National Weather Service alerts are unavailable right now.');
    });

    test('grey when our observations are more than 30 minutes old or missing', () => {
        for (const stale of [obs([wind('KVEL', 3, 40)], 40), null]) {
            expect(weatherLight({ alerts: nws([]), obs: stale, rwis: [station({})], now: NOW }))
                .toMatchObject({ level: 'grey', line: 'Observations out of date' });
        }
    });

    test('green without the road stations, saying their gusts are unavailable', () => {
        const result = weatherLight({ alerts: nws([]), obs: obs(), rwis: null, now: NOW });
        expect(result.level).toBe('green');
        expect(result.detail).toMatch(/road-station gusts are unavailable/);
    });

    test('strongestObservedWind converts from the units the feed states', () => {
        expect(strongestObservedWind([wind('KVEL', 10)], meta, NOW).mph).toBeCloseTo(22.4, 1);
        const unknownUnit = [{ ...wind('KVEL', 10), units: 'furlongs/fortnight' }];
        expect(strongestObservedWind(unknownUnit, meta, NOW)).toBeNull();
    });
});

// ── Ozone ─────────────────────────────────────────────────────────────────────────────────

describe('ozoneLight', () => {
    const markdown = (near, far) => [
        '## Uintah Basin Winter Ozone forecast outlook',
        '### Day 1–5 (Thu 3 Dec -- Mon 7 Dec):', `${near} RISK OF ELEVATED OZONE`, 'HIGH CONFIDENCE', 'Text.',
        ...(far ? ['### Day 6–10 (Tue 8 Dec -- Sat 12 Dec):', `${far} RISK OF ELEVATED OZONE`, 'LOW CONFIDENCE', 'Text.'] : []),
        '### Day 11–15 (Sun 13 Dec -- Thu 17 Dec):', 'HIGH RISK OF ELEVATED OZONE', 'LOW CONFIDENCE',
    ].join('\n');
    // Issued 1:00 pm MT on 3 Dec 2026 (20:00Z).
    const outlook = (near, far) => ({ filename: 'outlook_20261203_1300.md', markdown: markdown(near, far) });
    const at = (days) => Date.parse('2026-12-03T20:00:00Z') + days * 86400000;

    test.each([
        ['NO', 'LOW', 'green', 'Low risk, days 6 to 10'],
        ['LOW', 'NO', 'green', 'Low risk'],
        ['NO', 'NO', 'green', 'No risk'],
        ['SOME', 'LOW', 'amber', 'Some risk'],
        ['LOW', 'MODERATE', 'amber', 'Moderate risk, days 6 to 10'],
        ['MEDIUM', 'LOW', 'amber', 'Moderate risk'],
        ['HIGH', 'LOW', 'red', 'High risk'],
        ['NO', 'HIGH', 'red', 'High risk, days 6 to 10'],
    ])('days 1–5 %s and days 6–10 %s is %s: "%s"', (near, far, level, line) => {
        expect(ozoneLight({ outlook: outlook(near, far), now: at(1.5) }))
            .toMatchObject({ key: 'ozone', label: 'Ozone', href: '/forecast_outlooks', level, line });
    });

    test('days 11–15 are never read', () => {
        // The sample outlook says HIGH for days 11–15.
        expect(ozoneLight({ outlook: outlook('NO', 'NO'), now: at(1) }).level).toBe('green');
    });

    test('says which outlook it read and how old it is', () => {
        expect(ozoneLight({ outlook: outlook('LOW', 'SOME'), now: at(2.2) }).detail).toBe(
            'Forecasters\' outlook issued 3 Dec 2026, 1:00 pm MT (2 days ago): '
            + 'days 1 to 5 LOW risk, days 6 to 10 SOME risk of elevated ozone.'
        );
        expect(ozoneLight({ outlook: outlook('LOW', 'SOME'), now: at(0.1) }).detail).toMatch(/\(today\)/);
    });

    test('lit for five days, then grey', () => {
        expect(OUTLOOK_CURRENT_DAYS).toBe(5);
        expect(ozoneLight({ outlook: outlook('HIGH', 'HIGH'), now: at(4.9) }).level).toBe('red');
        expect(ozoneLight({ outlook: outlook('HIGH', 'HIGH'), now: at(5.1) })).toMatchObject({
            level: 'grey', line: 'No current outlook',
            detail: 'The last ozone outlook was issued 3 Dec 2026, 5 days ago. An outlook lights this tile for 5 days.',
        });
    });

    test('grey for last season\'s outlook, for no outlook, and for a file that is not one', () => {
        const lastSeason = { filename: 'outlook_20260306_1300.md', markdown: markdown('HIGH', 'HIGH') };
        expect(ozoneLight({ outlook: lastSeason, now: Date.parse('2026-07-02T00:00:00Z') })).toMatchObject({
            level: 'grey', line: 'No current outlook',
            detail: 'The last ozone outlook was issued 6 Mar 2026, in the 2025–26 season.',
        });
        expect(ozoneLight({ outlook: null, now: at(1) })).toMatchObject({ level: 'grey', line: 'No current outlook' });
        expect(ozoneLight({ outlook: { filename: 'template-2025-2026.md', markdown: markdown('HIGH') }, now: at(1) }).level).toBe('grey');
    });

    test('grey, not a guess, when the risk line is missing', () => {
        const noRisk = { filename: 'outlook_20261203_1300.md', markdown: '### Day 1–5 (Thu 3 Dec):\nCold and calm.\n' };
        expect(ozoneLight({ outlook: noRisk, now: at(1) })).toMatchObject({ level: 'grey', line: 'See the outlook' });
    });

    test('uses days 1–5 alone when the outlook has no days 6–10 section', () => {
        const result = ozoneLight({ outlook: outlook('SOME', null), now: at(1) });
        expect(result).toMatchObject({ level: 'amber', line: 'Some risk' });
        expect(result.detail).toMatch(/days 1 to 5 SOME risk of elevated ozone\.$/);
    });

    test('outlookRisk reads the heading with a hyphen or an en dash', () => {
        expect(outlookRisk('### Day 1-5 (x):\nLOW RISK OF ELEVATED OZONE', 1, 5)).toBe('LOW');
        expect(outlookRisk('### Day 1–5 (x):\nlow risk of elevated ozone', 1, 5)).toBe('LOW');
        expect(outlookRisk('### Day 11–15 (x):\nHIGH RISK', 1, 5)).toBeNull();
        expect(outlookRisk(null, 1, 5)).toBeNull();
    });

    test('the real test outlook of 12 Nov 2026: green the next day, grey a week on', () => {
        const real = {
            filename: 'outlook_20261112_0337.md',
            markdown: '### Day 1–5 (Thu 12 Nov -- Mon 16 Nov):\nNO RISK OF ELEVATED OZONE\n\nHIGH CONFIDENCE\n\n'
                + '### Day 6–10 (Tue 17 Nov -- Sat 21 Nov):\nNO RISK OF ELEVATED OZONE\n\nMEDIUM CONFIDENCE\n',
        };
        expect(ozoneLight({ outlook: real, now: Date.parse('2026-11-13T18:00:00Z') })).toMatchObject({ level: 'green', line: 'No risk' });
        expect(ozoneLight({ outlook: real, now: NOW })).toMatchObject({ level: 'grey', line: 'No current outlook' });
    });
});

// ── Precip ────────────────────────────────────────────────────────────────────────────────

describe('precipBands', () => {
    test('the three bands, top down', () => {
        expect(PRECIP_BANDS.map((band) => `${band.label}: ${band.range}`)).toEqual([
            'Passes: above 7,500 ft', 'Benches: 5,900 to 7,500 ft', 'Floor: below 5,900 ft',
        ]);
    });

    test('bandType: dry, snow, rain, or a mix', () => {
        expect(bandType({ snow: 0, rain: 0, mixed: 0 })).toBe('dry');
        expect(bandType({ snow: 9, rain: 1, mixed: 0 })).toBe('snow');
        expect(bandType({ snow: 1, rain: 9, mixed: 0 })).toBe('rain');
        expect(bandType({ snow: 5, rain: 5, mixed: 0 })).toBe('mix');
        expect(bandType({ snow: 6, rain: 0, mixed: 4 })).toBe('mix');
        expect(bandType({ snow: 8, rain: 0, mixed: 2 })).toBe('snow');
    });

    test('the real evening: snow on the passes and the floor, a mix on the benches', () => {
        const result = precipBands({ forecast: FORECAST, now: NOW });
        expect(result).toMatchObject({
            key: 'precip', label: 'Precip next 6 h', href: '/forecast_weather', status: 'ok', asOf: '2026-11-20T04:00:00Z',
            detail: 'HRRR forecast run at 9 PM: the kind of precipitation the model expects, not a measurement.',
        });
        expect(result.bands.map((band) => `${band.key}=${band.type}`)).toEqual(['passes=snow', 'benches=mix', 'floor=snow']);
        expect(result.bands[0].detail).toBe('Precipitation in 6 of the next 6 hours at Daniels Summit, Strawberry, Indian Canyon Summit.');
    });

    const point = (name, elevationM, types, lat = 40.2) => ({
        name, lat, lon: -110 - elevationM / 10000, elevation_m: elevationM,
        forecasts: types.map((type, i) => ({ valid_time: new Date(NOW + (i + 1) * 3600000).toISOString(), precip_type: type })),
    });
    const dry = ['none', 'none', 'none', 'none', 'none', 'none'];

    test('dry when the model has no precipitation, "at times" when only a little', () => {
        const forecast = { init_time: '2026-11-20T04:00:00Z', points: [
            point('Vernal', 1609, dry), point('Myton', 1585, ['none', 'none', 'none', 'none', 'none', 'rain']),
            point('Fruitland', 2042, dry), point('Daniels Summit', 2438, ['snow', 'snow', 'snow', 'snow', 'snow', 'snow']),
        ] };
        const bands = Object.fromEntries(precipBands({ forecast, now: NOW }).bands.map((band) => [band.key, band]));
        expect(bands.passes).toMatchObject({ type: 'snow', extent: null });
        expect(bands.benches).toMatchObject({ type: 'dry', extent: null, detail: 'No precipitation forecast at Fruitland.' });
        expect(bands.floor).toMatchObject({ type: 'rain', extent: 'at times' });
    });

    test('a band with no forecast point says so and shows no type', () => {
        const forecast = { init_time: '2026-11-20T04:00:00Z', points: [point('Vernal', 1609, dry)] };
        const bands = Object.fromEntries(precipBands({ forecast, now: NOW }).bands.map((band) => [band.key, band]));
        expect(bands.passes).toMatchObject({ type: null, detail: 'No forecast points at this height.' });
        expect(bands.floor.type).toBe('dry');
    });

    test('a waypoint shared by two routes is counted once', () => {
        const forecast = { init_time: '2026-11-20T04:00:00Z', points: [
            point('Roosevelt', 1588, ['rain', 'none', 'none', 'none', 'none', 'none']),
            point('Roosevelt', 1588, ['rain', 'none', 'none', 'none', 'none', 'none']),
            point('Vernal', 1609, dry, 40.45),
        ] };
        // One wet point-hour in twelve, not two in eighteen: still "at times" either way, so
        // check the names instead.
        const floor = precipBands({ forecast, now: NOW }).bands.find((band) => band.key === 'floor');
        expect(floor.detail).toBe('Precipitation in 1 of the next 6 hours at Roosevelt, Vernal.');
    });

    test('unavailable, with no bands, when the file is missing, malformed or too old', () => {
        for (const forecast of [null, {}, { points: 'x' }]) {
            expect(precipBands({ forecast, now: NOW })).toMatchObject({
                status: 'unavailable', bands: [], detail: 'The HRRR road forecast is not available right now.',
            });
        }
        // Ten hours on, only two of the file's hours are still ahead.
        expect(precipBands({ forecast: FORECAST, now: NOW + 9.2 * 3600000 })).toMatchObject({
            status: 'unavailable', bands: [], detail: 'The newest HRRR road forecast is too old to cover the next six hours.',
        });
    });

    test('never reads the amount field, which is a running total in this file', () => {
        const withAmounts = JSON.parse(JSON.stringify(FORECAST));
        for (const p of withAmounts.points) for (const f of p.forecasts) f.precip_1hr = 9999;
        expect(precipBands({ forecast: withAmounts, now: NOW })).toEqual(precipBands({ forecast: FORECAST, now: NOW }));
    });
});

// ── The forecast tile ─────────────────────────────────────────────────────────────────────

describe('forecastPeriod: the tile is named for the part of the day it covers', () => {
    const at = (iso) => Date.parse(iso);
    const hourly = (fromIso, count) => Array.from({ length: count }, (_, i) => at(fromIso) + i * 3600000);
    // 20 Nov 2026 is in Mountain Standard Time: local = UTC - 7.

    test.each([
        ['2026-11-20T07:30:00Z', 'This morning'],    // 12:30 AM
        ['2026-11-20T12:59:00Z', 'This morning'],    // 5:59 AM
        ['2026-11-20T13:00:00Z', 'This afternoon'],  // 6 AM
        ['2026-11-20T18:30:00Z', 'This afternoon'],  // 11:30 AM
        ['2026-11-20T19:00:00Z', 'Tonight'],         // noon
        ['2026-11-21T00:30:00Z', 'Tonight'],         // 5:30 PM
        ['2026-11-21T01:00:00Z', 'Overnight'],       // 6 PM
    ])('at %s it is "%s"', (now, title) => {
        expect(forecastPeriod(at(now)).title).toBe(title);
    });

    test('"Tonight" is 6 PM to midnight, and the tile weighs every hour from now until then', () => {
        const period = forecastPeriod(at('2026-11-20T21:10:00Z')); // 2:10 PM
        expect(period).toEqual({ title: 'Tonight', startMs: at('2026-11-21T01:00:00Z'), endMs: at('2026-11-21T07:00:00Z') });
    });

    test('late in the evening it looks to "Tomorrow morning" once the run reaches three hours into it', () => {
        const now = at('2026-11-21T05:30:00Z'); // 10:30 PM
        // A run reaching 8 AM puts 6, 7 and 8 AM inside tomorrow morning.
        expect(forecastPeriod(now, hourly('2026-11-21T06:00:00Z', 10))).toEqual({
            title: 'Tomorrow morning', startMs: at('2026-11-21T13:00:00Z'), endMs: at('2026-11-21T19:00:00Z'),
        });
        // One reaching only 7 AM does not: the tile stays on the small hours.
        expect(forecastPeriod(now, hourly('2026-11-21T06:00:00Z', 9)).title).toBe('Overnight');
        expect(forecastPeriod(now).title).toBe('Overnight');
    });

    test('keeps to the local clock across a daylight-saving change', () => {
        // 8 Mar 2026: clocks go from 2 AM MST to 3 AM MDT. At 1 AM MST the morning still starts at 6 AM MDT (12Z).
        const period = forecastPeriod(at('2026-03-08T08:00:00Z'));
        expect(period).toMatchObject({ title: 'This morning', startMs: at('2026-03-08T12:00:00Z'), endMs: at('2026-03-08T18:00:00Z') });
        // In July, Mountain Daylight Time: noon is 18Z.
        expect(forecastPeriod(at('2026-07-01T18:00:00Z')).title).toBe('Tonight');
    });
});

describe('largestRise', () => {
    test('the biggest climb from any value to a later one', () => {
        expect(largestRise([0, 10, 30, 25, 60])).toBe(60);
        expect(largestRise([50, 20, 45])).toBe(25);
        expect(largestRise([40, 30, 10])).toBe(0);
        expect(largestRise([])).toBe(0);
        expect(largestRise([null, 5, undefined, 30])).toBe(25);
    });
});

describe('forecastLight', () => {
    const HAZARDS = fixture('road_forecast_hazards_20261120.json'); // the 05Z run, received 06:22Z
    const NOON = Date.parse('2026-11-20T19:00:00Z'); // noon MST: the tile is "Tonight", 6 PM to midnight
    const VARIABLES = {
        temp_2m: { units: 'Celsius' }, wind_speed_10m: { units: 'm/s' }, wind_gust: { units: 'm/s' }, snow_depth: { units: 'mm' },
    };
    const MS_PER_MPH = 1 / 2.23694;
    const fToC = (f) => ((f - 32) * 5) / 9;
    // Twelve hourly values from 1 PM to midnight MST. `hour` fills in one point's hours.
    const point = (name, elevationFt, hour = () => ({})) => ({
        route_id: 'us40', name, lat: 40 + elevationFt / 1e5, lon: -110, elevation_m: elevationFt / 3.28084,
        forecasts: Array.from({ length: 12 }, (_, i) => ({
            valid_time: new Date(NOON + (i + 1) * 3600000).toISOString(),
            temp_2m: fToC(35), wind_speed_10m: 1, wind_gust: 5, snow_depth: 0, ...hour(i),
        })),
    });
    const run = (...points) => ({ model: 'hrrr', init_time: '2026-11-20T18:00:00Z', variables: VARIABLES, points });
    const lightFor = (...points) => forecastLight({ forecast: run(...points), now: NOON });

    test('green when nothing crosses a threshold, naming the hours it covers and the worst it saw', () => {
        const light = lightFor(point('Myton', 5100), point('Vernal', 5300, () => ({ wind_gust: 12 })));
        expect(light).toMatchObject({ key: 'ahead', label: 'Tonight', href: '/forecast_weather', level: 'green', line: 'Nothing notable' });
        expect(light.detail).toBe('HRRR forecast run at 11 AM, for 1 PM to 11 PM: no gusts of 40 mph, no inch of new snow on the '
            + 'Basin floor, and nothing as cold as 0°F (strongest gust 27 mph, coldest temperature 35°F). '
            + 'A model forecast for points along the highways, not a measurement or a warning.');
        expect(light.asOf).toBe('2026-11-20T18:00:00Z');
    });

    test('gusts: amber at 40 mph, red at 58 mph', () => {
        const gusting = (mph) => lightFor(point('Myton', 5100, (i) => (i === 8 ? { wind_gust: mph * MS_PER_MPH } : {})));
        expect(FORECAST_GUST_AMBER_MPH).toBe(GUST_MPH);
        expect([FORECAST_GUST_AMBER_MPH, FORECAST_GUST_RED_MPH]).toEqual([40, 58]);
        expect(gusting(39).level).toBe('green');
        expect(gusting(45)).toMatchObject({ level: 'amber', line: 'Gusts 45 mph near Myton' });
        expect(gusting(45).detail).toContain('gusts of 45 mph near Myton around 9 PM');
        expect(gusting(60)).toMatchObject({ level: 'red', line: 'Gusts 60 mph near Myton' });
        // A gust no station here has ever seen is a broken value, not a forecast.
        expect(gusting(300).level).toBe('green');
    });

    test('new snow on the floor: amber at 1 inch, red at 4, from the rise in snow depth', () => {
        const snowing = (inches, elevationFt = 5100) => lightFor(
            point('Myton', 5000),
            point('Duchesne', elevationFt, (i) => ({ snow_depth: Math.min(i, 6) * (inches * 25.4) / 6 })),
        );
        expect([NEW_SNOW_AMBER_IN, NEW_SNOW_RED_IN]).toEqual([1, 4]);
        expect(snowing(0.6).level).toBe('green');
        expect(snowing(1.4)).toMatchObject({ level: 'amber', line: 'About 1.5 in of new snow near Duchesne' });
        expect(snowing(5)).toMatchObject({ level: 'red', line: 'About 5 in of new snow near Duchesne' });
        // The benches and passes are the roads light's and the precipitation tile's job.
        expect(snowing(5, 6500).level).toBe('green');
    });

    test('snow already on the ground is not new snow, and melting is not a hazard', () => {
        expect(lightFor(point('Duchesne', 5100, () => ({ snow_depth: 200 }))).level).toBe('green');
        expect(lightFor(point('Duchesne', 5100, (i) => ({ snow_depth: 200 - i * 10 }))).level).toBe('green');
    });

    test('cold: amber at 0°F, red at -20°F, by wind chill or by the air itself when it is calm', () => {
        expect([COLD_AMBER_F, COLD_RED_F]).toEqual([0, -20]);
        // 10°F in a 20 mph wind is a wind chill of -9°F.
        const windy = lightFor(point('Myton', 5100, (i) => (i === 10 ? { temp_2m: fToC(10), wind_speed_10m: 20 * MS_PER_MPH } : {})));
        expect(windy).toMatchObject({ level: 'amber', line: 'Wind chill -9°F near Myton' });
        expect(windy.detail).toContain('wind chill -9°F near Myton around 11 PM');
        // A calm cold pool: no wind chill is defined, so the air temperature is weighed.
        const calm = lightFor(point('Ouray', 4800, () => ({ temp_2m: fToC(-4), wind_speed_10m: 0.5 })));
        expect(calm).toMatchObject({ level: 'amber', line: 'Temperature -4°F near Ouray' });
        expect(lightFor(point('Ouray', 4800, () => ({ temp_2m: fToC(-25), wind_speed_10m: 0 }))).level).toBe('red');
        expect(lightFor(point('Ouray', 4800, () => ({ temp_2m: fToC(3), wind_speed_10m: 0 }))).level).toBe('green');
    });

    test('the words never cross a threshold the colour did not', () => {
        // Just under a red threshold is amber, and must not be rounded up into reading like red.
        const gust = lightFor(point('Myton', 5100, (i) => (i === 8 ? { wind_gust: 57.6 * MS_PER_MPH } : {})));
        expect(gust).toMatchObject({ level: 'amber', line: 'Gusts 57 mph near Myton' });
        const snow = lightFor(point('Duchesne', 5100, (i) => ({ snow_depth: Math.min(i, 6) * (3.8 * 25.4) / 6 })));
        expect(snow).toMatchObject({ level: 'amber', line: 'About 3.5 in of new snow near Duchesne' });
        const cold = lightFor(point('Ouray', 4800, () => ({ temp_2m: fToC(-19.6), wind_speed_10m: 0 })));
        expect(cold).toMatchObject({ level: 'amber', line: 'Temperature -19°F near Ouray' });
        // On the threshold, the number and the colour agree.
        expect(lightFor(point('Myton', 5100, (i) => (i === 8 ? { wind_gust: 58.2 * MS_PER_MPH } : {})))).toMatchObject({ level: 'red', line: 'Gusts 58 mph near Myton' });
        expect(lightFor(point('Duchesne', 5100, (i) => ({ snow_depth: Math.min(i, 6) * (4.1 * 25.4) / 6 })))).toMatchObject({ level: 'red', line: 'About 4 in of new snow near Duchesne' });
        expect(lightFor(point('Ouray', 4800, () => ({ temp_2m: fToC(-20.3), wind_speed_10m: 0 })))).toMatchObject({ level: 'red', line: 'Temperature -20°F near Ouray' });
        // Nor does a quiet tile claim a number that would have lit it: 39.7 mph is "39", not "40".
        const quiet = lightFor(point('Myton', 5100, () => ({ wind_gust: 39.7 * MS_PER_MPH, temp_2m: fToC(0.4) })));
        expect(quiet.level).toBe('green');
        expect(quiet.detail).toContain('strongest gust 39 mph, coldest temperature 1°F');
        // Just below zero is amber and reads 0, never "-0".
        expect(lightFor(point('Ouray', 4800, () => ({ temp_2m: fToC(-0.4), wind_speed_10m: 0 })))).toMatchObject({ level: 'amber', line: 'Temperature 0°F near Ouray' });
    });

    test('ground above 7,500 ft does not colour it', () => {
        const light = lightFor(point('Myton', 5100), point('Daniels Summit', 8000, () => ({ wind_gust: 70 * MS_PER_MPH, temp_2m: fToC(-30) })));
        expect(light.level).toBe('green');
    });

    test('several reasons: a red one leads, the others are named after it', () => {
        const light = lightFor(
            point('Myton', 5100, (i) => (i === 7 ? { wind_gust: 44 * MS_PER_MPH } : {})),
            point('Duchesne', 5500, (i) => ({ snow_depth: i * 12 })),
        );
        expect(light).toMatchObject({ level: 'red', line: 'About 5 in of new snow near Duchesne, and strong gusts' });
        expect(light.detail).toContain('about 5 in of new snow near Duchesne; gusts of 44 mph near Myton around 8 PM');
    });

    test('only hours from now to the end of the named part of the day are weighed', () => {
        // The last value is at midnight, which belongs to "Overnight", not "Tonight".
        expect(lightFor(point('Myton', 5100, (i) => (i === 11 ? { wind_gust: 50 * MS_PER_MPH } : {}))).level).toBe('green');
        // An hour already past is not a forecast any more.
        const later = forecastLight({
            forecast: run(point('Myton', 5100, (i) => (i === 0 ? { wind_gust: 50 * MS_PER_MPH } : {}))),
            now: NOON + 90 * 60000,
        });
        expect(later.level).toBe('green');
    });

    test('grey, never green, with no forecast or one that does not reach the named part of the day', () => {
        expect(forecastLight({ forecast: null, now: NOON })).toMatchObject({
            label: 'Tonight', level: 'grey', line: 'Forecast unavailable',
        });
        expect(forecastLight({ forecast: { points: 'x' }, now: NOON }).level).toBe('grey');
        // Nine hours on, the same run has only one hour left before 6 AM.
        const stale = forecastLight({ forecast: run(point('Myton', 5100)), now: NOON + 9 * 3600000 });
        expect(stale).toMatchObject({ label: 'Overnight', level: 'grey', line: 'Forecast does not reach this far' });
        expect(stale.detail).toBe('The newest HRRR road forecast does not reach far enough into overnight to speak for it.');
    });

    test('a file that does not state its units cannot be read as "nothing notable": grey', () => {
        const forecast = run(point('Myton', 5100, () => ({ wind_gust: 30 })));
        forecast.variables = {};
        expect(forecastLight({ forecast, now: NOON })).toMatchObject({
            level: 'grey', line: 'Forecast incomplete',
            detail: 'The newest HRRR road forecast has no readable gusts or temperatures or snow depth, so this tile cannot say that nothing is coming.',
        });
        // One missing field is enough, and the tile says which.
        const noDepth = run(point('Myton', 5100, () => ({ snow_depth: null })));
        expect(forecastLight({ forecast: noDepth, now: NOON }).detail).toContain('no readable snow depth');
    });

    test('but a hazard it can read still shows when another field is missing', () => {
        const forecast = run(point('Myton', 5100, (i) => ({ snow_depth: null, wind_gust: i === 8 ? 45 * MS_PER_MPH : 5 })));
        expect(forecastLight({ forecast, now: NOON })).toMatchObject({ level: 'amber', line: 'Gusts 45 mph near Myton' });
    });

    test('the real night of 19 Nov 2026: about two inches of new snow on the floor by morning', () => {
        const light = forecastLight({ forecast: HAZARDS, now: Date.parse('2026-11-20T07:10:00Z') }); // 12:10 AM
        expect(light).toMatchObject({ label: 'This morning', level: 'amber', line: 'About 2 in of new snow near Bluebell' });
        expect(light.detail).toMatch(/^HRRR forecast run at Thu 10 PM, for 1 AM to 10 AM: about 2 in of new snow near Bluebell\./);
    });
});

