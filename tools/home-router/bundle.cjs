'use strict';
// Local file copy/hash only. Never connects to a TV or executes native assets.
const fs = require('fs'); const path = require('path');
const { hash, parse, read } = require('./core.cjs');
const pins = {
  ezinject: '3a03f5ea162651315cdbe710f6da815c8dd2650ea733e401a6cdce06943741b5',
  'libinputhookpp.so': 'fc1cd1e207e9d0c1fadb3019e340c56ab68b031a77ed207cb3a55b2d8641c084'
};
function build(source, output, gateFile) {
  const out = path.resolve(output);
  if (!out.split(path.sep).includes('.lanes')) throw Error('bundle must be under ignored .lanes');
  if (fs.existsSync(out)) throw Error('output exists; choose a fresh bundle directory');
  const mapping = {};
  ['router.cjs', 'core.cjs', 'monitor.cjs', 'boot.sh', 'NOTICE'].forEach(n => { mapping[n] = path.join(__dirname, n); });
  mapping['gates.json'] = gateFile || path.join(__dirname, 'gates.json'); parse(read(mapping['gates.json']));
  Object.keys(pins).forEach(n => { mapping[n] = path.join(source, 'inputhook/service/inputhook', n); if (hash(mapping[n]) !== pins[n]) throw Error('pinned native hash mismatch'); });
  mapping['LICENSE.inputhook'] = path.join(source, 'inputhook/LICENSE.md');
  mapping['LICENSE.inputhookpp'] = path.join(source, 'inputhookpp-v1.0/LICENSE');
  mapping['LICENSE.ezinject'] = path.join(source, 'ezinject/COPYING');
  Object.keys(mapping).forEach(n => { if (!fs.statSync(mapping[n]).isFile()) throw Error('missing bundle input'); });
  fs.mkdirSync(out, { recursive: true }); fs.mkdirSync(path.join(out, 'state'));
  const manifest = {};
  Object.keys(mapping).sort().forEach(n => {
    if (pins[n]) fs.copyFileSync(mapping[n], path.join(out, n));
    else fs.writeFileSync(path.join(out, n), fs.readFileSync(mapping[n], 'utf8').replace(/\r\n/g, '\n'));
    manifest[n] = hash(path.join(out, n));
  });
  fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  return { directory: out, files: Object.keys(manifest).length, manifestSha256: hash(path.join(out, 'manifest.json')) };
}
if (require.main === module) {
  try { if (process.argv.length < 4) throw Error('usage: node bundle.cjs SOURCES NEW-.lanes-DIR [GATES.json]'); console.log(JSON.stringify(build(process.argv[2], process.argv[3], process.argv[4]))); }
  catch (e) { console.error(e.message); process.exitCode = 1; }
}
module.exports = { build };
