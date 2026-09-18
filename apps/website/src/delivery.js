// APK delivery pipeline for the web downloader.
//
// Mirrors the SDK client flow (item -> ensure entitlement -> download info)
// using only the pure protocol helpers, because `@nkanf-dev/pico-store-sdk/client`
// pulls in node:fs / node:stream and cannot run on the Workers runtime.
//
// The Worker never re-hosts the APK: it either streams PICO's own artefact
// through to the visitor or hands out PICO's own CDN link, so storage stays at
// zero. Size and host are PICO's business; the only thing this pipeline refuses
// is an account that cannot obtain the app at all.

import {
  makeAccountItemRequest, makeAccountRequest, makeDownloadInfoRequest, makeFreeAcquisitionRequest,
  parseDownloadInfo, parseFreeAcquisition, parseOfficialJson, parsePublicItem,
} from '@nkanf-dev/pico-store-sdk/pico';

const MAX_JSON_BYTES = 4 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 25_000;

export class DeliveryError extends Error {
  constructor(code, status, details = {}) {
    super(code);
    this.name = 'DeliveryError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

function setCookieLines(headers) {
  if (typeof headers.getSetCookie === 'function') {
    const lines = headers.getSetCookie();
    if (lines.length) return lines;
  }
  const single = headers.get('set-cookie');
  return single ? [single] : [];
}

export function parseLoginAuth(response) {
  const root = response.data;
  if (!root || root.message !== 'success') throw new DeliveryError('account_rejected', 401);
  const data = root.data && typeof root.data === 'object' ? root.data : {};
  const cookies = {};
  for (const line of setCookieLines(response.headers)) {
    const [pair] = line.split(';', 1);
    const separator = pair?.indexOf('=') ?? -1;
    if (separator > 0) cookies[pair.slice(0, separator)] = pair.slice(separator + 1);
  }
  const auth = {
    uid: String(data.user_id_str ?? data.user_id ?? '0'),
    x_tt_token: response.headers.get('x-tt-token') ?? '',
    cookies,
  };
  if (!auth.x_tt_token && !Object.keys(cookies).length) throw new DeliveryError('account_session_missing', 502);
  return auth;
}

async function sendJson(spec, fetchImpl) {
  let response;
  try {
    response = await fetchImpl(spec.url, {
      method: spec.method, headers: spec.headers, body: spec.body,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new DeliveryError('upstream_unreachable', 502);
  }
  if (!response.ok) throw new DeliveryError('upstream_unreachable', 502, { upstreamStatus: response.status });
  let body;
  try {
    body = await response.text();
  } catch {
    throw new DeliveryError('upstream_unreachable', 502);
  }
  if (body.length > MAX_JSON_BYTES) throw new DeliveryError('upstream_response_too_large', 502);
  try {
    return { data: parseOfficialJson(body), headers: response.headers };
  } catch {
    throw new DeliveryError('upstream_invalid_response', 502);
  }
}

export async function sendVerificationCode(email, storeOptions = {}, fetchImpl = fetch) {
  const request = makeAccountRequest('send-code', email, undefined, storeOptions);
  const response = await sendJson(request, fetchImpl);
  if (response.data?.message !== 'success') throw new DeliveryError('account_rejected', 502);
}

export async function loginWithCode(email, code, storeOptions = {}, fetchImpl = fetch) {
  const request = makeAccountRequest('login', email, code, storeOptions);
  return parseLoginAuth(await sendJson(request, fetchImpl));
}

export async function fetchAccountItem(target, auth, storeOptions = {}, fetchImpl = fetch) {
  const request = makeAccountItemRequest(auth, storeOptions, target);
  try {
    return parsePublicItem((await sendJson(request, fetchImpl)).data, target, storeOptions);
  } catch (error) {
    if (error instanceof DeliveryError) throw error;
    throw new DeliveryError('item_unavailable', 502);
  }
}

function canAcquire(item) {
  return item.offerExists === true && /^0(?:\.0+)?$/.test(item.price) && Boolean(item.currency);
}

function entitlementRequired(item) {
  return new DeliveryError('entitlement_required', 402, {
    reason: 'not_in_account', price: item.price, canAcquire: canAcquire(item),
  });
}

// Free acquisition is idempotent: an already-entitled account returns early,
// and PICO needs a moment before the entitlement shows up on a re-read. A paid
// app that the account does not own cannot be obtained through this API, so it
// is reported as an account problem rather than a distribution policy.
export async function ensureEntitlement(target, auth, options = {}) {
  const { storeOptions = {}, fetchImpl = fetch, sleep = wait, attempts = 3 } = options;
  const current = await fetchAccountItem(target, auth, storeOptions, fetchImpl);
  if (current.entitlementStatus === 1) return current;
  if (!canAcquire(current)) throw entitlementRequired(current);
  let acquisitionError = null;
  try {
    parseFreeAcquisition((await sendJson(makeFreeAcquisitionRequest(auth, current, storeOptions), fetchImpl)).data);
  } catch (error) {
    acquisitionError = error instanceof DeliveryError
      ? error
      : new DeliveryError('entitlement_required', 402, { reason: 'claim_failed', price: current.price, canAcquire: true });
  }
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const updated = await fetchAccountItem(target, auth, storeOptions, fetchImpl);
      if (updated.entitlementStatus === 1) return updated;
    } catch (error) {
      if (attempt === attempts - 1) throw acquisitionError ?? error;
    }
    await sleep(400);
  }
  // A claim that succeeded but never became visible is a retryable upstream
  // hiccup; anything we already know about the account is reported as-is.
  throw acquisitionError ?? new DeliveryError('entitlement_unconfirmed', 502);
}

export function apkFileName(info) {
  const safe = `${info.packageName}-${info.versionCode}.apk`.replace(/[^A-Za-z0-9._-]/g, '_');
  return safe;
}

export async function resolveDownload(target, auth, options = {}) {
  const { storeOptions = {}, fetchImpl = fetch, sleep, acquire = false } = options;
  const item = acquire
    ? await ensureEntitlement(target, auth, { storeOptions, fetchImpl, sleep })
    : await fetchAccountItem(target, auth, storeOptions, fetchImpl);
  if (item.entitlementStatus !== 1) throw entitlementRequired(item);
  let info;
  try {
    info = parseDownloadInfo((await sendJson(makeDownloadInfoRequest(auth, storeOptions, target), fetchImpl)).data, target);
  } catch (error) {
    if (error instanceof DeliveryError) throw error;
    throw new DeliveryError('apk_metadata_unavailable', 502);
  }
  return { item, info, fileName: apkFileName(info) };
}

function hexToBase64(hex) {
  let binary = '';
  for (let index = 0; index < hex.length; index += 2) binary += String.fromCharCode(Number.parseInt(hex.slice(index, index + 2), 16));
  return btoa(binary);
}

export function apkMetadata(resolved, downloadUrl) {
  const { item, info, fileName } = resolved;
  const url = new URL(downloadUrl);
  url.searchParams.set('itemId', item.itemId);
  url.searchParams.set('package', item.packageName);
  return {
    available: true,
    itemId: item.itemId, packageName: item.packageName, name: item.name,
    versionCode: info.versionCode, version: info.version,
    size: info.size, md5: info.md5, fileName,
    downloadUrl: `${url.pathname}${url.search}`,
    directUrl: info.url,
  };
}

// Hands the visitor PICO's own CDN link. The browser then transfers the bytes
// directly, which also means Range/retry behaviour is PICO's, not ours.
export function directRedirect(info) {
  return new Response(null, {
    status: 302,
    headers: {
      Location: info.url,
      'Cache-Control': 'private, no-store',
      'Referrer-Policy': 'no-referrer',
    },
  });
}

// Streams PICO's APK to the visitor. No timeout is applied to the body: a
// multi-hundred-megabyte transfer outlives any request-scoped abort.
export async function apkResponse(info, fileName, request, fetchImpl = fetch) {
  const validator = request.headers.get('if-range');
  // This service exposes its own MD5 ETag, which need not match the CDN's.
  // Without a matching strong validator, fetch the whole current version.
  const range = validator === null || validator === `"${info.md5}"`
    ? request.headers.get('range') : null;
  let upstream;
  try {
    upstream = await fetchImpl(info.url, {
      headers: range ? { Range: range } : {},
      redirect: 'follow',
    });
  } catch {
    throw new DeliveryError('apk_unavailable', 502);
  }
  if (!upstream.ok || !upstream.body || (upstream.status !== 200 && upstream.status !== 206)) {
    throw new DeliveryError('apk_unavailable', 502, { upstreamStatus: upstream.status });
  }
  const headers = new Headers({
    'Content-Type': 'application/vnd.android.package-archive',
    'Content-Disposition': `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    'Accept-Ranges': 'bytes',
    'ETag': `"${info.md5}"`,
    'Digest': `md5=${hexToBase64(info.md5)}`,
    'X-Apk-Md5': info.md5,
    'X-Apk-Size': String(info.size),
    'X-Apk-Version-Code': String(info.versionCode),
    'X-Apk-Version': info.version,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  });
  const length = upstream.headers.get('content-length') ?? String(info.size);
  headers.set('Content-Length', length);
  if (upstream.status === 206) {
    const contentRange = upstream.headers.get('content-range');
    if (contentRange) headers.set('Content-Range', contentRange);
  }
  return new Response(upstream.body, { status: upstream.status, headers });
}
