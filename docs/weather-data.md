# Weather data

Quiet Home resolves a user-entered five-digit US ZIP code to a city location. It does not use device geolocation. Weather and air quality are separate Open-Meteo requests. Both accept an injected `fetch` function and abort signal, so the caller controls request timing and cancellation.

`app/weather.js` exposes:

- `validatePostalCode(zip)` returns the validated ZIP string and preserves leading zeroes.
- `resolveLocation(zip, { fetch, signal })` returns `postalCode`, `name`, `region`, `countryCode`, `latitude`, `longitude`, and `timezone`.
- `fetchWeather(location, { fetch, signal, now })` returns Fahrenheit temperature, relative humidity, WMO condition code and text, provider-reported day/night (`isDay`), valid time, fetch time, and source. `isDay` is `true` when Open-Meteo reports daytime (`is_day: 1`) and `false` for nighttime (`is_day: 0`); missing or invalid values fail the weather request.
- `fetchAirQuality(location, { fetch, signal, now })` returns US AQI, PM2.5, PM10, valid time, fetch time, and source.
- `describeWeatherWMO(code)` and `describeAqi(value)` map known codes and AQI ranges to short labels.

The module rejects an invalid location, HTTP error, invalid JSON, missing or null data, non-finite values, and unexpected units. It does not replace missing measurements with zero. Weather and air quality calls fail independently.

## Data limits

Weather values come from forecast models. Open-Meteo selects a suitable model for the city; the North American match uses NOAA HRRR where available, which updates hourly. These values are not readings from a local weather station.

The US AQI and particle values use the CAMS Global atmospheric composition model. Its grid is about 45 km, its native time step is 3 hours, and it updates about every 12 hours. The API may interpolate values to hourly steps. Treat them as modeled air-quality context, not a nearby monitor reading. PM2.5 does not identify its source, so do not call it smoke. The dust field is documented as Saharan dust and is not a smoke measurement.

Open-Meteo's pollen fields are Europe-only. This API path does not provide US pollen or allergen data. Do not show a pollen value when it is unavailable.

## Display and attribution

The UI should show the data's valid time and retain the last successful value with a separate fetch time. A 20–30 minute UI cache is a reasonable limit on requests; hide-time polling and stale-state display belong to the UI controller. Air-quality values may remain unchanged between model updates.

Credit Open-Meteo for weather data. Credit both Open-Meteo and CAMS Global for air-quality data. Weather and air-quality data are licensed under CC BY 4.0; the free API is for noncommercial use and is rate-limited. Review [Open-Meteo terms](https://open-meteo.com/en/terms) before use beyond a private home launcher.

## API references

- [Forecast API](https://open-meteo.com/en/docs)
- [Air Quality API](https://open-meteo.com/en/docs/air-quality-api)
- [Geocoding API](https://open-meteo.com/en/docs/geocoding-api)
- [Open-Meteo terms](https://open-meteo.com/en/terms)
