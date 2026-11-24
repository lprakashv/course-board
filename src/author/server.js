import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { publicFiles } from '../content.js';
import { isAssetPath } from '../browser/diagrams.js';
import { readDraft, saveDraft } from './project.js';

const studioUiDirectory = fileURLToPath(new URL('./browser/', import.meta.url));
const mimeTypes = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif', '.excalidraw': 'application/json',
};
const maxRequestBytes = 40 * 1024 * 1024;

function send(response, status, body, type = 'application/json', fontWorker = false) {
  response.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': type === 'image/svg+xml' ? 'sandbox; default-src \'none\'' : [
      "default-src 'self'", "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:",
      "font-src 'self' data: blob: https://esm.sh", "connect-src 'self' data: blob:", "worker-src 'self' blob:",
      "frame-ancestors 'none'", "base-uri 'none'", fontWorker ? "script-src 'self' 'unsafe-eval'" : "script-src 'self'",
    ].join('; '),
  });
  response.end(type === 'application/json' && !Buffer.isBuffer(body) ? JSON.stringify(body) : body);
}

async function readSaveRequest(request) {
  const chunks = [];
  let received = 0;
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    received += chunk.length;
    if (received > maxRequestBytes) {
      request.resume();
      const error = new Error('The save request exceeds 40 MiB. Use smaller files or save in batches.');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  const payload = JSON.parse(Buffer.concat(chunks));
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Expected a course object.');
  const { manifest, lessons, assets = {}, revision } = payload;
  if (revision !== null && (typeof revision !== 'string' || !/^[a-f\d]{64}$/.test(revision))) {
    throw new Error('Reload Studio to get the current course revision.');
  }
  if (!assets || typeof assets !== 'object' || Array.isArray(assets)) throw new Error('Expected a map of uploaded files.');
  const uploadedFiles = new Map();
  for (const [path, data] of Object.entries(assets)) {
    if (!/^(?:diagrams\/[a-f\d]{64}\.(?:excalidraw|svg|png|jpe?g|gif|webp|avif|html)|themes\/[a-f\d]{64}\.css)$/.test(path) ||
      typeof data !== 'string' || !/^[a-zA-Z0-9+/]+={0,2}$/.test(data)) throw new Error(`Invalid upload for "${path}".`);
    const bytes = Buffer.from(data, 'base64');
    const hash = createHash('sha256').update(bytes).digest('hex');
    if (!path.includes(`/${hash}.`)) throw new Error(`Upload content does not match "${path}".`);
    uploadedFiles.set(path, bytes);
  }
  return { draft: { manifest, lessons }, uploadedFiles, revision };
}

async function bundleStudio() {
  const outputDirectory = join(studioUiDirectory, 'bundle');
  const { outputFiles } = await build({
    entryPoints: { app: join(studioUiDirectory, 'app.js'), board: join(studioUiDirectory, 'board.js') },
    outdir: outputDirectory,
    write: false,
    bundle: true,
    splitting: true,
    format: 'esm',
    minify: true,
    target: 'es2022',
    conditions: ['production'],
    define: { 'process.env.NODE_ENV': '"production"' },
    loader: { '.woff2': 'file' },
  });
  const files = new Map();
  for (const file of outputFiles) {
    const urlPath = relative(outputDirectory, file.path).split(sep).join('/');
    files.set(`/studio/${urlPath}`, file.contents);
  }
  for (const name of ['index.html', 'studio.css']) {
    files.set(name === 'index.html' ? '/' : `/${name}`, await readFile(join(studioUiDirectory, name)));
  }
  files.set('/favicon.svg', await readFile(new URL('../browser/favicon.svg', import.meta.url)));
  return files;
}

export async function serveStudio(directory, port) {
  const root = resolve(directory);
  const publicDirectory = join(root, 'public');
  const require = createRequire(import.meta.url);
  const fontDirectory = join(dirname(require.resolve('@excalidraw/excalidraw')), 'fonts');
  const studioFiles = await bundleStudio();
  let pendingSave;
  const server = createServer(async (request, response) => {
    const host = `127.0.0.1:${server.address().port}`;
    if (request.headers.host !== host) return send(response, 403, { error: 'Open Studio at its loopback address.' });
    const origin = `http://${host}`;
    try {
      const url = new URL(request.url, origin);
      const { pathname } = url;
      if (request.method === 'PUT' && pathname === '/api/course') {
        if (request.headers.origin !== origin || !/^application\/json(?:;|$)/i.test(request.headers['content-type'] ?? '')) {
          return send(response, 403, { error: 'Save the course from the local Studio page.' });
        }
        if (pendingSave) return send(response, 409, { error: 'Another save is in progress. Try again.' });
        pendingSave = (async () => {
          const { draft, uploadedFiles, revision } = await readSaveRequest(request);
          return saveDraft(root, draft, uploadedFiles, { revision });
        })();
        try {
          return send(response, 200, await pendingSave);
        } finally {
          pendingSave = undefined;
        }
      }
      if (request.method !== 'GET') return send(response, 405, { error: 'Method not allowed.' });
      if (pathname === '/api/course') {
        if (pendingSave) await pendingSave.catch(() => {});
        return send(response, 200, await readDraft(root));
      }
      if (pathname === '/api/asset') {
        const path = url.searchParams.get('path');
        const type = isAssetPath(path) ? mimeTypes[extname(path)] : undefined;
        if ((type === 'application/json' || type?.startsWith('image/')) && (await publicFiles(publicDirectory)).has(path)) {
          return send(response, 200, await readFile(join(publicDirectory, path)), type);
        }
      }
      if (/^\/fonts\/(?:[\w-]+\/)*[\w.-]+\.woff2$/.test(pathname)) {
        return send(response, 200, await readFile(join(fontDirectory, pathname.slice('/fonts/'.length))), 'font/woff2');
      }
      const file = studioFiles.get(pathname);
      if (file) {
        // Excalidraw's font subsetter uses Emscripten bindings in a dedicated worker.
        const fontWorker = request.headers['sec-fetch-dest'] === 'worker' && /^\/studio\/subset-worker\.chunk-[\w-]+\.js$/.test(pathname);
        return send(response, 200, file, mimeTypes[extname(pathname)] ?? mimeTypes['.html'], fontWorker);
      }
      return send(response, 404, { error: 'File not found.' });
    } catch (error) {
      return send(response, error.status ?? (error.code === 'ENOENT' ? 404 : 400), { error: error.message });
    }
  });
  await new Promise((done, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', done);
  });
  console.log(`Course Board Studio at http://127.0.0.1:${server.address().port}/`);
  return server;
}
