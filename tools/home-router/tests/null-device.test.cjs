'use strict';
const test = require('node:test'); const assert = require('node:assert/strict');
const fs = require('node:fs'); const vm = require('node:vm'); const path = require('node:path');

test('null preflight verifies device 1:3 when ARM32 Node reports rdev 1', () => {
  let device = '1:3\n', checked = false;
  const mod = { exports: {} };
  const fakeFs = {
    constants: { W_OK: 2 },
    lstatSync(file) { assert.equal(file, '/dev/null'); return { uid: 0, mode: 0o20666, rdev: 1, isCharacterDevice: () => true }; },
    accessSync(file, mode) { assert.equal(file, '/dev/null'); assert.equal(mode, 2); checked = true; }
  };
  const childProcess = { execFileSync(file, args, options) {
    assert.equal(file, '/bin/busybox'); assert.deepEqual(Array.from(args), ['stat', '-c', '%t:%T', '/dev/null']);
    assert.equal(options.encoding, 'utf8'); assert.equal(options.timeout, 2000);
    assert.deepEqual(Array.from(options.stdio), ['ignore', 'pipe', 'ignore']);
    return device;
  } };
  const dependencies = { fs: fakeFs, child_process: childProcess, './core.cjs': require('../core.cjs'), './monitor.cjs': require('../monitor.cjs') };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'router.cjs'), 'utf8') + '\nmodule.exports = nullDevice;', {
    module: mod, require: dep => dependencies[dep] || require(dep)
  });
  assert.doesNotThrow(() => mod.exports()); assert.equal(checked, true);
  device = '1:5\n'; checked = false;
  assert.throws(() => mod.exports(), /unsafe \/dev\/null/); assert.equal(checked, false);
});
