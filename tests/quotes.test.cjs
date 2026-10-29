const test = require('node:test');
const assert = require('node:assert/strict');
let Quotes;
try { Quotes = require('../app/quotes.js'); } catch (error) { if (error.code !== 'MODULE_NOT_FOUND') throw error; Quotes = {}; }
const categories = ['Motivation','Inspiration','Leadership','Strength','Love','Healing','Meditation','Integrity','Loyalty','Gratitude'];
const bank = () => Array.from({ length: 300 }, (_, i) => ({ id: 'quote-' + i, category: categories[i % 10], text: 'A thoughtful original message number ' + i }));
test('quotes controller and bank validator are available', () => {
  assert.equal(typeof Quotes.createController, 'function');
  assert.equal(typeof Quotes.validateBank, 'function');
});

function harness(saved) {
  let time = 1000000, value = saved || null, next = 0, draws = 0;
  const jobs = new Map(), shown = [];
  const options = { now: () => time, random: () => { draws++; return 0.37; },
    storage: { getItem: () => value, setItem: (_, nextValue) => { value = nextValue; } },
    setTimeout: (fn, delay) => { jobs.set(++next, { fn, delay }); return next; }, clearTimeout: id => jobs.delete(id),
    show: item => shown.push(item.id) };
  const controller = Quotes.createController(options);
  return { controller, options, shown, jobs, get saved() { return value; }, get draws() { return draws; }, jump(ms) { time += ms; }, fire() { const job = [...jobs.values()][0]; jobs.clear(); job.fn(); } };
}
test('bank rejects duplicate IDs, text, markup, invalid categories and incomplete data', () => {
  assert.equal(Quotes.validateBank(bank()).length, 300);
  for (const change of [{ id: 'quote-1' }, { text: bank()[1].text }, { text: '<script>' }, { text: 'x'.repeat(151) }, { category: 'Unknown' }]) {
    const items = bank(); Object.assign(items[0], change); assert.throws(() => Quotes.validateBank(items));
  }
  assert.throws(() => Quotes.validateBank(bank().slice(1)));
});
test('five-minute shuffle visits every quote before a repeat and avoids boundary repeats', () => {
  const h = harness(); h.controller.setBank(bank()); h.controller.setVisible(true);
  assert.equal([...h.jobs.values()][0].delay, 300000);
  for (let i = 0; i < 299; i++) { h.jump(300000); h.fire(); }
  assert.equal(new Set(h.shown).size, 300);
  const last = h.shown.at(-1); h.jump(300000); h.fire(); assert.notEqual(h.shown.at(-1), last);
});
test('relaunch preserves quote and remaining time; hidden time skips slots without polling', () => {
  const h = harness(); h.controller.setBank(bank()); h.controller.setVisible(true); const original = h.shown.at(-1);
  h.jump(123000); h.controller.setVisible(false); assert.equal(h.jobs.size, 0);
  const resumed = Quotes.createController(h.options); resumed.setBank(bank()); resumed.setVisible(true);
  assert.equal(h.shown.at(-1), original); assert.equal([...h.jobs.values()][0].delay, 177000);
  resumed.setVisible(false); h.jump(900000); assert.equal(h.jobs.size, 0); resumed.setVisible(true);
  assert.notEqual(h.shown.at(-1), original); assert.equal([...h.jobs.values()][0].delay, 177000);
});
test('corrupt storage and very long absence are safe and bounded', () => {
  const h = harness('{bad'); h.controller.setBank(bank()); h.controller.setVisible(true); h.controller.setVisible(false);
  const before = h.draws; h.jump(300000 * 10000000); h.controller.setVisible(true);
  assert.ok(h.draws - before <= 900); assert.equal(h.jobs.size, 1); assert.equal(h.shown.length, 2);
  h.controller.setVisible(false);
  const blocked = harness(); blocked.options.storage = { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } };
  const controller = Quotes.createController(blocked.options); controller.setBank(bank()); controller.setVisible(true); assert.equal(blocked.jobs.size, 1); controller.setVisible(false);
});
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { pathToFileURL } = require('node:url'), { spawnSync } = require('node:child_process');
test('browser shows a centered quote without covering weather or the dock', t => {
  const browser = [process.env.CSP_TEST_BROWSER, 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/chromium'].find(p => p && fs.existsSync(p));
  if (!browser) return t.skip('Chromium is required for layout checks.');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'quiet-quotes-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 }));
  const app = path.join(__dirname, '../app');
  for (const name of ['main.js','core.js','platform.js','ambient.js','weather.js','weather-view.js','quotes.js','styles.css','tiles.json']) fs.copyFileSync(path.join(app, name), path.join(root, name));
  fs.cpSync(path.join(app, 'fonts'), path.join(root, 'fonts'), { recursive: true });
  fs.writeFileSync(path.join(root, 'quotes.json'), JSON.stringify(bank().map((item, i) => ({ ...item, text: 'A longer thoughtful message stays readable in the center of the screen ' + i }))));
  fs.writeFileSync(path.join(root, 'setup.js'), `localStorage.setItem('quiet-home.weather.v1', JSON.stringify({version:1, location:{postalCode:'62701',name:'Springfield',region:'IL',countryCode:'US',latitude:39.8,longitude:-89.6,timezone:'America/Chicago'},weather:{temperatureF:70,relativeHumidityPct:50,condition:'Clear',validAtMs:Date.now(),fetchedAtMs:Date.now()},air:{usAqi:42,pm25MicrogramsM3:4,pm10MicrogramsM3:8,validAtMs:Date.now(),fetchedAtMs:Date.now()}}));`);
  fs.writeFileSync(path.join(root, 'index.html'), fs.readFileSync(path.join(app, 'index.html'), 'utf8').replace('</head>', '<script src="setup.js"></script></head>').replace('</body>', '<script src="probe.js"></script></body>'));
  fs.writeFileSync(path.join(root, 'probe.js'), `setTimeout(async function () {
    var q = document.getElementById('quote-text'), header = document.querySelector('header'), dock = document.querySelector('.dock');
    var rect = function (x) { var r = x.getBoundingClientRect(); return {top:r.top,bottom:r.bottom,left:r.left,right:r.right}; };
    var faces = await document.fonts.load('500 44px "Cormorant Garamond"');
    var canvas = document.createElement('canvas'), ctx = canvas.getContext('2d');
    ctx.font = '500 44px "Cormorant Garamond"'; var fontWidth = ctx.measureText('Small steps can carry a clear and steady purpose.').width;
    ctx.font = '500 44px monospace'; var fallbackWidth = ctx.measureText('Small steps can carry a clear and steady purpose.').width;
    var result = {fontLoaded:faces.length > 0 && faces.every(face => face.status === 'loaded'), fontWidth:fontWidth, fallbackWidth:fallbackWidth, weight:getComputedStyle(q).fontWeight, quote:rect(q),header:rect(header),dock:rect(dock),text:q.textContent,hidden:q.hidden,font:getComputedStyle(q).fontFamily,size:parseFloat(getComputedStyle(q).fontSize),lineHeight:parseFloat(getComputedStyle(q).lineHeight),width:innerWidth,height:innerHeight};
    var out = document.createElement('pre'); out.id='quote-result'; out.textContent=JSON.stringify(result); document.body.appendChild(out);
  }, 400);`);
  for (const [width, height] of [[1920,1080],[1366,768],[960,540]]) {
    const run = spawnSync(browser, ['--headless=new','--disable-gpu','--no-first-run','--disable-background-networking','--allow-file-access-from-files',
      '--window-size=' + width + ',' + height, '--user-data-dir=' + path.join(root, 'profile-' + width), '--virtual-time-budget=1600',
      '--dump-dom',pathToFileURL(path.join(root,'index.html')).href], { encoding:'utf8',timeout:20000,windowsHide:true,maxBuffer:1024*1024 });
    assert.ifError(run.error); assert.equal(run.status, 0, run.stderr);
    const match = run.stdout.match(/<pre id="quote-result">([^<]+)<\/pre>/); assert.ok(match, 'Browser quote probe must complete');
    const result = JSON.parse(match[1].replaceAll('&amp;', '&'));
    assert.equal(result.hidden, false); assert.match(result.text, /^A longer thoughtful message/); assert.match(result.font, /Cormorant Garamond/); assert.equal(result.fontLoaded, true); assert.equal(result.weight, '500'); assert.ok(Math.abs(result.fontWidth - result.fallbackWidth) > 1); assert.ok(result.size >= 28 && result.size <= 44);
    if (width === 1920) assert.ok(result.quote.bottom - result.quote.top <= result.lineHeight * 1.1, JSON.stringify(result));
    assert.ok(result.quote.left >= 0 && result.quote.right <= result.width, JSON.stringify(result));
    assert.ok(result.quote.top >= result.header.bottom && result.quote.bottom <= result.dock.top, JSON.stringify(result));
    assert.ok(result.quote.bottom <= result.height, JSON.stringify(result));
    assert.ok(Math.abs((result.quote.left + result.quote.right) / 2 - result.width / 2) < 10, JSON.stringify(result));
  }
});
test('quote presenter dissolves changes, cancels hidden work, and respects reduced motion', t => {
  const browser = [process.env.CSP_TEST_BROWSER,'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/chromium'].find(file => file && fs.existsSync(file));
  if (!browser) return t.skip('Chromium is required.');
  const root = fs.mkdtempSync(path.join(os.tmpdir(),'quiet-fade-'));
  t.after(() => fs.rmSync(root,{recursive:true,force:true,maxRetries:8,retryDelay:250}));
  const app = path.join(__dirname,'../app');
  for (const name of ['main.js','core.js','platform.js','ambient.js','weather.js','weather-view.js','styles.css','tiles.json']) fs.copyFileSync(path.join(app,name),path.join(root,name));
  fs.writeFileSync(path.join(root,'quotes.json'),'[]');
  fs.mkdirSync(path.join(root,'wallpapers'));
  fs.writeFileSync(path.join(root,'wallpapers','02-fjord.jpg'),Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/aZkAAAAASUVORK5CYII=','base64'));
  fs.writeFileSync(path.join(root,'wallpapers.json'),JSON.stringify([{id:'02-fjord',title:'Fjord',location:'Norway',src:'wallpapers/02-fjord.jpg'}]));
  fs.writeFileSync(path.join(root,'quotes.js'), `window.LauncherQuotes={createController:function(o){var current={id:'a',text:'Alpha'};window.emitQuote=function(id,text){current={id:id,text:text};o.show(current);};return {setBank:function(){},setVisible:function(v){if(v)o.show(current);}};}};`);
  fs.writeFileSync(path.join(root,'index.html'),fs.readFileSync(path.join(app,'index.html'),'utf8').replace('</body>','<script src="fade-probe.js"></script></body>'));
  fs.writeFileSync(path.join(root,'fade-probe.js'), `var result={}, q=document.getElementById('quote-text');
    setTimeout(function(){window.emitQuote('a','Alpha');result.sameFades=q.classList.contains('quote-fading'); var land=document.getElementById('landscape'),wall=land.querySelector('.wallpaper'),frame=wall && wall.parentNode; result.motion={quote:getComputedStyle(q).animationName,wall:wall && getComputedStyle(wall).animationName,wallTransition:frame && getComputedStyle(frame).transitionDuration,mist:frame && getComputedStyle(frame,'::after').animationName,scene:frame && frame.getAttribute('data-atmosphere')};
      var qa=q.getAnimations().find(a=>a.animationName==='quote-float'), wa=wall && wall.getAnimations().find(a=>a.animationName==='wallpaper-drift');
      if (qa && wa) {
        qa.pause(); wa.pause(); qa.currentTime=0; wa.currentTime=0;
        var q0=q.getBoundingClientRect(), w0=wall.getBoundingClientRect(), bounds=land.getBoundingClientRect();
        qa.currentTime=5000; wa.currentTime=44999;
        var q1=q.getBoundingClientRect(), w1=wall.getBoundingClientRect();
        result.geometry={delta:q1.top-q0.top, shift:Math.abs((w1.left+w1.right-w0.left-w0.right)/2),
          covers:[w0.left<=bounds.left && w0.right>=bounds.right && w0.top<=bounds.top && w0.bottom>=bounds.bottom,w1.left<=bounds.left && w1.right>=bounds.right && w1.top<=bounds.top && w1.bottom>=bounds.bottom]};
        qa.play(); wa.play();
      }
      window.emitQuote('b','Beta');},100);
    setTimeout(function(){result.first={text:q.textContent,fading:q.classList.contains('quote-fading'),duration:getComputedStyle(q).transitionDuration};window.emitQuote('c','Charlie');},200);
    setTimeout(function(){result.after={text:q.textContent,fading:q.classList.contains('quote-fading')};window.emitQuote('d','Delta');window.dispatchEvent(new Event('pagehide'));},650);
    setTimeout(function(){var land=document.getElementById('landscape'),wall=land.querySelector('.wallpaper'),frame=wall && wall.parentNode; result.hidden={text:q.textContent,fading:q.classList.contains('quote-fading'),quoteState:getComputedStyle(q).animationPlayState,wallState:wall && getComputedStyle(wall).animationPlayState,mistState:frame && getComputedStyle(frame,'::after').animationPlayState};window.dispatchEvent(new Event('pageshow'));},1100);
    setTimeout(function(){result.resumed={text:q.textContent,fading:q.classList.contains('quote-fading'),opacity:getComputedStyle(q).opacity,state:getComputedStyle(q).animationPlayState}; var p=document.createElement('pre');p.id='fade-result';p.textContent=JSON.stringify(result);document.body.appendChild(p);},1700);`);
  for (const reduced of [false,true]) {
    const args=['--headless=new','--disable-gpu','--no-first-run','--disable-background-networking','--allow-file-access-from-files',
      '--user-data-dir='+path.join(root,'profile-'+reduced),'--virtual-time-budget=2400','--dump-dom',pathToFileURL(path.join(root,'index.html')).href];
    if (reduced) args.unshift('--force-prefers-reduced-motion');
    const run=spawnSync(browser,args,{encoding:'utf8',timeout:20000,windowsHide:true,maxBuffer:1024*1024});
    assert.ifError(run.error); assert.equal(run.status,0,run.stderr);
    const match=run.stdout.match(/<pre id="fade-result">([^<]+)<\/pre>/); assert.ok(match);
    const result=JSON.parse(match[1]); assert.equal(result.sameFades,false);
    assert.deepEqual(result.first,reduced?{text:'Beta',fading:false,duration:'0s'}:{text:'Alpha',fading:true,duration:'0.35s'});
    assert.deepEqual(result.after,{text:'Charlie',fading:false});
    assert.deepEqual(result.motion,reduced?{quote:'none',wall:'none',wallTransition:'0s',mist:'none',scene:'mist'}:{quote:'quote-float',wall:'wallpaper-drift',wallTransition:'2s',mist:'atmosphere-drift',scene:'mist'});
    if (!reduced) { assert.ok(result.geometry.delta >= 12 && result.geometry.delta <= 18, JSON.stringify(result.geometry)); assert.ok(result.geometry.shift >= 10, JSON.stringify(result.geometry)); assert.deepEqual(result.geometry.covers, [true,true]); }
    assert.equal(result.hidden.fading,false); if (!reduced) assert.equal(result.hidden.quoteState,'paused'); if (!reduced) assert.equal(result.hidden.wallState,'paused'); if (!reduced) assert.equal(result.hidden.mistState,'paused'); assert.deepEqual(result.resumed,{text:'Delta',fading:false,opacity:'1',state:'running'});
  }
});

test('browser uses scene-appropriate atmosphere including the northern lights', t => {
  const browser = [process.env.CSP_TEST_BROWSER,'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/chromium'].find(file => file && fs.existsSync(file));
  if (!browser) return t.skip('Chromium is required.');
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'quiet-atmosphere-'));
  t.after(() => fs.rmSync(root,{recursive:true,force:true,maxRetries:8,retryDelay:250}));
  const app=path.join(__dirname,'../app');
  for (const name of ['main.js','core.js','platform.js','weather.js','weather-view.js','styles.css','tiles.json']) fs.copyFileSync(path.join(app,name),path.join(root,name));
  fs.writeFileSync(path.join(root,'ambient.js'),`window.LauncherAmbient={createController:function(o){window.testScene=function(id){var img=document.createElement('img');o.show(img,{id:id,title:'Scene',location:'Place'});};return {setVisible:function(){},start:function(){},setScenes:function(){}};}};`);
  fs.writeFileSync(path.join(root,'index.html'),fs.readFileSync(path.join(app,'index.html'),'utf8').replace('</body>','<script src="scene-probe.js"></script></body>'));
  fs.writeFileSync(path.join(root,'scene-probe.js'),`setTimeout(function(){var ids=['07-namib','11-sonoran','18-atlas','19-bled','20-bhutan','21-tuscany','22-lapland','23-great-ocean-road','24-kauai'];var result=ids.map(function(id){window.testScene(id);return document.getElementById('landscape').lastElementChild.getAttribute('data-atmosphere');});var p=document.createElement('pre');p.id='scene-result';p.textContent=JSON.stringify(result);document.body.appendChild(p);},400);`);
  const run=spawnSync(browser,['--headless=new','--disable-gpu','--no-first-run','--allow-file-access-from-files','--user-data-dir='+path.join(root,'profile'),'--virtual-time-budget=1200','--dump-dom',pathToFileURL(path.join(root,'index.html')).href],{encoding:'utf8',timeout:20000,windowsHide:true,maxBuffer:1024*1024});
  assert.ifError(run.error); assert.equal(run.status,0,run.stderr); const match=run.stdout.match(/<pre id="scene-result">([^<]+)<\/pre>/); assert.ok(match);
  assert.deepEqual(JSON.parse(match[1]),['light','light','light','mist','light','light','aurora','light','mist']);
});
