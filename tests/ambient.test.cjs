const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
let Ambient;
try { Ambient = require('../app/ambient.js'); } catch (error) {
  if (error.code !== 'MODULE_NOT_FOUND') throw error;
  Ambient = {};
}
const manifest = () => Array.from({ length: 24 }, (_, i) => ({ id: 'scene-' + i,
  title: 'Scene ' + i, location: 'Location ' + i, src: 'wallpapers/scene-' + i + '.jpg' }));

test('Central clock follows winter, summer, and both DST changes', () => {
  assert.equal(typeof Ambient.formatClock, 'function', 'Central clock must be implemented');
  for (const [utc, time, date] of [
    ['2026-01-15T18:05:00Z', '12:05 PM', 'Thursday, January 15, 2026'],
    ['2026-07-15T18:05:00Z', '1:05 PM', 'Wednesday, July 15, 2026'],
    ['2026-03-08T07:59:00Z', '1:59 AM', 'Sunday, March 8, 2026'],
    ['2026-03-08T08:00:00Z', '3:00 AM', 'Sunday, March 8, 2026'],
    ['2026-11-01T06:59:00Z', '1:59 AM', 'Sunday, November 1, 2026'],
    ['2026-11-01T07:00:00Z', '1:00 AM', 'Sunday, November 1, 2026']
  ]) assert.deepEqual(Ambient.formatClock(Date.parse(utc)), { time, date, zone: 'Central Time' });
});

test('manifest rejects missing, duplicate, external, and escaped image paths', () => {
  assert.equal(typeof Ambient.validateManifest, 'function', 'Safe manifest validation is required');
  assert.deepEqual(Ambient.validateManifest(manifest()), manifest());
  for (const change of [{ id: '../bad' }, { src: 'https://example.com/a.jpg' },
    { src: '../a.jpg' }, { src: 'wallpapers/../a.jpg' }, { src: 'wallpapers/a.JPG' },
    { title: '' }, { location: null }]) {
    const list = manifest(); list[0] = { ...list[0], ...change };
    assert.throws(() => Ambient.validateManifest(list));
  }
  const duplicate = manifest(); duplicate[1] = duplicate[0];
  assert.throws(() => Ambient.validateManifest(duplicate));
  assert.throws(() => Ambient.validateManifest([]));
  assert.throws(() => Ambient.validateManifest(manifest().concat({ id: 'extra', title: 'Extra', location: 'Extra', src: 'wallpapers/extra.jpg' })));
});

test('runtime accepts a partial preview and rotation wraps through its available scenes', () => {
  for (const count of [1, 17, 24]) {
    const scenes = manifest().slice(0, count);
    assert.deepEqual(Ambient.validateManifest(scenes), scenes);
  }
  const h = harness({ scenes: [] }); h.controller.start();
  h.controller.setScenes(manifest().slice(0, 17)); h.loads[0].success();
  h.controller.setVisible(false); h.jump(900000 * 17);
  h.controller.setVisible(true); assert.equal(h.loads[1].scene.id, 'scene-0');
  h.controller.stop();
});

// Replace only time, scheduling, and image I/O; the real controller chooses scenes
// and owns all resources. Each allocated resource must eventually be released.
function harness(options = {}) {
  let now = 12345;
  let id = 0;
  const jobs = new Map(), loads = [], shown = [], clocks = [], errors = [], live = new Set();
  const controller = Ambient.createController({ scenes: manifest(), now: () => now,
    setTimeout: (fn, delay) => { jobs.set(++id, { fn, due: now + delay }); return id; },
    clearTimeout: key => jobs.delete(key),
    load: (scene, success, failure) => {
      const resource = { src: scene.src }; live.add(resource);
      const entry = { scene, resource, success: () => success(resource), failure,
        cancelled: false };
      loads.push(entry);
      return () => { entry.cancelled = true; live.delete(resource); };
    },
    show: (resource, scene) => shown.push(scene.id),
    release: resource => live.delete(resource),
    clock: value => clocks.push(value), error: value => errors.push(value), ...options });
  return { controller, jobs, loads, shown, clocks, errors, live,
    advance(ms) {
      const end = now + ms;
      while (true) {
        const next = [...jobs].filter(([, job]) => job.due <= end).sort((a, b) => a[1].due - b[1].due)[0];
        if (!next) break;
        now = next[1].due; jobs.delete(next[0]); next[1].fn();
      }
      now = end;
    },
    jump(ms) { now += ms; }
  };
}

test('controller loads one scene at a time and rotates at elapsed 15-minute boundaries', () => {
  assert.equal(typeof Ambient.createController, 'function', 'Ambient controller is required');
  const h = harness(); h.controller.start();
  assert.equal(h.loads.length, 1); assert.equal(h.loads[0].scene.id, 'scene-0');
  assert.equal(h.shown.length, 0);
  h.loads[0].success(); assert.deepEqual(h.shown, ['scene-0']);
  h.advance(900000 - 1); assert.equal(h.loads.length, 1);
  h.advance(1); assert.equal(h.loads[1].scene.id, 'scene-1');
  assert.deepEqual(h.shown, ['scene-0']); // Keep the old image until the next is loaded.
  h.loads[1].success(); assert.equal(h.live.size, 2);
  h.advance(700); assert.equal(h.live.size, 2, 'The outgoing frame must stay during the incoming fade');
  h.advance(1299); assert.equal(h.live.size, 2, 'Keep both frames until the two-second CSS fade finishes');
  h.advance(101); assert.equal(h.live.size, 1, 'Release the outgoing frame after the fade safety margin');
  h.controller.stop(); assert.equal(h.live.size, 0); assert.equal(h.jobs.size, 0);
});

test('minute-boundary clock ticks stop while hidden and resume skips elapsed slots', () => {
  const h = harness(); h.controller.start(); h.loads[0].success();
  h.advance(47654); assert.equal(h.clocks.length, 1);
  h.advance(1); assert.equal(h.clocks.length, 2);
  h.controller.setVisible(false); assert.equal(h.jobs.size, 0);
  h.jump(900000 * 27); assert.equal(h.loads.length, 1); assert.equal(h.clocks.length, 2);
  h.controller.setVisible(true);
  assert.equal(h.clocks.length, 3); assert.equal(h.loads[1].scene.id, 'scene-3');
  h.controller.stop(); assert.equal(h.jobs.size, 0);
});

test('hidden loading is cancelled and late callbacks cannot replace the visible scene', () => {
  const h = harness(); h.controller.start();
  h.controller.setVisible(false); assert.equal(h.loads[0].cancelled, true);
  h.loads[0].success(); assert.deepEqual(h.shown, []);
  h.controller.setVisible(true); assert.equal(h.loads.length, 2);
  h.loads[1].success(); assert.deepEqual(h.shown, ['scene-0']);
  h.controller.stop();
});

test('a failed image tries the next scene with a bounded fallback and keeps current image', () => {
  const h = harness(); h.controller.start(); h.loads[0].success(); h.advance(900000);
  h.loads[1].failure(); assert.equal(h.loads[2].scene.id, 'scene-2');
  assert.deepEqual(h.shown, ['scene-0']); assert.ok(h.live.size <= 2);
  for (let i = 2; i <= 24; i++) h.loads[i].failure();
  assert.equal(h.loads.length, 25); assert.equal(h.errors.length, 1);
  assert.deepEqual(h.shown, ['scene-0']); assert.equal(h.live.size, 1);
  h.controller.stop();
});

test('reduced motion releases the previous image immediately and repeat start adds no work', () => {
  const h = harness({ reducedMotion: () => true });
  h.controller.start(); h.controller.start(); assert.equal(h.loads.length, 1);
  h.loads[0].success(); h.advance(900000); h.loads[1].success();
  assert.equal(h.live.size, 1); h.controller.stop();
});

test('browser script exposes ambient API without CommonJS', () => {
  assert.equal(typeof Ambient.formatClock, 'function');
  const context = vm.createContext({ Intl, Date });
  vm.runInContext(fs.readFileSync(require.resolve('../app/ambient.js'), 'utf8'), context);
  assert.equal(context.LauncherAmbient.formatClock(Date.parse('2026-07-15T18:05:00Z')).time, '1:05 PM');
});

test('clock starts without a manifest and accepts scenes later without changing the cycle', () => {
  const h = harness({ scenes: [] }); h.controller.start();
  assert.equal(h.clocks.length, 1); assert.equal(h.loads.length, 0);
  h.jump(1800000); h.controller.setScenes(manifest());
  assert.equal(h.loads[0].scene.id, 'scene-2');
  h.controller.stop();
});

test('hiding during a fade releases the outgoing image and all timers', () => {
  const h = harness(); h.controller.start(); h.loads[0].success();
  h.advance(900000); h.loads[1].success(); assert.equal(h.live.size, 2);
  h.controller.setVisible(false); assert.equal(h.live.size, 1); assert.equal(h.jobs.size, 0);
  h.jump(900000 * 23); h.controller.setVisible(true);
  assert.equal(h.loads[2].scene.id, 'scene-0'); h.controller.stop();
});

test('package allowlist accepts exactly the manifest assets and rejects unknown files or links', t => {
  const path = require('node:path');
  const os = require('node:os');
  const { checkAssets } = require('../scripts/check.cjs');
  assert.equal(typeof checkAssets, 'function', 'Package allowlist must support manifest assets');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'quiet-assets-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const app = path.join(root, 'app'); fs.mkdirSync(app);
  fs.mkdirSync(path.join(app, 'weather-icons'));
  for (const name of ['clear-day.svg', 'clear-night.svg', 'partly-cloudy-day.svg', 'partly-cloudy-night.svg',
    'cloudy.svg', 'fog.svg', 'rain.svg', 'snow.svg', 'storm.svg', 'unknown.svg']) fs.writeFileSync(path.join(app, 'weather-icons', name), 'weather icon fixture');
  fs.mkdirSync(path.join(app, 'icons'));
  for (const name of ['stremio.svg', 'netflix.png', 'prime-video.png', 'hbo-max.png',
    'youtube.png', 'hdmi.svg', 'settings.svg', 'all-apps.svg']) fs.writeFileSync(path.join(app, 'icons', name), 'icon fixture');
  for (const file of ['appinfo.json', 'ambient.js', 'core.js', 'icon.png', 'index.html',
    'main.js', 'platform.js', 'styles.css', 'tiles.json', 'weather.js', 'weather-view.js', 'quotes.js', 'quotes.json']) fs.writeFileSync(path.join(app, file), 'fixture');
  fs.cpSync(path.join(__dirname, '../app/fonts'), path.join(app, 'fonts'), { recursive: true });
  fs.copyFileSync(path.join(__dirname, '../app/styles.css'), path.join(app, 'styles.css'));
  fs.writeFileSync(path.join(app, 'wallpapers.json'), JSON.stringify(manifest()));
  fs.mkdirSync(path.join(app, 'wallpapers'));
  for (const scene of manifest()) fs.writeFileSync(path.join(app, scene.src), 'image fixture');
  assert.doesNotThrow(() => checkAssets(app));
  // A partial preview must package only its real files, while the default
  // release gate must still reject it. The image I/O here is real local I/O.
  const partial = manifest().slice(0, 17);
  fs.writeFileSync(path.join(app, 'wallpapers.json'), JSON.stringify(partial));
  for (const scene of manifest().slice(17)) fs.unlinkSync(path.join(app, scene.src));
  assert.throws(() => checkAssets(app), /24/);
  assert.doesNotThrow(() => checkAssets(app, { allowPartial: true }));
  fs.writeFileSync(path.join(app, 'wallpapers.json'), '[]');
  assert.throws(() => checkAssets(app, { allowPartial: true }));
  fs.writeFileSync(path.join(app, 'wallpapers.json'), JSON.stringify(manifest()));
  for (const scene of manifest().slice(17)) fs.writeFileSync(path.join(app, scene.src), 'image fixture');
  const secret = path.join(app, '.env'); fs.writeFileSync(secret, 'private fixture');
  assert.throws(() => checkAssets(app)); fs.unlinkSync(secret);
  const unexpected = path.join(app, 'wallpapers', 'extra.jpg'); fs.writeFileSync(unexpected, 'fixture');
  assert.throws(() => checkAssets(app)); fs.unlinkSync(unexpected);
  fs.writeFileSync(path.join(app, 'wallpapers.json'), JSON.stringify(manifest().map((scene, i) =>
    i === 0 ? { ...scene, src: '../private.jpg' } : scene)));
  assert.throws(() => checkAssets(app));
  fs.writeFileSync(path.join(app, 'wallpapers.json'), JSON.stringify(manifest()));
  fs.renameSync(path.join(app, 'wallpapers'), path.join(root, 'images'));
  fs.symlinkSync(path.join(root, 'images'), path.join(app, 'wallpapers'), 'junction');
  assert.throws(() => checkAssets(app));
});
