(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.LauncherWeather = api;
})(typeof globalThis === 'undefined' ? this : globalThis, function () {
  'use strict';

  const WEATHER_SOURCE = 'Open-Meteo';
  const AIR_SOURCE = 'Open-Meteo / CAMS Global';
  const WMO = {
    0: 'Clear', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
    45: 'Fog', 48: 'Depositing rime fog',
    51: 'Light drizzle', 53: 'Moderate drizzle', 55: 'Dense drizzle',
    56: 'Light freezing drizzle', 57: 'Dense freezing drizzle',
    61: 'Slight rain', 63: 'Moderate rain', 65: 'Heavy rain',
    66: 'Light freezing rain', 67: 'Heavy freezing rain',
    71: 'Slight snow fall', 73: 'Moderate snow fall', 75: 'Heavy snow fall', 77: 'Snow grains',
    80: 'Slight rain showers', 81: 'Moderate rain showers', 82: 'Violent rain showers',
    85: 'Slight snow showers', 86: 'Heavy snow showers',
    95: 'Thunderstorm', 96: 'Thunderstorm with slight hail', 99: 'Thunderstorm with heavy hail'
  };

  function validatePostalCode(zip) {
    if (typeof zip !== 'string' || !/^\d{5}$/.test(zip)) {
      throw new Error('Location must be a five-digit US ZIP code.');
    }
    return zip;
  }

  function requestFetch(fetchOption) {
    const fn = fetchOption || (typeof globalThis !== 'undefined' && globalThis.fetch);
    if (typeof fn !== 'function') throw new Error('Fetch is not available.');
    return fn;
  }

  async function getJson(url, label, options) {
    const response = await requestFetch(options.fetch)(url, { signal: options.signal });
    if (!response || !response.ok) {
      const status = response && Number.isFinite(response.status) ? ` (HTTP ${response.status})` : '';
      throw new Error(`Open-Meteo ${label} request failed${status}.`);
    }
    let body;
    try { body = await response.json(); } catch (_) {
      throw new Error(`Open-Meteo ${label} response was not valid JSON.`);
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new Error(`Open-Meteo ${label} response was not a JSON object.`);
    }
    return body;
  }

  function locationField(result, key) {
    const value = result && result[key];
    if (typeof value !== 'string' || !value.trim()) throw new Error('Open-Meteo returned an incomplete location.');
    return value.trim();
  }

  function coordinate(value, key, min, max) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
      throw new Error(`Open-Meteo returned an invalid location ${key}.`);
    }
    return value;
  }

  async function resolveLocation(zip, options = {}) {
    const postalCode = validatePostalCode(zip);
    const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
    url.search = new URLSearchParams({ name: postalCode, count: '1', language: 'en', format: 'json', countryCode: 'US' });
    const body = await getJson(url, 'location', options);
    if (!Array.isArray(body.results) || body.results.length !== 1) {
      throw new Error('Open-Meteo did not return one US location for that ZIP code.');
    }
    const result = body.results[0];
    if (!result || typeof result !== 'object' || String(result.country_code || '').toUpperCase() !== 'US') {
      throw new Error('Open-Meteo returned a non-US location.');
    }
    return {
      postalCode,
      name: locationField(result, 'name'),
      region: locationField(result, 'admin1'),
      countryCode: 'US',
      latitude: coordinate(result.latitude, 'latitude', -90, 90),
      longitude: coordinate(result.longitude, 'longitude', -180, 180),
      timezone: locationField(result, 'timezone')
    };
  }

  function validateLocation(location) {
    if (!location || typeof location !== 'object' || location.countryCode !== 'US') {
      throw new Error('A resolved US location is required.');
    }
    validatePostalCode(location.postalCode);
    for (const key of ['name', 'region', 'timezone']) {
      if (typeof location[key] !== 'string' || !location[key].trim()) {
        throw new Error('A resolved US location is incomplete.');
      }
    }
    return {
      latitude: coordinate(location.latitude, 'latitude', -90, 90),
      longitude: coordinate(location.longitude, 'longitude', -180, 180)
    };
  }

  function finiteValue(object, key, label, min = -Infinity, max = Infinity) {
    const value = object && object[key];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
      throw new Error(`Open-Meteo ${label} response has an invalid ${key}.`);
    }
    return value;
  }

  function normalizedUnit(object, key, label) {
    const value = object && object[key];
    return typeof value === 'string' ? value.toLowerCase().replace(/\s+/g, '').replace(/μ/g, 'µ') : '';
  }

  function requireUnit(object, key, accepted, label) {
    if (!accepted.includes(normalizedUnit(object, key, label))) {
      throw new Error(`Open-Meteo ${label} response has an invalid ${key} unit.`);
    }
  }

  function responseTime(current, label) {
    const seconds = finiteValue(current, 'time', label, 1);
    const milliseconds = Math.trunc(seconds * 1000);
    if (!Number.isSafeInteger(milliseconds)) throw new Error(`Open-Meteo ${label} response has an invalid time.`);
    return milliseconds;
  }

  function fetchedTime(now) {
    const value = typeof now === 'function' ? now() : now === undefined ? Date.now() : now;
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Fetch time must be a finite timestamp in milliseconds.');
    return value;
  }

  function endpoint(path, coordinates, fields) {
    const url = new URL(path);
    url.search = new URLSearchParams({ latitude: String(coordinates.latitude), longitude: String(coordinates.longitude),
      current: fields, timezone: 'GMT', timeformat: 'unixtime' });
    return url;
  }

  async function fetchWeather(location, options = {}) {
    const coordinates = validateLocation(location);
    const url = endpoint('https://api.open-meteo.com/v1/forecast', coordinates,
      'temperature_2m,relative_humidity_2m,weather_code,is_day');
    url.searchParams.set('temperature_unit', 'fahrenheit');
    const body = await getJson(url, 'weather', options);
    const current = body.current;
    const units = body.current_units;
    if (!current || !units) throw new Error('Open-Meteo weather response is missing current values or units.');
    requireUnit(units, 'temperature_2m', ['°f'], 'weather');
    requireUnit(units, 'relative_humidity_2m', ['%'], 'weather');
    requireUnit(units, 'weather_code', ['wmocode'], 'weather');
    const weatherCode = finiteValue(current, 'weather_code', 'weather', 0, 99);
    if (!Number.isInteger(weatherCode)) throw new Error('Open-Meteo weather response has an invalid weather_code.');
    const isDayValue = finiteValue(current, 'is_day', 'weather', 0, 1);
    if (!Number.isInteger(isDayValue)) throw new Error('Open-Meteo weather response has an invalid is_day value.');
    return {
      temperatureF: finiteValue(current, 'temperature_2m', 'weather'),
      relativeHumidityPct: finiteValue(current, 'relative_humidity_2m', 'weather', 0, 100),
      weatherCode,
      isDay: isDayValue === 1,
      condition: describeWeatherWMO(weatherCode),
      validAtMs: responseTime(current, 'weather'),
      fetchedAtMs: fetchedTime(options.now),
      source: WEATHER_SOURCE
    };
  }

  async function fetchAirQuality(location, options = {}) {
    const coordinates = validateLocation(location);
    const url = endpoint('https://air-quality-api.open-meteo.com/v1/air-quality', coordinates,
      'us_aqi,pm2_5,pm10');
    url.searchParams.set('domains', 'cams_global');
    const body = await getJson(url, 'air quality', options);
    const current = body.current;
    const units = body.current_units;
    if (!current || !units) throw new Error('Open-Meteo air quality response is missing current values or units.');
    requireUnit(units, 'us_aqi', ['usaqi'], 'air quality');
    requireUnit(units, 'pm2_5', ['µg/m³'], 'air quality');
    requireUnit(units, 'pm10', ['µg/m³'], 'air quality');
    return {
      usAqi: finiteValue(current, 'us_aqi', 'air quality', 0),
      pm25MicrogramsM3: finiteValue(current, 'pm2_5', 'air quality', 0),
      pm10MicrogramsM3: finiteValue(current, 'pm10', 'air quality', 0),
      validAtMs: responseTime(current, 'air quality'),
      fetchedAtMs: fetchedTime(options.now),
      source: AIR_SOURCE
    };
  }

  function describeWeatherWMO(code) {
    if (typeof code !== 'number' || !Number.isInteger(code) || code < 0 || code > 99) return 'Conditions unavailable';
    return WMO[code] || 'Unknown conditions';
  }

  function describeAqi(value) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
    if (value <= 50) return 'Good';
    if (value <= 100) return 'Moderate';
    if (value <= 150) return 'Unhealthy for sensitive groups';
    if (value <= 200) return 'Unhealthy';
    if (value <= 300) return 'Very unhealthy';
    return 'Hazardous';
  }

  return { validatePostalCode, resolveLocation, fetchWeather, fetchAirQuality, describeWeatherWMO, describeAqi };
});
