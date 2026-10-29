'use strict';
const test = require('node:test'); const assert = require('node:assert/strict');
const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path'); const { build } = require('../bundle.cjs');
test('bundle refuses unpinned native assets before it creates output', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'router-bundle-'));
  try {
    const n = path.join(d, 'inputhook/service/inputhook'); fs.mkdirSync(n, { recursive: true }); fs.writeFileSync(path.join(n, 'ezinject'), 'never execute');
    const out = path.join(d, '.lanes/bundle'); assert.throws(() => build(d, out), /pinned native hash/); assert.equal(fs.existsSync(out), false);
    assert.throws(() => build(d, path.join(d, 'outside')), /ignored/);
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});
