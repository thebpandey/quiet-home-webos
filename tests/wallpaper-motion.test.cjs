const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { pathToFileURL } = require('node:url'), { spawnSync } = require('node:child_process');
test('wallpaper effects move visibly, layer above art, pause and respect reduced motion', t => {
  const browser = [process.env.CSP_TEST_BROWSER,'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/chromium'].find(file => file && fs.existsSync(file));
  if (!browser) return t.skip('Chromium is required.');
  const root = fs.mkdtempSync(path.join(os.tmpdir(),'quiet-effects-')); t.after(() => fs.rmSync(root,{recursive:true,force:true,maxRetries:8,retryDelay:250}));
  const app = path.join(__dirname,'../app');
  for (const name of ['main.js','core.js','platform.js','weather.js','weather-view.js','styles.css','tiles.json']) fs.copyFileSync(path.join(app,name),path.join(root,name));
  fs.writeFileSync(path.join(root,'ambient.js'),`window.LauncherAmbient={createController:function(o){window.testScene=function(id){var img=document.createElement('img');o.show(img,{id:id,title:'Scene',location:'Place'});};return {setVisible:function(){},start:function(){},setScenes:function(){}};}};`);
  fs.writeFileSync(path.join(root,'index.html'),fs.readFileSync(path.join(app,'index.html'),'utf8').replace('</body>','<script src="effects-probe.js"></script></body>'));
  fs.writeFileSync(path.join(root,'effects-probe.js'),`setTimeout(async function(){var land=document.getElementById('landscape'),out=[];
    for (var id of ['08-milford','07-namib','22-lapland']) {
      window.testScene(id); await new Promise(r=>setTimeout(r,60));
      var frame=land.lastElementChild, styles=['::before','::after'].map(p=>getComputedStyle(frame,p));
      var animations=frame.getAnimations({subtree:true}).filter(a=>a.effect && a.effect.pseudoElement);
      var tracks=animations.map(function(a){a.pause();a.currentTime=0;var x0=new DOMMatrixReadOnly(getComputedStyle(frame,a.effect.pseudoElement).transform).m41;a.currentTime=4000;var x1=new DOMMatrixReadOnly(getComputedStyle(frame,a.effect.pseudoElement).transform).m41;a.play();return Math.abs(x1-x0);});
      out.push({scene:frame.dataset.atmosphere,opacity:styles.map(s=>parseFloat(s.opacity)),background:styles.map(s=>s.backgroundImage),layers:styles.map(s=>s.zIndex),imageLayer:getComputedStyle(frame.querySelector('.wallpaper')).zIndex,isolation:getComputedStyle(frame).isolation,tracks:tracks});
    }
    window.dispatchEvent(new Event('pagehide')); var paused=['::before','::after'].map(p=>getComputedStyle(land.lastElementChild,p).animationPlayState);
    var p=document.createElement('pre');p.id='effects-result';p.textContent=JSON.stringify({out:out,paused:paused});document.body.appendChild(p);},400);`);
  for (const reduced of [false,true]) {
    const args=['--headless=new','--disable-gpu','--no-first-run','--allow-file-access-from-files','--user-data-dir='+path.join(root,'profile-'+reduced),'--virtual-time-budget=1700','--dump-dom',pathToFileURL(path.join(root,'index.html')).href];
    if (reduced) args.unshift('--force-prefers-reduced-motion');
    const run=spawnSync(browser,args,{encoding:'utf8',timeout:20000,windowsHide:true,maxBuffer:1024*1024}); assert.ifError(run.error); assert.equal(run.status,0,run.stderr);
    const match=run.stdout.match(/<pre id="effects-result">([^<]+)<\/pre>/); assert.ok(match);
    const result=JSON.parse(match[1]); assert.deepEqual(result.out.map(v=>v.scene),['mist','light','aurora']);
    for (const item of result.out) {
      assert.equal(item.isolation,'isolate'); assert.deepEqual(item.layers,['1','2']); assert.equal(item.imageLayer,'0');
      if (reduced) { assert.deepEqual(item.opacity,[0,0]); assert.equal(item.tracks.length,0); }
      else { assert.ok(item.opacity.every(value=>value>=.14), JSON.stringify(item)); assert.ok(item.background.every(v=>v.includes('gradient')), JSON.stringify(item)); assert.equal(item.tracks.length,2); assert.ok(item.tracks.every(v=>v>=8), JSON.stringify(item)); }
    }
    if (!reduced) assert.deepEqual(result.paused,['paused','paused']);
  }
});
test('cross-mode wallpaper handoff keeps each effect with its own bounded image frame', t => {
  const browser=[process.env.CSP_TEST_BROWSER,'C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/chromium'].find(file=>file&&fs.existsSync(file));
  if(!browser)return t.skip('Chromium is required.');
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'quiet-handoff-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true,maxRetries:8,retryDelay:250}));
  const app=path.join(__dirname,'../app');for(const name of ['main.js','core.js','platform.js','weather.js','weather-view.js','styles.css','tiles.json'])fs.copyFileSync(path.join(app,name),path.join(root,name));
  fs.writeFileSync(path.join(root,'ambient.js'),`window.LauncherAmbient={createController:function(o){window.showScene=function(id){var img=document.createElement('img');img.className='wallpaper';o.show(img,{id:id,title:'Scene',location:'Place'});return img;};window.releaseScene=function(img){o.release(img);};return {setVisible:function(){},start:function(){},setScenes:function(){}};}};`);
  fs.writeFileSync(path.join(root,'index.html'),fs.readFileSync(path.join(app,'index.html'),'utf8').replace('</body>','<script src="handoff-probe.js"></script></body>'));
  fs.writeFileSync(path.join(root,'handoff-probe.js'),`setTimeout(function(){var land=document.getElementById('landscape');var first=window.showScene('07-namib');getComputedStyle(first.parentNode).opacity;var firstFade=first.parentNode.getAnimations().find(a=>a.transitionProperty==='opacity');if(firstFade)firstFade.finish();
    var second=window.showScene('22-lapland');getComputedStyle(second.parentNode).opacity;var incoming=second.parentNode.getAnimations().find(a=>a.transitionProperty==='opacity');if(incoming){incoming.pause();incoming.currentTime=1000;}
    function snap(){return Array.from(land.querySelectorAll('.wallpaper-frame')).map(function(f){return {mode:f.dataset.atmosphere,hasImage:!!f.querySelector('.wallpaper'),before:getComputedStyle(f,'::before').backgroundImage,transition:getComputedStyle(f).transitionDuration,opacity:parseFloat(getComputedStyle(f).opacity)};});}
    var during=snap();window.releaseScene(first);var after=snap();var third=window.showScene('08-milford');window.releaseScene(second);var interrupted=snap();window.releaseScene(third);var end=snap();
    var p=document.createElement('pre');p.id='handoff-result';p.textContent=JSON.stringify({during:during,after:after,interrupted:interrupted,end:end});document.body.appendChild(p);},400);`);
  const run=spawnSync(browser,['--headless=new','--disable-gpu','--no-first-run','--allow-file-access-from-files','--user-data-dir='+path.join(root,'profile'),'--virtual-time-budget=1200','--dump-dom',pathToFileURL(path.join(root,'index.html')).href],{encoding:'utf8',timeout:20000,windowsHide:true,maxBuffer:1024*1024});
  assert.ifError(run.error);assert.equal(run.status,0,run.stderr);const match=run.stdout.match(/<pre id="handoff-result">([^<]+)<\/pre>/);assert.ok(match);const r=JSON.parse(match[1]);
  assert.deepEqual(r.during.map(v=>v.mode),['light','aurora']);assert.ok(r.during.every(v=>v.hasImage&&v.before.includes('gradient')&&v.transition==='2s'));
  assert.notEqual(r.during[0].before,r.during[1].before); assert.equal(r.during[0].opacity,1); assert.ok(r.during[1].opacity>0 && r.during[1].opacity<1, JSON.stringify(r.during));assert.deepEqual(r.after.map(v=>v.mode),['aurora']);assert.deepEqual(r.interrupted.map(v=>v.mode),['mist']);assert.deepEqual(r.end,[]);
});
