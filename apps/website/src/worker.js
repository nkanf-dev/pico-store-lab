import {
  makePublicItemRequest, makeSearchRequest, parseOfficialJson, parsePublicItem, parseSearchResults,
  storeOptionsForRegion,
} from '@nkanf-dev/pico-store-sdk/pico';
import catalog from '../../../contracts/v1/catalog.json' with { type: 'json' };
import {
  DeliveryError, apkMetadata, apkResponse, directRedirect, loginWithCode, loginWithMobile,
  resolveDownload, sendMobileVerificationCode, sendVerificationCode,
} from './delivery.js';
import {
  SESSION_COOKIE, clearRegionSession, consumeRateLimit, createSession, deleteSession, deriveSessionKey,
  parseCookies, pruneSessions, readSession, regionEntry, saveRegionSession, scopeHash,
  sessionCookie, clearedSessionCookie,
} from './session.js';
import { readReleaseState, recordReleaseFailure, recordReleaseSuccess } from './store.js';
import { recordMetric } from './metrics.js';

const ACCOUNT_WINDOW_SECONDS = 600;
const LIMITS = {
  sendCodePerEmail: 5, sendCodePerIp: 20,
  loginPerEmail: 10, loginPerIp: 30,
};

// The store region is chosen per request ("global" international store or "cn"
// mainland China store). Each region keeps its own PICO session.
function regionFrom(value) {
  return value === 'cn' ? 'cn' : 'global';
}

function storeOptions(region) {
  return storeOptionsForRegion(regionFrom(region));
}
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

async function requireRegionAuth(request, env, region) {
  const session = await requireSession(request, env);
  const entry = regionEntry(session, region);
  if (!entry) throw new DeliveryError('not_authenticated', 401);
  return entry;
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

function validateMobile(body) {
  const countryCode = typeof body.countryCode === 'string' ? body.countryCode.trim() : '86';
  const mobile = typeof body.mobile === 'string' ? body.mobile.trim() : '';
  if (!/^[1-9][0-9]{0,2}$/.test(countryCode)) throw new DeliveryError('invalid_country_code', 400);
  if (!/^[0-9]{5,14}$/.test(mobile) || (countryCode + mobile).length > 15) {
    throw new DeliveryError('invalid_mobile', 400);
  }
  if (countryCode === '86' && !/^1[3-9][0-9]{9}$/.test(mobile)) {
    throw new DeliveryError('invalid_mobile', 400);
  }
  return { countryCode, mobile };
}

async function rateLimit(db, pairs) {
  for (const [scope, limit] of pairs) {
    if (!(await consumeRateLimit(db, scope, limit, ACCOUNT_WINDOW_SECONDS)).allowed) {
      throw new DeliveryError('rate_limited', 429);
    }
  }
}

// Store a fresh sign-in under the visitor's existing cookie when present, so a
// browser can hold both the international and the China session at once.
async function persistLogin(db, key, request, url, region, label, auth) {
  const existingToken = parseCookies(request.headers.get('cookie'))[SESSION_COOKIE];
  if (existingToken) {
    const saved = await saveRegionSession(db, key, { token: existingToken, region, label, auth });
    if (saved) return { expiresAt: saved.expiresAt, setCookie: null };
  }
  const { token, expiresAt } = await createSession(db, key, { region, label, auth });
  return { expiresAt, setCookie: sessionCookie(url, token) };
}

async function sessionKey(env) {
  try {
    return await deriveSessionKey(env.SESSION_SECRET);
  } catch {
    throw new DeliveryError('session_secret_missing', 503);
  }
}

async function handleAccount(request, env, url) {
  if (request.method !== 'POST') throw new DeliveryError('method_not_allowed', 405);
  if (originRejected(request, url)) throw new DeliveryError('origin_rejected', 403);
  const db = requireStorage(env);
  const body = await readBody(request);

  if (url.pathname === '/api/account/logout') {
    const token = parseCookies(request.headers.get('cookie'))[SESSION_COOKIE];
    const region = body.region ? regionFrom(body.region) : null;
    if (token) {
      if (region) {
        const key = await sessionKey(env);
        await clearRegionSession(db, key, token, region);
      } else {
        await deleteSession(db, token);
      }
    }
    const headers = region ? {} : { 'Set-Cookie': clearedSessionCookie(url) };
    return apiResponse({ authenticated: false, region: region ?? undefined }, 200, headers);
  }

  const ipScope = await clientScope(request);

  // ---- China region: mobile + SMS -------------------------------------
  if (url.pathname === '/api/account/cn/send-code' || url.pathname === '/api/account/cn/login') {
    const { countryCode, mobile } = validateMobile(body);
    const mobileScope = await scopeHash('mobile', `${countryCode}${mobile}`);
    const options = { countryCode, storeOptions: storeOptions('cn') };
    await pruneSessions(db);
    if (url.pathname === '/api/account/cn/send-code') {
      await rateLimit(db, [[mobileScope, LIMITS.sendCodePerEmail], [ipScope, LIMITS.sendCodePerIp]]);
      try {
        await sendMobileVerificationCode(mobile, options);
      } catch (error) {
        if (error instanceof DeliveryError) throw error;
        throw new DeliveryError('account_unavailable', 502);
      }
      return apiResponse({ sent: true, region: 'cn' });
    }
    const code = typeof body.code === 'string' ? body.code.trim() : '';
    if (!/^[0-9]{6}$/.test(code)) throw new DeliveryError('invalid_code', 400);
    const key = await sessionKey(env);
    await rateLimit(db, [[mobileScope, LIMITS.loginPerEmail], [ipScope, LIMITS.loginPerIp]]);
    let auth;
    try {
      auth = await loginWithMobile(mobile, code, options);
    } catch (error) {
      if (error instanceof DeliveryError) throw error;
      throw new DeliveryError('account_rejected', 401);
    }
    const label = `+${countryCode} ${mobile}`;
    const { expiresAt, setCookie } = await persistLogin(db, key, request, url, 'cn', label, auth);
    await pruneSessions(db);
    const headers = setCookie ? { 'Set-Cookie': setCookie } : {};
    return apiResponse({ authenticated: true, region: 'cn', mobile: label, expiresAt }, 200, headers);
  }

  // ---- Global region: email code --------------------------------------
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254) throw new DeliveryError('invalid_email', 400);
  const emailScope = await scopeHash('email', email.toLowerCase());

  if (url.pathname === '/api/account/send-code') {
    await rateLimit(db, [[emailScope, LIMITS.sendCodePerEmail], [ipScope, LIMITS.sendCodePerIp]]);
    await pruneSessions(db);
    try {
      await sendVerificationCode(email, storeOptions('global'));
    } catch (error) {
      if (error instanceof DeliveryError) throw error;
      throw new DeliveryError('account_unavailable', 502);
    }
    return apiResponse({ sent: true, region: 'global' });
  }

  if (url.pathname === '/api/account/login') {
    const code = typeof body.code === 'string' ? body.code.trim() : '';
    if (!/^[A-Za-z0-9]{4,8}$/.test(code)) throw new DeliveryError('invalid_code', 400);
    const key = await sessionKey(env);
    await rateLimit(db, [[emailScope, LIMITS.loginPerEmail], [ipScope, LIMITS.loginPerIp]]);
    let auth;
    try {
      auth = await loginWithCode(email, code, storeOptions('global'));
    } catch (error) {
      if (error instanceof DeliveryError && error.code !== 'account_rejected') throw error;
      throw new DeliveryError('account_rejected', 401);
    }
    const { expiresAt, setCookie } = await persistLogin(db, key, request, url, 'global', email, auth);
    await pruneSessions(db);
    const headers = setCookie ? { 'Set-Cookie': setCookie } : {};
    return apiResponse({ authenticated: true, region: 'global', email, expiresAt }, 200, headers);
  }

  throw new DeliveryError('not_found', 404);
}

async function handleSession(request, env) {
  if (request.method !== 'GET') throw new DeliveryError('method_not_allowed', 405);
  try {
    const session = await requireSession(request, env);
    const regions = {};
    for (const region of ['global', 'cn']) {
      const entry = regionEntry(session, region);
      regions[region] = entry ? { authenticated: true, label: entry.label ?? '' } : { authenticated: false };
    }
    const authenticated = Boolean(regions.global.authenticated || regions.cn.authenticated);
    return apiResponse({ authenticated, email: session.email, regions, expiresAt: session.expiresAt });
  } catch (error) {
    if (error instanceof DeliveryError && error.code === 'not_authenticated') {
      return apiResponse({
        authenticated: false,
        regions: { global: { authenticated: false }, cn: { authenticated: false } },
      });
    }
    throw error;
  }
}

async function handleDownload(request, env, url) {
  if (url.pathname === '/api/download/acquire') {
    if (request.method !== 'POST') throw new DeliveryError('method_not_allowed', 405);
    // Unlike the read-only GET routes, this creates an order on the PICO account.
    if (request.headers.get('origin') !== url.origin) throw new DeliveryError('origin_rejected', 403);
    const body = await readBody(request);
    const region = regionFrom(body.region);
    const entry = await requireRegionAuth(request, env, region);
    const targetUrl = new URL('/api/download', url);
    if (typeof body.itemId === 'string') targetUrl.searchParams.set('itemId', body.itemId);
    if (typeof body.packageName === 'string') targetUrl.searchParams.set('package', body.packageName);
    targetUrl.searchParams.set('region', region);
    const target = downloadTarget(targetUrl);
    const resolved = await resolveDownload(target, entry.auth, { acquire: true, storeOptions: storeOptions(region) });
    return apiResponse(apkMetadata(resolved, targetUrl));
  }
  if (request.method !== 'GET') throw new DeliveryError('method_not_allowed', 405);
  if (!env.DB) throw new DeliveryError('storage_not_configured', 503);
  const region = regionFrom(url.searchParams.get('region'));
  const target = downloadTarget(url);
  const entry = await requireRegionAuth(request, env, region);
  let resolved = await resolveDownload(target, entry.auth, { storeOptions: storeOptions(region) });
  if (url.pathname === '/api/download/info') {
    return apiResponse(apkMetadata(resolved, relativeUrl(url, '/api/download')));
  }
  if (url.pathname === '/api/download/diagnostics') {
    const events = [];
    // Header/range probe only. Never buffer an APK or include its private URL.
    const probe = new Request(request.url, { headers: { Range: 'bytes=0-0' } });
    try {
      const response = await apkResponse(resolved.info, resolved.fileName, probe, fetch, event => events.push(event));
      await response.body?.cancel();
      return apiResponse({ events, response: { httpStatus: response.status,
        contentLength: response.headers.get('content-length'), contentRange: response.headers.get('content-range'),
        metadataNotice: response.headers.get('x-apk-metadata-notice') } });
    } catch (error) {
      if (!(error instanceof DeliveryError)) throw error;
      return apiResponse({ events, error: error.code, ...error.details }, error.status);
    }
  }
  if (url.searchParams.get('direct') === '1') return directRedirect(resolved.info);
  try {
    return await apkResponse(resolved.info, resolved.fileName, request);
  } catch (error) {
    if (!(error instanceof DeliveryError) || error.code !== 'apk_unavailable') throw error;
    // A signed CDN link can expire during a rollout. Re-read entitlement and
    // metadata before trying again; never turn an ownership rejection into a download.
    try {
      resolved = await resolveDownload(target, entry.auth, { storeOptions: storeOptions(region) });
      return await apkResponse(resolved.info, resolved.fileName, request);
    } catch (retryError) {
      if (!(retryError instanceof DeliveryError) || retryError.status < 500) throw retryError;
      // The visitor's network may reach PICO when the Worker cannot. Preserve
      // the already-authorized original download as the final alternate route.
      const response = directRedirect(resolved.info);
      response.headers.set('X-Apk-Recovery', 'direct_download');
      return response;
    }
  }
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
    if (['/api/download', '/api/download/info', '/api/download/acquire', '/api/download/diagnostics'].includes(url.pathname)) {
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
      const region = regionFrom(url.searchParams.get('region'));
      try {
        const spec = makeSearchRequest(word, storeOptions(region));
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
      const region = regionFrom(url.searchParams.get('region'));
      const target = { itemId: url.searchParams.get('itemId') ?? '', packageName: url.searchParams.get('package') ?? '' };
      try {
        const spec = makePublicItemRequest(storeOptions(region), target);
        const upstream = await fetch(spec.url, { ...spec, signal: AbortSignal.timeout(15000) });
        if (!upstream.ok) throw new Error('upstream item unavailable');
        return Response.json(parsePublicItem(parseOfficialJson(await upstream.text()), target, storeOptions(region)), {
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
