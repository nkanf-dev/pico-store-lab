export const PICO_ITEM_ID = '7288745304105664518';
export const PICO_PACKAGE = 'com.vrchat.android';
export const STORE_HOST = 'https://appstore-us.picoxr.com';
export const ACCOUNT_HOST = 'https://matrix-us.picovr.com';
export const OFFICIAL_STORE_URL = `https://store-global.picoxr.com/jp/detail/1/${PICO_ITEM_ID}`;
export interface StoreTarget { itemId: string; packageName: string; name?: string }
export const DEFAULT_TARGET: StoreTarget = { itemId: PICO_ITEM_ID, packageName: PICO_PACKAGE, name: 'VRChat' };

export function validateTarget(target: StoreTarget): StoreTarget {
  if (!target || !/^[0-9]{1,20}$/.test(target.itemId) ||
      !/^[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)+$/.test(target.packageName)) {
    throw new Error('valid PICO item ID and package name required');
  }
  return target;
}

const STORE_VERSION = '401200000';
const DEVICE_NAME = 'A9210';

function parseImageUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && url.hostname ? url.href : null;
  } catch { return null; }
}

export interface RequestSpec {
  url: string;
  method: 'POST';
  headers: Record<string, string>;
  body: string;
}

export interface StoreOptions {
  uid?: string;
  language?: string;
  zone?: string;
  storeHost?: string;
  accountHost?: string;
  webStoreHost?: string;
  webRegion?: string;
  manifestVersionCode?: string;
  deviceName?: string;
  appId?: string;
  clientType?: string;
  passportAid?: string;
  devicePlatform?: string;
}

export interface PicoAuth {
  uid?: string;
  x_tt_token?: string;
  cookies?: Record<string, string>;
}

export interface PublicItem {
  itemId: string;
  packageName: string;
  name: string;
  versionCode: number;
  price: string;
  currency: string;
  iconUrl: string | null;
  coverUrl?: string | null;
  summary?: string;
  description?: string;
  screenshots?: string[];
  publisher?: string;
  genres?: string;
  ageRating?: string;
  supportedPlatforms?: string;
  appVersion?: string;
  score?: number | null;
  officialUrl: string;
  entitlementStatus: number | null;
  offerExists: boolean | null;
}

export interface DownloadInfo {
  itemId: string;
  packageName: string;
  versionCode: number;
  version: string;
  size: number;
  md5: string;
  url: string;
}

export interface SearchItem extends StoreTarget {
  name: string;
  versionCode: number | null;
  price: string;
  iconUrl: string | null;
}

export interface SearchResults { items: SearchItem[]; nextId: number | null }

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid PICO response');
  return value as Record<string, unknown>;
}

export function parseOfficialJson(text: string): unknown {
  // PICO IDs exceed JS Number.MAX_SAFE_INTEGER; the JSON token source is exact.
  return JSON.parse(text, (key: string, value: unknown, context?: { source?: string }) => {
    if (['item_id', 'order_id', 'user_id', 'uid'].includes(key) && typeof value === 'number') {
      if (!context?.source) throw new Error('lossless ID parsing is unavailable');
      return context.source;
    }
    return value;
  });
}

function storeUrl(path: string, options: StoreOptions = {}): string {
  const url = new URL(path, options.storeHost ?? STORE_HOST);
  const params = {
    manifest_version_code: options.manifestVersionCode ?? STORE_VERSION,
    device_name: options.deviceName ?? DEVICE_NAME,
    uid: String(options.uid ?? '0'),
    app_id: options.appId ?? '314431',
    app_language: options.language ?? 'ja',
    client_type: options.clientType ?? '1',
    zone_name: options.zone ?? 'Asia/Shanghai',
    timestamp: String(Math.floor(Date.now() / 1000)),
  };
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
}

function storeHeaders(language = 'ja'): Record<string, string> {
  return { 'Content-Type': 'application/json', Locale: language };
}

export function makePublicItemRequest(options: StoreOptions = {}, target: StoreTarget = DEFAULT_TARGET): RequestSpec {
  validateTarget(target);
  return {
    url: storeUrl('/api/app/v1/item/info', options),
    method: 'POST',
    headers: storeHeaders(options.language),
    body: JSON.stringify({ package_name: target.packageName }),
  };
}

export function makeAccountItemRequest(auth: PicoAuth, options: StoreOptions, target: StoreTarget): RequestSpec {
  const request = makePublicItemRequest({ ...options, uid: auth.uid ?? '0' }, target);
  return { ...request, headers: { ...request.headers, ...authHeaders(auth) } };
}

function authHeaders(auth: PicoAuth): Record<string, string> {
  if (!auth.x_tt_token && !Object.keys(auth.cookies ?? {}).length) throw new Error('authenticated PICO session required');
  const headers: Record<string, string> = {};
  if (auth.x_tt_token) headers['X-Tt-Token'] = auth.x_tt_token;
  if (auth.cookies) headers.Cookie = Object.entries(auth.cookies).map(([key, value]) => `${key}=${value}`).join('; ');
  return headers;
}

export function makeFreeAcquisitionRequest(auth: PicoAuth, item: PublicItem, options: StoreOptions = {}): RequestSpec {
  if (!/^0(?:\.0+)?$/.test(item.price) || !item.currency) throw new Error('free app price and currency required');
  return {
    url: storeUrl('/api/app/v1/item/price', { ...options, uid: auth.uid ?? '0' }), method: 'POST',
    headers: { ...storeHeaders(options.language), ...authHeaders(auth) },
    body: `{"item_id":${item.itemId},"is_free_entitlment":true,"currency":${JSON.stringify(item.currency)},"amount":${JSON.stringify(item.price)},"support_cross_pay":false}`,
  };
}

export function parseFreeAcquisition(response: unknown): string {
  const root = object(response);
  if (root.code !== 0) throw new Error(`PICO free acquisition failed: ${String(root.code)}`);
  const data = object(root.data);
  const id = String(data.order_id ?? '');
  if (data.free !== true || !/^[1-9][0-9]*$/.test(id)) throw new Error('PICO did not confirm a free order');
  return id;
}

export function makeSearchRequest(word: string, options: StoreOptions = {}, nextId = 1): RequestSpec {
  if (typeof word !== 'string' || !word.trim() || word.length > 100) throw new Error('search word required');
  if (!Number.isSafeInteger(nextId) || nextId < 1) throw new Error('invalid search page');
  return {
    url: storeUrl('/api/app/v2/search/aggregation', options), method: 'POST',
    headers: storeHeaders(options.language),
    body: JSON.stringify({ word: word.trim(), pageable: { next_id: nextId, size: 20 } }),
  };
}

export function parseSearchResults(response: unknown): SearchResults {
  const root = object(response);
  if (root.code !== 0) throw new Error('PICO search failed');
  const data = object(root.data);
  if (!Array.isArray(data.search_list)) throw new Error('PICO search failed');
  const seen = new Set<string>();
  const items: SearchItem[] = [];
  let nextId: number | null = null;
  for (const groupValue of data.search_list) {
    const group = object(groupValue);
    for (const itemValue of Array.isArray(group.items) ? group.items : []) {
      const item = object(itemValue);
      const itemId = String(item.item_id ?? '');
      const packageName = item.package_name;
      if (!/^[0-9]{1,20}$/.test(itemId) || typeof packageName !== 'string' ||
          !/^[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)+$/.test(packageName) || seen.has(itemId)) continue;
      seen.add(itemId);
      const cover = item.cover && typeof item.cover === 'object' ? item.cover as Record<string, unknown> : null;
      items.push({ itemId, packageName, name: String(item.name || packageName),
        versionCode: Number.isSafeInteger(item.version_code) ? item.version_code as number : null,
        price: String(item.price ?? ''),
        iconUrl: parseImageUrl(cover?.square) });
    }
    if (group.has_more && Number.isSafeInteger(group.next_id) && (group.next_id as number) > 0)
      nextId ??= group.next_id as number;
  }
  return { items, nextId };
}

function checkItem(data: Record<string, unknown>, target: StoreTarget): void {
  if (String(data.item_id) !== target.itemId || data.package_name !== target.packageName) {
    throw new Error('PICO returned an unexpected item or package');
  }
}

export function parsePublicItem(response: unknown, target: StoreTarget = DEFAULT_TARGET, options: StoreOptions = {}): PublicItem {
  validateTarget(target);
  const root = object(response);
  if (root.code !== 0) throw new Error(`PICO item lookup failed: ${String(root.code ?? 'invalid response')}`);
  const data = object(root.data);
  checkItem(data, target);
  if (!Number.isSafeInteger(data.version_code) || (data.version_code as number) <= 0) {
    throw new Error('PICO returned an invalid version code');
  }
  const cover = data.cover && typeof data.cover === 'object' ? data.cover as Record<string, unknown> : {};
  const detail = data.detail && typeof data.detail === 'object' ? data.detail as Record<string, unknown> : {};
  const description = data.description && typeof data.description === 'object' ? data.description as Record<string, unknown> : {};
  const ageRating = data.age_rating && typeof data.age_rating === 'object' ? data.age_rating as Record<string, unknown> : {};
  return {
    itemId: target.itemId,
    packageName: target.packageName,
    name: String(data.name || target.name || target.packageName),
    versionCode: data.version_code as number,
    price: String(data.price ?? ''),
    currency: String(data.currency ?? ''),
    iconUrl: parseImageUrl(data.icon),
    coverUrl: parseImageUrl(cover.landscape) ?? parseImageUrl(cover.square),
    summary: typeof data.abstract === 'string' ? data.abstract : '',
    description: typeof description.app_description === 'string' ? description.app_description : '',
    screenshots: Array.isArray(data.images) ? data.images.flatMap(image => {
      const url = parseImageUrl(image && typeof image === 'object' ? (image as Record<string, unknown>).image_url : null);
      return url ? [url] : [];
    }) : [],
    publisher: String(detail.app_publisher ?? ''),
    genres: String(detail.app_genres ?? ''),
    ageRating: String(ageRating.name ?? ''),
    supportedPlatforms: String(detail.app_supported_platforms ?? ''),
    appVersion: String(detail.app_version ?? ''),
    score: typeof data.score === 'number' && Number.isFinite(data.score) && data.score > 0 ? data.score : null,
    officialUrl: `${(options.webStoreHost ?? 'https://store-global.picoxr.com').replace(/\/$/, '')}/${options.webRegion ?? 'global'}/detail/1/${target.itemId}`,
    entitlementStatus: Number.isInteger(data.entitlement_status) ? data.entitlement_status as number : null,
    offerExists: typeof data.is_offer_exist === 'boolean' ? data.is_offer_exist : null,
  };
}

export function encodeAccountField(value: string): string {
  return [...new TextEncoder().encode(value)]
    .map(byte => (byte ^ 5).toString(16).padStart(2, '0')).join('');
}

export function makeAccountRequest(kind: 'send-code' | 'login', email: string, code?: string, options: StoreOptions = {}): RequestSpec {
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('valid email required');
  if (kind === 'login' && !code) throw new Error('verification code required');
  const path = kind === 'send-code' ? '/passport/email/send_code/' : '/passport/app/email/code_login/';
  const url = new URL(path, options.accountHost ?? ACCOUNT_HOST);
  for (const [key, value] of Object.entries({
    multi_login: '1', account_sdk_source: 'app', 'passport-sdk-version': '30490',
    aid: options.passportAid ?? '308733', device_platform: options.devicePlatform ?? 'android',
  })) url.searchParams.set(key, value);
  const fields: Record<string, string> = kind === 'send-code'
    ? { email: encodeAccountField(email), type: encodeAccountField('13'), email_logic_type: '0', mix_mode: '1' }
    : { email: encodeAccountField(email), ect_type: '13', code: encodeAccountField(code ?? ''), mix_mode: '1', email_logic_type: '0' };
  return { url: url.toString(), method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields).toString() };
}

export function makeDownloadInfoRequest(auth: PicoAuth, options: StoreOptions = {}, target: StoreTarget = DEFAULT_TARGET): RequestSpec {
  validateTarget(target);
  const headers = storeHeaders(options.language);
  Object.assign(headers, authHeaders(auth));
  return {
    url: storeUrl('/api/app/v1/download/info', { ...options, uid: auth.uid ?? '0' }),
    method: 'POST',
    headers,
    body: `{"item_id":${target.itemId},"package_name":"${target.packageName}"}`,
  };
}

export function parseDownloadInfo(response: unknown, target: StoreTarget = DEFAULT_TARGET): DownloadInfo {
  validateTarget(target);
  const root = object(response);
  if (root.code !== 0) throw new Error(`PICO download info failed: ${String(root.code ?? 'invalid response')}`);
  const data = object(root.data);
  const pkg = object(data.package);
  if (String(data.item_id) !== target.itemId || pkg.package_name !== target.packageName) {
    throw new Error('PICO returned an unexpected download package');
  }
  if (!Number.isSafeInteger(pkg.version_code) || (pkg.version_code as number) <= 0 ||
      !Number.isSafeInteger(pkg.size) || (pkg.size as number) <= 0 ||
      typeof pkg.md5 !== 'string' || !/^[a-f0-9]{32}$/i.test(pkg.md5) ||
      typeof pkg.path !== 'string' || !pkg.path.startsWith('https://')) {
    throw new Error('PICO returned incomplete APK metadata');
  }
  return {
    itemId: target.itemId, packageName: target.packageName,
    versionCode: pkg.version_code as number, version: String(pkg.version ?? ''),
    size: pkg.size as number, md5: pkg.md5.toLowerCase(), url: pkg.path,
  };
}
