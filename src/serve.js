import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { buildSite } from './build.js';

const mimeTypes = new Map(Object.entries({
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.avif': 'image/avif', '.woff2': 'font/woff2',
}));

export async function serve(directory, { dev, port, customize }) {
  const output = resolve(directory, 'dist');
  let pendingBuild;
  const server = createServer(async (request, response) => {
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(405, { Allow: 'GET, HEAD' }).end();
      return;
    }
    let path;
    try {
      path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    } catch {
      response.writeHead(400).end('Invalid path');
      return;
    }
    if (path === '/') path = '/index.html';
    const file = resolve(output, '.' + path);
    if (!file.startsWith(output + sep) || path.includes('\0')) {
      response.writeHead(404).end('File not found');
      return;
    }
    try {
      if (dev && path === '/index.html') {
        pendingBuild ??= buildSite(directory, { customize }).finally(() => { pendingBuild = undefined; });
        await pendingBuild;
      }
      const data = await readFile(file);
      response.writeHead(200, {
        'Content-Type': mimeTypes.get(extname(file)) ?? 'application/octet-stream',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      response.end(request.method === 'HEAD' ? undefined : data);
    } catch (error) {
      const missing = ['ENOENT', 'EISDIR'].includes(error.code) && !(dev && path === '/index.html');
      response.writeHead(missing ? 404 : 500, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end(missing ? 'File not found' : error.message);
    }
  });

  await new Promise((done, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', done);
  });
  console.log(`Course Board at http://127.0.0.1:${server.address().port}/`);
  return server;
}
