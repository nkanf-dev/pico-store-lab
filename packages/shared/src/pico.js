export const PICO_ITEM_ID = '7288745304105664518';
export const PICO_PACKAGE = 'com.vrchat.android';
export const STORE_HOST = 'https://appstore-us.picoxr.com';
export const ACCOUNT_HOST = 'https://matrix-us.picovr.com';
export const OFFICIAL_STORE_URL = `https://store-global.picoxr.com/jp/detail/1/${PICO_ITEM_ID}`;
export const DEFAULT_TARGET = Object.freeze({ itemId: PICO_ITEM_ID, packageName: PICO_PACKAGE, name: 'VRChat' });

export function validateTarget(target) {
  if (!target || !/^[0-9]{1,20}$/.test(target.itemId) ||
      !/^[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)+$/.test(target.packageName)) {
    throw new Error('valid PICO item ID and package name required');
  }
  return target;
}

const STORE_VERSION = '401200000';
const DEVICE_NAME = 'A9210';

function parseImageUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && url.hostname ? url.href : null;
  } catch { return null; }
}

export function parseOfficialJson(text) {
  // PICO's item_id is above Number.MAX_SAFE_INTEGER. Preserve its decimal source.
  return JSON.parse(text, (key, value, context) => {
    if (['item_id', 'order_id', 'user_id', 'uid'].includes(key) && typeof value === 'number') {
      if (!context?.source) throw new Error('lossless ID parsing is unavailable');
      return context.source;
    }
    return value;
  });
}

function storeUrl(path, options = {}) {
  const { uid = '0', language = 'ja', zone = 'Asia/Shanghai' } = options;
  const url = new URL(path, options.storeHost ?? STORE_HOST);
  const params = {
    manifest_version_code: options.manifestVersionCode ?? STORE_VERSION,
    device_name: options.deviceName ?? DEVICE_NAME,
    uid: String(uid),
    app_id: options.appId ?? '314431',
    app_language: language,
    client_type: options.clientType ?? '1',
    zone_name: zone,
    timestamp: String(Math.floor(Date.now() / 1000)),
  };
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
}

function storeHeaders(language = 'ja') {
  return { 'Content-Type': 'application/json', Locale: language };
}

export function makePublicItemRequest(options = {}, target = DEFAULT_TARGET) {
  validateTarget(target);
  const language = options.language ?? 'ja';
  return {
    url: storeUrl('/api/app/v1/item/info', options),
    method: 'POST',
    headers: storeHeaders(language),
    body: JSON.stringify({ package_name: target.packageName }),
  };
}

function authHeaders(auth) {
  if (!auth || (!auth.x_tt_token && !Object.keys(auth.cookies ?? {}).length)) throw new Error('authenticated PICO session required');
  const headers = {};
  if (auth.x_tt_token) headers['X-Tt-Token'] = auth.x_tt_token;
  if (auth.cookies) headers.Cookie = Object.entries(auth.cookies).map(([key, value]) => `${key}=${value}`).join('; ');
  return headers;
}

export function makeAccountItemRequest(auth, options = {}, target = DEFAULT_TARGET) {
  const request = makePublicItemRequest({ ...options, uid: auth.uid ?? '0' }, target);
  return { ...request, headers: { ...request.headers, ...authHeaders(auth) } };
}

export function makeFreeAcquisitionRequest(auth, item, options = {}) {
  if (!/^0(?:\.0+)?$/.test(item.price) || !item.currency) throw new Error('free app price and currency required');
  return { url: storeUrl('/api/app/v1/item/price', { ...options, uid: auth.uid ?? '0' }), method: 'POST',
    headers: { ...storeHeaders(options.language), ...authHeaders(auth) },
    body: `{"item_id":${item.itemId},"is_free_entitlment":true,"currency":${JSON.stringify(item.currency)},"amount":${JSON.stringify(item.price)},"support_cross_pay":false}` };
}

export function parseFreeAcquisition(response) {
  if (response?.code !== 0 || response?.data?.free !== true ||
      !/^[1-9][0-9]*$/.test(String(response.data.order_id ?? ''))) throw new Error('PICO did not confirm a free order');
  return String(response.data.order_id);
}

export function makeSearchRequest(word, options = {}, nextId = 1) {
  if (typeof word !== 'string' || !word.trim() || word.length > 100) throw new Error('search word required');
  if (!Number.isSafeInteger(nextId) || nextId < 1) throw new Error('invalid search page');
  return {
    url: storeUrl('/api/app/v2/search/aggregation', options),
    method: 'POST',
    headers: storeHeaders(options.language),
    body: JSON.stringify({ word: word.trim(), pageable: { next_id: nextId, size: 20 } }),
  };
}

export function parseSearchResults(response) {
  if (response?.code !== 0 || !Array.isArray(response?.data?.search_list)) {
    throw new Error('PICO search failed');
  }
  const seen = new Set();
  const items = [];
  let nextId = null;
  for (const group of response.data.search_list) {
    for (const item of group.items ?? []) {
      const itemId = String(item.item_id ?? '');
      if (!/^[0-9]{1,20}$/.test(itemId) || !/^[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)+$/.test(item.package_name ?? '') || seen.has(itemId)) continue;
      seen.add(itemId);
      items.push({ itemId, packageName: item.package_name, name: String(item.name || item.package_name),
        versionCode: Number.isSafeInteger(item.version_code) ? item.version_code : null,
        price: String(item.price ?? ''),
        iconUrl: parseImageUrl(item.cover?.square) });
    }
    if (group.has_more && Number.isSafeInteger(group.next_id) && group.next_id > 0) nextId ??= group.next_id;
  }
  return { items, nextId };
}

function checkItem(data, target) {
  if (String(data?.item_id) !== target.itemId || data?.package_name !== target.packageName) {
    throw new Error('PICO returned an unexpected item or package');
  }
}

export function parsePublicItem(response, target = DEFAULT_TARGET, options = {}) {
  validateTarget(target);
  if (response?.code !== 0) throw new Error(`PICO item lookup failed: ${response?.code ?? 'invalid response'}`);
  const data = response.data;
  checkItem(data, target);
  if (!Number.isSafeInteger(data.version_code) || data.version_code <= 0) {
    throw new Error('PICO returned an invalid version code');
  }
  return {
    itemId: target.itemId,
    packageName: target.packageName,
    name: String(data.name || target.name || target.packageName),
    versionCode: data.version_code,
    price: String(data.price ?? ''),
    currency: String(data.currency ?? ''),
    iconUrl: parseImageUrl(data.icon),
    officialUrl: `${(options.webStoreHost ?? 'https://store-global.picoxr.com').replace(/\/$/, '')}/${options.webRegion ?? 'global'}/detail/1/${target.itemId}`,
    entitlementStatus: Number.isInteger(data.entitlement_status) ? data.entitlement_status : null,
    offerExists: typeof data.is_offer_exist === 'boolean' ? data.is_offer_exist : null,
  };
}

export function encodeAccountField(value) {
  return [...new TextEncoder().encode(value)].map(byte => (byte ^ 5).toString(16).padStart(2, '0')).join('');
}

export function makeAccountRequest(kind, email, code, options = {}) {
  if (typeof email !== 'string' || !/^\S+@\S+\.\S+$/.test(email)) throw new Error('valid email required');
  if (kind !== 'send-code' && kind !== 'login') throw new Error('unknown account action');
  if (kind === 'login' && (!code || typeof code !== 'string')) throw new Error('verification code required');
  const path = kind === 'send-code' ? '/passport/email/send_code/' : '/passport/app/email/code_login/';
  const url = new URL(path, options.accountHost ?? ACCOUNT_HOST);
  for (const [key, value] of Object.entries({
    multi_login: '1', account_sdk_source: 'app', 'passport-sdk-version': '30490',
    aid: options.passportAid ?? '308733', device_platform: options.devicePlatform ?? 'android',
  })) url.searchParams.set(key, value);
  const fields = kind === 'send-code'
    ? { email: encodeAccountField(email), type: encodeAccountField('13'), email_logic_type: '0', mix_mode: '1' }
    : { email: encodeAccountField(email), ect_type: '13', code: encodeAccountField(code), mix_mode: '1', email_logic_type: '0' };
  return {
    url: url.toString(), method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields).toString(),
  };
}

export function makeDownloadInfoRequest(auth, options = {}, target = DEFAULT_TARGET) {
  validateTarget(target);
  const language = options.language ?? 'ja';
  const headers = storeHeaders(language);
  Object.assign(headers, authHeaders(auth));
  return {
    url: storeUrl('/api/app/v1/download/info', { ...options, uid: auth.uid ?? '0' }),
    method: 'POST', headers,
    // Preserve the 64-bit decimal item ID in the JSON number, not an imprecise JS Number.
    body: `{"item_id":${target.itemId},"package_name":"${target.packageName}"}`,
  };
}

export function parseDownloadInfo(response, target = DEFAULT_TARGET) {
  validateTarget(target);
  if (response?.code !== 0) throw new Error(`PICO download info failed: ${response?.code ?? 'invalid response'}`);
  const data = response.data;
  if (String(data?.item_id) !== target.itemId || data?.package?.package_name !== target.packageName) {
    throw new Error('PICO returned an unexpected download package');
  }
  const pkg = data.package;
  if (!Number.isSafeInteger(pkg.version_code) || pkg.version_code <= 0 ||
      !Number.isSafeInteger(pkg.size) || pkg.size <= 0 ||
      !/^[a-f0-9]{32}$/i.test(pkg.md5 ?? '') ||
      typeof pkg.path !== 'string' || !pkg.path.startsWith('https://')) {
    throw new Error('PICO returned incomplete APK metadata');
  }
  return {
    itemId: target.itemId, packageName: target.packageName,
    versionCode: pkg.version_code, version: String(pkg.version ?? ''),
    size: pkg.size, md5: pkg.md5.toLowerCase(), url: pkg.path,
  };
}
