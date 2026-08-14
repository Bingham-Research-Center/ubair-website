import fetch from 'node-fetch';

export const NWS_USER_AGENT = 'BasinWX/1.0 (basinwx.com)';

export async function nwsFetch(url) {
    const response = await fetch(url, {
        headers: {
            'User-Agent': NWS_USER_AGENT,
            'Accept': 'application/json'
        }
    });
    if (!response.ok) {
        throw new Error(`NWS API error: ${response.status} for ${url}`);
    }
    return response.json();
}

export async function fetchNWSGridpointForecast(lat, lon) {
    const points = await nwsFetch(`https://api.weather.gov/points/${lat},${lon}`);
    const forecastUrl = points.properties.forecast;
    const forecast = await nwsFetch(forecastUrl);
    const periods = forecast.properties.periods;
    return {
        current: periods[0],
        upcoming: periods.slice(1, 5),
        periods,
        raw: forecast
    };
}
