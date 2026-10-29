'use strict';
const cp = require('child_process');
const { Frame, Router } = require('./core.cjs');
const NATIVE_REASONS = Object.freeze(['native_null_failed', 'native_discovery_failed', 'native_target_failed', 'native_target_changed', 'native_mapping_failed', 'native_injector_spawn_failed', 'native_injector_timeout', 'native_injector_overflow', 'native_injector_signal', 'native_injector_ptrace_failed', 'native_injector_resolve_failed', 'native_injector_wait_failed', 'native_injector_cleanup_failed', 'native_injector_unknown_failed']);
const NATIVE_TARGETS = Object.freeze(['none', 'lginput2', 'micomservice']);
function gate(g, phase) {
  const needed = phase === 'home' ? ['ready'] : phase === 'exit' ? ['ready', 'homeTest', 'settingsTest', 'exitTest'] : ['ready', 'homeTest', 'settingsTest', 'exitTest', 'bootApproved'];
  if (['first-tv-65', 'second-tv-55'].indexOf(g.identity) === -1 || needed.some(k => g[k] !== true)) throw Error('manual ' + phase + ' gates incomplete');
  if (phase !== 'home' && (!g.home || g.home.appId !== 'com.webos.app.home' || g.home.windowType !== '_WEBOS_WINDOW_TYPE_CARD' || !Array.isArray(g.apps) || !g.apps.length || g.apps.some(id => !/^[a-zA-Z0-9_.-]+$/.test(id) || /settings|screensaver|hdmi|input|system|home/i.test(id)))) throw Error('observed exit destination/apps required');
}
function monitor(options, dependencies = {}) {
  const spawn = dependencies.spawn || cp.spawn, interval = dependencies.setInterval || setInterval, clear = dependencies.clearInterval || clearInterval;
  const timeout = dependencies.setTimeout || setTimeout, clearTimeoutOwned = dependencies.clearTimeout || clearTimeout;
  const children = []; let timer, refreshTimer, router, pending; let stopped = false, phase = 'native_wait', generation = 0, refreshed = false;
  const diagnosticStarted = options.now(), readyUntil = diagnosticStarted + 30000;
  const monotonic = dependencies.monotonic || (() => { const t = process.hrtime(); return t[0] * 1000 + t[1] / 1e6; });
  let monoStarted; try { monoStarted = monotonic(); } catch (_) { /* Optional diagnostic clock. */ }
  const firstReplies = new Set(); let vetoRecorded = false, decisionClosed = options.boot !== true || !dependencies.onDecision, decisionEvents = 0;
  function decision(event, source = 'none', rows, category = 'none') {
    if (decisionClosed || options.boot !== true || !dependencies.onDecision) return;
    try {
      const now = options.now(), elapsed = monotonic() - monoStarted;
      if (!Number.isFinite(elapsed)) { decisionClosed = true; return; }
      const hardLimit = elapsed >= 60000;
      if (hardLimit) { event = 'final'; source = 'none'; rows = undefined; category = 'diagnostic_deadline'; }
      if (decisionEvents++ >= 14) { decisionClosed = true; return; }
      if (['veto', 'launch_requested', 'stopped', 'final'].indexOf(event) !== -1) decisionClosed = true;
      dependencies.onDecision({ event, phase, source, generation, boot: !!(router && router.boot), remainingMs: router ? router.bootUntil - now : null, nowMs: now, wallElapsedMs: now - diagnosticStarted, monotonicElapsedMs: elapsed, rows, states: !hardLimit && router ? router.states : {}, incomplete: !hardLimit && router ? Array.from(router.incomplete) : [], category });
    } catch (_) { decisionClosed = true; } // Diagnostics cannot change routing.
  }
  function veto(source, rows) {
    if (vetoRecorded) return; vetoRecorded = true;
    let category = options.now() >= router.bootUntil ? 'deadline' : 'other_window';
    if (category !== 'deadline' && Array.isArray(rows)) {
      if (rows.some(w => w && typeof w.appId === 'string' && /^(com\.webos\.|com\.palm\.)/.test(w.appId) && /settings/i.test(w.appId))) category = 'settings';
      else if (rows.some(w => w && w.appId === 'com.webos.app.screensaver')) category = 'screensaver';
      else if (!router.states[source]) category = 'invalid_snapshot';
      else if (rows.some(w => w && options.apps.indexOf(w.appId) !== -1)) category = 'streaming_app';
    }
    decision('veto', source, rows, category);
  }
  function status(next, reason = 'running', source = 'none') {
    if (next) phase = next;
    if (options.boot === true && dependencies.onStatus) { try { dependencies.onStatus(phase, reason, source); } catch (_) { /* Diagnostics cannot change routing. */ } }
  }
  function stop(reason = 'requested_stop', source = 'none') {
    if (stopped) return; decision('stopped', source, undefined, 'none'); stopped = true; if (router) router.stop();
    status(null, reason, source);
    if (timer !== undefined) clear(timer);
    if (refreshTimer !== undefined) { clearTimeoutOwned(refreshTimer); refreshTimer = undefined; }
    children.forEach(p => p.kill('SIGTERM'));
    if (dependencies.onStop) dependencies.onStop(reason, source);
  }
  const methods = {
    sam: ['com.webos.applicationManager/getForegroundAppInfo', { extraInfo: true, subscribe: true }],
    sm: ['com.webos.surfacemanager/getForegroundAppInfo', { subscribe: true }],
    windows: ['com.webos.surfacemanager/getForegroundWindowInfo', { subscribe: true }],
    focus: ['com.webos.surfacemanager/getFocusedWindowInfo', { subscribe: true }]
  };
  function subscribe() {
    // Native setup has finished. No pre-injection foreground state is consumed.
    const active = ++generation;
    children.splice(0).forEach(p => p.kill('SIGTERM'));
    pending = new Set(Object.keys(methods));
    if (refreshed) Object.keys(methods).forEach(source => router.begin(source));
    status('subscribing');
    if (options.boot && !refreshed) refreshTimer = timeout(() => stop('initial_snapshot_timeout', pending.values().next().value || 'none'), Math.max(0, router.bootUntil - options.now()));
    Object.keys(methods).forEach(source => {
      if (stopped) return;
      const [method, payload] = methods[source];
      let p;
      try { p = spawn('/usr/bin/luna-send', ['-i', 'luna://' + method, JSON.stringify(payload)], { shell: false, stdio: ['ignore', 'pipe', 'ignore'] }); }
      catch (_) { stop('subscription_spawn_failed', source); return; }
      children.push(p);
      let acknowledged = false;
      const frame = new Frame(reply => {
        if (stopped || active !== generation) return;
        if (reply.returnValue !== true) { stop('reply_denied', source); return; }
        if (!acknowledged && reply.subscribed !== true) { stop('initial_ack_rejected', source); return; }
        if (Object.prototype.hasOwnProperty.call(reply, 'subscribed') && reply.subscribed !== true) { stop('subscription_revoked', source); return; }
        acknowledged = true; // Later SM/window/focus notifications omit subscribed on this TV.
        const wasBoot = router.boot, rows = reply[source === 'focus' ? 'focusedWindowInfo' : source === 'windows' ? 'windows' : 'foregroundAppInfo'];
        router.update(source, reply);
        const key = active + ':' + source;
        if (!firstReplies.has(key)) { firstReplies.add(key); decision('first_reply', source, rows); }
        if (wasBoot && !router.boot) veto(source, rows);
        if (router.states[source]) pending.delete(source);
        if (!pending.size && refreshTimer !== undefined) {
          decision(refreshed ? 'fresh_ready' : 'initial_ready');
          // A late usable focus can leave the other three initial views stale.
          // Refresh once, retaining this Router's original deadline and vetoes.
          if (!refreshed && router.boot) { refreshed = true; subscribe(); return; }
          clearTimeoutOwned(refreshTimer); refreshTimer = undefined; status('subscriptions_ready');
        }
      }, 65536, () => { if (!stopped && active === generation) { router.begin(source); pending.add(source); } });
      p.stdout.setEncoding('utf8'); p.stdout.on('data', chunk => { if (!stopped && active === generation) { try { frame.push(chunk); } catch (_) { if (active === generation) stop('frame_invalid', source); } } });
      p.on('error', () => { if (active === generation) stop('subscription_error', source); }); p.on('close', () => { if (active === generation) stop('subscription_closed', source); });
    });
  }
  function poll() {
    if (stopped) return;
    try {
      try { if (!decisionClosed && monotonic() - monoStarted >= 60000) decision('final'); } catch (_) { decisionClosed = true; }
      if (router) { const wasBoot = router.boot; router.tick(); if (wasBoot && !router.boot && phase !== 'launch_requested') veto('none'); return; }
      if (options.boot) {
        if (options.now() >= readyUntil) { stop('native_readiness_timeout'); return; }
        try { if (options.ready && !options.ready()) return; } catch (_) { stop('native_readiness_failed'); return; }
        // A failed or partial injection stops this monitor. It is never retried.
        try { if (options.bootstrap) options.bootstrap(); } catch (e) { stop(e && NATIVE_REASONS.indexOf(e.nativeReason) !== -1 ? e.nativeReason : 'native_bootstrap_failed', e && NATIVE_TARGETS.indexOf(e.nativeTarget) !== -1 ? e.nativeTarget : 'none'); return; }
        status('native_ready');
      }
      router = new Router(Object.assign({}, options, { launch() { phase = 'launch_requested'; const result = options.launch(); status(null); decision('launch_requested'); return result; } })); subscribe();
    } catch (_) { stop('poll_failed'); }
  }
  status('native_wait');
  try { poll(); if (!stopped) timer = interval(poll, 100); } catch (_) { stop('timer_failed'); }
  return stop;
}
module.exports = { monitor, gate, NATIVE_REASONS, NATIVE_TARGETS };
