const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };
const inside = (root, file) => {
  const relative = path.relative(root, file);
  return relative !== '' && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
};

function createPreviewServer({ root = path.join(__dirname, '..', 'app') } = {}) {
  const base = path.resolve(root);
  return http.createServer(async (request, response) => {
    const reply = (status, body) => {
      response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(request.method === 'HEAD' ? undefined : body);
    };
    if (request.method !== 'GET' && request.method !== 'HEAD') return reply(405, 'Use GET or HEAD.');
    let pathname;
    try { pathname = decodeURIComponent(request.url.split('?')[0]); }
    catch { return reply(400, 'Invalid path.'); }
    if (!pathname.startsWith('/') || pathname.startsWith('//') || /[\\\x00-\x1f]/.test(pathname)) {
      return reply(400, 'Invalid path.');
    }
    const segments = pathname.split('/');
    if (segments.some(segment => segment === '..' || segment === '.' || segment.startsWith('.'))) {
      return reply(403, 'Path denied.');
    }
    const file = path.resolve(base, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!inside(base, file)) return reply(403, 'Path denied.');
    try {
      const [realBase, realFile] = await Promise.all([fs.realpath(base), fs.realpath(file)]);
      if (!inside(realBase, realFile)) return reply(403, 'Path denied.');
      const type = types[path.extname(realFile).toLowerCase()];
      if (!type || !(await fs.stat(realFile)).isFile()) return reply(404, 'File not found.');
      const body = await fs.readFile(realFile);
      response.writeHead(200, { 'Content-Type': type, 'Content-Length': body.length,
        'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      response.end(request.method === 'HEAD' ? undefined : body);
    } catch (error) {
      reply(error.code === 'ENOENT' || error.code === 'ENOTDIR' ? 404 : 500, 'File unavailable.');
    }
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT || 4173);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be 1 to 65535.');
  const server = createPreviewServer();
  server.on('error', error => { console.error(error.message); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => console.log(`Preview: http://127.0.0.1:${port}`));
}

module.exports = { createPreviewServer };
