const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const request = (port, target, method = 'GET') => new Promise((resolve, reject) => {
  http.request({ host: '127.0.0.1', port, path: target, method }, response => {
    const chunks = [];
    response.on('data', chunk => chunks.push(chunk));
    response.on('end', () => resolve({ status: response.statusCode,
      headers: response.headers, body: Buffer.concat(chunks).toString() }));
  }).on('error', reject).end();
});

test('preview serves only local app files and rejects unsafe requests', async t => {
  // A server that serves from the repository root would expose private.txt.
  const { createPreviewServer } = require('../scripts/preview.cjs');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'quiet-preview-'));
  const app = path.join(root, 'app');
  await fs.mkdir(app);
  await fs.writeFile(path.join(app, 'index.html'), '<h1>Home</h1>');
  await fs.writeFile(path.join(app, 'main.js'), 'window.ready = true;');
  await fs.writeFile(path.join(app, 'styles.css'), 'body { color: ivory; }');
  await fs.writeFile(path.join(app, 'tiles.json'), '{"title":"Home"}');
  await fs.writeFile(path.join(app, 'icon.png'), 'png fixture');
  await fs.writeFile(path.join(app, 'scene.jpg'), 'jpeg fixture');
  await fs.writeFile(path.join(app, 'scene.jpeg'), 'jpeg fixture');
  await fs.writeFile(path.join(root, 'private.txt'), 'must stay private');
  const server = createPreviewServer({ root: app });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await fs.rm(root, { recursive: true, force: true });
  });
  const port = server.address().port;
  const home = await request(port, '/');
  assert.equal(home.status, 200);
  assert.equal(home.body, '<h1>Home</h1>');
  assert.match(home.headers['content-type'], /^text\/html/);
  for (const [file, type] of [['main.js', 'text/javascript'], ['styles.css', 'text/css'],
    ['tiles.json', 'application/json'], ['icon.png', 'image/png'],
    ['scene.jpg', 'image/jpeg'], ['scene.jpeg', 'image/jpeg']]) {
    const result = await request(port, '/' + file);
    assert.equal(result.status, 200);
    assert.ok(result.headers['content-type'].startsWith(type));
  }
  assert.equal((await request(port, '/main.js?cache=1')).status, 200);
  assert.equal((await request(port, '/', 'HEAD')).body, '');
  assert.equal((await request(port, '/', 'POST')).status, 405);
  for (const target of ['/private.txt', '/../private.txt', '/%2e%2e/private.txt',
    '/%2e%2e%5cprivate.txt', '/%2f../private.txt', '/%ZZ', '/%00',
    '//private.txt', '/missing.js', '/.git/config', '/']) {
    if (target === '/') continue;
    const result = await request(port, target);
    assert.ok(result.status >= 400, target);
    assert.ok(!result.body.includes('must stay private'), target);
  }
});

test('preview rejects a symbolic link that escapes app/', async t => {
  // Lexical containment alone does not stop a symlink escape.
  const { createPreviewServer } = require('../scripts/preview.cjs');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'quiet-link-'));
  const app = path.join(root, 'app');
  await fs.mkdir(app);
  await fs.mkdir(path.join(root, 'private'));
  await fs.writeFile(path.join(root, 'private', 'secret.json'), '{"private":true}');
  await fs.symlink(path.join(root, 'private'), path.join(app, 'linked'), 'junction');
  const server = createPreviewServer({ root: app });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await fs.rm(root, { recursive: true, force: true });
  });
  assert.equal((await request(server.address().port, '/linked/secret.json')).status, 403);
});
