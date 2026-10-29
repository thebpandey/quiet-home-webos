const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const app = path.join(root, 'app');
const expected = ['appinfo.json', 'ambient.js', 'core.js', 'icon.png', 'index.html', 'main.js',
  'platform.js', 'styles.css', 'quotes.js', 'quotes.json', 'weather.js', 'weather-view.js', 'tiles.json', 'wallpapers.json', 'wallpapers', 'icons', 'weather-icons', 'fonts'];
const iconNames = ['stremio.svg', 'netflix.png', 'prime-video.png', 'hbo-max.png',
  'youtube.png', 'hdmi.svg', 'settings.svg', 'all-apps.svg'];
const weatherIconNames = ['clear-day.svg', 'clear-night.svg', 'partly-cloudy-day.svg', 'partly-cloudy-night.svg',
  'cloudy.svg', 'fog.svg', 'rain.svg', 'snow.svg', 'storm.svg', 'unknown.svg'];
function checkFonts(directory) {
  const fonts = path.join(directory, 'fonts'), stat = fs.lstatSync(fonts);
  assert.ok(stat.isDirectory() && !stat.isSymbolicLink(), 'fonts must be a regular directory');
  assert.deepEqual(fs.readdirSync(fonts).sort(), ['CormorantGaramond.ttf', 'OFL.txt'].sort(), 'Only the selected font and license are permitted');
  for (const name of ['CormorantGaramond.ttf', 'OFL.txt']) {
    const entry = fs.lstatSync(path.join(fonts, name));
    assert.ok(entry.isFile() && !entry.isSymbolicLink(), name + ' must be a regular file');
  }
  const font = fs.readFileSync(path.join(fonts, 'CormorantGaramond.ttf'));
  assert.equal(font.length, 1195560, 'The selected font has an unexpected size');
  assert.equal(font.subarray(0, 4).toString('hex'), '00010000', 'The font must be a TrueType file');
  assert.equal(crypto.createHash('sha256').update(font).digest('hex'), 'b20b7d9626dd956b2c5e558692ad328b1f19e3275e2782db4fa07670d83f35e0', 'The font must match the selected specimen');
  assert.match(fs.readFileSync(path.join(fonts, 'OFL.txt'), 'utf8'), /SIL OPEN FONT LICENSE/);
  const css = fs.readFileSync(path.join(directory, 'styles.css'), 'utf8');
  assert.equal([...css.matchAll(/@font-face\s*\{/gi)].length, 1, 'Only the selected font face is permitted');
  assert.ok(!/@import\b/i.test(css), 'External stylesheet imports are not permitted');
  const urls = [...css.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)].map(match => match[1].trim());
  assert.deepEqual(urls, ['fonts/CormorantGaramond.ttf'], 'Styles must use only the selected local font');
}
function checkWeatherIcons(directory) {
  const icons = path.join(directory, 'weather-icons');
  const stat = fs.lstatSync(icons);
  assert.ok(stat.isDirectory() && !stat.isSymbolicLink(), 'weather-icons must be a regular directory');
  assert.deepEqual(fs.readdirSync(icons).sort(), weatherIconNames.slice().sort(), 'Only approved weather icons are permitted');
  for (const name of weatherIconNames) {
    const file = fs.lstatSync(path.join(icons, name));
    assert.ok(file.isFile() && !file.isSymbolicLink(), name + ' must be a regular local file');
  }
}
function checkIcons(directory) {
  const icons = path.join(directory, 'icons');
  const stat = fs.lstatSync(icons);
  assert.ok(stat.isDirectory() && !stat.isSymbolicLink(), 'icons must be a regular directory');
  assert.deepEqual(fs.readdirSync(icons).sort(), iconNames.slice().sort(), 'Only the eight approved icons are permitted');
  for (const name of iconNames) {
    const file = fs.lstatSync(path.join(icons, name));
    assert.ok(file.isFile() && !file.isSymbolicLink(), name + ' must be a regular local file');
  }
  const main = fs.readFileSync(path.join(directory, 'main.js'), 'utf8');
  for (const reference of main.matchAll(/["'](icons\/[^"']+)["']/g)) {
    assert.ok(iconNames.some(name => reference[1] === 'icons/' + name), 'Unsafe or unknown icon reference: ' + reference[1]);
  }
}
function checkPolicy(html) {
  const policies = [...html.matchAll(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"\s*>/gi)];
  assert.equal(policies.length, 1, 'Exactly one package content security policy is required');
  const directives = new Map();
  for (const part of policies[0][1].split(';').filter(value => value.trim())) {
    const [name, ...sources] = part.trim().split(/\s+/);
    assert.ok(!directives.has(name), 'Duplicate CSP directive: ' + name);
    directives.set(name, sources);
  }
  for (const name of ['script-src', 'style-src', 'img-src', 'font-src', 'connect-src']) {
    const sources = directives.get(name) || [];
    assert.ok(sources.includes('file:'), name + ' must permit packaged files on the TV opaque file origin');
    const permitted = ["'self'", 'file:'];
    if (name === 'connect-src') permitted.push('https://api.open-meteo.com', 'https://air-quality-api.open-meteo.com', 'https://geocoding-api.open-meteo.com');
    assert.deepEqual(sources.slice().sort(), permitted.sort(), name + ' has unexpected sources');
    directives.delete(name);
  }
  for (const name of ['default-src', 'frame-src', 'child-src', 'worker-src', 'object-src', 'base-uri', 'form-action']) {
    assert.deepEqual(directives.get(name), ["'none'"], name + ' must deny unused capabilities');
    directives.delete(name);
  }
  assert.equal(directives.size, 0, 'Unexpected CSP directives require a policy review');
}

function checkAssets(directory, { allowPartial = false } = {}) {
  assert.deepEqual(fs.readdirSync(directory).sort(), expected.slice().sort(), 'app/ must contain only the approved package assets');
  for (const name of expected) {
    const stat = fs.lstatSync(path.join(directory, name));
    assert.ok(!stat.isSymbolicLink(), name + ' must not be a symbolic link');
    assert.ok(name === 'wallpapers' || name === 'icons' || name === 'weather-icons' || name === 'fonts' ? stat.isDirectory() : stat.isFile(), name + ' has the wrong file type');
  }
  checkIcons(directory);
  checkWeatherIcons(directory);
  checkFonts(directory);
  const scenes = require('../app/ambient.js').validateManifest(JSON.parse(fs.readFileSync(path.join(directory, 'wallpapers.json'), 'utf8')));
  if (!allowPartial) assert.equal(scenes.length, 24, 'A release package requires exactly 24 wallpapers; use --preview for a partial preview');
  const imageNames = scenes.map(scene => scene.id + '.jpg');
  assert.deepEqual(fs.readdirSync(path.join(directory, 'wallpapers')).sort(), imageNames.sort(), 'Only the manifest images are permitted');
  for (const scene of scenes) {
    const image = path.resolve(directory, scene.src);
    assert.equal(path.dirname(image), path.join(path.resolve(directory), 'wallpapers'), 'Image must stay in app/wallpapers');
    const stat = fs.lstatSync(image);
    assert.ok(stat.isFile() && !stat.isSymbolicLink(), scene.src + ' must be a regular file');
  }
}

async function main() {
  const args = process.argv.slice(2);
  assert.ok(args.length === 0 || (args.length === 1 && args[0] === '--preview'), 'Usage: node scripts/check.cjs [--preview]');
  const allowPartial = args[0] === '--preview';
  const html = fs.readFileSync(path.join(app, 'index.html'), 'utf8');
  checkPolicy(html);
  checkAssets(app, { allowPartial });
  // Supplied by the wallpaper lane. Both release and preview packages must
  // pass the same image integrity checks; only the required count differs.
  await require('./check-wallpapers.cjs').checkWallpapers(app, { allowPartial });
  for (const file of ['app/core.js', 'app/platform.js', 'app/main.js', 'app/ambient.js', 'app/weather.js', 'app/weather-view.js', 'app/quotes.js', 'scripts/check.cjs',
    'scripts/package.cjs', 'scripts/preview.cjs', 'scripts/icon.cjs']) {
    const result = spawnSync(process.execPath, ['--check', path.join(root, file)], { stdio: 'inherit' });
    assert.equal(result.status, 0, file + ' syntax check failed');
  }
  const info = JSON.parse(fs.readFileSync(path.join(app, 'appinfo.json'), 'utf8'));
  assert.equal(info.id, 'com.local.quietlauncher');
  assert.equal(info.version, '0.2.10');
  const packageInfo = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  for (const version of [packageInfo.version, lock.version, lock.packages[''].version]) {
    assert.equal(version, info.version, 'App and package versions must agree');
  }
  assert.equal(info.type, 'web');
  assert.equal(info.title, 'Quiet Home');
  assert.equal(info.main, 'index.html');
  assert.equal(info.icon, 'icon.png');
  assert.equal(info.disableBackHistoryAPI, true);
  require('../app/quotes.js').validateBank(JSON.parse(fs.readFileSync(path.join(app, 'quotes.json'), 'utf8')));
  const { validateConfig } = require('../app/core.js');
  validateConfig(JSON.parse(fs.readFileSync(path.join(app, 'tiles.json'), 'utf8')));
  const icon = fs.readFileSync(path.join(app, 'icon.png'));
  assert.equal(icon.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(icon.readUInt32BE(16), 80);
  assert.equal(icon.readUInt32BE(20), 80);
  for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    assert.ok(expected.includes(match[1]), 'Only local package resources are permitted: ' + match[1]);
  }
  console.log('Syntax, metadata, configuration, icon and package asset checks passed.');
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { checkAssets, checkPolicy, checkIcons, checkWeatherIcons, checkFonts };
