'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const dir = '/tmp/quiet-home-router-boot-status', file = dir + '/status.json';
function fixture(attack) {
  let now = 1000, next = 1;
  const entries = new Map([['/tmp', { directory: true, mode: 0o1777, uid: 0 }]]), fds = new Map();
  function missing() { const e = Error('missing'); e.code = 'ENOENT'; throw e; }
  function entry(p) { return entries.get(p) || missing(); }
  const fakeFs = {
    lstatSync(p) { const e = entry(p); return { uid: e.uid, mode: e.mode, isSymbolicLink: () => !!e.link, isDirectory: () => !!e.directory, isFile: () => !e.directory }; },
    mkdirSync(p, options) { if (entries.has(p)) { const e = Error('exists'); e.code = 'EEXIST'; throw e; } entries.set(p, { directory: true, mode: options.mode, uid: 0 }); },
    readdirSync(p) { return Array.from(entries.keys()).filter(k => path.posix.dirname(k) === p).map(k => path.posix.basename(k)); },
    readFileSync(p, encoding) { const b = p === '/proc/sys/kernel/random/boot_id' ? Buffer.from('11111111-2222-4333-8444-555555555555\n') : entry(p).bytes; return encoding ? b.toString(encoding) : b; },
    openSync(p, flags, mode) { if (entries.has(p)) { const e = Error('exists'); e.code = 'EEXIST'; throw e; } const fd = next++; entries.set(p, { mode, uid: 0, bytes: Buffer.alloc(0) }); fds.set(fd, p); return fd; },
    writeFileSync(fd, bytes) { entry(fds.get(fd)).bytes = Buffer.from(bytes); }, fchmodSync(fd, mode) { entry(fds.get(fd)).mode = mode; },
    fsyncSync() {}, closeSync(fd) { fds.delete(fd); }, renameSync(from, to) { entries.set(to, entry(from)); entries.delete(from); }
  };
  if (attack) {
    entries.set(dir, { directory: true, mode: 0o700, uid: 0 });
    if (attack === 'directory_link') entries.get(dir).link = true;
    if (attack === 'directory_mode') entries.get(dir).mode = 0o755;
    if (attack === 'foreign_owner') entries.get(dir).uid = 1000;
    if (attack === 'file_link') entries.set(file, { uid: 0, mode: 0o600, link: true, bytes: Buffer.from('untouched') });
    if (attack === 'file_mode') entries.set(file, { uid: 0, mode: 0o644, bytes: Buffer.from('untouched') });
  }
  const mod = { exports: {} }, dependencies = { fs: fakeFs, './core.cjs': require('../core.cjs'), './monitor.cjs': require('../monitor.cjs') };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../router.cjs'), 'utf8') + '\nmodule.exports = typeof bootStatus === "function" ? bootStatus : () => () => false;', {
    module: mod, require: p => dependencies[p] || require(p), Buffer, Date: { now: () => now }, process: { platform: 'linux', getuid: () => 0 }, console: { error() {} }
  });
  return { write: mod.exports(['netflix']), entries, tick(ms) { now += ms; } };
}
test('boot receipt is private, atomic, bounded and contains fixed fields only', () => {
  const f = fixture(); f.tick(200); f.write('native_ready', 'running', 'none');
  assert.ok(f.entries.has(file), 'boot progress must produce a receipt');
  const r = JSON.parse(f.entries.get(file).bytes);
  assert.deepEqual(r, { version: 1, bootId: '11111111-2222-4333-8444-555555555555', phase: 'native_ready', reason: 'running', source: 'none', elapsedMs: 200 });
  assert.equal(f.entries.get(dir).mode, 0o700); assert.equal(f.entries.get(file).mode, 0o600); assert.equal(f.entries.has(file + '.next'), false);
  f.write('native_wait', 'native_injector_cleanup_failed', 'lginput2');
  const native = JSON.parse(f.entries.get(file).bytes);
  assert.equal(native.reason, 'native_injector_cleanup_failed'); assert.equal(native.source, 'lginput2');
  f.write('untrusted detail', 'untrusted detail', 'untrusted detail');
  const sanitized = JSON.parse(f.entries.get(file).bytes);
  assert.equal(sanitized.phase, 'unclassified'); assert.equal(sanitized.reason, 'unclassified_stop'); assert.equal(sanitized.source, 'none');
  assert.equal(f.entries.get(file).bytes.toString().includes('untrusted detail'), false);
});

test('boot decision companion is bounded and stores only permitted window metadata', () => {
  const f = fixture(), decision = dir + '/boot-decision.json';
  const rows = [{ appId: 'com.webos.app.home', windowType: '_WEBOS_WINDOW_TYPE_CARD', title: 'untrusted detail', params: { url: 'untrusted detail' } }, { appId: 'netflix', type: 'fullscreen' }, { appId: 'private-user-app', windowType: 'untrusted detail' }, { appId: 'com.local.quietlauncher', windowType: '_WEBOS_WINDOW_TYPE_CARD' }];
  const data = { event: 'first_reply', source: 'sam', generation: 1, boot: true, remainingMs: 29000, nowMs: 2000, wallElapsedMs: 1000, monotonicElapsedMs: 100, rows, states: { sam: { time: 1000, windows: rows } }, incomplete: ['focus'], category: 'none' };
  if (f.write.decision) f.write.decision(data);
  assert.ok(f.entries.has(decision), 'decision snapshot must produce its fixed companion');
  f.write.decision(Object.assign({}, data, { event: 'veto', source: 'windows', boot: false, category: 'settings' }));
  for (let i = 0; i < 20; i++) f.write.decision(Object.assign({}, data, { rows: Array(20).fill(rows[0]) }));
  const bytes = f.entries.get(decision).bytes, r = JSON.parse(bytes);
  assert.equal(f.entries.get(decision).mode, 0o600); assert.ok(bytes.length < 65536); assert.equal(r.firstReplies.length, 1);
  assert.equal(r.firstVeto.category, 'settings'); assert.equal(r.latest.sources.sam.ageMs, 1000);
  assert.equal(r.latest.wallElapsedMs, 1000); assert.equal(r.latest.monotonicElapsedMs, 100);
  assert.equal(r.firstReplies[0].observed[0].appId, 'com.webos.app.home'); assert.equal(r.firstReplies[0].observed[1].appId, 'netflix');
  assert.equal(r.firstReplies[0].observed[2].appId, 'other'); assert.equal(r.firstReplies[0].observed[2].type, 'other');
  assert.equal(r.firstReplies[0].observed[3].appId, 'com.local.quietlauncher'); assert.equal(r.finished, true);
  assert.ok(r.latest.observed.length <= 8); assert.equal(bytes.toString().includes('untrusted detail'), false); assert.equal(bytes.toString().includes('private-user-app'), false);
  f.write('subscriptions_ready', 'running', 'none'); assert.equal(JSON.parse(f.entries.get(file).bytes).phase, 'subscriptions_ready');
});
test('unsafe diagnostic paths are untouched and diagnostic failure does not throw', () => {
  for (const attack of ['directory_link', 'directory_mode', 'foreign_owner', 'file_link', 'file_mode']) {
    const f = fixture(attack), before = f.entries.has(file) ? f.entries.get(file).bytes : undefined;
    assert.doesNotThrow(() => f.write('native_ready', 'running', 'none'));
    assert.deepEqual(f.entries.has(file) ? f.entries.get(file).bytes : undefined, before, attack);
    assert.equal(f.entries.has(file + '.next'), false);
  }
});
