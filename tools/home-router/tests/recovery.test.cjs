'use strict';
const test = require('node:test'); const assert = require('node:assert/strict');
const fs = require('node:fs'); const vm = require('node:vm'); const path = require('node:path');
const ROOT = '/var/lib/quiet-home-router', STATE = ROOT + '/state';
function fixture(mode, wrong = {}) {
  let alive = true; const signals = [], reads = [], descriptors = new Map(), files = new Map(); let nextFd = 1;
  const names = ['core.cjs', 'monitor.cjs', 'router.cjs', 'boot.sh', 'gates.json', 'ezinject', 'libinputhookpp.so', 'LICENSE.inputhook', 'LICENSE.inputhookpp', 'LICENSE.ezinject', 'NOTICE', 'manifest.json'];
  for (const name of names) files.set(ROOT + '/' + name, Buffer.from('{}'));
  files.set(STATE + '/settings.json', Buffer.from('{"home":true,"exit":true,"boot":true}'));
  files.set(STATE + '/observer.json', Buffer.from('{"pid":80,"start":"100"}'));
  files.set(STATE + '/keybinds.original', Buffer.from('{"139":{"action":"pass"}}'));
  const config = '/home/root/.config/lginputhook/keybinds.json';
  files.set(config, Buffer.from('{"139":{"action":"pass"},"773":{"action":"launch","id":"com.local.quietlauncher"}}'));
  const dirs = new Set(['/var', '/var/lib', ROOT, STATE, '/home', '/home/root', '/home/root/.config', '/home/root/.config/lginputhook']);
  const elf = Buffer.alloc(1024 * 1024, 7); elf.write('\x7fELF', 0, 'binary');
  function data(file) {
    if (file.startsWith('/proc/80/')) {
      if (!alive) { const e = Error('gone'); e.code = 'ENOENT'; throw e; }
      if (file.endsWith('/stat')) return Buffer.from('80 (node) ' + Array(19).fill('0').concat(wrong.start || '100').join(' '));
      if (file.endsWith('/comm')) return Buffer.from('node\n');
      if (file.endsWith('/cmdline')) return Buffer.from('/usr/bin/node\0' + (wrong.script || ROOT + '/router.cjs') + '\0' + mode + '\0');
      if (file.endsWith('/maps')) return Buffer.from('');
      if (file.endsWith('/exe')) return elf;
    }
    if (!files.has(file)) throw Error('unexpected fixture path: ' + file); return files.get(file);
  }
  const fakeFs = {
    lstatSync(file) { const dir = dirs.has(file); if (!dir && !files.has(file)) throw Error('missing fixture path'); return { uid: 0, mode: dir ? 0o700 : 0o600, mtimeMs: 0, isSymbolicLink: () => false, isDirectory: () => dir, isFile: () => !dir }; },
    readdirSync(dir) { return dir === ROOT ? names.concat('state') : Array.from(files.keys()).filter(f => path.posix.dirname(f) === dir).map(f => path.posix.basename(f)); },
    existsSync: file => dirs.has(file) || files.has(file),
    readFileSync(file, encoding) { const bytes = data(file); if (file.endsWith('/exe')) reads.push(bytes.length); return encoding ? bytes.toString(encoding) : bytes; },
    readlinkSync: () => '/usr/bin/node',
    openSync(file, flags) { const id = nextFd++; if (flags === 'wx' && files.has(file)) throw Error('exists'); descriptors.set(id, file); if (flags === 'wx') files.set(file, Buffer.alloc(0)); return id; },
    readSync(fd, buffer, offset, length, position) { reads.push(length); const b = data(descriptors.get(fd)); return b.copy(buffer, offset, position, position + length); },
    closeSync(fd) { descriptors.delete(fd); }, fsyncSync() {},
    writeFileSync(file, value) { files.set(typeof file === 'number' ? descriptors.get(file) : file, Buffer.from(value)); },
    renameSync(from, to) { files.set(to, files.get(from)); files.delete(from); }, unlinkSync(file) { files.delete(file); }
  };
  function load(name, dependencies, expose = '') {
    const mod = { exports: {} }; const requireFake = dep => dependencies[dep] || require(dep);
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', name), 'utf8') + expose, { module: mod, require: requireFake, __dirname: ROOT, Buffer, process: { platform: 'linux', getuid: () => 0, kill(pid, signal) { signals.push([pid, signal]); alive = false; } }, console: { log() {} }, setTimeout(fn) { fn(); } });
    return mod.exports;
  }
  const core = load('core.cjs', { fs: fakeFs });
  const runtime = load('router.cjs', { fs: fakeFs, './core.cjs': core, './monitor.cjs': require('../monitor.cjs') }, '\nmodule.exports = { main, proc };');
  return { runtime, files, signals, reads, descriptors, config, fakeFs };
}
test('stop and disable signal exact owned boot and observe processes and clear records', async () => {
  for (const mode of ['boot', 'observe']) for (const command of ['stop', 'disable']) {
    const f = fixture(mode); await f.runtime.main(command);
    assert.deepEqual(f.signals, [[80, 'SIGTERM']], mode + command); assert.equal(f.files.has(STATE + '/observer.json'), false);
    if (command === 'disable') {
      assert.deepEqual(JSON.parse(f.files.get(STATE + '/settings.json')), { home: false, exit: false, boot: false });
      assert.deepEqual(JSON.parse(f.files.get(f.config)), { '139': { action: 'pass' } });
    }
  }
});
test('stop rejects wrong start, script and extra or unowned entry arguments', async () => {
  for (const [mode, wrong] of [['observe', { start: '101' }], ['boot', { script: '/tmp/router.cjs' }], ['probe', {}], ['boot\0observe', {}]]) {
    const f = fixture(mode, wrong); await assert.rejects(f.runtime.main('stop'), /ownership mismatch/); assert.deepEqual(f.signals, []);
  }
});
test('proc reads only the 20-byte ELF header and always closes its descriptor', () => {
  const f = fixture('observe'); const row = f.runtime.proc(80); assert.equal(row.elf.length, 20); assert.deepEqual(f.reads, [20]); assert.equal(f.descriptors.size, 0);
});
test('proc closes the ELF descriptor if reading fails', () => {
  const f = fixture('boot'); f.fakeFs.readSync = () => { throw Error('read failed'); };
  assert.throws(() => f.runtime.proc(80), /read failed/); assert.equal(f.descriptors.size, 0);
});
