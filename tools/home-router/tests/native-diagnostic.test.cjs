'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
function runtime(childProcess = {}) {
  const mod = { exports: {} }, deps = { child_process: childProcess, './core.cjs': require('../core.cjs'), './monitor.cjs': require('../monitor.cjs') };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../router.cjs'), 'utf8') + '\nmodule.exports={ classify:typeof classifyInjector === "function"?classifyInjector:()=>null, run(mock){nullDevice=mock.nullDevice;discover=mock.discover;proc=mock.proc;return native();} };', { module: mod, require: p => deps[p] || require(p), Buffer });
  return mod.exports;
}
test('injector classification keeps only anchored static error codes and clears both raw streams', () => {
  const r = runtime();
  for (const [text, wanted] of [
    ['[ERR ] remote_attach failed: untrusted detail\n', 'native_injector_ptrace_failed'],
    ['[ERR ] cannot resolve dl symbols\n', 'native_injector_resolve_failed'],
    ['[ERR ] remote_wait failed\n', 'native_injector_wait_failed'],
    ['[ERR ] remote_sc_free: ELF header restore failed\n', 'native_injector_cleanup_failed'],
    ['[INFO] [ERR ] remote_attach failed: untrusted detail\n', 'native_injector_unknown_failed'],
    ['[ERR ] remote_attach failed_extra\n', 'native_injector_unknown_failed']
  ]) {
    const out = Buffer.from('own memory map /untrusted/path\n' + text), err = Buffer.from('unmatched detail');
    const result = { status: 1, stdout: out, stderr: err, output: [null, out, err] };
    assert.equal(r.classify(result), wanted); assert.ok(out.every(b => b === 0)); assert.ok(err.every(b => b === 0));
  }
  const success = { status: 0, stdout: Buffer.from('[ERR ] remote_wait failed\n'), stderr: Buffer.alloc(0) };
  assert.equal(r.classify(success), null); assert.ok(success.stdout.every(b => b === 0));
  for (const [result, wanted] of [[{ error: { code: 'ETIMEDOUT' }, signal: 'SIGTERM' }, 'native_injector_timeout'], [{ error: { code: 'ENOBUFS' } }, 'native_injector_overflow'], [{ error: { code: 'ENOENT' } }, 'native_injector_spawn_failed'], [{ status: null, signal: 'SIGSEGV' }, 'native_injector_signal']]) assert.equal(r.classify(result), wanted);
});
test('native failure retains the fixed target and aborts without retry after a mapped library and nonzero exit', () => {
  let calls = 0, mapped = false;
  const r = runtime({ spawnSync(cmd, args, opts) {
    calls++; assert.ok(cmd.endsWith('/ezinject')); assert.deepEqual(Array.from(args), ['-l', '/dev/null', '80', '/var/lib/quiet-home-router/libinputhookpp.so']);
    assert.equal(opts.timeout, 15000); assert.equal(opts.maxBuffer, 8 * 1024 * 1024); assert.deepEqual(Array.from(opts.stdio), ['ignore', 'pipe', 'pipe']);
    mapped = true; return { status: 1, stdout: Buffer.from('[ERR ] remote_sc_free: ELF header restore failed\n'), stderr: Buffer.alloc(0) };
  } });
  const elf = Buffer.alloc(20); elf.write('\x7fELF', 0, 'binary'); elf[4] = 1; elf[5] = 1; elf.writeUInt16LE(40, 18);
  const rows = ['lginput2', 'micomservice'].map((name, i) => ({ pid: 80 + i, name, exe: '/usr/sbin/' + name, start: '10', elf, maps: '', loaded: false }));
  assert.throws(() => r.run({ nullDevice() {}, discover: () => rows, proc: pid => Object.assign({}, rows.find(p => p.pid === pid), { maps: mapped && pid === 80 ? '/var/lib/quiet-home-router/libinputhookpp.so' : '' }) }), e => e.nativeReason === 'native_injector_cleanup_failed' && e.nativeTarget === 'lginput2' && !e.message.includes('untrusted'));
  assert.equal(calls, 1);
});
