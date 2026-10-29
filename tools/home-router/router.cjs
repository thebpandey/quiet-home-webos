'use strict';
// Private root CLI. No socket, HTTP service, remote transport, or raw-event log.
const fs = require('fs'); const cp = require('child_process'); const path = require('path');
const { ROOT, parse, read, atomic, verifyAssets, targets, writeMapping, restoreMapping } = require('./core.cjs');
const { gate, monitor, NATIVE_REASONS, NATIVE_TARGETS } = require('./monitor.cjs');
const CONFIG = '/home/root/.config/lginputhook/keybinds.json';
const state = ROOT + '/state'; const backup = state + '/keybinds.original'; const pidfile = state + '/observer.json';
const files = ['core.cjs', 'monitor.cjs', 'router.cjs', 'boot.sh', 'gates.json', 'ezinject', 'libinputhookpp.so', 'LICENSE.inputhook', 'LICENSE.inputhookpp', 'LICENSE.ezinject', 'NOTICE'];
let bootDiagnostic = () => false;
function bootStatus(apps = []) {
  const dir = '/tmp/quiet-home-router-boot-status';
  const phases = ['boot_start', 'native_wait', 'native_ready', 'subscribing', 'subscriptions_ready', 'launch_requested', 'unclassified'];
  const reasons = ['running', 'requested_stop', 'signal_term', 'signal_int', 'startup_failed', 'native_readiness_timeout', 'native_readiness_failed', 'native_bootstrap_failed', 'subscription_spawn_failed', 'reply_denied', 'initial_ack_rejected', 'subscription_revoked', 'frame_invalid', 'subscription_error', 'subscription_closed', 'initial_snapshot_timeout', 'poll_failed', 'timer_failed', 'unclassified_stop'].concat(NATIVE_REASONS);
  const sources = ['sam', 'sm', 'windows', 'focus'].concat(NATIVE_TARGETS), started = Date.now();
  let enabled = true, phase = 'boot_start', bootId;
  function owned(path, directory, mode) {
    const s = fs.lstatSync(path);
    if (s.isSymbolicLink() || (directory ? !s.isDirectory() : !s.isFile()) || s.uid !== 0 || (s.mode & 0o7777) !== mode) throw Error('unsafe diagnostic path');
  }
  function write(name, data) {
    if (!enabled) return false;
    try {
      if (process.platform !== 'linux' || process.getuid() !== 0) throw Error('root diagnostic required');
      if (!bootId) {
        const tmp = fs.lstatSync('/tmp');
        if (tmp.isSymbolicLink() || !tmp.isDirectory() || tmp.uid !== 0 || ((tmp.mode & 0o022) && !(tmp.mode & 0o1000))) throw Error('unsafe temporary directory');
        bootId = fs.readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim();
        if (!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(bootId)) throw Error('invalid boot identifier');
      }
      try { fs.mkdirSync(dir, { mode: 0o700 }); } catch (e) { if (e.code !== 'EEXIST') throw e; }
      owned(dir, true, 0o700);
      if (fs.readdirSync(dir).some(n => n !== 'status.json' && n !== 'boot-decision.json')) throw Error('unknown diagnostic entry');
      const file = dir + '/' + name;
      try { owned(file, false, 0o600); } catch (e) { if (e.code !== 'ENOENT') throw e; }
      const bytes = JSON.stringify(Object.assign({ version: 1, bootId }, data)) + '\n';
      if (Buffer.byteLength(bytes) > 65536) throw Error('diagnostic bound');
      const temp = file + '.next', fd = fs.openSync(temp, 'wx', 0o600);
      try { fs.fchmodSync(fd, 0o600); fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
      owned(temp, false, 0o600); fs.renameSync(temp, file); return true;
    } catch (_) { enabled = false; return false; } // Never change routing to obtain diagnostics.
  }
  const report = (next, reason, source) => {
    phase = next === null ? phase : phases.indexOf(next) !== -1 ? next : 'unclassified';
    return write('status.json', { phase, reason: reasons.indexOf(reason) !== -1 ? reason : 'unclassified_stop', source: sources.indexOf(source) !== -1 ? source : 'none', elapsedMs: Math.max(0, Math.min(2147483647, Math.floor(Date.now() - started))) });
  };
  const events = ['first_reply', 'initial_ready', 'fresh_ready', 'veto', 'launch_requested', 'stopped', 'final'];
  const categories = ['none', 'deadline', 'settings', 'screensaver', 'invalid_snapshot', 'streaming_app', 'other_window', 'diagnostic_deadline'];
  const views = ['sam', 'sm', 'windows', 'focus'], known = ['com.local.quietlauncher'].concat(apps);
  const types = ['_WEBOS_WINDOW_TYPE_CARD', '_WEBOS_WINDOW_TYPE_HOME', '_WEBOS_WINDOW_TYPE_OVERLAY', '_WEBOS_WINDOW_TYPE_SCREENSAVER', '_WEBOS_WINDOW_TYPE_SPLASH', '_WEBOS_WINDOW_TYPE_POPUP', 'SYSTEM_UI_TYPE_OVERLAY', 'fullscreen', 'overlay'];
  const firstReplies = [], readiness = []; let firstVeto = null, decisionFinished = false;
  const bounded = n => Number.isFinite(n) ? Math.max(-2147483647, Math.min(2147483647, Math.floor(n))) : null;
  function windows(rows) {
    return (Array.isArray(rows) ? rows.slice(0, 8) : []).map(w => {
      const id = w && w.appId, type = w && (w.type !== undefined ? w.type : w.windowType);
      return { appId: typeof id === 'string' && /^[a-zA-Z0-9_.-]{1,96}$/.test(id) && (/^(com\.webos\.|com\.palm\.)/.test(id) || known.indexOf(id) !== -1) ? id : 'other', type: types.indexOf(type) !== -1 ? type : 'other', secondaryDisplay: !!(w && w.displayId !== undefined && w.displayId !== 0) };
    });
  }
  report.decision = data => {
    if (decisionFinished) return false;
    try {
      const snapshot = { event: events.indexOf(data.event) !== -1 ? data.event : 'stopped', phase: phases.indexOf(data.phase) !== -1 ? data.phase : 'unclassified', source: views.indexOf(data.source) !== -1 ? data.source : 'none', generation: data.generation === 1 || data.generation === 2 ? data.generation : 0, boot: data.boot === true, remainingMs: bounded(data.remainingMs), wallElapsedMs: bounded(data.wallElapsedMs), monotonicElapsedMs: bounded(data.monotonicElapsedMs), category: categories.indexOf(data.category) !== -1 ? data.category : 'none', observedKind: !Array.isArray(data.rows) ? 'missing' : data.rows.length > 32 ? 'oversized' : data.rows.length ? 'nonempty' : 'empty', observed: windows(data.rows), sources: {} };
      views.forEach(k => { const s = data.states && data.states[k], ageMs = s ? bounded(data.nowMs - s.time) : null, incomplete = Array.isArray(data.incomplete) && data.incomplete.indexOf(k) !== -1; snapshot.sources[k] = { present: !!s, ageMs, incomplete, fresh: !!s && ageMs !== null && ageMs <= 4000 && !incomplete, windows: windows(s && s.windows) }; });
      if (snapshot.event === 'first_reply' && snapshot.generation && views.indexOf(snapshot.source) !== -1 && firstReplies.length < 8 && !firstReplies.some(s => s.generation === snapshot.generation && s.source === snapshot.source)) {
        const first = Object.assign({}, snapshot, { sources: {} });
        views.forEach(k => { const s = snapshot.sources[k]; first.sources[k] = { present: s.present, ageMs: s.ageMs, incomplete: s.incomplete, fresh: s.fresh }; }); firstReplies.push(first);
      }
      if ((snapshot.event === 'initial_ready' || snapshot.event === 'fresh_ready') && readiness.length < 2 && !readiness.some(s => s.event === snapshot.event)) readiness.push(snapshot);
      if (snapshot.event === 'veto' && !firstVeto) firstVeto = snapshot;
      decisionFinished = ['veto', 'launch_requested', 'stopped', 'final'].indexOf(snapshot.event) !== -1;
      return write('boot-decision.json', { finished: decisionFinished, latest: snapshot, firstReplies, readiness, firstVeto });
    } catch (_) { return false; }
  };
  return report;
}
function secure(file, directory) {
  const s = fs.lstatSync(file);
  if (s.isSymbolicLink() || (directory ? !s.isDirectory() : !s.isFile()) || s.uid !== 0 || (s.mode & 0o022)) throw Error('unsafe owned path: ' + path.basename(file));
}
function check(recovery) {
  if (process.platform !== 'linux' || process.getuid() !== 0 || __dirname !== ROOT) throw Error('first-TV root install path required');
  for (const dir of ['/var', '/var/lib', ROOT]) secure(dir, true);
  const actual = fs.readdirSync(ROOT).sort(), expected = files.concat(['manifest.json', 'state']).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw Error('unknown or missing owned path');
  files.concat(['manifest.json']).forEach(f => secure(ROOT + '/' + f, false)); secure(state, true);
  const allowed = ['settings.json', 'keybinds.original', 'observer.json'];
  fs.readdirSync(state).forEach(f => { if (allowed.indexOf(f) === -1) throw Error('unknown state path'); secure(state + '/' + f, false); });
  if (recovery) return; // Asset damage must not block a safe mapping restore.
  const manifest = parse(read(ROOT + '/manifest.json'));
  if (JSON.stringify(Object.keys(manifest).sort()) !== JSON.stringify(files.slice().sort())) throw Error('manifest file set mismatch');
  verifyAssets(ROOT, manifest);
}
function settings() {
  const s = fs.existsSync(state + '/settings.json') ? parse(read(state + '/settings.json')) : { home: false, exit: false, boot: false };
  if (JSON.stringify(Object.keys(s).sort()) !== '["boot","exit","home"]' || Object.keys(s).some(k => typeof s[k] !== 'boolean')) throw Error('invalid stage settings');
  return s;
}
function save(x) { atomic(state + '/settings.json', JSON.stringify(x) + '\n'); }
function gates() { return parse(read(ROOT + '/gates.json')); }
function proc(pid) {
  const base = '/proc/' + pid, stat = fs.readFileSync(base + '/stat', 'utf8');
  const start = stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19];
  const fd = fs.openSync(base + '/exe', 'r'), header = Buffer.alloc(20); let length = 0;
  try { while (length < header.length) { const count = fs.readSync(fd, header, length, header.length - length, length); if (!count) break; length += count; } }
  finally { fs.closeSync(fd); }
  return { pid: Number(pid), name: fs.readFileSync(base + '/comm', 'utf8').trim(), exe: fs.readlinkSync(base + '/exe'), elf: header.slice(0, length), maps: fs.readFileSync(base + '/maps', 'utf8'), start };
}
function discover() {
  const rows = [];
  fs.readdirSync('/proc').filter(p => /^\d+$/.test(p)).forEach(pid => {
    try { const name = fs.readFileSync('/proc/' + pid + '/comm', 'utf8').trim(); if (name === 'lginput2' || name === 'micomservice') rows.push(proc(pid)); } catch (_) { /* Exited process; missing target fails below. */ }
  });
  return targets(rows);
}
function nullDevice() {
  const s = fs.lstatSync('/dev/null');
  if (!s.isCharacterDevice() || s.uid !== 0 || (s.mode & 0o222) === 0) throw Error('unsafe /dev/null');
  // The TV's ARM32 Node reports rdev=1 for device 1:3. Check via the fixed system applet.
  const device = cp.execFileSync('/bin/busybox', ['stat', '-c', '%t:%T', '/dev/null'], { encoding: 'utf8', timeout: 2000, stdio: ['ignore', 'pipe', 'ignore'] });
  if (device.trim() !== '1:3') throw Error('unsafe /dev/null');
  fs.accessSync('/dev/null', fs.constants.W_OK);
}
function configPath(create) {
  secure('/home', true); secure('/home/root', true);
  for (const d of ['/home/root/.config', '/home/root/.config/lginputhook']) {
    if (create && !fs.existsSync(d)) fs.mkdirSync(d, { mode: 0o700 });
    secure(d, true);
  }
  if (fs.existsSync(CONFIG)) secure(CONFIG, false);
}
function nativeFailure(reason, target = 'none') { const e = Error('native setup failed'); e.nativeReason = reason; e.nativeTarget = target; return e; }
function classifyInjector(result) {
  const streams = [result.stdout, result.stderr];
  try {
    if (result.error) return result.error.code === 'ETIMEDOUT' ? 'native_injector_timeout' : result.error.code === 'ENOBUFS' ? 'native_injector_overflow' : 'native_injector_spawn_failed';
    if (result.signal) return 'native_injector_signal';
    if (result.status === 0) return null;
    const rules = [
      ['native_injector_cleanup_failed', ['remote_getregs failed (restore)', 'failed to restore saved stack data', 'remote_sc_free: ELF header restore failed', 'remote_sc_free: failed to free memory map', 'remote_detach failed']],
      ['native_injector_resolve_failed', ['cannot resolve dl symbols', 'libc_init() failed', 'Failed to get libc base']],
      ['native_injector_wait_failed', ['remote_wait failed', 'remote_wait']],
      ['native_injector_ptrace_failed', ['remote_attach failed', 'remote_getregs failed (initial)', 'remote_setregs failed', 'ptrace']]
    ], marker = Buffer.from('[ERR ] ');
    for (const bytes of streams) {
      if (!Buffer.isBuffer(bytes)) continue;
      let at = -1;
      while ((at = bytes.indexOf(marker, at + 1)) !== -1) {
        if (at !== 0 && bytes[at - 1] !== 10) continue;
        const end = bytes.indexOf(10, at), text = bytes.slice(at + marker.length, Math.min(end === -1 ? bytes.length : end, at + marker.length + 256)).toString('utf8').replace(/\r$/, '');
        for (const [code, prefixes] of rules) if (prefixes.some(p => text === p || text.startsWith(p + ':'))) return code;
      }
    }
    return 'native_injector_unknown_failed';
  } finally { streams.forEach(bytes => { if (Buffer.isBuffer(bytes)) bytes.fill(0); }); }
}
function native() {
  let selected;
  try { nullDevice(); } catch (_) { throw nativeFailure('native_null_failed'); }
  try { selected = discover(); } catch (_) { throw nativeFailure('native_discovery_failed'); }
  selected.forEach(row => {
    const target = NATIVE_TARGETS.indexOf(row.name) !== -1 ? row.name : 'none'; let current;
    try { current = targets([proc(row.pid)].concat(selected.filter(r => r.pid !== row.pid)))[selected.indexOf(row)]; } catch (_) { throw nativeFailure('native_target_failed', target); }
    if (current.start !== row.start || current.exe !== row.exe) throw nativeFailure('native_target_changed', target);
    if (!current.loaded) {
      let result;
      try { result = cp.spawnSync(ROOT + '/ezinject', ['-l', '/dev/null', String(row.pid), ROOT + '/libinputhookpp.so'], { shell: false, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 8 * 1024 * 1024, timeout: 15000 }); } catch (_) { throw nativeFailure('native_injector_spawn_failed', target); }
      const reason = classifyInjector(result); if (reason) throw nativeFailure(reason, target);
      try { const after = proc(row.pid); if (after.start !== row.start || !targets([after].concat(selected.filter(r => r.pid !== row.pid))).some(r => r.pid === row.pid && r.loaded)) throw Error('mapping not verified'); } catch (_) { throw nativeFailure('native_mapping_failed', target); }
    }
  });
}
function inputReady() {
  try { discover(); return true; }
  catch (e) { if (/^target missing or ambiguous: /.test(e.message)) return false; throw e; }
}
async function stopOwned() {
  if (!fs.existsSync(pidfile)) return;
  const owner = parse(read(pidfile)); if (!Number.isInteger(owner.pid) || owner.pid < 2) throw Error('invalid owned PID');
  try {
    const row = proc(owner.pid), cmd = fs.readFileSync('/proc/' + owner.pid + '/cmdline', 'utf8').split('\0');
    if (row.start !== owner.start || row.exe !== '/usr/bin/node' || cmd.length !== 4 || cmd[0] !== '/usr/bin/node' || cmd[1] !== ROOT + '/router.cjs' || (cmd[2] !== 'observe' && cmd[2] !== 'boot') || cmd[3] !== '') throw Error('observer PID ownership mismatch');
    process.kill(owner.pid, 'SIGTERM');
  } catch (e) { if (e.code !== 'ENOENT' && e.code !== 'ESRCH') throw e; }
  for (let i = 0; i < 20 && fs.existsSync(pidfile); i++) {
    try { if (proc(owner.pid).start !== owner.start) break; }
    catch (e) { if (e.code === 'ENOENT' || e.code === 'ESRCH') break; throw e; }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (fs.existsSync(pidfile)) {
    try { if (proc(owner.pid).start === owner.start) throw Error('observer did not stop'); }
    catch (e) { if (e.code !== 'ENOENT' && e.code !== 'ESRCH') throw e; }
    if (parse(read(pidfile)).pid !== owner.pid) throw Error('PID record changed');
    fs.unlinkSync(pidfile);
  }
}
function launch() {
  const child = cp.spawn('/usr/bin/luna-send', ['-n', '1', 'luna://com.webos.applicationManager/launch', '{"id":"com.local.quietlauncher"}'], { shell: false, stdio: 'ignore' });
  const timeout = setTimeout(() => child.kill('SIGTERM'), 3000); child.on('close', () => clearTimeout(timeout)); child.on('error', () => clearTimeout(timeout));
  return () => { clearTimeout(timeout); child.kill('SIGTERM'); };
}
async function main(command) {
  check(command === 'disable' || command === 'stop'); const s = command === 'disable' || command === 'stop' ? {} : settings();
  if (command === 'probe') { nullDevice(); discover(); console.log('Preflight only. No injection or config change. Manual device gates still apply.'); return; }
  if (command === 'enable-home') {
    gate(gates(), 'home'); nullDevice(); discover();
    configPath(true);
    await writeMapping(CONFIG, backup);
    try { native(); } catch (e) { save({ home: false, exit: false, boot: false }); await restoreMapping(CONFIG, backup); throw e; }
    s.home = true; save(s); return;
  }
  if (command === 'disable') {
    save({ home: false, exit: false, boot: false }); let stopError;
    try { await stopOwned(); } catch (e) { stopError = e; }
    if (fs.existsSync(backup)) { configPath(false); await restoreMapping(CONFIG, backup); }
    if (stopError) throw stopError;
    console.log('Mapping restored. Verify physical stock HOME and Settings. Native library remains mapped.'); return;
  }
  if (command === 'enable-exit' || command === 'enable-boot') {
    if (!s.home || (command === 'enable-boot' && !s.exit)) throw Error('prior manual stages required'); gate(gates(), command === 'enable-exit' ? 'exit' : 'boot');
    s[command === 'enable-exit' ? 'exit' : 'boot'] = true; save(s); return;
  }
  if (command === 'stop') { await stopOwned(); return; }
  if (command === 'boot') {
    if (!s.boot || !s.home) return; const g = gates(); gate(g, 'boot');
    bootDiagnostic = bootStatus(g.apps); bootDiagnostic('boot_start', 'running', 'none');
    // Native HOME readiness is independent of the startup foreground.
    return observe(s, true);
  }
  if (command === 'observe') { if (!s.exit || !s.home) return; gate(gates(), 'exit'); return observe(s, false); }
  throw Error('commands: probe, enable-home, enable-exit, enable-boot, observe, boot, stop, disable');
}
function observe(s, boot) {
  const g = gates(); const owned = { pid: process.pid, start: proc(process.pid).start };
  const fd = fs.openSync(pidfile, 'wx', 0o600); try { fs.writeFileSync(fd, JSON.stringify(owned)); } finally { fs.closeSync(fd); }
  let launchStop = () => {}; let stop = () => {}; let finished = false;
  function cleanup(reason) { if (finished) return; finished = true; stop(reason); launchStop(); if (fs.existsSync(pidfile) && parse(read(pidfile)).pid === process.pid) fs.unlinkSync(pidfile); }
  process.on('SIGTERM', () => cleanup('signal_term')); process.on('SIGINT', () => cleanup('signal_int'));
  // Prepare native HOME first; then observe only fresh foreground replies.
  stop = monitor({ enabled: true, home: g.home, apps: g.apps, boot, bootInput: g.bootInput, ready: boot ? inputReady : null, bootstrap: boot ? native : null, now: () => Date.now(), launch() {
    launchStop = launch();
  } }, { onStop: cleanup, onStatus: boot ? bootDiagnostic : null, onDecision: boot ? bootDiagnostic.decision : null });
}
if (require.main === module) main(process.argv[2]).catch(() => { bootDiagnostic(null, 'startup_failed', 'none'); console.error('Router stopped: unsafe or incomplete state. Use the runbook; no device data logged.'); process.exitCode = 1; });
