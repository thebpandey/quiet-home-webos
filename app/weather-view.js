(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LauncherWeatherView = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var KEY = 'quiet-home.weather.v1', INTERVAL = 1800000, TIMEOUT = 8000;
  function validLocation(value) {
    return value && /^\d{5}$/.test(value.postalCode) && typeof value.name === 'string' && value.name.length > 0 &&
      typeof value.region === 'string' && value.region.trim() && value.countryCode === 'US' &&
      Number.isFinite(value.latitude) && Math.abs(value.latitude) <= 90 && Number.isFinite(value.longitude) && Math.abs(value.longitude) <= 180 && typeof value.timezone === 'string' && value.timezone.trim();
  }
  function validWeather(value) {
    return value && Number.isFinite(value.temperatureF) && Number.isFinite(value.relativeHumidityPct) && value.relativeHumidityPct >= 0 && value.relativeHumidityPct <= 100 &&
      typeof value.condition === 'string' && Number.isFinite(value.validAtMs) && Number.isFinite(value.fetchedAtMs);
  }
  function validAir(value) {
    return value && Number.isFinite(value.usAqi) && value.usAqi >= 0 && Number.isFinite(value.pm25MicrogramsM3) && value.pm25MicrogramsM3 >= 0 && Number.isFinite(value.pm10MicrogramsM3) && value.pm10MicrogramsM3 >= 0 && Number.isFinite(value.validAtMs) && Number.isFinite(value.fetchedAtMs);
  }
  function createController(options) {
    var engine = options.engine, storage = options.storage, now = options.now || Date.now;
    var later = options.setTimeout, cancel = options.clearTimeout, render = options.render;
    var visible = false, generation = 0, pending = [], timer = null;
    var state = { location: null, weather: null, air: null, weatherStale: false, airStale: false };
    function paint() { render(state); }
    function persist() { try { storage.setItem(KEY, JSON.stringify({ version: 1, location: state.location, weather: state.weather, air: state.air })); } catch (ignored) {} }
    function abort() {
      generation++;
      pending.forEach(function (entry) { entry.controller.abort(); cancel(entry.timer); if (entry.reject) entry.reject(new Error('Request cancelled.')); });
      pending = [];
      if (timer !== null) { cancel(timer); timer = null; }
    }
    function request(method, arg) {
      var controller = new AbortController();
      var entry = { controller: controller, timer: null };
      pending.push(entry);
      return new Promise(function (resolve, reject) {
        entry.reject = reject;
        entry.timer = later(function () { controller.abort(); reject(new Error('Request timed out.')); }, TIMEOUT);
        Promise.resolve().then(function () { return engine[method](arg, { fetch: options.fetch, signal: controller.signal, now: now() }); }).then(resolve, reject);
      }).then(function (result) { finish(); return result; }, function (error) { finish(); throw error; });
      function finish() { cancel(entry.timer); pending = pending.filter(function (item) { return item !== entry; }); }
    }
    function refresh() {
      if (!visible || !state.location || !engine) return;
      var token = generation, location = state.location;
      ['weather', 'air'].forEach(function (kind) {
        var method = kind === 'weather' ? 'fetchWeather' : 'fetchAirQuality';
        request(method, location).then(function (value) {
          if (token !== generation || !visible) return;
          if (!(kind === 'weather' ? validWeather(value) : validAir(value))) throw new Error('Invalid data');
          state[kind] = value; state[kind + 'Stale'] = false; persist(); paint();
        }).catch(function () {
          if (token !== generation || !visible) return;
          state[kind + 'Stale'] = true; paint();
        });
      });
      timer = later(function () { timer = null; refresh(); }, INTERVAL);
    }
    function fresh(value) { return value && value.fetchedAtMs <= now() && now() - value.fetchedAtMs < INTERVAL; }
    function resume() {
      if (!visible || !state.location) return;
      state.weatherStale = Boolean(state.weather && !fresh(state.weather));
      state.airStale = Boolean(state.air && !fresh(state.air));
      paint();
      if (fresh(state.weather) && fresh(state.air)) {
        timer = later(function () { timer = null; refresh(); }, Math.max(0, INTERVAL - Math.max(now() - state.weather.fetchedAtMs, now() - state.air.fetchedAtMs)));
      } else refresh();
    }
    try {
      var saved = JSON.parse(storage.getItem(KEY));
      if (saved && saved.version === 1 && validLocation(saved.location)) {
        state.location = saved.location;
        state.weather = validWeather(saved.weather) ? saved.weather : null;
        state.air = validAir(saved.air) ? saved.air : null;
        state.weatherStale = Boolean(state.weather && !fresh(state.weather));
        state.airStale = Boolean(state.air && !fresh(state.air));
      }
    } catch (ignored) {}
    paint();
    return {
      getState: function () { return state; },
      setVisible: function (value) { if (visible === value) return; visible = value; abort(); if (visible) resume(); },
      saveZip: function (zip) {
        if (!engine) return Promise.reject(new Error('Weather is unavailable.'));
        try { engine.validatePostalCode(zip); } catch (error) { return Promise.reject(error); }
        abort(); var token = generation;
        return request('resolveLocation', zip).then(function (location) {
          if (token !== generation) throw new Error('Location request cancelled.');
          if (!validLocation(location) || location.postalCode !== zip) throw new Error('Location not found.');
          state.location = location; state.weather = null; state.air = null; state.weatherStale = false; state.airStale = false;
          persist(); paint(); if (visible) refresh(); return location;
        }).catch(function (error) { if (token === generation && visible) resume(); throw error; });
      },
      cancel: function () { abort(); if (visible) resume(); }
    };
  }
  return { createController: createController };
}));
