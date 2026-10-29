const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Weather = require('../app/weather.js');

const location = { postalCode: '00501', name: 'Holtsville', region: 'New York', countryCode: 'US',
  latitude: 40.8154, longitude: -73.0451, timezone: 'America/New_York' };
const reply = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const weatherBody = (overrides = {}) => ({
  current: { time: 1793070000, temperature_2m: 61.2, relative_humidity_2m: 68, weather_code: 3, is_day: 1 },
  current_units: { time: 'unixtime', temperature_2m: '°F', relative_humidity_2m: '%', weather_code: 'wmo code' },
  ...overrides
});
const airBody = (overrides = {}) => ({
  current: { time: 1793070000, us_aqi: 34, pm2_5: 6.8, pm10: 12.1 },
  current_units: { time: 'unixtime', us_aqi: 'USAQI', pm2_5: 'μg/m³', pm10: 'μg/m³' },
  ...overrides
});

test('postal lookup keeps five digit US ZIP codes and returns one validated city location', async () => {
  assert.equal(Weather.validatePostalCode('00501'), '00501');
  for (const invalid of [501, '501', '0050A', ' 00501', '00501-1234', null]) {
    assert.throws(() => Weather.validatePostalCode(invalid), /five-digit US ZIP/i);
  }
  let requested;
  const result = await Weather.resolveLocation('00501', { now: 1793070012345, fetch: async (url, options) => {
    requested = { url: new URL(url), options };
    return reply({ results: [{ name: 'Holtsville', admin1: 'New York', country_code: 'US',
      latitude: 40.8154, longitude: -73.0451, timezone: 'America/New_York' }] });
  } });
  assert.deepEqual(result, location);
  assert.equal(requested.url.origin, 'https://geocoding-api.open-meteo.com');
  assert.equal(requested.url.pathname, '/v1/search');
  assert.equal(requested.url.searchParams.get('name'), '00501');
  assert.equal(requested.url.searchParams.get('countryCode'), 'US');
  assert.equal(requested.url.searchParams.get('count'), '1');
  assert.equal(requested.options.signal, undefined);
});

test('postal lookup rejects absent, multiple, foreign, or incomplete location results', async () => {
  for (const body of [{ results: [] }, { results: [{ name: 'A' }, { name: 'B' }] },
    { results: [{ ...location, country_code: 'CA' }] },
    { results: [{ ...location, latitude: null }] },
    { results: [{ ...location, timezone: '' }] }]) {
    await assert.rejects(Weather.resolveLocation('00501', { fetch: async () => reply(body) }), /location/i);
  }
});

test('weather fetch validates its US model response and normalizes unit and timestamps', async () => {
  let requested;
  const result = await Weather.fetchWeather(location, { now: 1793070012345, fetch: async (url, options) => {
    requested = { url: new URL(url), options };
    return reply(weatherBody());
  } });
  assert.equal(requested.url.origin, 'https://api.open-meteo.com');
  assert.equal(requested.url.pathname, '/v1/forecast');
  assert.equal(requested.url.searchParams.get('latitude'), String(location.latitude));
  assert.equal(requested.url.searchParams.get('longitude'), String(location.longitude));
  assert.equal(requested.url.searchParams.get('current'), 'temperature_2m,relative_humidity_2m,weather_code,is_day');
  assert.equal(requested.url.searchParams.get('temperature_unit'), 'fahrenheit');
  assert.equal(requested.url.searchParams.get('timezone'), 'GMT');
  assert.equal(requested.url.searchParams.get('timeformat'), 'unixtime');
  assert.equal(requested.options.signal, undefined);
  assert.deepEqual(result, { temperatureF: 61.2, relativeHumidityPct: 68, weatherCode: 3, isDay: true,
    condition: 'Overcast', validAtMs: 1793070000000, fetchedAtMs: 1793070012345, source: 'Open-Meteo' });
});

test('weather fetch returns isDay false when the provider reports night', async () => {
  const result = await Weather.fetchWeather(location, { fetch: async () => reply(weatherBody({
    current: { ...weatherBody().current, is_day: 0 }
  })) });
  assert.equal(result.isDay, false);
});

test('air fetch makes an independent US AQI request and normalizes pollutant units', async () => {
  let requested;
  const result = await Weather.fetchAirQuality(location, { now: 1793070012345, fetch: async (url, options) => {
    requested = { url: new URL(url), options };
    return reply(airBody());
  } });
  assert.equal(requested.url.origin, 'https://air-quality-api.open-meteo.com');
  assert.equal(requested.url.pathname, '/v1/air-quality');
  assert.equal(requested.url.searchParams.get('latitude'), String(location.latitude));
  assert.equal(requested.url.searchParams.get('longitude'), String(location.longitude));
  assert.equal(requested.url.searchParams.get('current'), 'us_aqi,pm2_5,pm10');
  assert.equal(requested.url.searchParams.get('domains'), 'cams_global');
  assert.equal(requested.url.searchParams.get('timezone'), 'GMT');
  assert.equal(requested.url.searchParams.get('timeformat'), 'unixtime');
  assert.deepEqual(result, { usAqi: 34, pm25MicrogramsM3: 6.8, pm10MicrogramsM3: 12.1,
    validAtMs: 1793070000000, fetchedAtMs: 1793070012345, source: 'Open-Meteo / CAMS Global' });
});

test('weather data rejects bad status, missing values, invalid units and nonfinite values', async () => {
  await assert.rejects(Weather.fetchWeather(location, { fetch: async () => reply({}, 503) }), /HTTP 503/);
  await assert.rejects(Weather.fetchWeather(location, { fetch: async () => ({ ok: true, json: async () => { throw new Error('bad json'); } }) }), /valid JSON/);
  for (const body of [weatherBody({ current: { ...weatherBody().current, temperature_2m: null } }),
    weatherBody({ current: { ...weatherBody().current, relative_humidity_2m: Infinity } }),
    weatherBody({ current: { ...weatherBody().current, weather_code: '3' } }),
    weatherBody({ current: { time: 1793070000, temperature_2m: 61.2, relative_humidity_2m: 68, weather_code: 3 } }),
    weatherBody({ current: { ...weatherBody().current, is_day: null } }),
    weatherBody({ current: { ...weatherBody().current, is_day: 2 } }),
    weatherBody({ current: { ...weatherBody().current, is_day: '1' } }),
    weatherBody({ current_units: { ...weatherBody().current_units, temperature_2m: '°C' } }),
    weatherBody({ current: { ...weatherBody().current, time: null } })]) {
    await assert.rejects(Weather.fetchWeather(location, { fetch: async () => reply(body) }), /weather/i);
  }
});

test('weather requests require a resolved ZIP-backed US location', async () => {
  for (const invalid of [{ ...location, countryCode: 'CA' }, { ...location, postalCode: '501' },
    { ...location, name: '' }, { ...location, longitude: Infinity }]) {
    await assert.rejects(Weather.fetchWeather(invalid, { fetch: async () => reply(weatherBody()) }), /location/i);
  }
});

test('air data rejects invalid AQI, missing PM, invalid units, and nonfinite readings', async () => {
  for (const body of [airBody({ current: { ...airBody().current, us_aqi: null } }),
    airBody({ current: { ...airBody().current, us_aqi: -1 } }),
    airBody({ current: { ...airBody().current, us_aqi: Infinity } }),
    airBody({ current: { time: 1793070000, us_aqi: 34, pm2_5: 6.8 } }),
    airBody({ current: { ...airBody().current, pm10: NaN } }),
    airBody({ current_units: { ...airBody().current_units, pm2_5: 'ppm' } })]) {
    await assert.rejects(Weather.fetchAirQuality(location, { fetch: async () => reply(body) }), /air quality/i);
  }
  const extreme = await Weather.fetchAirQuality(location, { fetch: async () =>
    reply(airBody({ current: { ...airBody().current, us_aqi: 501 } })) });
  assert.equal(extreme.usAqi, 501);
  assert.equal(Weather.describeAqi(extreme.usAqi), 'Hazardous');
});

test('weather code and US AQI descriptions handle known values and unknown input safely', () => {
  assert.equal(Weather.describeWeatherWMO(0), 'Clear');
  assert.equal(Weather.describeWeatherWMO(3), 'Overcast');
  assert.equal(Weather.describeWeatherWMO(95), 'Thunderstorm');
  assert.equal(Weather.describeWeatherWMO(14), 'Unknown conditions');
  assert.equal(Weather.describeWeatherWMO(null), 'Conditions unavailable');
  assert.equal(Weather.describeAqi(0), 'Good');
  assert.equal(Weather.describeAqi(50), 'Good');
  assert.equal(Weather.describeAqi(51), 'Moderate');
  assert.equal(Weather.describeAqi(101), 'Unhealthy for sensitive groups');
  assert.equal(Weather.describeAqi(151), 'Unhealthy');
  assert.equal(Weather.describeAqi(201), 'Very unhealthy');
  assert.equal(Weather.describeAqi(301), 'Hazardous');
  assert.equal(Weather.describeAqi(501), 'Hazardous');
  assert.equal(Weather.describeAqi(1250), 'Hazardous');
  assert.equal(Weather.describeAqi(null), null);
  assert.equal(Weather.describeAqi(-1), null);
  assert.equal(Weather.describeAqi(Infinity), null);
  assert.equal(Weather.describeAqi(NaN), null);
});

test('provided abort signal reaches fetch and fetch failures are preserved', async () => {
  const controller = new AbortController();
  let requestOptions;
  const fetchFailure = Object.assign(new Error('cancelled'), { name: 'AbortError' });
  await assert.rejects(Weather.fetchWeather(location, { signal: controller.signal, fetch: async (_url, options) => {
    requestOptions = options;
    throw fetchFailure;
  } }), error => error === fetchFailure);
  assert.equal(requestOptions.signal, controller.signal);
});

test('browser script exposes the same API without CommonJS', () => {
  const browser = { URL, URLSearchParams, Date, Number, Math };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'app', 'weather.js'), 'utf8'), browser);
  assert.equal(typeof browser.LauncherWeather.resolveLocation, 'function');
  assert.equal(typeof browser.LauncherWeather.fetchAirQuality, 'function');
});
