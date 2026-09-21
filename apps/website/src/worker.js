import { makePublicItemRequest, makeSearchRequest, parseOfficialJson, parsePublicItem, parseSearchResults } from '@nkanf-dev/pico-store-sdk/pico';
import catalog from '../../../contracts/v1/catalog.json' with { type: 'json' };
import {
  DeliveryError, apkMetadata, apkResponse, directRedirect, loginWithCode, resolveDownload, sendVerificationCode,
} from './delivery.js';
import {
  SESSION_COOKIE, consumeRateLimit, createSession, deleteSession, deriveSessionKey, parseCookies,
  pruneSessions, readSession, scopeHash, sessionCookie, clearedSessionCookie,
} from './session.js';
import { readReleaseState, recordReleaseFailure, recordReleaseSuccess } from './store.js';
import { recordMetric } from './metrics.js';

const ACCOUNT_WINDOW_SECONDS = 600;
const LIMITS = {
  sendCodePerEmail: 5, sendCodePerIp: 20,
  loginPerEmail: 10, loginPerIp: 30,
};
const MAX_REQUEST_BODY_BYTES = 4 * 1024;

export async function checkForRelease(env, fetchImpl = fetch, now = () => new Date(), target = catalog[0]) {
  if (!env.DB) throw new Error('D1 DB binding is required for release tracking');
  const startedAt = now().toISOString();
  let product;
  try {
    const request = makePublicItemRequest({}, target);
    const response = await fetchImpl(request.url, { ...request, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error('PICO public item HTTP error');
    product = parsePublicItem(parseOfficialJson(await response.text()), target);
  } catch {
    await recordReleaseFailure(env.DB, startedAt, now().toISOString(), target.itemId);
    return { ok: false, state: await readReleaseState(env.DB, target.itemId) };
  }
  await recordReleaseSuccess(env.DB, product, now().toISOString());
  return { ok: true, state: await readReleaseState(env.DB, target.itemId) };
}

function apiResponse(body, status = 200, headers = {}) {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      ...headers,
    },
  });
}

function fail(error) {
  if (error instanceof DeliveryError) return apiResponse({ error: error.code, ...error.details }, error.status);
  return apiResponse({ error: 'internal_error' }, 500);
}

// Browsers always send `Origin` on cross-origin-capable requests; a mismatching
// value is cross-site request forgery, and a missing value can only come from a
// non-browser client that has nothing to forge.
function originRejected(request, url) {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  return origin !== `${url.protocol}//${url.host}`;
}

async function readBody(request) {
  const text = await request.text();
  if (text.length > MAX_REQUEST_BODY_BYTES) throw new DeliveryError('invalid_body', 413);
  try {
    const parsed = JSON.parse(text || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    throw new DeliveryError('invalid_body', 400);
  }
}

function requireStorage(env) {
  if (!env.DB) throw new DeliveryError('storage_not_configured', 503);
  return env.DB;
}

async function requireSession(request, env) {
  const db = requireStorage(env);
  let key;
  try {
    key = await deriveSessionKey(env.SESSION_SECRET);
  } catch {
    throw new DeliveryError('session_secret_missing', 503);
  }
  const session = await readSession(db, key, request.headers.get('cookie'));
  if (!session) throw new DeliveryError('not_authenticated', 401);
  return session;
}

// Any exact PICO item can be requested, not just the catalogued ones: the
// package name identifies the app, and PICO itself rejects a mismatched pair.
function downloadTarget(url) {
  const itemId = (url.searchParams.get('itemId') ?? '').trim();
  if (!/^[0-9]{1,20}$/.test(itemId)) throw new DeliveryError('invalid_item_id', 400);
  const requested = (url.searchParams.get('package') ?? url.searchParams.get('packageName') ?? '').trim();
  const known = catalog.find(item => item.itemId === itemId);
  const packageName = requested || known?.packageName || '';
  if (!/^[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)+$/.test(packageName)) throw new DeliveryError('invalid_package', 400);
  return { itemId, packageName, name: known?.name };
}

function clientScope(request) {
  const address = request.headers.get('cf-connecting-ip')
    ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
  return scopeHash('ip', address);
}

function relativeUrl(url, pathname) {
  const copy = new URL(url);
  copy.pathname = pathname;
  return copy;
}

async function handleAccount(request, env, url) {
  if (request.method !== 'POST') throw new DeliveryError('method_not_allowed', 405);
  if (originRejected(request, url)) throw new DeliveryError('origin_rejected', 403);
  const db = requireStorage(env);

  if (url.pathname === '/api/account/logout') {
    const token = parseCookies(request.headers.get('cookie'))[SESSION_COOKIE];
    if (token) await deleteSession(db, token);
    return apiResponse({ authenticated: false }, 200, { 'Set-Cookie': clearedSessionCookie(url) });
  }

  const body = await readBody(request);
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254) throw new DeliveryError('invalid_email', 400);
  const emailScope = await scopeHash('email', email.toLowerCase());
  const ipScope = await clientScope(request);

  if (url.pathname === '/api/account/send-code') {
    for (const [scope, limit] of [[emailScope, LIMITS.sendCodePerEmail], [ipScope, LIMITS.sendCodePerIp]]) {
      if (!(await consumeRateLimit(db, scope, limit, ACCOUNT_WINDOW_SECONDS)).allowed) {
        throw new DeliveryError('rate_limited', 429);
      }
    }
    await pruneSessions(db);
    try {
      await sendVerificationCode(email);
    } catch (error) {
      if (error instanceof DeliveryError) throw error;
      throw new DeliveryError('account_unavailable', 502);
    }
    return apiResponse({ sent: true });
  }

  if (url.pathname === '/api/account/login') {
    const code = typeof body.code === 'string' ? body.code.trim() : '';
    if (!/^[A-Za-z0-9]{4,8}$/.test(code)) throw new DeliveryError('invalid_code', 400);
    let key;
    try {
      key = await deriveSessionKey(env.SESSION_SECRET);
    } catch {
      throw new DeliveryError('session_secret_missing', 503);
    }
    for (const [scope, limit] of [[emailScope, LIMITS.loginPerEmail], [ipScope, LIMITS.loginPerIp]]) {
      if (!(await consumeRateLimit(db, scope, limit, ACCOUNT_WINDOW_SECONDS)).allowed) {
        throw new DeliveryError('rate_limited', 429);
      }
    }
    let auth;
    try {
      auth = await loginWithCode(email, code);
    } catch (error) {
      if (error instanceof DeliveryError && error.code !== 'account_rejected') throw error;
      throw new DeliveryError('account_rejected', 401);
    }
    const { token, expiresAt } = await createSession(db, key, { email, auth });
    await pruneSessions(db);
    return apiResponse({ authenticated: true, email, expiresAt }, 200, {
      'Set-Cookie': sessionCookie(url, token),
    });
  }

  throw new DeliveryError('not_found', 404);
}

async function handleSession(request, env) {
  if (request.method !== 'GET') throw new DeliveryError('method_not_allowed', 405);
  try {
    const session = await requireSession(request, env);
    return apiResponse({ authenticated: true, email: session.email, expiresAt: session.expiresAt });
  } catch (error) {
    if (error instanceof DeliveryError && error.code === 'not_authenticated') {
      return apiResponse({ authenticated: false });
    }
    throw error;
  }
}

async function handleDownload(request, env, url) {
  if (url.pathname === '/api/download/acquire') {
    if (request.method !== 'POST') throw new DeliveryError('method_not_allowed', 405);
    // Unlike the read-only GET routes, this creates an order on the PICO account.
    if (request.headers.get('origin') !== url.origin) throw new DeliveryError('origin_rejected', 403);
    const session = await requireSession(request, env);
    const body = await readBody(request);
    const targetUrl = new URL('/api/download', url);
    if (typeof body.itemId === 'string') targetUrl.searchParams.set('itemId', body.itemId);
    if (typeof body.packageName === 'string') targetUrl.searchParams.set('package', body.packageName);
    const target = downloadTarget(targetUrl);
    const resolved = await resolveDownload(target, session.auth, { acquire: true });
    return apiResponse(apkMetadata(resolved, targetUrl));
  }
  if (request.method !== 'GET') throw new DeliveryError('method_not_allowed', 405);
  if (!env.DB) throw new DeliveryError('storage_not_configured', 503);
  const target = downloadTarget(url);
  const session = await requireSession(request, env);
  const resolved = await resolveDownload(target, session.auth);
  if (url.pathname === '/api/download/info') {
    return apiResponse(apkMetadata(resolved, relativeUrl(url, '/api/download')));
  }
  if (url.searchParams.get('direct') === '1') return directRedirect(resolved.info);
  return apkResponse(resolved.info, resolved.fileName, request);
}

export default {
  async scheduled(_controller, env) {
    for (const target of catalog) await checkForRelease(env, fetch, () => new Date(), target);
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/metrics') return recordMetric(request, env);
    if (!url.pathname.startsWith('/api/') && ['GET', 'HEAD'].includes(request.method)) {
      const language = url.searchParams.get('lang');
      if (language === 'en' || language === 'zh-CN') {
        const path = url.pathname.replace(/^\/en(?=\/|$)/, '') || '/';
        url.pathname = `${language === 'en' ? '/en' : ''}${path}`;
        url.searchParams.delete('lang');
        return Response.redirect(url.href, 301);
      }
    }
    if (url.pathname === '/api/account/session') {
      try {
        return await handleSession(request, env);
      } catch (error) {
        return fail(error);
      }
    }
    if (url.pathname.startsWith('/api/account/')) {
      try {
        return await handleAccount(request, env, url);
      } catch (error) {
        return fail(error);
      }
    }
    if (['/api/download', '/api/download/info', '/api/download/acquire'].includes(url.pathname)) {
      try {
        return await handleDownload(request, env, url);
      } catch (error) {
        return fail(error);
      }
    }
    if (url.pathname === '/api/search') {
      if (request.method !== 'GET') return new Response('Method Not Allowed', { status: 405 });
      const word = url.searchParams.get('q')?.trim() ?? '';
      if (!word || word.length > 100) return Response.json({ error: 'invalid_search_query' }, { status: 400 });
      try {
        const spec = makeSearchRequest(word);
        const upstream = await fetch(spec.url, { ...spec, signal: AbortSignal.timeout(15000) });
        if (!upstream.ok) throw new Error('upstream search unavailable');
        return Response.json(parseSearchResults(parseOfficialJson(await upstream.text())), {
          headers: { 'Cache-Control': 'public, max-age=60' },
        });
      } catch {
        return Response.json({ error: 'search_unavailable' }, { status: 502 });
      }
    }
    if (url.pathname === '/api/item') {
      if (request.method !== 'GET') return new Response('Method Not Allowed', { status: 405 });
      const target = { itemId: url.searchParams.get('itemId') ?? '', packageName: url.searchParams.get('package') ?? '' };
      try {
        const spec = makePublicItemRequest({}, target);
        const upstream = await fetch(spec.url, { ...spec, signal: AbortSignal.timeout(15000) });
        if (!upstream.ok) throw new Error('upstream item unavailable');
        return Response.json(parsePublicItem(parseOfficialJson(await upstream.text()), target), {
          headers: { 'Cache-Control': 'public, max-age=60' },
        });
      } catch {
        return Response.json({ error: 'item_unavailable' }, { status: 502 });
      }
    }
    if (url.pathname === '/api/releases' || url.pathname === '/api/catalog') {
      if (request.method !== 'GET') return new Response('Method Not Allowed', { status: 405 });
      if (!env.DB) return Response.json({ error: 'release_database_not_configured' }, { status: 503 });
      try {
        const selected = catalog.find(item => item.itemId === url.searchParams.get('itemId')) ?? catalog[0];
        const state = url.pathname === '/api/catalog'
          ? await Promise.all(catalog.map(async item => ({ ...item, state: await readReleaseState(env.DB, item.itemId) })))
          : await readReleaseState(env.DB, selected.itemId);
        return Response.json(state ?? { stale: true, releases: [], latestVersionCode: null }, {
          headers: { 'Cache-Control': 'no-store' },
        });
      } catch {
        return Response.json({ error: 'release_database_unavailable' }, { status: 503 });
      }
    }
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response('Not Found', { status: 404 });
  },
};
