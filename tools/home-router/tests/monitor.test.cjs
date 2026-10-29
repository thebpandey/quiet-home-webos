'use strict';
const test = require('node:test'); const assert = require('node:assert/strict'); const { EventEmitter } = require('node:events');
const { monitor, gate } = require('../monitor.cjs');
test('missing/manual gates keep HOME, exit and boot disabled', () => {
  assert.throws(() => gate({ identity: 'first-tv-65' }, 'home'));
  assert.doesNotThrow(() => gate({ identity: 'first-tv-65', ready: true }, 'home'));
  assert.throws(() => gate({ identity: 'first-tv-65', ready: true }, 'exit'));
  const g = { identity: 'first-tv-65', ready: true, homeTest: true, settingsTest: true, exitTest: true, home: { appId: 'com.webos.app.home', windowType: '_WEBOS_WINDOW_TYPE_CARD' }, apps: ['netflix'] };
  assert.doesNotThrow(() => gate(g, 'exit')); assert.throws(() => gate(g, 'boot'));
  assert.doesNotThrow(() => gate(Object.assign({}, g, { bootApproved: true }), 'boot'));
  assert.throws(() => gate(Object.assign({}, g, { apps: ['com.webos.app.hdmi1'] }), 'exit'));
});

test('only the two explicit TV profiles pass with their own complete manual gates', () => {
  const observed = { ready: true, homeTest: true, settingsTest: true, exitTest: true, bootApproved: true,
    home: { appId: 'com.webos.app.home', windowType: '_WEBOS_WINDOW_TYPE_CARD' }, apps: ['netflix'] };
  for (const identity of ['first-tv-65', 'second-tv-55']) {
    for (const phase of ['home', 'exit', 'boot']) assert.doesNotThrow(() => gate(Object.assign({}, observed, { identity }), phase));
  }
  for (const phase of ['home', 'exit', 'boot']) assert.throws(() => gate(Object.assign({}, observed, { identity: 'another-tv' }), phase));
  for (const proof of ['ready', 'homeTest', 'settingsTest', 'exitTest', 'bootApproved']) {
    assert.throws(() => gate(Object.assign({}, observed, { identity: 'second-tv-55', [proof]: false }), 'boot'));
  }
});

function bootFixture(options = {}) {
  let now = 0, mono = 0, launches = 0, bootstraps = 0, tick, stops = 0, ready = options.ready !== false;
  const generations = [], order = [], status = [], decisions = [], deadlineDelays = [], deadlines = new Map(); let nextDeadline = 0;
  const home = { appId: 'com.webos.app.home', windowType: '_WEBOS_WINDOW_TYPE_CARD' };
  const stop = monitor({ enabled: true, boot: true, bootInput: options.bootInput, home, apps: ['netflix'], now: () => now,
    ready: () => ready, bootstrap() { order.push('native'); bootstraps++; if (options.failBootstrap) { const e = Error('partial native failure'); e.nativeReason = options.nativeReason; e.nativeTarget = options.nativeTarget; throw e; } }, launch() { launches++; }
  }, {
    spawn(cmd, args) {
      assert.equal(cmd, '/usr/bin/luna-send'); assert.equal(args[0], '-i');
      order.push('subscribe');
      const p = new EventEmitter(); p.stdout = new EventEmitter(); p.stdout.setEncoding = () => {}; p.kill = () => { p.killed = true; };
      if (args[1].indexOf('applicationManager') !== -1) generations.push({});
      const source = args[1].indexOf('applicationManager') !== -1 ? 'sam' : args[1].endsWith('/getForegroundWindowInfo') ? 'windows' : args[1].endsWith('/getFocusedWindowInfo') ? 'focus' : 'sm';
      generations[generations.length - 1][source] = p; return p;
    }, setInterval(fn) { tick = fn; return 1; }, clearInterval() {},
    setTimeout(fn, ms) { deadlineDelays.push(ms); deadlines.set(++nextDeadline, fn); return nextDeadline; }, clearTimeout(id) { deadlines.delete(id); },
    onStop() { stops++; }, onStatus(phase, reason, source) { status.push({ phase, reason, source }); }, monotonic: () => mono,
    onDecision(data) { decisions.push(JSON.parse(JSON.stringify(data))); }
  });
  function reply(source, windows = [home], generation = generations.length - 1) {
    const field = source === 'focus' ? 'focusedWindowInfo' : source === 'windows' ? 'windows' : 'foregroundAppInfo';
    generations[generation][source].stdout.emit('data', JSON.stringify({ returnValue: true, subscribed: true, [field]: source === 'focus' ? windows.map(w => ({ appId: w.appId, type: w.windowType === '_WEBOS_WINDOW_TYPE_CARD' ? 'fullscreen' : 'overlay' })) : windows }));
  }
  return { stop, generations, order, status, decisions, deadlineDelays, deadlines, home, reply, full(windows) { for (const source of ['sam', 'sm', 'windows', 'focus']) reply(source, windows); },
    at(ms) { mono += Math.max(0, ms - now); now = ms; if (tick) tick(); }, jumpWall(ms) { now += ms; }, advanceMono(ms) { mono += ms; if (tick) tick(); }, ready(value) { ready = value; }, count: () => launches, bootstraps: () => bootstraps, stops: () => stops };
}

test('saved HDMI boot prepares native HOME before any Home UI and launches once from four fresh replies', () => {
  const h = bootFixture({ ready: false, bootInput: 'com.webos.app.hdmi2' });
  assert.equal(h.bootstraps(), 0); assert.equal(h.generations.length, 0);
  h.ready(true); h.at(100); assert.equal(h.bootstraps(), 1); assert.equal(h.generations.length, 1);
  assert.deepEqual(h.order, ['native', 'subscribe', 'subscribe', 'subscribe', 'subscribe']);
  const hdmi = { appId: 'com.webos.app.hdmi2', windowType: '_WEBOS_WINDOW_TYPE_CARD' };
  for (const source of ['sam', 'sm', 'windows']) h.reply(source, [hdmi]);
  h.at(900); assert.equal(h.count(), 0); h.reply('focus', [hdmi]);
  assert.equal(h.count(), 0); h.full([hdmi]);
  h.at(1649); assert.equal(h.count(), 0); h.at(1650); assert.equal(h.count(), 1);
  h.full([{ appId: 'netflix', windowType: '_WEBOS_WINDOW_TYPE_CARD' }]); h.at(2450);
  h.full([hdmi]); h.at(3250); assert.equal(h.count(), 1); assert.equal(h.bootstraps(), 1); assert.equal(h.deadlines.size, 0); h.stop();
});

test('late usable focus refreshes one fresh quartet without reinjection or extending the boot deadline', () => {
  const hdmi = { appId: 'com.webos.app.hdmi2', windowType: '_WEBOS_WINDOW_TYPE_CARD' };
  const h = bootFixture({ bootInput: hdmi.appId });
  for (const source of ['sam', 'sm', 'windows']) h.reply(source, [hdmi]);
  assert.deepEqual(h.deadlineDelays, [30000]); h.at(5000); h.reply('focus', []); h.at(6000);
  assert.equal(h.count(), 0); assert.equal(h.stops(), 0);
  h.generations[0].focus.stdout.emit('data', JSON.stringify({ returnValue: true, subscribed: true, focusedWindowInfo: [{ appId: hdmi.appId, type: 'fullscreen' }] }) + 'retired-frame');
  assert.equal(h.generations.length, 2); assert.equal(h.bootstraps(), 1); assert.deepEqual(h.deadlineDelays, [30000]);
  h.generations[0].focus.emit('close', 1);
  for (const source of ['sam', 'sm', 'windows', 'focus']) h.reply(source, [hdmi], 0);
  h.at(6800); assert.equal(h.count(), 0); assert.equal(h.stops(), 0);
  h.full([hdmi]); h.at(7549); assert.equal(h.count(), 0); h.at(7550); assert.equal(h.count(), 1); h.stop();
  const late = bootFixture({ bootInput: hdmi.appId });
  for (const source of ['sam', 'sm', 'windows']) late.reply(source, [hdmi]);
  late.at(29400); late.reply('focus', [hdmi]); late.full([hdmi]); late.at(30150);
  assert.equal(late.count(), 0); assert.equal(late.bootstraps(), 1); assert.deepEqual(late.deadlineDelays, [30000]); late.stop();
});

test('Settings veto during the refreshed partial focus cancels startup permanently', () => {
  const hdmi = { appId: 'com.webos.app.hdmi2', windowType: '_WEBOS_WINDOW_TYPE_CARD' }, h = bootFixture({ bootInput: hdmi.appId });
  h.full([hdmi]); assert.equal(h.generations.length, 2);
  h.generations[1].focus.stdout.emit('data', '{"returnValue":true,"subscribed":true,"focusedWindowInfo":[');
  h.reply('windows', [{ appId: 'com.webos.app.settings', windowType: '_WEBOS_WINDOW_TYPE_OVERLAY' }]);
  h.generations[1].focus.stdout.emit('data', '{"appId":"com.webos.app.hdmi2","type":"fullscreen"}]}');
  h.full([hdmi]); h.at(800); assert.equal(h.count(), 0); assert.equal(h.bootstraps(), 1); h.stop();
});

test('observed HDMI alert and focused notification block boot until both clear without extending intent', () => {
  const hdmi = { appId: 'com.webos.app.hdmi1', windowType: '_WEBOS_WINDOW_TYPE_CARD' }, alert = { appId: 'com.webos.app.alert', windowType: 'unknown_startup_style' };
  for (const clearAt of [2000, 29400]) {
    const h = bootFixture({ bootInput: hdmi.appId });
    h.reply('sam', [hdmi]); h.reply('sm', [hdmi]); h.reply('windows', [hdmi, alert]);
    h.generations[0].focus.stdout.emit('data', JSON.stringify({ returnValue: true, subscribed: true, focusedWindowInfo: [{ appId: 'com.webos.systemui.notification', type: 'unknown_notification_style' }] }));
    h.at(clearAt); assert.equal(h.count(), 0); assert.equal(h.generations.length, 1); assert.equal(h.decisions.some(d => d.event === 'veto'), false);
    h.reply('windows', [hdmi]); assert.equal(h.generations.length, 1); h.reply('focus', [hdmi]); assert.equal(h.generations.length, 2); h.full([hdmi]);
    h.at(clearAt + 749); assert.equal(h.count(), 0); h.at(clearAt + 750); assert.equal(h.count(), clearAt === 2000 ? 1 : 0);
    assert.equal(h.bootstraps(), 1); assert.deepEqual(h.deadlineDelays, [30000]); h.stop();
  }
});

test('focused LG alert with unknown style only blocks and cannot mask explicit vetoes', () => {
  const hdmi = { appId: 'com.webos.app.hdmi1', windowType: '_WEBOS_WINDOW_TYPE_CARD' }, alert = { appId: 'com.webos.app.alert', windowType: 'unknown_startup_style' };
  const h = bootFixture({ bootInput: hdmi.appId });
  h.reply('sam', [hdmi]); h.reply('sm', [hdmi]); h.reply('windows', [hdmi]);
  h.generations[0].focus.stdout.emit('data', JSON.stringify({ returnValue: true, subscribed: true, focusedWindowInfo: [{ appId: alert.appId, type: 'unknown_alert_style' }] }));
  h.at(800); assert.equal(h.count(), 0); assert.equal(h.decisions.some(d => d.event === 'veto'), false);
  h.reply('focus', [hdmi]); assert.equal(h.generations.length, 2); h.full([hdmi]); h.at(1550); assert.equal(h.count(), 1); h.stop();
  for (const unsafe of [
    { appId: 'com.webos.app.settings', windowType: '_WEBOS_WINDOW_TYPE_OVERLAY' },
    { appId: 'com.webos.app.screensaver', windowType: '_WEBOS_WINDOW_TYPE_SCREENSAVER' },
    { appId: 'com.webos.app.hdmi2', windowType: '_WEBOS_WINDOW_TYPE_CARD' },
    { appId: 'netflix', windowType: '_WEBOS_WINDOW_TYPE_CARD' },
    Object.assign({}, alert, { displayId: 1 })
  ]) {
    const bad = bootFixture({ bootInput: hdmi.appId }); bad.reply('windows', [hdmi, alert, unsafe]); bad.full([hdmi]); bad.full([hdmi]); bad.at(800); assert.equal(bad.count(), 0, unsafe.appId); bad.stop();
  }
  const other = bootFixture({ bootInput: hdmi.appId }); other.reply('focus', [alert]);
  other.reply('windows', [{ appId: 'com.webos.app.settings', windowType: '_WEBOS_WINDOW_TYPE_OVERLAY' }]);
  other.full([hdmi]); other.full([hdmi]); other.at(800); assert.equal(other.count(), 0); other.stop();
  const notification = bootFixture({ bootInput: hdmi.appId });
  notification.generations[0].focus.stdout.emit('data', JSON.stringify({ returnValue: true, subscribed: true, focusedWindowInfo: [{ appId: 'com.webos.systemui.notification', type: 'unknown_notification_style' }, { appId: 'com.webos.app.settings', type: 'overlay' }] }));
  notification.full([hdmi]); notification.full([hdmi]); notification.at(800); assert.equal(notification.count(), 0); notification.stop();
});

test('boot Home still needs complete stable replies and a partial frame blocks launch', () => {
  const h = bootFixture(); h.full(); h.full(); h.at(200);
  h.generations[1].focus.stdout.emit('data', '{"returnValue":true,"subscribed":true,"focusedWindowInfo":[');
  h.at(800); assert.equal(h.count(), 0);
  h.generations[1].focus.stdout.emit('data', '{"appId":"com.webos.app.home","type":"fullscreen"}]}');
  h.at(1549); assert.equal(h.count(), 0); h.at(1550); assert.equal(h.count(), 1); h.stop();
});

test('successful empty startup replies preserve bounded intent but require a fresh HDMI quartet', () => {
  const h = bootFixture({ bootInput: 'com.webos.app.hdmi2' });
  for (const source of ['sam', 'sm', 'windows', 'focus']) h.reply(source, []);
  assert.equal(h.deadlines.size, 1); h.at(6000); assert.equal(h.count(), 0);
  h.full([{ appId: 'com.webos.app.hdmi2', windowType: '_WEBOS_WINDOW_TYPE_CARD' }]);
  h.full([{ appId: 'com.webos.app.hdmi2', windowType: '_WEBOS_WINDOW_TYPE_CARD' }]);
  h.at(6749); assert.equal(h.count(), 0); h.at(6750); assert.equal(h.count(), 1); h.stop();
});

test('only known Home or configured-input splash preserves startup and never masks a Settings veto', () => {
  const hdmi = { appId: 'com.webos.app.hdmi2', windowType: '_WEBOS_WINDOW_TYPE_CARD' };
  for (const [id, settings, wanted] of [['com.webos.app.hdmi2', false, 1], ['com.webos.app.home', false, 1], ['netflix', false, 0], ['com.webos.app.hdmi2', true, 0]]) {
    const h = bootFixture({ bootInput: 'com.webos.app.hdmi2' });
    h.reply('sam', [hdmi]); h.reply('sm', [hdmi]); h.reply('focus', [hdmi]);
    const rows = [{ appId: id, windowType: '_WEBOS_WINDOW_TYPE_SPLASH' }];
    if (settings) rows.push({ appId: 'com.webos.app.settings', windowType: '_WEBOS_WINDOW_TYPE_OVERLAY' });
    h.reply('windows', rows); h.at(800); assert.equal(h.count(), 0);
    h.full([hdmi]); h.full([hdmi]); h.at(1549); assert.equal(h.count(), 0); h.at(1550); assert.equal(h.count(), wanted, id + (settings ? ' with Settings' : '')); h.stop();
  }
});

test('Settings or an interactive app cancels startup so a later HDMI switch is never overridden', () => {
  for (const app of [{ appId: 'com.webos.app.settings', windowType: '_WEBOS_WINDOW_TYPE_OVERLAY' }, { appId: 'netflix', windowType: '_WEBOS_WINDOW_TYPE_CARD' }]) {
    const h = bootFixture({ bootInput: 'com.webos.app.hdmi2' }); h.full([app]); h.at(800); assert.equal(h.count(), 0);
    h.full([{ appId: 'com.webos.app.hdmi2', windowType: '_WEBOS_WINDOW_TYPE_CARD' }]); h.at(1600); assert.equal(h.count(), 0);
    h.full(); h.at(2400); assert.equal(h.count(), 0); h.stop();
  }
});

test('boot input is strict and startup intent expires before later Home or input activity', () => {
  for (const bootInput of [null, 'netflix', 'com.webos.app.hdmi5', 'com.webos.app.hdmi1']) {
    const h = bootFixture({ bootInput }); h.full([{ appId: 'com.webos.app.hdmi2', windowType: '_WEBOS_WINDOW_TYPE_CARD' }]);
    h.at(800); assert.equal(h.count(), 0); h.stop();
  }
  const h = bootFixture({ bootInput: 'com.webos.app.hdmi2' });
  const hdmi = { appId: 'com.webos.app.hdmi2', windowType: '_WEBOS_WINDOW_TYPE_CARD' };
  h.reply('sam'); h.reply('sm', [hdmi]); h.reply('windows'); h.reply('focus', [hdmi]);
  h.at(30000); h.full(); h.at(30800); assert.equal(h.count(), 0); h.stop();
});

test('native readiness is bounded and a partial bootstrap failure is never retried', () => {
  const waiting = bootFixture({ ready: false }); waiting.at(30000); assert.equal(waiting.stops(), 1); assert.equal(waiting.bootstraps(), 0);
  const failed = bootFixture({ failBootstrap: true }); failed.at(800); assert.equal(failed.bootstraps(), 1); assert.equal(failed.stops(), 1); assert.equal(failed.generations.length, 0);
});

test('boot diagnostics classify phases and static stop reasons without reply or error content', () => {
  const h = bootFixture(); h.full(); h.full(); h.at(750);
  assert.deepEqual(h.status.map(s => s.phase), ['native_wait', 'native_ready', 'subscribing', 'subscribing', 'subscriptions_ready', 'launch_requested']);
  h.generations[1].sam.emit('error', Error('untrusted detail'));
  assert.deepEqual(h.status[h.status.length - 1], { phase: 'launch_requested', reason: 'subscription_error', source: 'sam' });
  h.generations[1].windows.emit('close', 1);
  assert.equal(h.status.filter(s => s.reason !== 'running').length, 1);
  assert.equal(JSON.stringify(h.status).includes('untrusted detail'), false);
  const failed = bootFixture({ failBootstrap: true });
  assert.deepEqual(failed.status[failed.status.length - 1], { phase: 'native_wait', reason: 'native_bootstrap_failed', source: 'none' });
  const native = bootFixture({ failBootstrap: true, nativeReason: 'native_injector_cleanup_failed', nativeTarget: 'lginput2' });
  assert.deepEqual(native.status[native.status.length - 1], { phase: 'native_wait', reason: 'native_injector_cleanup_failed', source: 'lginput2' });
  const untrusted = bootFixture({ failBootstrap: true, nativeReason: 'untrusted detail', nativeTarget: 'untrusted detail' });
  assert.deepEqual(untrusted.status[untrusted.status.length - 1], { phase: 'native_wait', reason: 'native_bootstrap_failed', source: 'none' });
  const pending = bootFixture(); pending.reply('sam'); pending.reply('sm'); pending.reply('windows');
  Array.from(pending.deadlines.values())[0]();
  assert.deepEqual(pending.status[pending.status.length - 1], { phase: 'subscribing', reason: 'initial_snapshot_timeout', source: 'focus' });
});

test('boot decision captures first cancellation, generation readiness and wall-clock divergence', () => {
  const h = bootFixture(); h.full(); h.full();
  assert.equal(h.decisions.filter(d => d.event === 'first_reply').length, 8);
  assert.deepEqual(h.decisions.filter(d => ['initial_ready', 'fresh_ready'].includes(d.event)).map(d => d.generation), [1, 2]);
  h.stop();
  const veto = bootFixture(); veto.reply('windows', [{ appId: 'com.webos.app.settings', windowType: '_WEBOS_WINDOW_TYPE_OVERLAY' }]);
  const endedCount = veto.decisions.length;
  veto.full(); assert.equal(veto.decisions.filter(d => d.event === 'veto').length, 1); assert.equal(veto.decisions.length, endedCount);
  assert.equal(veto.decisions.find(d => d.event === 'veto').category, 'settings'); veto.stop();
  const jump = bootFixture({ bootInput: 'com.webos.app.hdmi2' }); jump.jumpWall(60000);
  jump.reply('sam', [{ appId: 'com.webos.app.hdmi2', windowType: '_WEBOS_WINDOW_TYPE_CARD' }]);
  const ended = jump.decisions.find(d => d.event === 'veto');
  assert.ok(ended, 'deadline cancellation must be recorded'); assert.equal(ended.category, 'deadline');
  assert.equal(ended.wallElapsedMs, 60000); assert.equal(ended.monotonicElapsedMs, 0); assert.equal(ended.remainingMs, -30000); jump.stop();
  const hard = bootFixture(); hard.full(); hard.full(); hard.jumpWall(-60000); hard.advanceMono(60000);
  const final = hard.decisions[hard.decisions.length - 1]; assert.equal(final.category, 'diagnostic_deadline'); assert.deepEqual(final.states, {});
  const count = hard.decisions.length; hard.full(); hard.stop(); assert.equal(hard.decisions.length, count); assert.ok(count <= 14);
});

test('incomplete boot refresh has a bounded deadline and stop closes the new children', () => {
  for (const expire of [false, true]) {
    const h = bootFixture(); h.reply('sam'); h.reply('sm'); h.reply('windows');
    assert.equal(h.deadlines.size, 1);
    if (expire) Array.from(h.deadlines.values())[0](); else h.stop();
    assert.equal(h.stops(), 1); assert.equal(h.deadlines.size, 0); assert.ok(h.generations.every(g => Object.values(g).every(p => p.killed)));
    h.reply('focus'); h.at(1550); assert.equal(h.count(), 0);
  }
});
test('monitor stop and child failure close only its subscriptions and timers', () => {
  for (const failure of [false, true]) {
    const children = []; const cleared = [];
    const stop = monitor({ enabled: true, home: { appId: 'home', windowType: 'HOME' }, apps: [], now: () => 0, launch: () => {} }, {
      spawn(cmd, args, options) { assert.equal(cmd, '/usr/bin/luna-send'); assert.equal(args[0], '-i'); assert.equal(options.shell, false); const p = new EventEmitter(); p.stdout = new EventEmitter(); p.stdout.setEncoding = () => {}; p.stderr = new EventEmitter(); p.kill = () => { p.killed = true; }; children.push(p); return p; },
      setInterval() { return 99; }, clearInterval(id) { cleared.push(id); }, onStop() {}
    });
    assert.equal(children.length, 4);
    if (failure) children[0].emit('close', 1); else stop();
    assert.ok(children.every(p => p.killed)); assert.deepEqual(cleared, [99]); stop(); assert.deepEqual(cleared, [99]);
  }
});
function streamFixture(initial = true, apps = ['netflix']) {
  let now = 0, launches = 0, stops = 0, tick;
  const streams = {};
  const home = { appId: 'com.webos.app.home', windowType: '_WEBOS_WINDOW_TYPE_CARD' };
  const focus = { appId: 'com.webos.app.home', type: 'fullscreen' };
  const stop = monitor({ enabled: true, home, apps, now: () => now, launch() { launches++; } }, {
    spawn(cmd, args) {
      const p = new EventEmitter(); p.stdout = new EventEmitter(); p.stdout.setEncoding = () => {}; p.kill = () => {};
      const uri = args[1]; const key = uri.indexOf('applicationManager') !== -1 ? 'sam' : uri.endsWith('/getForegroundWindowInfo') ? 'windows' : uri.endsWith('/getFocusedWindowInfo') ? 'focus' : 'sm';
      streams[key] = p.stdout; return p;
    }, setInterval(fn) { tick = fn; return 1; }, clearInterval() {}, onStop() { stops++; }
  });
  const field = { sam: 'foregroundAppInfo', sm: 'foregroundAppInfo', windows: 'windows', focus: 'focusedWindowInfo' };
  function reply(source, windows) { streams[source].emit('data', JSON.stringify({ returnValue: true, subscribed: true, [field[source]]: source === 'focus' ? windows.map(w => ({ appId: w.appId, type: 'fullscreen' })) : windows })); }
  if (initial) {
    for (const source of Object.keys(streams)) reply(source, [{ appId: 'netflix', windowType: '_WEBOS_WINDOW_TYPE_CARD' }]);
    for (const source of Object.keys(streams)) reply(source, [home]);
  }
  return { stop, streams, reply, home, focus, count: () => launches, stops: () => stops, at(ms) { now = ms; tick(); } };
}

test('captured YouTube exit accepts later events without subscribed and keeps history through empty focus', () => {
  const h = streamFixture(false, ['youtube.leanback.v4']);
  const card = appId => ({ appId, windowType: '_WEBOS_WINDOW_TYPE_CARD' });
  for (const source of Object.keys(h.streams)) h.reply(source, [card('com.local.quietlauncher')]);
  function event(ms, source, rows, subscribed) {
    h.at(ms);
    const field = source === 'focus' ? 'focusedWindowInfo' : source === 'windows' ? 'windows' : 'foregroundAppInfo';
    const reply = { returnValue: true, [field]: rows };
    if (subscribed !== undefined) reply.subscribed = subscribed;
    h.streams[source].emit('data', JSON.stringify(reply));
  }
  event(22393, 'focus', []);
  const splash = { appId: 'youtube.leanback.v4', windowType: '_WEBOS_WINDOW_TYPE_SPLASH' };
  event(23204, 'windows', [card('com.local.quietlauncher'), splash]);
  event(23228, 'windows', [splash, card('youtube.leanback.v4')]);
  event(23438, 'windows', [card('youtube.leanback.v4')]);
  event(23487, 'focus', [{ appId: 'youtube.leanback.v4', type: 'fullscreen' }]);
  event(23503, 'sm', [card('youtube.leanback.v4')]);
  event(23520, 'sam', [card('youtube.leanback.v4')], true);
  event(30012, 'focus', []); h.at(30200); assert.equal(h.count(), 0);
  event(30282, 'focus', [{ appId: 'com.webos.app.home', type: 'fullscreen' }]);
  event(30287, 'windows', [h.home]); event(30319, 'sm', [h.home]); event(30321, 'sam', [h.home], true);
  h.at(31070); assert.equal(h.count(), 0); h.at(31071); assert.equal(h.count(), 1);
  h.at(32000); assert.equal(h.count(), 1); h.stop();
});

test('each stream requires an initial subscription acknowledgement and rejects explicit revocation', () => {
  for (const initial of [false, true]) {
    const h = streamFixture(initial);
    const reply = { returnValue: true, focusedWindowInfo: [h.focus] };
    if (initial) reply.subscribed = false;
    h.streams.focus.emit('data', JSON.stringify(reply));
    assert.equal(h.stops(), 1); h.at(800); assert.equal(h.count(), 0);
  }
});
test('chunked focus veto blocks the previous Home snapshot before completion', () => {
  const h = streamFixture(); h.at(200);
  h.streams.focus.emit('data', '{"returnValue":true,"subscribed":true,"focusedWindowInfo":[');
  h.at(800); assert.equal(h.count(), 0);
  h.streams.focus.emit('data', '{"appId":"com.webos.app.settings","type":"overlay"}]}');
  h.at(1600); assert.equal(h.count(), 0); h.stop();
});
test('safe chunk completion restarts the full stability interval', () => {
  const h = streamFixture(); h.at(200);
  h.streams.focus.emit('data', '{"returnValue":true,"subscribed":true,"focusedWindowInfo":[');
  h.at(800); assert.equal(h.count(), 0);
  h.streams.focus.emit('data', JSON.stringify(h.focus) + ']}');
  h.at(1549); assert.equal(h.count(), 0); h.at(1550); assert.equal(h.count(), 1); h.stop();
});
test('a complete modal veto disarms an exit while another stream is incomplete', () => {
  const h = streamFixture(); h.at(200);
  h.streams.focus.emit('data', '{"returnValue":true,"subscribed":true,"focusedWindowInfo":[');
  h.reply('windows', [h.home, { appId: 'com.webos.app.settings', windowType: '_WEBOS_WINDOW_TYPE_OVERLAY' }]);
  h.reply('windows', [h.home]); h.at(800);
  h.streams.focus.emit('data', JSON.stringify(h.focus) + ']}');
  h.at(1600); assert.equal(h.count(), 0); h.stop();
});
