const test = require('node:test');
const assert = require('node:assert/strict');
const Ambient = require('../app/ambient.js');
const STEP = 900000;
const scenes = (count = 4) => Array.from({ length: count }, (_, i) => ({ id: 'scene-' + i,
  title: 'Scene ' + i, location: 'Place', src: 'wallpapers/scene-' + i + '.jpg' }));
function seeded(seed = 42) { return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296); }
function storage() { return { data: null, writes: 0, getItem() { return this.data; },
  setItem(key, value) { this.data = value; this.writes++; } }; }
function harness(options = {}, initial = 100000000) {
  let now = initial, id = 0;
  const jobs = new Map(), loads = [], shown = [], live = new Set(), clocks = [], errors = [];
  const controller = Ambient.createController({ scenes: scenes(), random: seeded(), now: () => now,
    setTimeout(fn, delay) { jobs.set(++id, { fn, due: now + delay }); return id; },
    clearTimeout(key) { jobs.delete(key); }, clock: value => clocks.push(value), error: value => errors.push(value),
    load(scene, success, failure) {
      const resource = { id: scene.id }; live.add(resource);
      const request = { scene, success: () => success(resource), failure, cancelled: false }; loads.push(request);
      return () => { request.cancelled = true; live.delete(resource); };
    }, show: (resource, scene) => shown.push(scene.id), release: resource => live.delete(resource), ...options });
  return { controller, loads, shown, jobs, live, clocks, errors, get now() { return now; },
    accept() { loads.at(-1).success(); }, jump(ms) { now += ms; },
    advance(ms) {
      const end = now + ms;
      while (true) {
        const next = [...jobs].filter(([, j]) => j.due <= end).sort((a, b) => a[1].due - b[1].due)[0];
        if (!next) break;
        now = next[1].due; jobs.delete(next[0]); next[1].fn();
      }
      now = end;
    }
  };
}

test('fresh shuffled bags vary with random seed and visit each scene once without boundary repeats', () => {
  const h = harness(), other = harness({ random: () => .99 });
  h.controller.start(); other.controller.start();
  assert.notEqual(h.loads[0].scene.id, other.loads[0].scene.id);
  h.accept();
  for (let i = 1; i < 12; i++) { h.advance(STEP); h.accept(); }
  for (let i = 0; i < 12; i += 4) assert.equal(new Set(h.shown.slice(i, i + 4)).size, 4);
  assert.notEqual(h.shown[3], h.shown[4]); assert.notEqual(h.shown[7], h.shown[8]);
  h.controller.stop(); other.controller.stop();
});

test('reopen retains the successful scene and only the remaining 15-minute time', () => {
  const store = storage(); const first = harness({ storage: store });
  first.controller.start(); first.accept(); const current = first.shown[0];
  first.advance(300000); first.controller.stop();
  const second = harness({ storage: store, random: () => .99 }, first.now);
  second.controller.start(); second.accept(); assert.equal(second.shown[0], current);
  second.advance(599999); assert.equal(second.loads.length, 1);
  second.advance(1); assert.notEqual(second.loads[1].scene.id, current);
  second.controller.stop();
});

test('suspension stops every timer and resumes at the elapsed bag position', () => {
  const store = storage(); const h = harness({ storage: store });
  h.controller.start(); h.accept();
  const saved = JSON.parse(store.data);
  h.controller.setVisible(false); assert.equal(h.jobs.size, 0);
  h.jump(2 * STEP + 1234); h.controller.setVisible(true);
  assert.equal(h.loads.at(-1).scene.id, saved.bag[1]);
  assert.equal(h.clocks.length, 2); h.accept();
  h.advance(STEP - 1235); assert.equal(h.loads.length, 2);
  h.advance(1); assert.equal(h.loads.length, 3);
  h.controller.stop(); assert.equal(h.live.size, 0); assert.equal(h.jobs.size, 0);
});

test('manifest expansion adds new scenes to the remaining bag and removes stale IDs', () => {
  const store = storage(); const h = harness({ scenes: scenes(17), storage: store });
  h.controller.start(); h.accept(); const initial = h.shown[0]; h.controller.stop();
  const next = harness({ scenes: scenes(24), storage: store }); next.controller.start(); next.accept();
  assert.equal(next.shown[0], initial);
  for (let i = 0; i < 23; i++) { next.advance(STEP); next.accept(); }
  assert.equal(new Set(next.shown).size, 24);
  next.controller.setScenes(scenes(2)); next.accept();
  assert.ok(['scene-0', 'scene-1'].includes(next.shown.at(-1))); next.controller.stop();
});

test('corrupt or unavailable storage and clock rollback cannot stop rotation', () => {
  for (const bad of ['{broken', 'null', JSON.stringify({ version: 99 }),
    JSON.stringify({ version: 1, ids: ['scene-0'], current: 'scene-0', bag: ['scene-0'], at: 1 })]) {
    const store = storage(); store.data = bad;
    const h = harness({ storage: store }); h.controller.start(); h.accept(); h.advance(STEP);
    assert.equal(h.loads.length, 2); h.controller.stop();
  }
  const h = harness({ storage: { getItem() { throw Error('blocked'); }, setItem() { throw Error('quota'); } } });
  h.controller.start(); h.accept(); h.controller.setVisible(false); h.jump(-5 * STEP);
  h.controller.setVisible(true); h.advance(STEP - 1); assert.equal(h.loads.length, 1);
  h.advance(1); assert.equal(h.loads.length, 2); h.controller.stop();
  const store = storage(); const old = harness({ storage: store }); old.controller.start(); old.accept(); old.controller.stop();
  const reset = harness({ storage: store }, old.now - STEP); reset.controller.start(); reset.accept();
  reset.advance(STEP); assert.equal(reset.loads.length, 2); reset.controller.stop();
});

test('failures persist only a successful fallback, cancelled callbacks cannot replace it, and images stay bounded', () => {
  const store = storage(); const h = harness({ storage: store, reducedMotion: () => true });
  h.controller.start(); assert.equal(store.writes, 0);
  h.loads[0].failure(); assert.equal(store.writes, 0); h.accept();
  assert.equal(JSON.parse(store.data).current, h.shown[0]);
  h.advance(STEP); const stale = h.loads.at(-1); const saved = store.data;
  h.controller.setVisible(false); assert.equal(stale.cancelled, true); stale.success();
  assert.equal(store.data, saved); assert.equal(h.shown.length, 1);
  h.controller.setVisible(true);
  for (let i = 0; i < 4; i++) h.loads.at(-1).failure();
  assert.equal(h.errors.length, 1); assert.equal(store.data, saved); assert.ok(h.live.size <= 1);
  h.controller.stop(); assert.equal(h.jobs.size, 0);
});

test('one-scene random mode rotates safely and huge elapsed time stays bounded', () => {
  const h = harness({ scenes: scenes(1) }); h.controller.start(); h.accept();
  h.controller.setVisible(false); h.jump(STEP * 1000000 + 1000); h.controller.setVisible(true);
  assert.equal(h.loads.at(-1).scene.id, 'scene-0'); h.accept(); h.controller.stop();
  let calls = 0;
  const many = harness({ scenes: scenes(24), random: () => { calls++; return .5; } });
  many.controller.start(); many.accept(); many.controller.setVisible(false);
  many.jump(STEP * 1000000 + 1000); many.controller.setVisible(true);
  assert.equal(many.loads.length, 2); assert.ok(calls < 150, 'Long absence must not shuffle a million expired slots');
  many.controller.stop();
});

test('fallback tries every distinct scene across a saved bag boundary before declaring all failed', () => {
  const store = storage();
  store.data = JSON.stringify({ version: 1, ids: ['scene-0', 'scene-1', 'scene-2', 'scene-3'],
    current: 'scene-3', bag: ['scene-0'], at: 100000000 });
  const h = harness({ storage: store, random: () => .99 }); h.controller.start();
  for (let i = 0; i < 4; i++) {
    const request = h.loads.at(-1);
    if (request.scene.id === 'scene-2') { request.success(); break; }
    request.failure();
    assert.ok(h.live.size <= 2);
  }
  assert.deepEqual(h.loads.map(request => request.scene.id), ['scene-3', 'scene-0', 'scene-1', 'scene-2']);
  assert.deepEqual(h.shown, ['scene-2']); assert.equal(h.errors.length, 0);
  assert.equal(JSON.parse(store.data).current, 'scene-2');
  h.controller.stop(); assert.equal(h.live.size, 0); assert.equal(h.jobs.size, 0);
});
