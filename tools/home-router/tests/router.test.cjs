'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Frame, Router, writeMapping, restoreMapping, verifyAssets, targets } = require('../core.cjs');

test('stream frames multiline JSON, quoted braces and chunk boundaries', () => {
  const out = []; const f = new Frame(x => out.push(x));
  for (const s of [' {\n"x":"}', '\\"{", "n":', '1}\n{"ok":true}']) f.push(s);
  f.end(); assert.deepEqual(out, [{ x: '}"{', n: 1 }, { ok: true }]);
});
test('framing rejects junk, mismatch, truncated and oversized replies', () => {
  for (const chunks of [['error'], ['{"x":]'], ['{'], ['{"x":"' + 'x'.repeat(90)]]) {
    assert.throws(() => { const f = new Frame(() => {}, 64); chunks.forEach(s => f.push(s)); f.end(); });
  }
});
const card = id => ({ appId: id, windowType: '_WEBOS_WINDOW_TYPE_CARD' });
const home = { appId: 'com.webos.app.home', windowType: '_WEBOS_WINDOW_TYPE_CARD' };
const focusOf = w => ({ appId: w.appId, type: w.windowType === '_WEBOS_WINDOW_TYPE_CARD' ? 'fullscreen' : 'overlay' });
function harness(enabled = true, bootInput = null) {
  let now = 10000; let launches = 0;
  const r = new Router({ enabled, home, bootInput, apps: ['observed.app'], launch: () => { launches++; }, now: () => now });
  function state(w, focus = w, overrides = {}) {
    for (const k of ['sam', 'sm', 'windows', 'focus']) r.update(k, Object.assign({ returnValue: true, [k === 'focus' ? 'focusedWindowInfo' : k === 'windows' ? 'windows' : 'foregroundAppInfo']: k === 'focus' ? focus.map(focusOf) : w }, overrides));
  }
  return { r, state, tick(n = 800) { now += n; r.tick(); }, count: () => launches };
}
test('only an observed app to stable full Home transition returns once', () => {
  const h = harness(); h.state([card('observed.app')]); h.state([home]); h.tick(); h.tick();
  assert.equal(h.count(), 1); h.state([home]); h.tick(); assert.equal(h.count(), 1);
});
test('normal long playback keeps approved app history but needs fresh complete Home', () => {
  const h = harness(); h.state([card('observed.app')]); h.tick(600000); assert.equal(h.count(), 0);
  h.state([home]); h.tick(749); assert.equal(h.count(), 0); h.tick(1); assert.equal(h.count(), 1);
});

test('captured Stremio retirement and empty handoff keeps proved history until fresh Home', () => {
  let now = 0, launches = 0;
  const r = new Router({ enabled: true, home, apps: ['io.strem.tv'], now: () => now, launch() { launches++; } });
  function send(ms, source, rows) {
    now = ms; r.begin(source); r.update(source, { returnValue: true, [source === 'focus' ? 'focusedWindowInfo' : source === 'windows' ? 'windows' : 'foregroundAppInfo']: rows });
  }
  const app = card('io.strem.tv'), retired = Object.assign({}, app, { displayId: -1 });
  send(6009, 'windows', [app]); send(6010, 'focus', [{ appId: app.appId, type: 'fullscreen' }]);
  send(6015, 'sm', [Object.assign({}, app, { displayId: 0 })]); send(6104, 'sam', [Object.assign({}, app, { displayId: 0 })]);
  assert.equal(r.armed, 'io.strem.tv');
  for (const [ms, source, rows] of [[9109, 'sam', [retired]], [9139, 'sam', []], [9153, 'sm', [retired]], [9154, 'sm', []], [9155, 'focus', []], [9156, 'windows', []]]) {
    send(ms, source, rows); r.tick(); assert.equal(launches, 0); assert.equal(r.armed, 'io.strem.tv'); assert.equal(r.states[source], undefined);
  }
  send(10334, 'focus', [{ appId: home.appId, type: 'fullscreen' }]); send(10337, 'sm', [Object.assign({}, home, { displayId: 0 })]);
  send(10339, 'windows', [home]); send(10392, 'sam', [Object.assign({}, home, { displayId: 0 })]);
  now = 11141; r.tick(); assert.equal(launches, 0); now = 11142; r.tick(); assert.equal(launches, 1);
  now = 12000; r.tick(); assert.equal(launches, 1);
});

test('retirement exception rejects other apps, displays, sources and mixed unsafe windows', () => {
  const retired = Object.assign(card('observed.app'), { displayId: -1 });
  for (const [source, rows, ok] of [
    ['sam', [Object.assign(card('another.app'), { displayId: -1 })], true],
    ['sm', [Object.assign(card('observed.app'), { displayId: 1 })], true],
    ['sam', [Object.assign(card('observed.app'), { displayId: -2 })], true],
    ['windows', [retired], true],
    ['sam', [Object.assign({}, retired, { windowType: '_WEBOS_WINDOW_TYPE_OVERLAY' })], true],
    ['sam', [retired, { appId: 'com.webos.app.settings', windowType: '_WEBOS_WINDOW_TYPE_OVERLAY' }], true],
    ['sm', [null], true], ['sam', [], false]
  ]) {
    const h = harness(); h.state([card('observed.app')]); h.r.update('sam', { returnValue: true, foregroundAppInfo: [retired] });
    h.r.update(source, { returnValue: ok, [source === 'windows' ? 'windows' : 'foregroundAppInfo']: rows });
    h.state([home]); h.tick(); assert.equal(h.count(), 0, source + JSON.stringify(rows));
  }
  const h = harness(); h.state([card('observed.app')]); h.r.update('sam', { returnValue: true, foregroundAppInfo: [retired] });
  h.r.update('windows', { returnValue: true, windows: [{ appId: 'com.webos.app.settings', windowType: '_WEBOS_WINDOW_TYPE_OVERLAY' }] });
  h.state([home]); h.tick(); assert.equal(h.count(), 0);
});
test('captured Stremio Back prompt keeps proved long-playback history through confirmed exit', () => {
  let now = 0, launches = 0;
  const r = new Router({ enabled: true, home, apps: ['io.strem.tv'], now: () => now, launch() { launches++; } });
  const app = card('io.strem.tv'), alert = { appId: 'com.webos.app.alert', windowType: '_WEBOS_WINDOW_TYPE_ALERT' };
  function send(ms, source, rows) { now = ms; r.begin(source); r.update(source, { returnValue: true, [source === 'focus' ? 'focusedWindowInfo' : source === 'windows' ? 'windows' : 'foregroundAppInfo']: rows }); }
  send(80, 'sam', [app]); send(88, 'sm', [app]); send(91, 'windows', [app]); send(104, 'focus', [focusOf(app)]);
  send(601779, 'windows', [app, alert]); assert.equal(r.armed, app.appId); assert.equal(r.states.windows, undefined);
  send(601784, 'focus', []); send(601786, 'focus', [{ appId: 'com.webos.systemui.notification', type: 'alert' }]);
  r.tick(); assert.equal(launches, 0); assert.equal(r.states.focus, undefined); assert.equal(r.armed, app.appId);
  // Closing the prompt does not refresh the long-idle SAM/SM snapshots.
  send(602945, 'focus', [focusOf(app)]); send(602947, 'windows', [app]); assert.equal(r.armed, app.appId);
  for (const [ms, source, rows] of [[603910, 'focus', []], [603927, 'sm', [Object.assign({}, app, { displayId: -1 })]], [603928, 'sm', []], [603928, 'windows', []], [603960, 'sam', [Object.assign({}, app, { displayId: -1 })]], [603961, 'sam', []]]) send(ms, source, rows);
  r.tick(); assert.equal(launches, 0);
  send(605363, 'windows', [home]); send(605364, 'focus', [focusOf(home)]); send(605371, 'sm', [home]); send(605437, 'sam', [home]);
  now = 606186; r.tick(); assert.equal(launches, 0); now = 606187; r.tick(); assert.equal(launches, 1);
  now = 610000; r.tick(); assert.equal(launches, 1);
});
test('exit prompt cannot mask mixed Settings or an uncorrelated notification', () => {
  const app = card('observed.app'), alert = { appId: 'com.webos.app.alert', windowType: '_WEBOS_WINDOW_TYPE_ALERT' };
  const settings = { appId: 'com.webos.app.settings', windowType: '_WEBOS_WINDOW_TYPE_OVERLAY' };
  const mixed = harness(); mixed.state([app]); mixed.r.update('windows', { returnValue: true, windows: [app, alert, settings] });
  mixed.state([home]); mixed.tick(); assert.equal(mixed.count(), 0);
  const during = harness(); during.state([app]); during.r.update('windows', { returnValue: true, windows: [app, alert] });
  during.r.update('sm', { returnValue: true, foregroundAppInfo: [settings] }); during.state([home]); during.tick(); assert.equal(during.count(), 0);
  const cleared = harness(); cleared.state([app]); cleared.r.update('windows', { returnValue: true, windows: [app, alert] });
  cleared.r.update('windows', { returnValue: true, windows: [app] });
  cleared.r.update('focus', { returnValue: true, focusedWindowInfo: [{ appId: 'com.webos.systemui.notification', type: 'alert' }] });
  cleared.state([home]); cleared.tick(); assert.equal(cleared.count(), 0);
});
test('captured Prime native prompt focus-first order restores only proved stale app history', () => {
  let now = 0, launches = 0;
  const app = card('amazon'), alert = { appId: 'com.webos.app.alert', windowType: '_WEBOS_WINDOW_TYPE_ALERT' };
  const r = new Router({ enabled: true, home, apps: ['amazon'], now: () => now, launch() { launches++; } });
  function send(ms, source, rows) { now = ms; r.begin(source); r.update(source, { returnValue: true, [source === 'focus' ? 'focusedWindowInfo' : source === 'windows' ? 'windows' : 'foregroundAppInfo']: rows }); }
  send(1, 'sam', [app]); send(2, 'sm', [app]); send(3, 'windows', [app]); send(39, 'focus', [focusOf(app)]);
  send(24934, 'focus', []); send(24999, 'focus', [{ appId: 'com.webos.systemui.notification', type: 'alert' }]);
  assert.equal(r.armed, null); r.tick(); assert.equal(launches, 0);
  send(25025, 'windows', [app, alert]); assert.equal(r.armed, 'amazon'); assert.equal(r.states.windows, undefined); assert.equal(r.states.focus, undefined);
  send(26000, 'focus', [focusOf(app)]); send(26001, 'windows', [app]); assert.equal(r.armed, 'amazon');
  send(30000, 'focus', []); send(30001, 'sam', [Object.assign({}, app, { displayId: -1 })]); send(30002, 'sam', []); send(30003, 'sm', []); send(30004, 'windows', []);
  send(31000, 'windows', [home]); send(31001, 'focus', [focusOf(home)]); send(31002, 'sm', [home]); send(31003, 'sam', [home]);
  now = 31752; r.tick(); assert.equal(launches, 0); now = 31753; r.tick(); assert.equal(launches, 1);
});
test('focus-first candidate cannot survive expiry, Settings or another app', () => {
  for (const mode of ['unmatched', 'expired', 'settings', 'other-app']) {
    let now = 0, launches = 0; const app = card('amazon');
    const r = new Router({ enabled: true, home, apps: ['amazon', 'netflix'], now: () => now, launch() { launches++; } });
    function full(w) { for (const source of ['sam', 'sm', 'windows', 'focus']) r.update(source, { returnValue: true, [source === 'focus' ? 'focusedWindowInfo' : source === 'windows' ? 'windows' : 'foregroundAppInfo']: [source === 'focus' ? focusOf(w) : w] }); }
    full(app); now = 10000; r.update('focus', { returnValue: true, focusedWindowInfo: [{ appId: 'com.webos.systemui.notification', type: 'alert' }] }); assert.equal(r.armed, null);
    if (mode === 'expired') { now += 4001; r.tick(); }
    if (mode === 'settings' || mode === 'other-app') r.update('sm', { returnValue: true, foregroundAppInfo: [mode === 'settings' ? { appId: 'com.webos.app.settings', windowType: '_WEBOS_WINDOW_TYPE_OVERLAY' } : card('netflix')] });
    if (mode !== 'unmatched') r.update('windows', { returnValue: true, windows: [app, { appId: 'com.webos.app.alert', windowType: '_WEBOS_WINDOW_TYPE_ALERT' }] });
    assert.equal(r.armed, null, mode); full(home); now += 800; r.tick(); assert.equal(launches, 0, mode);
  }
});
test('the observed Home CARD and fullscreen focus route, while unknown focus types veto', () => {
  const h = harness(); h.state([card('observed.app')]); h.state([home]);
  h.r.update('focus', { returnValue: true, focusedWindowInfo: [{ appId: 'com.webos.app.home', type: 'fullscreen' }] });
  h.tick(); assert.equal(h.count(), 1);
  const unsafe = harness(); unsafe.state([card('observed.app')]); unsafe.state([home]);
  unsafe.r.update('focus', { returnValue: true, focusedWindowInfo: [{ appId: 'com.webos.app.home', type: 'overlay' }] });
  unsafe.tick(); assert.equal(unsafe.count(), 0);
});
test('disabled, missing, stale, denied and malformed state cannot return', () => {
  for (const mode of ['disabled', 'missing', 'stale', 'denied', 'malformed']) {
    const h = harness(mode !== 'disabled'); h.state([card('observed.app')]); h.state([home]);
    if (mode === 'missing') h.r.invalidate('focus');
    if (mode === 'denied') h.r.update('focus', { returnValue: false });
    if (mode === 'malformed') h.r.update('windows', { returnValue: true, windows: [] });
    h.tick(mode === 'stale' ? 6000 : 800); assert.equal(h.count(), 0, mode);
  }
});
test('every source and focus veto overlays, Settings, saver and app switches', () => {
  for (const source of ['sam', 'sm', 'windows', 'focus']) for (const id of ['com.webos.app.settings', 'com.webos.app.screensaver', 'quicksettings', 'dialog', 'another.app']) {
    const h = harness(); h.state([card('observed.app')]); h.state([home]);
    const key = source === 'focus' ? 'focusedWindowInfo' : source === 'windows' ? 'windows' : 'foregroundAppInfo';
    h.r.update(source, { returnValue: true, [key]: [home, { appId: id, windowType: '_WEBOS_WINDOW_TYPE_OVERLAY' }] });
    h.tick(); assert.equal(h.count(), 0, source + id);
    h.state([home]); h.tick(); assert.equal(h.count(), 0, 'veto disarms transition');
  }
});
test('stop cancels pending return and later updates', () => {
  const h = harness(); h.state([card('observed.app')]); h.state([home]); h.r.stop(); h.tick(); h.state([home]); h.tick(); assert.equal(h.count(), 0);
});
test('configured boot input never becomes a normal app exit destination', () => {
  const h = harness(true, 'com.webos.app.hdmi2'); h.state([card('observed.app')]);
  h.state([card('com.webos.app.hdmi2')]); h.tick(); assert.equal(h.count(), 0);
  h.state([home]); h.tick(); assert.equal(h.count(), 0);
});

test('unmatched LG alerts remain permanent vetoes for normal app exit routing', () => {
  for (const appId of ['com.webos.app.alert', 'com.webos.systemui.notification']) {
    const h = harness(); h.state([card('observed.app')]);
    h.state([home, { appId, windowType: 'unknown_startup_style' }]); h.tick();
    h.state([home]); h.tick(); assert.equal(h.count(), 0);
  }
});

test('boot routes one complete stable Home after native setup owned by the monitor', () => {
  let now = 10000, launches = 0;
  const r = new Router({ enabled: true, home, apps: [], boot: true, now: () => now, launch() { launches++; } });
  function full() { for (const k of ['sam', 'sm', 'windows', 'focus']) r.update(k, { returnValue: true, [k === 'focus' ? 'focusedWindowInfo' : k === 'windows' ? 'windows' : 'foregroundAppInfo']: [k === 'focus' ? focusOf(home) : home] }); }
  full(); now += 749; r.tick(); assert.equal(launches, 0);
  now += 1; r.tick(); assert.equal(launches, 1); full(); now += 6000; r.tick(); assert.equal(launches, 1);
});
test('HOME preserves keys and original bytes; restore keeps later unrelated edits and advances mtime', async () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'router-'));
  try {
    const file = path.join(d, 'keys'); const backup = path.join(d, 'backup');
    const bytes = '{ "412": {"action":"pass"}, "139":{"action":"pass"}, "773":{"action":"ignore"} }\n';
    fs.writeFileSync(file, bytes); await writeMapping(file, backup);
    assert.equal(fs.readFileSync(backup, 'utf8'), bytes);
    const obj = JSON.parse(fs.readFileSync(file)); assert.equal(obj['773'].id, 'com.local.quietlauncher'); assert.equal(obj['139'].action, 'pass');
    obj['7'] = { action: 'pass' }; fs.writeFileSync(file, JSON.stringify(obj)); const before = fs.statSync(file).mtimeMs;
    await restoreMapping(file, backup); const result = JSON.parse(fs.readFileSync(file));
    assert.deepEqual(result['773'], { action: 'ignore' }); assert.equal(result['7'].action, 'pass'); assert.ok(Math.floor(fs.statSync(file).mtimeMs / 1000) > Math.floor(before / 1000));
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});
test('restore never deletes a new config and refuses changed HOME ownership', async () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'router-'));
  try {
    const f = path.join(d, 'keys'), b = path.join(d, 'backup'); await writeMapping(f, b); await restoreMapping(f, b);
    assert.deepEqual(JSON.parse(fs.readFileSync(f)), {});
    await writeMapping(f, b); fs.writeFileSync(f, '{"773":{"action":"pass"}}'); await assert.rejects(restoreMapping(f, b), /changed HOME/);
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});
test('asset hashes and manifest path traversal fail closed', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'router-'));
  try { fs.writeFileSync(path.join(d, 'x'), 'wrong'); assert.throws(() => verifyAssets(d, { x: '0'.repeat(64) })); assert.throws(() => verifyAssets(d, { '../x': '0'.repeat(64) })); }
  finally { fs.rmSync(d, { recursive: true, force: true }); }
});
test('target discovery requires unique allowed exe, ARM32 and safe mappings', () => {
  const elf = Buffer.alloc(20); elf.write('\x7fELF', 0, 'binary'); elf[4] = 1; elf[5] = 1; elf.writeUInt16LE(40, 18);
  const rows = [{ pid: 80, name: 'lginput2', exe: '/usr/sbin/lginput2', elf, maps: '', start: '100' }, { pid: 90, name: 'micomservice', exe: '/usr/sbin/micomservice', elf, maps: '', start: '101' }];
  assert.deepEqual(targets(rows).map(x => x.pid), [80, 90]);
  assert.throws(() => targets(rows.concat(rows[0]))); assert.throws(() => targets([Object.assign({}, rows[0], { exe: '/tmp/lginput2' }), rows[1]]));
  assert.throws(() => targets([Object.assign({}, rows[0], { maps: '/foreign/libinputhookpp.so' }), rows[1]]));
});
