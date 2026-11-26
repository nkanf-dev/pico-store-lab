// China-region sign-in through PICO's official SSO web flow.
//
// The Matrix "app" SMS endpoint used by the headset is protected by device
// risk control and answers error 7 for browser-originated requests. The SSO
// site (sso.picoxr.com) uses a different web endpoint that performs the same
// human verification the official page does, so a hosted site can complete
// mobile + SMS sign-in without launching a local browser.

import { DeliveryError } from './delivery-error.js';

const SSO_ORIGIN = 'https://sso.picoxr.com';
const SSO_AID = '264297';
const SSO_SDK_VERSION = '2.2.2';
const REQUEST_TIMEOUT_MS = 25_000;

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

function collectCookies(headers) {
  const cookies = {};
  for (const line of setCookieLines(headers)) {
    const [pair] = line.split(';', 1);
    const separator = pair?.indexOf('=') ?? -1;
    if (separator > 0) cookies[pair.slice(0, separator)] = pair.slice(separator + 1);
  }
  return cookies;
}

async function postForm(url, fields, fetchImpl) {
  let response;
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json, text/javascript',
        Origin: SSO_ORIGIN,
        Referer: `${SSO_ORIGIN}/passport`,
      },
      body: new URLSearchParams(fields).toString(),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new DeliveryError('upstream_unreachable', 502);
  }
  if (!response.ok) throw new DeliveryError('upstream_unreachable', 502, { upstreamStatus: response.status });
  let text;
  try {
    text = await response.text();
  } catch {
    throw new DeliveryError('upstream_unreachable', 502);
  }
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new DeliveryError('upstream_invalid_response', 502);
  }
  return { body, headers: response.headers };
}

function ssoFailure(body, fallback = 'account_rejected') {
  const code = body?.error_code;
  if (Number.isInteger(code)) {
    if (code === 7) return new DeliveryError('account_unavailable', 502, { upstreamCode: 7 });
    if (code === 16) return new DeliveryError('account_unavailable', 502, { upstreamCode: 16 });
    if (code === 1202) return new DeliveryError('invalid_code', 400, { upstreamCode: 1202 });
    return new DeliveryError(fallback, 401, { upstreamCode: code });
  }
  return new DeliveryError(fallback, 401);
}

export function mobileLoginName(countryCode, mobile) {
  return `+${countryCode} ${mobile}`;
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
  return { mobileTicket: ticket };
}

export async function loginWithCnSso(mobile, code, options = {}, fetchImpl = fetch) {
  const { countryCode = '86', mobileTicket } = options;
  if (typeof mobileTicket !== 'string' || !/^mobile_ticket_[A-Za-z0-9]+$/.test(mobileTicket)) {
    throw new DeliveryError('code_expired', 400);
  }
  const response = await postForm(ssoUrl('/quick_login/v2/'), {
    mix_mode: '1',
    mobile: encodeField(mobileLoginName(countryCode, mobile)),
    code: encodeField(code),
    mobile_ticket: mobileTicket,
    is6Digits: '1',
    fixed_mix_mode: '1',
  }, fetchImpl);
  const body = response.body;
  if (body?.error_code !== 0) throw ssoFailure(body);
  const data = body?.data && typeof body.data === 'object' ? body.data : {};
  const cookies = collectCookies(response.headers);
  const uid = String(data.user_id_str ?? data.user_id ?? cookies.uid_tt ?? cookies.uid_tt_ss ?? '0');
  const auth = { uid, x_tt_token: response.headers.get('x-tt-token') ?? '', cookies };
  if (!auth.x_tt_token && !cookies.sessionid && !cookies.sessionid_ss && !cookies.sid_tt) {
    throw new DeliveryError('account_session_missing', 502);
  }
  return auth;
}
