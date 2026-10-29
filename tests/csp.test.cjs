const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawnSync } = require('node:child_process');

// Exercise browser enforcement with the shipped policy, rather than asserting
// that a policy string contains particular words. No TV or network is needed.
test('file policy loads local code/styles and blocks remote, inline, eval, frames and objects', t => {
  const browser = [process.env.CSP_TEST_BROWSER,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome']
    .find(file => file && fs.existsSync(file));
  if (!browser) return t.skip('Set CSP_TEST_BROWSER to an installed Chromium browser for the file-origin regression test.');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'quiet-csp-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 }));
  const html = fs.readFileSync(path.join(__dirname, '../app/index.html'), 'utf8');
  const meta = html.match(/<meta\s+http-equiv="Content-Security-Policy"\s+content="[^"]+"\s*>/i);
  assert.ok(meta, 'The shipped HTML must enforce a content security policy');
  fs.writeFileSync(path.join(root, 'probe.css'), 'body { --csp-probe: loaded; }');
  fs.writeFileSync(path.join(root, 'probe.js'), `
    var blocked = {};
    document.addEventListener('securitypolicyviolation', function (event) {
      if (event.blockedURI === 'inline') blocked.inline = true;
      if (event.blockedURI === 'eval') blocked.eval = true;
      if (event.blockedURI.indexOf('http://127.0.0.1:9/') === 0) blocked.remote = true;
      if (event.effectiveDirective === 'frame-src') blocked.frame = true;
      if (event.effectiveDirective === 'object-src') blocked.object = true;
    });
    try { new Function('window.evalRan = true')(); } catch (ignored) {}
    document.addEventListener('DOMContentLoaded', function () {
      var remote = document.createElement('script'); remote.src = 'http://127.0.0.1:9/probe.js'; document.head.appendChild(remote);
      var frame = document.createElement('iframe'); frame.src = 'child.html'; document.body.appendChild(frame);
      var object = document.createElement('object'); object.data = 'child.html'; document.body.appendChild(object);
      setTimeout(function () {
        document.body.setAttribute('data-local-script', 'loaded');
        document.body.setAttribute('data-local-style', getComputedStyle(document.body).getPropertyValue('--csp-probe').trim());
        ['inline', 'eval', 'remote', 'frame', 'object'].forEach(function (kind) {
          document.body.setAttribute('data-blocked-' + kind, String(Boolean(blocked[kind])));
        });
        document.body.setAttribute('data-unsafe-executed', String(Boolean(window.inlineRan || window.evalRan)));
      }, 300);
    });
  `);
  fs.writeFileSync(path.join(root, 'child.html'), '<!doctype html><title>Blocked child</title>');
  fs.writeFileSync(path.join(root, 'index.html'), '<!doctype html><html><head>' + meta[0] +
    '<link rel="stylesheet" href="probe.css"><script src="probe.js"></script>' +
    '<script>window.inlineRan = true</script></head><body>Probe</body></html>');
  const result = spawnSync(browser, ['--headless=new', '--disable-gpu', '--no-first-run',
    '--no-default-browser-check', '--disable-background-networking',
    '--user-data-dir=' + path.join(root, 'profile'), '--virtual-time-budget=1200',
    '--dump-dom', pathToFileURL(path.join(root, 'index.html')).href],
    { encoding: 'utf8', timeout: 20000, windowsHide: true, maxBuffer: 1024 * 1024 });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /data-local-script="loaded"/, 'The real file-origin page must execute its local script');
  assert.match(result.stdout, /data-local-style="loaded"/, 'The real file-origin page must load its local stylesheet');
  for (const kind of ['inline', 'eval', 'remote', 'frame', 'object']) {
    assert.ok(result.stdout.includes('data-blocked-' + kind + '="true"'), kind + ' must be refused by browser CSP enforcement');
  }
  assert.match(result.stdout, /data-unsafe-executed="false"/);
});

test('package policy gate rejects the confirmed TV failure and unsafe resource permissions', () => {
  const { checkPolicy } = require('../scripts/check.cjs');
  assert.equal(typeof checkPolicy, 'function', 'The package gate must validate file-origin policy');
  const html = fs.readFileSync(path.join(__dirname, '../app/index.html'), 'utf8');
  assert.doesNotThrow(() => checkPolicy(html));
  for (const change of [html.replaceAll(' file:', ''),
    html.replace('https://api.open-meteo.com', 'https://example.com'),
    html.replace('https://api.open-meteo.com', 'https:'),
    html.replace("font-src 'self' file:", "font-src 'self' file: https:"),
    html.replace("font-src 'self' file:", "font-src *"),
    html.replace('script-src', "script-src https: 'unsafe-inline' 'unsafe-eval'"),
    html.replace("frame-src 'none'", 'frame-src file:'),
    html.replace('file:', 'file:///media/developer/apps/')]) {
    assert.throws(() => checkPolicy(change));
  }
});
