import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import worker from './worker.js';
import { getBrowserLoginJob, startBrowserLoginJob } from './local-browser-login.js';
import {
  SESSION_COOKIE,
  createSession,
  deriveSessionKey,
  parseCookies,
  saveRegionSession,
  sessionCookie,
} from './session.js';

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

function jsonResponse(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extraHeaders },
  });
}

// Persist the China session captured by the local browser window under the
// visitor's existing cookie (so a global sign-in is kept), or mint a new one.
async function persistLocalLogin(env, cookieHeader, url, capture) {
  const auth = { uid: capture.uid, cookies: capture.cookies };
  const label = capture.label;
  const existingToken = parseCookies(cookieHeader)[SESSION_COOKIE];
  if (existingToken) {
    const saved = await saveRegionSession(env.DB, await deriveSessionKey(env.SESSION_SECRET), {
      token: existingToken, region: 'cn', label, auth,
    });
    if (saved) return { expiresAt: saved.expiresAt, setCookie: null };
  }
  const { token, expiresAt } = await createSession(env.DB, await deriveSessionKey(env.SESSION_SECRET), {
    region: 'cn', label, auth,
  });
  return { expiresAt, setCookie: sessionCookie(url, token) };
}

// Local-only official-window China sign-in. These routes exist on the Node dev
// server (which can launch a browser); the Cloudflare worker returns 501.
async function handleLocalBrowserLogin(env, req, requested, rawBody) {
  const sameOrigin = (req.headers.origin ?? `http://${req.headers.host}`) === `http://${req.headers.host}`;
  if (!sameOrigin) return jsonResponse({ error: 'origin_rejected' }, 403);
  if (requested.pathname === '/api/local/browser-login/start' && req.method === 'POST') {
    const started = startBrowserLoginJob();
    return jsonResponse({ ok: true, ...started });
  }
  if (requested.pathname === '/api/local/browser-login/status' && req.method === 'GET') {
    const job = getBrowserLoginJob(requested.searchParams.get('jobId'));
    if (!job) return jsonResponse({ error: 'job_not_found' }, 404);
    if (job.state === 'authenticated' && job.auth && !job.persisted) {
      job.persisted = true;
      const capture = { uid: job.auth.uid, cookies: job.auth.cookies, label: job.label };
      const { expiresAt, setCookie } = await persistLocalLogin(
        env, req.headers.cookie ?? '', requested, capture,
      );
      const headers = setCookie ? { 'Set-Cookie': setCookie } : {};
      return jsonResponse({ state: 'authenticated', region: 'cn', label: job.label, expiresAt }, 200, headers);
    }
    if (job.state === 'authenticated') {
      return jsonResponse({ state: 'authenticated', region: 'cn', label: job.label });
    }
    return jsonResponse({ state: job.state, region: 'cn', error: job.error ?? undefined });
  }
  return null;
}

async function sendWebResponse(res, response) {
  res.writeHead(response.status, Object.fromEntries(response.headers));
  if (response.body) await pipeline(Readable.fromWeb(response.body), res);
  else res.end();
}

export function createDevServer(env) {
  const server = createServer(async (req, res) => {
    try {
      const requested = new URL(req.url, `http://${req.headers.host}`);
      const headers = {};
      for (const [name, value] of Object.entries(req.headers)) if (typeof value === 'string') headers[name] = value;
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const rawBody = chunks.length ? Buffer.concat(chunks) : null;
      const init = { method: req.method, headers };
      if (req.method !== 'GET' && req.method !== 'HEAD' && rawBody) init.body = rawBody;

      const local = await handleLocalBrowserLogin(env, req, requested, rawBody);
      if (local) return await sendWebResponse(res, local);

      const response = await worker.fetch(new Request(requested, init), { ...env, ASSETS: { fetch: assetResponse } });
      await sendWebResponse(res, response);
    } catch {
      if (!res.headersSent && !res.destroyed) { res.writeHead(500); res.end('Server unavailable'); }
      else res.destroy();
    }
  });
  // The interactive window is polled over short requests, but keep the dev
  // server permissive rather than cutting long-lived local connections.
  server.requestTimeout = 0;
  return server;
}
