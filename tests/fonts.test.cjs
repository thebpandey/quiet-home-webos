const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
test('font package gate accepts only the selected local font and license', t => {
  const { checkFonts } = require('../scripts/check.cjs');
  assert.equal(typeof checkFonts, 'function');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'quiet-font-'));
  t.after(() => fs.rmSync(root, {recursive:true,force:true,maxRetries:8,retryDelay:250}));
  fs.cpSync(path.join(__dirname,'../app/fonts'),path.join(root,'fonts'),{recursive:true});
  const css = fs.readFileSync(path.join(__dirname,'../app/styles.css'),'utf8'); fs.writeFileSync(path.join(root,'styles.css'),css);
  assert.doesNotThrow(() => checkFonts(root));
  fs.writeFileSync(path.join(root,'fonts','extra.ttf'),'extra'); assert.throws(() => checkFonts(root)); fs.unlinkSync(path.join(root,'fonts','extra.ttf'));
  const file = path.join(root,'fonts','CormorantGaramond.ttf'), original = fs.readFileSync(file);
  fs.writeFileSync(file, Buffer.from('invalid')); assert.throws(() => checkFonts(root)); fs.writeFileSync(file,original);
  fs.writeFileSync(path.join(root,'styles.css'),css.replace('fonts/CormorantGaramond.ttf','https://example.com/font.ttf')); assert.throws(() => checkFonts(root));
  fs.writeFileSync(path.join(root,'styles.css'),css); fs.renameSync(path.join(root,'fonts'),path.join(root,'real-fonts'));
  fs.symlinkSync(path.join(root,'real-fonts'),path.join(root,'fonts'),'junction'); assert.throws(() => checkFonts(root));
});
