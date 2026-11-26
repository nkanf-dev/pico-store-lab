// China-region sign-in through PICO's official SSO web flow.
//
// The Matrix "app" SMS endpoint used by the headset is protected by device
// risk control and answers error 7 for browser-originated requests. The SSO
// site (sso.picoxr.com) uses a different web endpoint that performs the same
// human verification the official page does, so a hosted site can complete
// mobile + SMS sign-in without launching a local browser.

import { DeliveryError } from './delivery-error.js';

const SSO_ORIGIN = 'https://sso.picoxr.com';
const SSO_SERVICE = 'https://store.picoxr.com/';
const SSO_AID = '264297';
const SSO_SDK_VERSION = '2.2.2';
const REQUEST_TIMEOUT_MS = 25_000;
const SESSION_COOKIE_NAMES = ['sessionid', 'sessionid_ss', 'sid_tt'];
const FOLLOW_HOSTS = new Set(['sso.picoxr.com', 'store.picoxr.com', 'www.picoxr.com']);

function ssoUrl(path) {
  const url = new URL(path, SSO_ORIGIN);
  for (const [key, value] of Object.entries({
    aid: SSO_AID, account_sdk_source: 'sso', sdk_version: SSO_SDK_VERSION, language: 'zh',
  })) url.searchParams.set(key, value);
  return url.toString();
}

// PICO's passport encodes account fields as hex bytes XOR 5. This is the same
// encoding used by the headset protocol; it is transport obfuscation, not a
// security boundary.
function encodeField(value) {
  return [...new TextEncoder().encode(value)]
    .map(byte => (byte ^ 5).toString(16).padStart(2, '0')).join('');
}

function setCookieLines(headers) {
  if (typeof headers.getSetCookie === 'function') {
    const lines = headers.getSetCookie();
    if (lines.length) return lines;
  }
  const single = headers.get('set-cookie');
  return single ? [single] : [];
}

export function collectCookies(headers) {
  const cookies = {};
  for (const line of setCookieLines(headers)) {
    const [pair] = line.split(';', 1);
    const separator = pair?.indexOf('=') ?? -1;
    if (separator > 0) cookies[pair.slice(0, separator)] = pair.slice(separator + 1);
  }
  return cookies;
}

export function sanitizeCookies(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const cookies = {};
  let count = 0;
  for (const [name, cookie] of Object.entries(value)) {
    if (!/^[A-Za-z0-9_.-]{1,64}$/.test(name)) continue;
    if (typeof cookie !== 'string' || cookie.length === 0 || cookie.length > 500) continue;
    if (/[\r\n;]/.test(cookie)) continue;
    cookies[name] = cookie;
    if (++count >= 20) break;
  }
  return cookies;
}

function cookieHeader(cookies) {
  return Object.entries(cookies).map(([name, value]) => `${name}=${value}`).join('; ');
}

// quick_login commonly returns a passport-level session plus a redirect into
// the service (the web store). The store session cookies are issued on that
// service response, so follow the short redirect chain with the same cookie jar
// before declaring the sign-in incomplete.
async function followServiceRedirect(redirectUrl, cookies, fetchImpl) {
  let next = redirectUrl;
  for (let hop = 0; hop < 6 && next; hop += 1) {
    let target;
    try {
      target = new URL(next, SSO_ORIGIN);
    } catch {
      return;
    }
    if (!FOLLOW_HOSTS.has(target.hostname)) return;
    let response;
    try {
      response = await fetchImpl(target, {
        method: 'GET',
        redirect: 'manual',
        headers: {
          Accept: 'text/html,application/xhtml+xml',
          Referer: `${SSO_ORIGIN}/passport`,
          Cookie: cookieHeader(cookies),
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      return;
    }
    Object.assign(cookies, collectCookies(response.headers));
    if (response.status < 300 || response.status >= 400) return;
    const location = response.headers.get('location');
    if (!location) return;
    next = new URL(location, target).toString();
  }
}

async function postForm(url, fields, fetchImpl, cookies = {}) {
  let response;
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json, text/javascript',
        Origin: SSO_ORIGIN,
        Referer: `${SSO_ORIGIN}/passport`,
        ...(Object.keys(cookies).length ? { Cookie: cookieHeader(cookies) } : {}),
      },
      body: new URLSearchParams(fields).toString(),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new DeliveryError('upstream_unreachable', 502);
  }
  // A successful web sign-in is allowed to answer with a redirect carrying
  // the session cookies instead of a JSON body. Do not turn that into an
  // upstream failure before the caller has a chance to read the cookies.
  if (response.status >= 400) {
    throw new DeliveryError('upstream_unreachable', 502, { upstreamStatus: response.status });
  }
  let body = {};
  const text = response.status >= 300 && response.status < 400 ? '' : await response.text();
  if (text.trim()) {
    try {
      body = JSON.parse(text);
    } catch {
      throw new DeliveryError('upstream_invalid_response', 502);
    }
  }
  return { body, headers: response.headers, status: response.status };
}

function ssoFailure(body, fallback = 'account_rejected') {
  const code = body?.error_code;
  if (Number.isInteger(code)) {
    if (code === 7) return new DeliveryError('account_unavailable', 502, { upstreamCode: 7 });
    if (code === 16) return new DeliveryError('account_unavailable', 502, { upstreamCode: 16 });
    if (code === 1202) return new DeliveryError('invalid_code', 400, { upstreamCode: 1202 });
    if (code === 1203) return new DeliveryError('account_rejected', 401, { upstreamCode: 1203 });
    return new DeliveryError(fallback, 401, { upstreamCode: code });
  }
  return new DeliveryError(fallback, 401);
}

export function mobileLoginName(countryCode, mobile) {
  return `+${countryCode} ${mobile}`;
}

function hasSessionCookie(cookies) {
  return SESSION_COOKIE_NAMES.some(name => typeof cookies[name] === 'string' && cookies[name] !== '');
}

export async function sendCnSsoCode(mobile, options = {}, fetchImpl = fetch) {
  const { countryCode = '86' } = options;
  const response = await postForm(ssoUrl('/send_activation_code/v2/'), {
    mix_mode: '1',
    mobile: encodeField(mobileLoginName(countryCode, mobile)),
    type: encodeField('24'),
    is6Digits: '1',
    fixed_mix_mode: '1',
  }, fetchImpl);
  if (response.body?.error_code !== 0) throw ssoFailure(response.body, 'account_unavailable');
  const ticket = response.body?.mobile_ticket;
  if (typeof ticket !== 'string' || !/^mobile_ticket_[A-Za-z0-9]+$/.test(ticket)) {
    throw new DeliveryError('upstream_invalid_response', 502);
  }
  // The official page keeps the short-lived SSO cookies from this request and
  // presents them again on quick_login. Some deployments only issue the final
  // session cookie when that continuity is present.
  return { mobileTicket: ticket, cookies: sanitizeCookies(collectCookies(response.headers)) };
}

export async function loginWithCnSso(mobile, code, options = {}, fetchImpl = fetch) {
  const { countryCode = '86', mobileTicket } = options;
  const requestCookies = sanitizeCookies(options.cookies);
  if (typeof mobileTicket !== 'string' || !/^mobile_ticket_[A-Za-z0-9]+$/.test(mobileTicket)) {
    throw new DeliveryError('code_expired', 400);
  }
  const response = await postForm(ssoUrl('/quick_login/v2/'), {
    mix_mode: '1',
    mobile: encodeField(mobileLoginName(countryCode, mobile)),
    code: encodeField(code),
    mobile_ticket: mobileTicket,
    service: SSO_SERVICE,
    is6Digits: '1',
    fixed_mix_mode: '1',
  }, fetchImpl, requestCookies);
  const body = response.body;
  if (body?.error_code !== 0) throw ssoFailure(body);
  const data = body?.data && typeof body.data === 'object' ? body.data : {};
  const cookies = { ...requestCookies, ...collectCookies(response.headers) };
  const redirectUrl = typeof data.redirect_url === 'string'
    ? data.redirect_url
    : typeof body?.redirect_url === 'string' ? body.redirect_url : '';
  if (redirectUrl) await followServiceRedirect(redirectUrl, cookies, fetchImpl);
  for (const name of SESSION_COOKIE_NAMES) {
    if (typeof data[name] === 'string' && data[name] !== '') cookies[name] = data[name];
  }
  if (data.cookies && typeof data.cookies === 'object') {
    Object.assign(cookies, sanitizeCookies(data.cookies));
  }
  const xToken = response.headers.get('x-tt-token') ?? data.x_tt_token ?? data['x-tt-token'] ?? '';
  const uid = String(
    data.user_id_str ?? data.user_id ?? body?.user_id_str ?? body?.user_id
      ?? cookies.uid_tt ?? cookies.uid_tt_ss ?? '0',
  );
  if (!xToken && !hasSessionCookie(cookies)) {
    throw new DeliveryError('account_session_missing', 502, {
      upstreamStatus: response.status,
      bodyKeys: Object.keys(body).slice(0, 8),
      dataKeys: Object.keys(data).slice(0, 12),
      cookieNames: Object.keys(cookies).slice(0, 12),
      hasXToken: Boolean(xToken),
    });
  }
  return { uid, x_tt_token: xToken, cookies };
}
