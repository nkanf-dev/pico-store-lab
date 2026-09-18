import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import worker from './worker.js';

const root = new URL('../public/', import.meta.url);
const files = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
  ['/i18n.css', ['i18n.css', 'text/css; charset=utf-8']],
  ['/catalog.json', ['catalog.json', 'application/json; charset=utf-8']],
]);

export function createDevServer(env) {
  return createServer(async (req, res) => {
    const requested = new URL(req.url, `http://${req.headers.host}`);
    const pathname = requested.pathname;
    if (pathname.startsWith('/api/')) {
      const headers = {};
      for (const [name, value] of Object.entries(req.headers)) {
        if (typeof value === 'string') headers[name] = value;
      }
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const init = { method: req.method, headers };
      if (req.method !== 'GET' && req.method !== 'HEAD' && chunks.length) init.body = Buffer.concat(chunks);
      const response = await worker.fetch(new Request(requested, init), env);
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
      return;
    }
    const asset = files.get(pathname);
    if (!asset || req.method !== 'GET') { res.writeHead(404); res.end('Not Found'); return; }
    try {
      const body = await readFile(new URL(asset[0], root));
      res.writeHead(200, { 'Content-Type': asset[1] });
      res.end(body);
    } catch {
      res.writeHead(500); res.end('Asset unavailable');
    }
  });
}
