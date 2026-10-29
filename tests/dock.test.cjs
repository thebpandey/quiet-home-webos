const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
const { spawnSync } = require('node:child_process');
const iconNames = ['stremio.svg', 'netflix.png', 'prime-video.png', 'hbo-max.png',
  'youtube.png', 'hdmi.svg', 'settings.svg', 'all-apps.svg'];

function renderDock(t, unknown = false, weather = false) {
  const browser = [process.env.CSP_TEST_BROWSER, 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/chromium']
    .find(file => file && fs.existsSync(file));
  if (!browser) return t.skip('An installed Chromium browser is required for dock rendering checks.');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'quiet-dock-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 }));
  const app = path.join(__dirname, '../app');
  for (const name of ['main.js', 'core.js', 'platform.js', 'ambient.js', 'weather-view.js', 'styles.css', 'tiles.json']) {
    fs.copyFileSync(path.join(app, name), path.join(root, name));
  }
  if (weather) fs.writeFileSync(path.join(root, 'weather.js'), `
    window.LauncherWeather = {
      validatePostalCode: function (zip) { if (!/^\\d{5}$/.test(zip)) throw Error('Invalid ZIP'); },
      resolveLocation: function (zip) { return Promise.resolve({postalCode: zip, name: 'Springfield', region: 'IL', countryCode: 'US', latitude: 39.8, longitude: -89.6, timezone: 'America/Chicago'}); },
      fetchWeather: function () { var item = window.weatherCase || {code:0, day:true}; return Promise.resolve({temperatureF:70, relativeHumidityPct:50, condition:'Clear', weatherCode:item.code, isDay:item.day, validAtMs:1700000000000, fetchedAtMs:Date.now()}); },
      fetchAirQuality: function () { return Promise.resolve({usAqi:${weather === 600 ? 600 : 42}, pm25MicrogramsM3:4, pm10MicrogramsM3:8, validAtMs:1700000000000, fetchedAtMs:Date.now()}); },
      describeAqi: function (value) { return value > 500 ? 'Hazardous' : 'Good'; }
    };
  `);
  if (unknown) {
    const config = JSON.parse(fs.readFileSync(path.join(root, 'tiles.json'), 'utf8'));
    config.tiles[0] = { label: 'Music', appId: 'local.music', kind: 'app' };
    fs.writeFileSync(path.join(root, 'tiles.json'), JSON.stringify(config));
  }
  // Use the real app with missing scenery: logo rendering/navigation must not
  // depend on the separate wallpaper manifest. No production files are changed.
  fs.writeFileSync(path.join(root, 'index.html'), fs.readFileSync(path.join(app, 'index.html'), 'utf8')
    .replace('</body>', '<script src="dock-probe.js"></script></body>'));
  fs.writeFileSync(path.join(root, 'dock-probe.js'), `
    setTimeout(async function () {
      var buttons = Array.from(document.querySelectorAll('.tile'));
      var results = { count: buttons.length, labels: buttons.map(b => b.getAttribute('aria-label')),
        visibleText: buttons.map(b => b.innerText.trim()),
        appearance: buttons.map(b => { var s = getComputedStyle(b); return { background: s.backgroundColor, border: s.borderTopWidth }; }),
        images: buttons.map(b => { var img = b.querySelector('img'); return img ? { src: img.getAttribute('src'), alt: img.alt } : null; }),
        logo: buttons[0] && buttons[0].querySelector('.tile-logo').getBoundingClientRect().toJSON(),
        genericCells: Array.from(buttons[0].querySelectorAll('.tile-generic-cell')).map(cell => ({
          width: cell.getBoundingClientRect().width, height: cell.getBoundingClientRect().height,
          border: getComputedStyle(cell).borderTopWidth, color: getComputedStyle(cell).borderTopColor
        })),
        dock: document.querySelector('.tiles').getBoundingClientRect().toJSON(),
        first: buttons[0] && buttons[0].getBoundingClientRect().toJSON() };
      results.focus = [];
      buttons[0].focus();
      for (var i = 0; i < 6; i++) {
        document.activeElement.dispatchEvent(new KeyboardEvent('keydown', {key:'ArrowRight',bubbles:true,cancelable:true}));
        results.focus.push(buttons.indexOf(document.activeElement));
      }
      results.focusOutline = getComputedStyle(document.activeElement).outlineStyle;
      results.focusBackground = getComputedStyle(document.activeElement).backgroundColor;
      var back = new KeyboardEvent('keydown', {key:'Back',bubbles:true,cancelable:true});
      document.activeElement.dispatchEvent(back); results.backPrevented = back.defaultPrevented;
      var rootTvBack = new KeyboardEvent('keydown', {key:'Unidentified',keyCode:461,bubbles:true,cancelable:true});
      document.activeElement.dispatchEvent(rootTvBack); results.rootTvBackPrevented = rootTvBack.defaultPrevented;
      results.rootBackFocus = document.activeElement === buttons[6];
      document.activeElement.dispatchEvent(new KeyboardEvent('keydown', {key:'Enter',bubbles:true,cancelable:true}));
      await new Promise(resolve => setTimeout(resolve, 20));
      results.dialogOpened = !document.getElementById('settings-overlay').hidden;
      results.initialFocus = document.activeElement.id;
      var key = function (name, extra) { var e = new KeyboardEvent('keydown', Object.assign({key:name,bubbles:true,cancelable:true}, extra || {})); document.activeElement.dispatchEvent(e); return e; };
      var originalDefaultLaunch = window.LauncherPlatform.launch, defaultCount = 0;
      window.LauncherPlatform.launch = function (tile, env) { if (tile.appId === 'com.palm.app.settings') defaultCount++; return originalDefaultLaunch(tile, env); };
      key('ArrowLeft'); results.defaultLeft1 = document.activeElement.id; key('ArrowLeft'); results.defaultLeft2 = document.activeElement.id;
      key('ArrowRight'); key('ArrowRight'); key('Enter'); await new Promise(resolve => setTimeout(resolve, 20)); results.defaultLaunchCount = defaultCount;
      window.LauncherPlatform.launch = originalDefaultLaunch; key('ArrowUp'); results.zipFocus = document.activeElement.id;
      results.zipLeftPrevented = key('ArrowLeft').defaultPrevented;
      results.zipRightPrevented = key('ArrowRight').defaultPrevented;
      results.dialogFocus = [];
      ['ArrowDown','ArrowRight','ArrowRight','ArrowLeft','ArrowUp'].forEach(function (name) { key(name); results.dialogFocus.push(document.activeElement.id); });
      key('ArrowDown'); var save = document.getElementById('settings-save'); save.disabled = true;
      key('ArrowRight'); results.disabledSkip = document.activeElement.id; save.disabled = false;
      key('ArrowUp'); key('Tab'); results.tabFocus = document.activeElement.id; key('Tab',{shiftKey:true}); results.shiftTabFocus = document.activeElement.id;
      key('ArrowDown'); key('ArrowRight'); results.enterPrevented = key('Enter').defaultPrevented;
      results.cancelClosed = document.getElementById('settings-overlay').hidden; results.cancelFocus = document.activeElement === buttons[6];
      buttons[6].click();
      var tvBack = key('Unidentified', {keyCode:461}); results.tvBackPrevented = tvBack.defaultPrevented;
      results.tvBackClosed = document.getElementById('settings-overlay').hidden; results.tvBackFocus = document.activeElement === buttons[6];
      buttons[6].click();
      var originalLaunch = window.LauncherPlatform.launch;
      window.LauncherPlatform.launch = function (tile, env) { if (tile.appId === 'com.palm.app.settings') { results.launchedId = tile.appId; results.launchCount = (results.launchCount || 0) + 1; } return originalLaunch(tile, env); };
      key('ArrowUp'); results.zipEnterPrevented = key('Enter').defaultPrevented;
      var countSave = 0; document.getElementById('settings-save').addEventListener('click', function () { countSave++; });
      document.getElementById('settings-save').focus(); key('Enter'); key('Enter', {repeat:true}); await new Promise(resolve => setTimeout(resolve, 20));
      results.saveCount = countSave;
      document.getElementById('settings-save').disabled = true;
      document.getElementById('settings-save').dispatchEvent(new KeyboardEvent('keydown', {key:'Enter',bubbles:true,cancelable:true}));
      document.getElementById('settings-save').disabled = false; results.disabledSaveCount = countSave;
      results.offline = document.getElementById('settings-message').textContent;
      document.getElementById('settings-tv').focus(); key('Enter'); await new Promise(resolve => setTimeout(resolve, 20));
      results.tvSettings = document.getElementById('settings-message').textContent;
      var escape = new KeyboardEvent('keydown', {key:'Escape',bubbles:true,cancelable:true});
      document.activeElement.dispatchEvent(escape);
      results.closed = document.getElementById('settings-overlay').hidden;
      results.focusRestored = document.activeElement === buttons[6];
      results.escapePrevented = escape.defaultPrevented;
      buttons[Math.min(4, buttons.length - 1)].click(); await new Promise(resolve => setTimeout(resolve, 20));
      results.pointer = document.getElementById('status').textContent;
      buttons[7].click();
      await new Promise(resolve => setTimeout(resolve, 20));
      results.appsOpen = !document.getElementById('apps-overlay').hidden;
      results.appsLabel = document.getElementById('apps-message').textContent;
      results.appsFirst = document.activeElement.textContent;
      key('Enter'); await new Promise(resolve => setTimeout(resolve, 20));
      results.appsLaunch = document.getElementById('apps-message').textContent;
      key('ArrowDown'); results.appsNext = document.activeElement.id;
      results.appsBackPrevented = key('Unidentified', {keyCode:461}).defaultPrevented; results.appsClosed = document.getElementById('apps-overlay').hidden; results.appsFocus = document.activeElement === buttons[7];
      window.LauncherPlatform.listApps = function () { return Promise.reject(Error('denied')); };
      buttons[7].click(); await new Promise(resolve => setTimeout(resolve, 20));
      results.appsError = document.getElementById('apps-message').textContent; results.appsRetry = document.activeElement.id;
      window.LauncherPlatform.listApps = function () { return Promise.resolve({simulated:false, apps:[]}); };
      key('Enter'); await new Promise(resolve => setTimeout(resolve, 20)); results.appsEmpty = document.getElementById('apps-message').textContent;
      key('Escape');
      buttons[0].click(); await new Promise(resolve => setTimeout(resolve, 20));
      results.firstLaunch = document.getElementById('status').textContent;
      if (window.LauncherWeather) {
        buttons[6].click(); document.getElementById('weather-zip').value = '62701';
        document.getElementById('settings-save').click(); await new Promise(resolve => setTimeout(resolve, 50));
        results.weatherDisplay = ['weather-temperature','weather-condition','weather-air','weather-particles'].map(id => document.getElementById(id).textContent);
        results.footerInMain = ['weather-times','weather-source'].some(id => document.querySelector('.weather').contains(document.getElementById(id)));
        results.footerInSettings = ['weather-times','weather-source'].every(id => document.getElementById('settings-overlay').contains(document.getElementById(id)));
        results.source = document.getElementById('weather-source').textContent;
        results.unavailableInMain = document.querySelector('.weather').textContent.includes('Dust / smoke');
        results.icons = [];
        for (var item of [{code:0,day:true},{code:0,day:false},{code:1,day:true},{code:2,day:false},{code:3},{code:45},{code:61},{code:71},{code:95},{code:999},{code:0}]) {
          window.weatherCase = item; document.getElementById('settings-save').click(); await new Promise(resolve => setTimeout(resolve, 15));
          var icon = document.getElementById('weather-icon'); results.icons.push(icon ? {src:icon.getAttribute('src'),alt:icon.getAttribute('alt')} : null);
        }
      }
      var output = document.createElement('pre'); output.id = 'dock-result';
      output.textContent = JSON.stringify(results); document.body.appendChild(output);
    }, 400);
  `);
  const run = spawnSync(browser, ['--headless=new', '--disable-gpu', '--no-first-run',
    '--disable-background-networking', '--allow-file-access-from-files', '--window-size=1920,1080',
    '--user-data-dir=' + path.join(root, 'profile'), '--virtual-time-budget=1400',
    '--dump-dom', pathToFileURL(path.join(root, 'index.html')).href],
    { encoding: 'utf8', timeout: 20000, windowsHide: true, maxBuffer: 1024 * 1024 });
  assert.ifError(run.error); assert.equal(run.status, 0, run.stderr);
  const output = run.stdout.match(/<pre id="dock-result">([^<]+)<\/pre>/);
  assert.ok(output, 'The actual launcher must finish its browser checks');
  return JSON.parse(output[1].replaceAll('&amp;', '&').replaceAll('&gt;', '>'));
}

test('transparent icon-only dock keeps named hit areas and arrows, OK, pointer, and Back', t => {
  const result = renderDock(t);
  if (!result) return;
  assert.equal(result.count, 8);
  assert.deepEqual(result.labels, ['Stremio', 'Netflix', 'Prime Video', 'HBO Max', 'YouTube', 'HDMI 2', 'Settings', 'All Apps']);
  assert.ok(result.visibleText.every(text => text === ''), 'Only the images are visible inside each button');
  assert.ok(result.appearance.every(s => s.background === 'rgba(0, 0, 0, 0)' && s.border === '0px'), 'Button hit areas must stay clear');
  assert.equal(result.focusOutline, 'solid', 'Remote focus must remain visible');
  assert.equal(result.focusBackground, 'rgba(0, 0, 0, 0)', 'Focus must not restore an opaque card');
  assert.ok(result.images.every(img => img && img.alt === '' && /^icons\/[a-z0-9-]+\.(svg|png|jpg)$/.test(img.src)));
  assert.deepEqual(result.images.map(img => img.src), ['icons/stremio.svg', 'icons/netflix.png',
    'icons/prime-video.png', 'icons/hbo-max.png', 'icons/youtube.png', 'icons/hdmi.svg', 'icons/settings.svg', 'icons/all-apps.svg']);
  assert.deepEqual(result.focus, [1, 2, 3, 4, 5, 6]);
  assert.equal(result.backPrevented, true); assert.equal(result.rootTvBackPrevented, true); assert.equal(result.rootBackFocus, true);
  assert.equal(result.dialogOpened, true); assert.equal(result.initialFocus, 'settings-tv'); assert.equal(result.defaultLeft1, 'settings-cancel'); assert.equal(result.defaultLeft2, 'settings-save'); assert.equal(result.defaultLaunchCount, 1); assert.equal(result.zipFocus, 'weather-zip');
  assert.equal(result.zipLeftPrevented, false); assert.equal(result.zipRightPrevented, false);
  assert.deepEqual(result.dialogFocus, ['settings-save','settings-cancel','settings-tv','settings-cancel','weather-zip']);
  assert.equal(result.disabledSkip, 'settings-cancel'); assert.equal(result.tabFocus, 'settings-save'); assert.equal(result.shiftTabFocus, 'weather-zip');
  assert.equal(result.zipEnterPrevented, false); assert.equal(result.saveCount, 1); assert.equal(result.disabledSaveCount, 1);
  assert.equal(result.enterPrevented, true); assert.equal(result.cancelClosed, true); assert.equal(result.cancelFocus, true);
  assert.equal(result.tvBackPrevented, true); assert.equal(result.tvBackClosed, true); assert.equal(result.tvBackFocus, true);
  assert.equal(result.launchedId, 'com.palm.app.settings'); assert.equal(result.launchCount, 1);
  assert.match(result.offline, /unavailable/i); assert.match(result.tvSettings, /Opening TV settings/);
  assert.equal(result.closed, true); assert.equal(result.focusRestored, true); assert.equal(result.escapePrevented, true);
  assert.match(result.pointer, /Simulated: open YouTube/);
  assert.equal(result.appsOpen, true); assert.match(result.appsLabel, /simulation/i); assert.equal(result.appsFirst, 'Example app');
  assert.match(result.appsLaunch, /Simulated: open Example app/); assert.equal(result.appsNext, 'apps-close');
  assert.equal(result.appsBackPrevented, true); assert.equal(result.appsClosed, true); assert.equal(result.appsFocus, true);
  assert.match(result.appsError, /Cannot load/); assert.equal(result.appsRetry, 'apps-retry'); assert.match(result.appsEmpty, /No installed apps/);
  assert.ok(result.first.width >= 150 && result.first.width <= 165, 'TV tiles keep their compact width');
  assert.ok(result.first.height >= 106 && result.first.height <= 110, 'TV tiles keep their compact height');
  assert.ok(result.logo.width >= 140 && result.logo.width <= 145 && result.logo.height === 90, 'The image canvas uses the current button size');
  assert.ok(result.dock.width <= 1372, 'Eight tiles must leave most of the art clear');
});

test('an app without a mapped logo keeps a visible generic app symbol and its configured action', t => {
  const result = renderDock(t, true);
  if (!result) return;
  assert.equal(result.labels[0], 'Music');
  assert.equal(result.visibleText[0], '');
  assert.equal(result.appearance[0].background, 'rgba(0, 0, 0, 0)');
  assert.equal(result.genericCells.length, 4, 'An unmapped app must show a visible grid symbol');
  assert.ok(result.genericCells.every(cell => cell.width >= 20 && cell.height >= 20 &&
    cell.border === '2px' && cell.color === 'rgb(255, 255, 255)'), 'Every cell must paint a visible outline');
  assert.match(result.firstLaunch, /Simulated: open Music/);
});

test('icon package gate rejects extra files, missing logos, unsafe references and linked directories', t => {
  const { checkIcons } = require('../scripts/check.cjs');
  assert.equal(typeof checkIcons, 'function', 'The package must validate its local icon directory');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'quiet-icons-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'icons'));
  for (const name of iconNames) fs.writeFileSync(path.join(root, 'icons', name), 'fixture');
  fs.writeFileSync(path.join(root, 'main.js'), "var logo = 'icons/youtube.png';");
  assert.doesNotThrow(() => checkIcons(root));
  fs.writeFileSync(path.join(root, 'icons', '.env'), 'fixture');
  assert.throws(() => checkIcons(root)); fs.unlinkSync(path.join(root, 'icons', '.env'));
  fs.unlinkSync(path.join(root, 'icons', 'youtube.png'));
  assert.throws(() => checkIcons(root)); fs.writeFileSync(path.join(root, 'icons', 'youtube.png'), 'fixture');
  fs.writeFileSync(path.join(root, 'main.js'), "var logo = 'icons/../private.svg';");
  assert.throws(() => checkIcons(root));
  fs.writeFileSync(path.join(root, 'main.js'), "var logo = 'icons/youtube.png';");
  fs.renameSync(path.join(root, 'icons'), path.join(root, 'actual-icons'));
  fs.symlinkSync(path.join(root, 'actual-icons'), path.join(root, 'icons'), 'junction');
  assert.throws(() => checkIcons(root));
});

test('successful weather readings show valid units and separators in the browser', t => {
  const result = renderDock(t, false, true);
  if (!result) return;
  assert.deepEqual(result.weatherDisplay, ['70\u00b0F', 'Clear \u00b7 Humidity 50%', 'US AQI 42 \u00b7 Good', 'PM2.5 4 \u00b7 PM10 8 \u00b5g/m\u00b3']);
});

test('high AQI remains visible in the browser', t => {
  const result = renderDock(t, false, 600);
  if (!result) return;
  assert.equal(result.weatherDisplay[2], 'US AQI 600 \u00b7 Hazardous');
});

test('weather icon follows conditions while details and credit stay in settings', t => {
  const result = renderDock(t, false, true); if (!result) return;
  assert.equal(result.footerInMain, false); assert.equal(result.footerInSettings, true);
  assert.match(result.source, /Open-Meteo.*CAMS/); assert.equal(result.unavailableInMain, false);
  assert.deepEqual(result.icons.map(icon => icon && icon.src), [
    'weather-icons/clear-day.svg','weather-icons/clear-night.svg','weather-icons/partly-cloudy-day.svg',
    'weather-icons/partly-cloudy-night.svg','weather-icons/cloudy.svg','weather-icons/fog.svg',
    'weather-icons/rain.svg','weather-icons/snow.svg','weather-icons/storm.svg','weather-icons/unknown.svg','weather-icons/unknown.svg']);
  assert.ok(result.icons.every(icon => icon.alt === ''));
});

test('weather icon gate rejects missing, extra and linked assets', t => {
  const { checkWeatherIcons } = require('../scripts/check.cjs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'quiet-weather-icons-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const dir = path.join(root, 'weather-icons'); fs.mkdirSync(dir);
  const names = ['clear-day.svg','clear-night.svg','partly-cloudy-day.svg','partly-cloudy-night.svg','cloudy.svg','fog.svg','rain.svg','snow.svg','storm.svg','unknown.svg'];
  for (const name of names) fs.writeFileSync(path.join(dir, name), 'fixture');
  assert.doesNotThrow(() => checkWeatherIcons(root));
  fs.writeFileSync(path.join(dir, 'extra.svg'), 'fixture'); assert.throws(() => checkWeatherIcons(root)); fs.unlinkSync(path.join(dir, 'extra.svg'));
  fs.unlinkSync(path.join(dir, 'fog.svg')); assert.throws(() => checkWeatherIcons(root));
  fs.writeFileSync(path.join(dir, 'fog.svg'), 'fixture');
  fs.renameSync(dir, path.join(root, 'actual')); fs.symlinkSync(path.join(root, 'actual'), dir, 'junction');
  assert.throws(() => checkWeatherIcons(root));
});
test('cached stale weather and air show separate saved-reading labels after independent refresh failures', t => {
  const browser = [process.env.CSP_TEST_BROWSER, 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/chromium'].find(file => file && fs.existsSync(file));
  if (!browser) return t.skip('An installed Chromium browser is required.');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'quiet-stale-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 }));
  const app = path.join(__dirname, '../app');
  for (const file of ['main.js','core.js','platform.js','ambient.js','weather-view.js','styles.css','tiles.json']) fs.copyFileSync(path.join(app, file), path.join(root, file));
  fs.writeFileSync(path.join(root, 'index.html'), fs.readFileSync(path.join(app, 'index.html'), 'utf8')
    .replace('</head>', '<script src="setup.js"></script></head>').replace('</body>', '<script src="stale-probe.js"></script></body>'));
  fs.writeFileSync(path.join(root, 'setup.js'), `var past = Date.now() - 3600000;
    localStorage.setItem('quiet-home.weather.v1',JSON.stringify({version:1,location:{postalCode:'62701',name:'Springfield',region:'IL',countryCode:'US',latitude:39.8,longitude:-89.6,timezone:'America/Chicago'},weather:{temperatureF:70,relativeHumidityPct:50,condition:'Clear',weatherCode:0,isDay:true,validAtMs:past,fetchedAtMs:past},air:{usAqi:42,pm25MicrogramsM3:4,pm10MicrogramsM3:8,validAtMs:past,fetchedAtMs:past}}));`);
  fs.writeFileSync(path.join(root, 'stale-probe.js'), `var initial; function read() {return [document.getElementById('weather-condition').textContent,document.getElementById('weather-air').textContent];}
    setTimeout(function(){initial=read();},100);
    setTimeout(function(){var p=document.createElement('pre');p.id='stale-result';p.textContent=JSON.stringify({initial:initial,final:read()});document.body.appendChild(p);},700);`);
  for (const failed of ['weather', 'air']) {
    fs.writeFileSync(path.join(root, 'weather.js'), `window.LauncherWeather = { describeAqi:function(){return 'Good';},
      fetchWeather:function(){return new Promise(function(resolve,reject){setTimeout(function(){${failed === 'weather' ? "reject(Error('offline'))" : "resolve({temperatureF:71,relativeHumidityPct:51,condition:'Clear',weatherCode:0,isDay:true,validAtMs:Date.now(),fetchedAtMs:Date.now()})"};},300);});},
      fetchAirQuality:function(){return new Promise(function(resolve,reject){setTimeout(function(){${failed === 'air' ? "reject(Error('offline'))" : "resolve({usAqi:43,pm25MicrogramsM3:5,pm10MicrogramsM3:9,validAtMs:Date.now(),fetchedAtMs:Date.now()})"};},300);});}};`);
    const result = spawnSync(browser, ['--headless=new','--disable-gpu','--no-first-run','--disable-background-networking','--allow-file-access-from-files',
      '--user-data-dir=' + path.join(root, 'profile-' + failed), '--virtual-time-budget=1500','--dump-dom',pathToFileURL(path.join(root,'index.html')).href],
      {encoding:'utf8',timeout:20000,windowsHide:true,maxBuffer:1024*1024});
    assert.ifError(result.error); assert.equal(result.status, 0, result.stderr);
    const match = result.stdout.match(/<pre id="stale-result">([^<]+)<\/pre>/); assert.ok(match);
    const display = JSON.parse(match[1].replaceAll('&amp;', '&'));
    assert.ok(display.initial.every(line => /Saved reading/.test(line)), JSON.stringify(display));
    assert.equal(/Saved reading/.test(display.final[0]), failed === 'weather', JSON.stringify(display));
    assert.equal(/Saved reading/.test(display.final[1]), failed === 'air', JSON.stringify(display));
  }
});
test('TV launch success clears status and a later failure stays visible on return', t => {
  const browser = [process.env.CSP_TEST_BROWSER,'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/chromium'].find(file => file && fs.existsSync(file));
  if (!browser) return t.skip('Chromium is required.');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'quiet-tv-launch-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 }));
  const app = path.join(__dirname, '../app');
  for (const name of ['main.js','core.js','platform.js','ambient.js','weather.js','weather-view.js','styles.css','tiles.json']) fs.copyFileSync(path.join(app, name), path.join(root, name));
  fs.writeFileSync(path.join(root, 'index.html'), fs.readFileSync(path.join(app, 'index.html'), 'utf8')
    .replace('</head>', '<script src="bridge-fixture.js"></script></head>').replace('</body>', '<script src="tv-probe.js"></script></body>'));
  fs.writeFileSync(path.join(root, 'bridge-fixture.js'), `window.bridgeCalls=[]; window.PalmServiceBridge=function(){this.call=function(uri,payload){var self=this;window.bridgeCalls.push({uri:uri,payload:JSON.parse(payload)});setTimeout(function(){self.onservicecallback(JSON.stringify(window.bridgeCalls.length===1?{returnValue:true}:{returnValue:false,errorText:'Input unavailable'}));},10);};this.cancel=function(){};};`);
  fs.writeFileSync(path.join(root, 'tv-probe.js'), `setTimeout(async function(){var tiles=Array.from(document.querySelectorAll('.tile')), hdmi=tiles.find(x=>x.getAttribute('aria-label')==='HDMI 2'),status=document.getElementById('status'),error=document.getElementById('error');
    hdmi.click();await new Promise(r=>setTimeout(r,80));var success=status.textContent;window.dispatchEvent(new Event('pageshow'));var afterReturn=status.textContent;
    hdmi.click();await new Promise(r=>setTimeout(r,80));var failure={text:error.textContent,hidden:error.hidden,status:status.textContent};window.dispatchEvent(new Event('focus'));var afterError=error.textContent;
    var out=document.createElement('pre');out.id='tv-result';out.textContent=JSON.stringify({success:success,afterReturn:afterReturn,failure:failure,afterError:afterError,calls:window.bridgeCalls});document.body.appendChild(out);},400);`);
  const run=spawnSync(browser,['--headless=new','--disable-gpu','--no-first-run','--disable-background-networking','--allow-file-access-from-files',
    '--user-data-dir='+path.join(root,'profile'),'--virtual-time-budget=1600','--dump-dom',pathToFileURL(path.join(root,'index.html')).href],
    {encoding:'utf8',timeout:20000,windowsHide:true,maxBuffer:1024*1024});
  assert.ifError(run.error); assert.equal(run.status,0,run.stderr); const match=run.stdout.match(/<pre id="tv-result">([^<]+)<\/pre>/); assert.ok(match);
  const result=JSON.parse(match[1].replaceAll('&amp;','&')); assert.equal(result.calls.length,2);
  assert.ok(result.calls.every(call => call.uri==='luna://com.webos.applicationManager/launch' && call.payload.id==='com.webos.app.hdmi2'));
  assert.equal(result.success,''); assert.equal(result.afterReturn,''); assert.equal(result.failure.hidden,false);
  assert.match(result.failure.text,/Input unavailable/); assert.equal(result.failure.status,''); assert.equal(result.afterError,result.failure.text);
});
