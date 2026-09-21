import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from './worker.js';

const root = resolve(fileURLToPath(new URL('../dist/', import.meta.url)));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.png': 'image/png', '.webp': 'image/webp',
  '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8' };

async function assetResponse(request) {
  if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method Not Allowed', { status: 405 });
  const url = new URL(request.url);
  let decoded;
  try { decoded = decodeURIComponent(url.pathname); } catch { return new Response('Bad Request', { status: 400 }); }
  let file = resolve(root, `.${decoded}`);
  if (file !== root && !file.startsWith(root + sep)) return new Response('Not Found', { status: 404 });
  try {
    if ((await stat(file)).isDirectory()) {
      if (!url.pathname.endsWith('/')) { url.pathname += '/'; return Response.redirect(url, 301); }
      file = resolve(file, 'index.html');
    }
    const body = await readFile(file);
    return new Response(request.method === 'HEAD' ? null : body, { headers: { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' } });
  } catch {
    return new Response('Not Found', { status: 404 });
  }
}

export function createDevServer(env) {
  return createServer(async (req, res) => {
    try {
      const requested = new URL(req.url, `http://${req.headers.host}`);
      const headers = {};
      for (const [name, value] of Object.entries(req.headers)) if (typeof value === 'string') headers[name] = value;
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const init = { method: req.method, headers };
      if (req.method !== 'GET' && req.method !== 'HEAD' && chunks.length) init.body = Buffer.concat(chunks);
      const response = await worker.fetch(new Request(requested, init), { ...env, ASSETS: { fetch: assetResponse } });
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      res.writeHead(500); res.end('Server unavailable');
    }
  });
}
