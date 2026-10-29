const test = require('node:test');
const assert = require('node:assert/strict');
let view;
try { view = require('../app/weather-view.js'); } catch (e) { if (e.code !== 'MODULE_NOT_FOUND') throw e; view = {}; }
test('weather controller exposes the settings and lifecycle actions', () => {
  assert.equal(typeof view.createController, 'function');
});
const location = zip => ({ postalCode: zip, name: 'Springfield', region: 'IL', countryCode: 'US', latitude: 39.8, longitude: -89.6, timezone: 'America/Chicago' });
const weather = time => ({ temperatureF: 70, relativeHumidityPct: 50, condition: 'Clear', validAtMs: time, fetchedAtMs: time });
const air = time => ({ usAqi: 42, pm25MicrogramsM3: 4, pm10MicrogramsM3: 8, validAtMs: time, fetchedAtMs: time });
const flush = () => new Promise(resolve => setImmediate(resolve));
function harness() {
  let saved = null, clock = 100000, id = 0;
  const jobs = new Map(), calls = [], paints = [];
  const engine = {
    validatePostalCode(zip) { if (!/^\d{5}$/.test(zip)) throw Error('Enter a five-digit ZIP.'); },
    resolveLocation(zip) { return new Promise((resolve, reject) => calls.push({ kind: 'location', zip, resolve, reject })); },
    fetchWeather() { return new Promise((resolve, reject) => calls.push({ kind: 'weather', resolve, reject })); },
    fetchAirQuality() { return new Promise((resolve, reject) => calls.push({ kind: 'air', resolve, reject })); }
  };
  const options = { engine, storage: { getItem: () => saved, setItem: (_, value) => { saved = value; } },
    now: () => clock, setTimeout: (fn, ms) => { jobs.set(++id, { fn, ms }); return id; }, clearTimeout: key => jobs.delete(key),
    render: state => paints.push({ ...state }) };
  const controller = view.createController(options);
  return { controller, calls, paints, jobs, options, setClock: value => { clock = value; }, saved: () => saved };
}
test('invalid ZIP keeps the previous selection and a failed lookup does not commit', async () => {
  const h = harness(); h.controller.setVisible(true);
  await assert.rejects(h.controller.saveZip('1234'), /five-digit/);
  const save = h.controller.saveZip('62701'); await flush();
  h.calls[0].reject(Error('Location not found')); await assert.rejects(save, /not found/);
  assert.equal(h.controller.getState().location, null);
  assert.equal(h.saved(), null);
});
test('new location prevents a late old lookup from overwriting it', async () => {
  const h = harness(); h.controller.setVisible(true);
  const old = h.controller.saveZip('01234'); const oldRejected = assert.rejects(old, /cancelled/); await flush();
  const next = h.controller.saveZip('62701'); await flush();
  h.calls[1].resolve(location('62701')); await next; await flush();
  h.calls[0].resolve(location('01234')); await oldRejected;
  assert.equal(h.controller.getState().location.postalCode, '62701');
});
test('cached readings survive failures and resume does not poll while hidden', async () => {
  const h = harness(); h.controller.setVisible(true);
  const save = h.controller.saveZip('62701'); await flush(); h.calls[0].resolve(location('62701')); await save; await flush();
  h.calls.find(c => c.kind === 'weather').resolve(weather(100000)); h.calls.find(c => c.kind === 'air').resolve(air(100000)); await flush();
  h.controller.setVisible(false); assert.equal(h.jobs.size, 0);
  const count = h.calls.length; h.controller.setVisible(true); await flush(); assert.equal(h.calls.length, count);
  h.controller.setVisible(false); h.setClock(2000000); h.controller.setVisible(true); await flush();
  h.calls.filter(c => c.kind === 'weather').at(-1).reject(Error('offline'));
  h.calls.filter(c => c.kind === 'air').at(-1).reject(Error('offline')); await flush();
  assert.equal(h.controller.getState().weather.temperatureF, 70);
  assert.equal(h.controller.getState().weatherStale, true);
  assert.equal(h.controller.getState().airStale, true);
  h.controller.setVisible(false);
});
test('valid cached location and readings restore without a network request', async () => {
  const h = harness(); h.controller.setVisible(true);
  const save = h.controller.saveZip('01234'); await flush(); h.calls[0].resolve(location('01234')); await save; await flush();
  h.calls.find(c => c.kind === 'weather').resolve(weather(100000)); h.calls.find(c => c.kind === 'air').resolve(air(100000)); await flush(); h.controller.setVisible(false);
  const otherCalls = h.calls.length; const restored = view.createController(h.options); restored.setVisible(true); await flush();
  assert.equal(restored.getState().location.postalCode, '01234'); assert.equal(restored.getState().air.usAqi, 42); assert.equal(h.calls.length, otherCalls); restored.setVisible(false);
});

test('AQI above 500 is saved and restored, while invalid AQI is rejected', async () => {
  const h = harness(); h.controller.setVisible(true);
  const save = h.controller.saveZip('62701'); await flush(); h.calls[0].resolve(location('62701')); await save; await flush();
  h.calls.find(c => c.kind === 'weather').resolve(weather(100000));
  h.calls.find(c => c.kind === 'air').resolve({ ...air(100000), usAqi: 600 }); await flush();
  assert.equal(h.controller.getState().air.usAqi, 600);
  h.controller.setVisible(false);
  const restored = view.createController(h.options);
  assert.equal(restored.getState().air.usAqi, 600);
  for (const invalid of [-1, NaN, Infinity]) {
    const snapshot = JSON.parse(h.saved()); snapshot.air.usAqi = invalid;
    const invalidOptions = { ...h.options, storage: { getItem: () => JSON.stringify(snapshot), setItem() {} } };
    assert.equal(view.createController(invalidOptions).getState().air, null);
  }
});

test('invalid live AQI values are rejected', async () => {
  for (const invalid of [-1, NaN, Infinity]) {
    const h = harness(); h.controller.setVisible(true);
    const save = h.controller.saveZip('62701'); await flush(); h.calls[0].resolve(location('62701')); await save; await flush();
    h.calls.find(c => c.kind === 'air').resolve({ ...air(100000), usAqi: invalid }); await flush();
    assert.equal(h.controller.getState().air, null);
    assert.equal(h.controller.getState().airStale, true);
    h.controller.setVisible(false);
  }
});
