import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { PICO_ITEM_ID } from '@nkanf-dev/pico-store-sdk/pico';
import { Md5, md5Hex } from '../public/md5.js';
import { apkResponse } from '../src/delivery.js';
import { openLocalD1 } from '../src/local-db.js';
import worker, { checkForRelease } from '../src/worker.js';
import { readReleaseState, recordReleaseFailure, recordReleaseSuccess } from '../src/store.js';

const product = {
  itemId: PICO_ITEM_ID, packageName: 'com.vrchat.android', name: 'VRChat',
  price: '0', officialUrl: 'https://store-global.picoxr.com/jp/detail/1/7288745304105664518',
  versionCode: 972240,
};

const SESSION_SECRET = 'test-session-secret-with-enough-length';
const APK_BYTES = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x50, 0x4b, 0x01, 0x02]);
const APK_MD5 = md5Hex(APK_BYTES);
const SECOND_ITEM_ID = '7270207384512020485';

function testEnv(extra = {}) {
  return { DB: openLocalD1(), SESSION_SECRET, ...extra };
}

const request = (path, init) => new Request(`https://example.test${path}`, init);
const json = (body, init = {}) => ({ method: 'POST', body: JSON.stringify(body), ...init });

async function withFetch(stub, run) {
  const original = globalThis.fetch;
  globalThis.fetch = stub;
  try {
    return await run();
  } finally {
    globalThis.fetch = original;
  }
}

function upstreamStub(overrides = {}) {
  const state = {
    entitlement: overrides.entitlement ?? 1, price: '0', currency: 'JPY', offerExists: true,
    size: APK_BYTES.length, md5: APK_MD5, versionCode: 972240, apkStatus: 200,
    downloadInfoCode: 0, itemCode: 0,
    itemId: PICO_ITEM_ID, packageName: 'com.vrchat.android', name: 'VRChat', ...overrides,
  };
  const calls = [];
  const stub = async (url, init = {}) => {
    const target = String(url);
    calls.push({ url: target, body: init.body ?? null, headers: init.headers ?? {} });
    if (target.includes('/passport/email/send_code/')) return new Response('{"message":"success","data":{}}');
    if (target.includes('/passport/app/email/code_login/')) {
      return new Response('{"message":"success","data":{"user_id_str":"4711"}}', {
        headers: { 'x-tt-token': 'token-abc', 'set-cookie': 'sid=xyz; Path=/; HttpOnly' },
      });
    }
    if (target.includes('/api/app/v1/item/info')) {
      return new Response(`{"code":${state.itemCode},"data":{"item_id":${state.itemId},"package_name":"${state.packageName}","name":"${state.name}","price":"${state.price}","currency":"${state.currency}","version_code":${state.versionCode},"entitlement_status":${state.entitlement},"is_offer_exist":${state.offerExists}}}`);
    }
    if (target.includes('/api/app/v1/item/price')) {
      if (state.grantOnAcquire) state.entitlement = 1;
      return new Response(`{"code":0,"data":{"free":true,"order_id":9001}}`);
    }
    if (target.includes('/api/app/v1/download/info')) {
      return new Response(`{"code":${state.downloadInfoCode},"data":{"item_id":${state.itemId},"package":{"package_name":"${state.packageName}","version_code":${state.versionCode},"version":"1.2.3","size":${state.size},"md5":"${state.md5}","path":"https://cdn.picoxr.com/apk/vrchat.apk"}}}`);
    }
    if (target.includes('cdn.picoxr.com')) {
      const partial = state.apkStatus === 206;
      return new Response(partial ? APK_BYTES.subarray(0, 4) : APK_BYTES, {
        status: state.apkStatus,
        headers: {
          'content-length': String(partial ? 4 : APK_BYTES.length),
          ...(partial ? { 'content-range': `bytes 0-3/${APK_BYTES.length}` } : {}),
        },
      });
    }
    throw new Error(`unexpected upstream request: ${target}`);
  };
  return { stub, calls, state };
}

async function signIn(env, email = 'player@example.com') {
  const response = await worker.fetch(request('/api/account/login', json({ email, code: '123456' })), env);
  assert.equal(response.status, 200);
  return response.headers.get('set-cookie').split(';')[0];
}

test('player path links the website to the repo, guide, and client release', () => {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const script = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const english = readFileSync(new URL('../../../README.md', import.meta.url), 'utf8');
  const chinese = readFileSync(new URL('../../../README.zh-CN.md', import.meta.url), 'utf8');
  assert.match(html, /href="https:\/\/github\.com\/nkanf-dev\/pico-store-lab"/);
  assert.match(html, /id="guide-link"/);
  assert.match(html, /href="https:\/\/github\.com\/nkanf-dev\/pico-store-lab\/releases\/latest"/);
  assert.match(script, /README\.zh-CN\.md#player-guide/);
  for (const guide of [english, chinese]) {
    assert.match(guide, /<a id="player-guide"><\/a>/);
    assert.match(guide, /send-code --email you@example\.com/);
    assert.match(guide, /search 'YouTube VR'/);
    assert.match(guide, /download --item-id 7270207384512020485/);
  }
});

test('web downloader is wired into the page, script, and guide', () => {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const script = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  for (const id of ['account-form', 'send-code', 'sign-in', 'download-card', 'download-apk', 'download-direct', 'verify-file', 'sign-out']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /id="download-apk"[^>]*download/);
  assert.match(script, /\/api\/download\/info/);
  assert.match(script, /md5File\(/);
  for (const readme of ['../../../README.md', '../../../README.zh-CN.md']) {
    assert.match(readFileSync(new URL(readme, import.meta.url), 'utf8'), /Download APK in the browser|网页上下载 APK/);
  }
});

test('the page, the script, and both locales stay in agreement', () => {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const source = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const htmlIds = new Set([...html.matchAll(/id="([^"]+)"/g)].map(match => match[1]));
  for (const [, name] of source.matchAll(/\$\('([^']+)'\)/g)) {
    assert.ok(htmlIds.has(name), `app.js references #${name}, which index.html does not define`);
  }
  const start = source.indexOf('const translations = {');
  const literal = source.slice(source.indexOf('{', start), source.indexOf('\n};', start) + 3);
  const translations = new Function(`return ${literal}`)(); // string-only literal
  const english = new Set(Object.keys(translations.en));
  const chinese = new Set(Object.keys(translations['zh-CN']));
  assert.deepEqual([...english].sort(), [...chinese].sort(), 'both locales must define the same keys');
  const errorBlock = source.slice(source.indexOf('const ERROR_KEYS = {'));
  const used = new Set([
    ...[...html.matchAll(/data-i18n(?:-placeholder)?="([^"]+)"/g)].map(match => match[1]),
    ...[...source.matchAll(/\bt\('([A-Za-z0-9_]+)'\)/g)].map(match => match[1]),
    ...[...errorBlock.slice(0, errorBlock.indexOf('\n};')).matchAll(/: '([A-Za-z0-9_]+)'/g)].map(match => match[1]),
  ]);
  assert.ok(used.size > 40, `expected a meaningful key set, got ${used.size}`);
  for (const key of used) assert.ok(english.has(key), `missing translation key: ${key}`);
});

test('MD5 matches the RFC 1321 vectors and node:crypto on a large buffer', () => {
  const encoder = new TextEncoder();
  const vectors = [
    ['', 'd41d8cd98f00b204e9800998ecf8427e'],
    ['a', '0cc175b9c0f1b6a831c399e269772661'],
    ['abc', '900150983cd24fb0d6963f7d28e17f72'],
    ['message digest', 'f96b697d7cb7938d525a2f31aaf161d0'],
    ['abcdefghijklmnopqrstuvwxyz', 'c3fcd3d76192e4007dfb496cca67e13b'],
    ['ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789', 'd174ab98d277d9f5a5611c2c9f419d9f'],
    ['12345678901234567890123456789012345678901234567890123456789012345678901234567890', '57edf4a22be3c955ac49da2e2107b67a'],
  ];
  for (const [input, expected] of vectors) assert.equal(md5Hex(encoder.encode(input)), expected);
  const size = 1024 * 1024 + 37;
  const buffer = new Uint8Array(size);
  for (let index = 0; index < size; index++) buffer[index] = (index * 31 + (index >> 8)) & 0xff;
  const expected = createHash('md5').update(buffer).digest('hex');
  assert.equal(md5Hex(buffer), expected);
  const hasher = new Md5();
  for (let offset = 0; offset < size; offset += 999) hasher.update(buffer.subarray(offset, Math.min(offset + 999, size)));
  assert.equal(hasher.hex(), expected);
  assert.equal(hasher.hex(), expected, 'hex() stays repeatable');
});

function publicResponse(versionCode = 972240) {
  const body = `{"code":0,"data":{"item_id":${PICO_ITEM_ID},"package_name":"com.vrchat.android","name":"VRChat","price":"0","version_code":${versionCode}}}`;
  return new Response(body, { status: 200 });
}

test('scheduled check stores and serves a public release snapshot', async () => {
  const db = openLocalD1();
  try {
    const env = { DB: db };
    const result = await checkForRelease(env, async () => publicResponse(), () => new Date('2026-09-18T01:00:00Z'));
    assert.equal(result.ok, true);
    assert.equal(result.state.latestVersionCode, 972240);
    await checkForRelease(env, async () => publicResponse(), () => new Date('2026-09-19T01:00:00Z'));
    const response = await worker.fetch(new Request('https://example.test/api/releases'), env);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).releases.length, 1);
  } finally { db.close(); }
});

test('tracking stays independent for a second catalog app', async () => {
  const db = openLocalD1();
  const target = { itemId: SECOND_ITEM_ID, packageName: 'com.google.android.apps.youtube.vr.pico', name: 'YouTube VR' };
  try {
    const env = { DB: db };
    const response = () => new Response(`{"code":0,"data":{"item_id":${SECOND_ITEM_ID},"package_name":"com.google.android.apps.youtube.vr.pico","name":"YouTube VR","version_code":18713000,"price":"0"}}`);
    await checkForRelease(env, async () => response(), () => new Date('2026-09-18T02:00:00Z'), target);
    assert.equal((await readReleaseState(db, target.itemId)).latestVersionCode, 18713000);
    assert.equal(await readReleaseState(db), null);
    const api = await worker.fetch(new Request('https://example.test/api/catalog'), env);
    const entries = await api.json();
    assert.equal(entries.length, 3);
    assert.equal(entries[1].state.name, 'YouTube VR');
  } finally { db.close(); }
});

test('atomic writes retain higher version and prevent an old failure from hiding success', async () => {
  const db = openLocalD1();
  try {
    await recordReleaseSuccess(db, product, '2026-09-18T01:00:00Z');
    await recordReleaseSuccess(db, { ...product, versionCode: 980000 }, '2026-09-18T02:00:00Z');
    await recordReleaseSuccess(db, { ...product, name: 'Outdated metadata' }, '2026-09-18T02:30:00Z');
    await recordReleaseFailure(db, '2026-09-18T01:30:00Z', '2026-09-18T03:00:00Z');
    const state = await readReleaseState(db);
    assert.equal(state.latestVersionCode, 980000);
    assert.equal(state.name, 'VRChat');
    assert.deepEqual(state.releases.map(release => release.versionCode), [972240, 980000]);
    assert.equal(state.stale, false);
    await recordReleaseFailure(db, '2026-09-18T03:30:00Z', '2026-09-18T04:00:00Z');
    assert.equal((await readReleaseState(db)).stale, true);
  } finally { db.close(); }
});

test('unconfigured release database does not claim a live result', async () => {
  const response = await worker.fetch(new Request('https://example.test/api/releases'), {});
  assert.equal(response.status, 503);
});

test('verification codes are proxied once and then throttled per email', async () => {
  const env = testEnv();
  const { stub, calls } = upstreamStub();
  try {
    await withFetch(stub, async () => {
      const invalid = await worker.fetch(request('/api/account/send-code', json({ email: 'not-an-email' })), env);
      assert.equal(invalid.status, 400);
      assert.equal((await invalid.json()).error, 'invalid_email');
      for (let attempt = 0; attempt < 5; attempt++) {
        const sent = await worker.fetch(request('/api/account/send-code', json({ email: 'player@example.com' })), env);
        assert.equal(sent.status, 200);
        assert.equal((await sent.json()).sent, true);
      }
      const throttled = await worker.fetch(request('/api/account/send-code', json({ email: 'player@example.com' })), env);
      assert.equal(throttled.status, 429);
      assert.equal((await throttled.json()).error, 'rate_limited');
    });
    assert.equal(calls.filter(call => call.url.includes('/passport/email/send_code/')).length, 5, 'throttled attempts never reach PICO');
    const body = new URLSearchParams(calls[0].body);
    assert.match(body.get('email'), /^[0-9a-f]+$/, 'the email travels XOR-encoded like the mobile client');
  } finally { env.DB.close(); }
});

test('login stores an opaque session and rejects cross-site posts', async () => {
  const env = testEnv();
  const { stub } = upstreamStub();
  try {
    await withFetch(stub, async () => {
      const crossed = await worker.fetch(request('/api/account/login', json({ email: 'a@b.c', code: '123456' }, {
        headers: { Origin: 'https://evil.test' },
      })), env);
      assert.equal(crossed.status, 403);
      assert.equal((await crossed.json()).error, 'origin_rejected');
      const badCode = await worker.fetch(request('/api/account/login', json({ email: 'a@b.c', code: 'abc' })), env);
      assert.equal(badCode.status, 400);
      const anonymous = await worker.fetch(request('/api/account/session'), env);
      assert.deepEqual(await anonymous.json(), { authenticated: false });
      const cookie = await signIn(env);
      const session = await worker.fetch(request('/api/account/session', { headers: { cookie } }), env);
      assert.equal((await session.json()).email, 'player@example.com');
      const row = await env.DB.prepare('SELECT token_hash, credentials, email FROM sessions').bind().first();
      assert.ok(row);
      assert.equal(row.email, 'player@example.com');
      assert.ok(!row.credentials.includes('token-abc'), 'PICO credentials are sealed, not stored in clear');
      assert.ok(!row.token_hash.includes(cookie.split('=')[1]), 'only the cookie hash is stored');
      const loggedOut = await worker.fetch(request('/api/account/logout', json({}, { headers: { cookie } })), env);
      assert.match(loggedOut.headers.get('set-cookie'), /psl_session=;/);
      assert.deepEqual(await (await worker.fetch(request('/api/account/session', { headers: { cookie } }), env)).json(), { authenticated: false });
    });
  } finally { env.DB.close(); }
});

test('a rejected code never creates a session', async () => {
  const env = testEnv();
  const stub = async url => {
    if (String(url).includes('/passport/app/email/code_login/')) return new Response('{"message":"error","data":{}}');
    throw new Error(`unexpected upstream request: ${url}`);
  };
  try {
    await withFetch(stub, async () => {
      const response = await worker.fetch(request('/api/account/login', json({ email: 'player@example.com', code: '000000' })), env);
      assert.equal(response.status, 401);
      assert.equal((await response.json()).error, 'account_rejected');
      assert.equal(response.headers.get('set-cookie'), null);
      assert.equal(await env.DB.prepare('SELECT token_hash FROM sessions').bind().first(), null);
    });
  } finally { env.DB.close(); }
});

test('letter-and-digit email codes reach PICO and create a session', async () => {
  const env = testEnv();
  const { stub, calls } = upstreamStub();
  try {
    await withFetch(stub, async () => {
      const response = await worker.fetch(request('/api/account/login', json({ email: 'player@example.com', code: 'aB3dE9' })), env);
      assert.equal(response.status, 200);
      assert.ok(response.headers.get('set-cookie'));
      assert.equal(calls.filter(call => call.url.includes('/code_login/')).length, 1);
    });
  } finally { env.DB.close(); }
});

test('an HTTP-successful send-code business rejection is not reported as sent', async () => {
  const env = testEnv();
  try {
    await withFetch(async () => Response.json({ message: 'error', data: { error_code: 1105 } }), async () => {
      const response = await worker.fetch(request('/api/account/send-code', json({ email: 'player@example.com' })), env);
      assert.equal(response.status, 502);
      assert.deepEqual(await response.json(), { error: 'account_unavailable' });
    });
  } finally { env.DB.close(); }
});

test('malformed upstream login responses are 502, not rejected credentials', async () => {
  const env = testEnv();
  try {
    await withFetch(async () => new Response('<html>upstream failure</html>'), async () => {
      const response = await worker.fetch(request('/api/account/login', json({ email: 'player@example.com', code: 'aB3dE9' })), env);
      assert.equal(response.status, 502);
      assert.deepEqual(await response.json(), { error: 'upstream_invalid_response' });
      assert.equal(response.headers.get('set-cookie'), null);
    });
  } finally { env.DB.close(); }
});

test('an upstream login body read failure remains an upstream failure', async () => {
  const env = testEnv();
  try {
    await withFetch(async () => new Response(new ReadableStream({
      start(controller) { controller.error(new Error('interrupted body')); },
    })), async () => {
      const response = await worker.fetch(request('/api/account/login', json({ email: 'player@example.com', code: 'aB3dE9' })), env);
      assert.equal(response.status, 502);
      assert.deepEqual(await response.json(), { error: 'upstream_unreachable' });
    });
  } finally { env.DB.close(); }
});

test('downloads require a session and a configured secret, and reject a malformed target', async () => {
  const unconfigured = await worker.fetch(request(`/api/download?itemId=${PICO_ITEM_ID}`), testEnv({ SESSION_SECRET: undefined }));
  assert.equal(unconfigured.status, 503);
  assert.equal((await unconfigured.json()).error, 'session_secret_missing');
  const env = testEnv();
  try {
    const anonymous = await worker.fetch(request(`/api/download?itemId=${PICO_ITEM_ID}`), env);
    assert.equal(anonymous.status, 401);
    assert.equal((await anonymous.json()).error, 'not_authenticated');
    const { stub } = upstreamStub();
    await withFetch(stub, async () => {
      const cookie = await signIn(env);
      for (const [query, error] of [
        ['itemId=not-an-id&package=x.y', 'invalid_item_id'],
        ['itemId=1234567890123456789', 'invalid_package'],
        [`itemId=${PICO_ITEM_ID}&package=not-a-package`, 'invalid_package'],
      ]) {
        const response = await worker.fetch(request(`/api/download?${query}`, { headers: { cookie } }), env);
        assert.equal(response.status, 400, query);
        assert.equal((await response.json()).error, error, query);
      }
    });
  } finally { env.DB.close(); }
});

test('an app outside our catalog downloads with its package name', async () => {
  const env = testEnv();
  const { stub, calls } = upstreamStub({
    itemId: '1234567890123456789', packageName: 'com.example.delisted', name: 'Delisted App',
  });
  try {
    await withFetch(stub, async () => {
      const cookie = await signIn(env);
      const info = await worker.fetch(
        request('/api/download/info?itemId=1234567890123456789&package=com.example.delisted', { headers: { cookie } }), env,
      );
      assert.equal(info.status, 200);
      const metadata = await info.json();
      assert.equal(metadata.name, 'Delisted App');
      assert.equal(metadata.packageName, 'com.example.delisted');
      assert.equal(metadata.fileName, 'com.example.delisted-972240.apk');
      assert.equal(calls.some(call => call.url.includes('/api/app/v1/download/info')), true);
    });
  } finally { env.DB.close(); }
});

test('an entitled free app streams the APK with verifiable metadata', async () => {
  const env = testEnv();
  const { stub, calls } = upstreamStub();
  try {
    await withFetch(stub, async () => {
      const cookie = await signIn(env);
      const info = await worker.fetch(request(`/api/download/info?itemId=${PICO_ITEM_ID}`, { headers: { cookie } }), env);
      assert.equal(info.status, 200);
      const metadata = await info.json();
      assert.equal(metadata.available, true);
      assert.equal(metadata.md5, APK_MD5);
      assert.equal(metadata.size, APK_BYTES.length);
      assert.equal(metadata.fileName, 'com.vrchat.android-972240.apk');
      assert.equal(metadata.downloadUrl, `/api/download?itemId=${PICO_ITEM_ID}&package=com.vrchat.android`);
      assert.equal(metadata.directUrl, 'https://cdn.picoxr.com/apk/vrchat.apk');

      const apk = await worker.fetch(request(`/api/download?itemId=${PICO_ITEM_ID}`, { headers: { cookie } }), env);
      assert.equal(apk.status, 200);
      assert.equal(apk.headers.get('content-type'), 'application/vnd.android.package-archive');
      assert.equal(apk.headers.get('content-disposition'), 'attachment; filename="com.vrchat.android-972240.apk"; filename*=UTF-8\'\'com.vrchat.android-972240.apk');
      assert.equal(apk.headers.get('content-length'), String(APK_BYTES.length));
      assert.equal(apk.headers.get('etag'), `"${APK_MD5}"`);
      assert.equal(apk.headers.get('x-apk-md5'), APK_MD5);
      assert.equal(apk.headers.get('digest'), `md5=${Buffer.from(APK_MD5, 'hex').toString('base64')}`);
      assert.equal(apk.headers.get('cache-control'), 'private, no-store');
      assert.deepEqual(new Uint8Array(await apk.arrayBuffer()), APK_BYTES);
      assert.equal(calls.filter(call => call.url.includes('/api/app/v1/item/price')).length, 0, 'an entitled account is never charged');
    });
  } finally { env.DB.close(); }
});

test('GET download routes never acquire an unowned free app', async () => {
  const env = testEnv();
  const { stub, calls } = upstreamStub({ entitlement: 2, grantOnAcquire: true });
  try {
    await withFetch(stub, async () => {
      const cookie = await signIn(env);
      for (const route of ['download/info', 'download', 'download?direct=1']) {
        const separator = route.includes('?') ? '&' : '?';
        const response = await worker.fetch(request(`/api/${route}${separator}itemId=${PICO_ITEM_ID}`, {
          headers: { cookie, 'Sec-Fetch-Site': 'cross-site', 'Sec-Fetch-Mode': 'navigate' },
        }), env);
        assert.equal(response.status, 402, route);
        assert.equal((await response.json()).canAcquire, true);
      }
      assert.equal(calls.filter(call => call.url.includes('/item/price')).length, 0);
      assert.equal(calls.filter(call => call.url.includes('/download/info')).length, 0);
    });
  } finally { env.DB.close(); }
});

test('explicit same-origin acquisition grants a free app before download', async () => {
  const env = testEnv();
  const { stub, calls } = upstreamStub({ entitlement: 2, grantOnAcquire: true });
  try {
    await withFetch(stub, async () => {
      const cookie = await signIn(env);
      const body = { itemId: PICO_ITEM_ID, packageName: 'com.vrchat.android' };
      for (const origin of [undefined, 'https://evil.test', 'null']) {
        const denied = await worker.fetch(request('/api/download/acquire', json(body, {
          headers: { cookie, ...(origin ? { Origin: origin } : {}) },
        })), env);
        assert.equal(denied.status, 403);
      }
      assert.equal(calls.filter(call => call.url.includes('/item/price')).length, 0);
      const acquired = await worker.fetch(request('/api/download/acquire', json(body, {
        headers: { cookie, Origin: 'https://example.test' },
      })), env);
      assert.equal(acquired.status, 200);
      assert.equal((await acquired.json()).available, true);
      const apk = await worker.fetch(request(`/api/download?itemId=${PICO_ITEM_ID}`, { headers: { cookie } }), env);
      assert.equal(apk.status, 200);
      assert.equal(calls.filter(call => call.url.includes('/api/app/v1/item/price')).length, 1);
      assert.match(calls.find(call => call.url.includes('/item/price')).body, /"is_free_entitlment":true/);
      assert.deepEqual(new Uint8Array(await apk.arrayBuffer()), APK_BYTES);
    });
  } finally { env.DB.close(); }
});

test('the direct route hands out PICO\'s own CDN link', async () => {
  const env = testEnv();
  const { stub } = upstreamStub();
  try {
    await withFetch(stub, async () => {
      const cookie = await signIn(env);
      const response = await worker.fetch(
        request(`/api/download?itemId=${PICO_ITEM_ID}&direct=1`, { headers: { cookie } }), env,
      );
      assert.equal(response.status, 302);
      assert.equal(response.headers.get('location'), 'https://cdn.picoxr.com/apk/vrchat.apk');
      assert.equal(response.headers.get('cache-control'), 'private, no-store');
    });
  } finally { env.DB.close(); }
});

test('only direct=1 redirects; false-like or other values still stream', async () => {
  const env = testEnv();
  const { stub } = upstreamStub();
  try {
    await withFetch(stub, async () => {
      const cookie = await signIn(env);
      for (const direct of ['0', 'false', '', '2']) {
        const response = await worker.fetch(request(`/api/download?itemId=${PICO_ITEM_ID}&direct=${direct}`, { headers: { cookie } }), env);
        assert.equal(response.status, 200, direct);
        assert.equal(response.headers.get('location'), null);
        assert.deepEqual(new Uint8Array(await response.arrayBuffer()), APK_BYTES);
      }
    });
  } finally { env.DB.close(); }
});

test('a paid app the account does not own is an account problem, not a policy one', async () => {
  const env = testEnv();
  const { stub, calls } = upstreamStub({ entitlement: 0, price: '19.99' });
  try {
    await withFetch(stub, async () => {
      const cookie = await signIn(env);
      const response = await worker.fetch(request(`/api/download?itemId=${PICO_ITEM_ID}`, { headers: { cookie } }), env);
      assert.equal(response.status, 402);
      assert.deepEqual(await response.json(), { error: 'entitlement_required', reason: 'not_in_account', price: '19.99', canAcquire: false });
      assert.equal(calls.filter(call => call.url.includes('/item/price')).length, 0, 'a paid app is never claimed as if it were free');
    });
  } finally { env.DB.close(); }
});

test('ownership decides access: a paid app already in the account downloads', async () => {
  const env = testEnv();
  const { stub } = upstreamStub({ entitlement: 1, price: '19.99' });
  try {
    await withFetch(stub, async () => {
      const cookie = await signIn(env);
      const apk = await worker.fetch(request(`/api/download?itemId=${PICO_ITEM_ID}`, { headers: { cookie } }), env);
      assert.equal(apk.status, 200);
      assert.deepEqual(new Uint8Array(await apk.arrayBuffer()), APK_BYTES);
    });
  } finally { env.DB.close(); }
});

test('APK size is PICO\'s business, not a distribution gate', async () => {
  const env = testEnv();
  const giant = 900 * 1024 * 1024;
  const { stub } = upstreamStub({ size: giant });
  try {
    await withFetch(stub, async () => {
      const cookie = await signIn(env);
      const info = await worker.fetch(request(`/api/download/info?itemId=${PICO_ITEM_ID}`, { headers: { cookie } }), env);
      assert.equal(info.status, 200);
      assert.equal((await info.json()).size, giant);
      const apk = await worker.fetch(request(`/api/download?itemId=${PICO_ITEM_ID}`, { headers: { cookie } }), env);
      assert.equal(apk.status, 200);
      assert.equal(apk.headers.get('x-apk-size'), String(giant));
    });
  } finally { env.DB.close(); }
});

test('incomplete APK metadata from PICO fails the download', async () => {
  const env = testEnv();
  const { stub } = upstreamStub({ md5: 'not-a-digest' });
  try {
    await withFetch(stub, async () => {
      const cookie = await signIn(env);
      const response = await worker.fetch(request(`/api/download?itemId=${PICO_ITEM_ID}`, { headers: { cookie } }), env);
      assert.equal(response.status, 502);
      assert.equal((await response.json()).error, 'apk_metadata_unavailable');
    });
  } finally { env.DB.close(); }
});

test('range requests resume a partial download', async () => {
  const env = testEnv();
  const { stub } = upstreamStub({ apkStatus: 206 });
  try {
    await withFetch(stub, async () => {
      const cookie = await signIn(env);
      const response = await worker.fetch(request(`/api/download?itemId=${PICO_ITEM_ID}`, {
        headers: { cookie, Range: 'bytes=0-3' },
      }), env);
      assert.equal(response.status, 206);
      assert.equal(response.headers.get('content-range'), `bytes 0-3/${APK_BYTES.length}`);
      assert.equal(response.headers.get('content-length'), '4');
      assert.equal((await response.arrayBuffer()).byteLength, 4);
    });
  } finally { env.DB.close(); }
});

test('If-Range is evaluated against the MD5 ETag before requesting partial bytes', async () => {
  const info = { url: 'https://cdn.example.test/current.apk', md5: APK_MD5, size: APK_BYTES.length, versionCode: 2, version: '2' };
  const etag = `"${APK_MD5}"`;
  for (const [validator, partial] of [
    [etag, true], [null, true], ['"00000000000000000000000000000000"', false],
    [`W/${etag}`, false], ['Thu, 17 Sep 2026 00:00:00 GMT', false],
  ]) {
    const response = await apkResponse(info, 'app.apk', request('/api/download', {
      headers: { Range: 'bytes=4-', ...(validator ? { 'If-Range': validator } : {}) },
    }), async (_url, init) => {
      const range = new Headers(init.headers).get('range');
      assert.equal(Boolean(range), partial, String(validator));
      return new Response(range ? APK_BYTES.subarray(4) : APK_BYTES, {
        status: range ? 206 : 200,
        headers: { 'Content-Length': String(range ? 4 : APK_BYTES.length),
          ...(range ? { 'Content-Range': 'bytes 4-7/8' } : {}) },
      });
    });
    assert.equal(response.status, partial ? 206 : 200);
    assert.equal(response.headers.get('etag'), etag);
    assert.equal((await response.arrayBuffer()).byteLength, partial ? 4 : 8);
  }
});

test('an unreachable PICO CDN fails the download instead of hanging', async () => {
  const env = testEnv();
  const { stub } = upstreamStub();
  const failing = async (url, init) => {
    if (String(url).includes('cdn.picoxr.com')) return new Response('gone', { status: 404 });
    return stub(url, init);
  };
  try {
    await withFetch(failing, async () => {
      const cookie = await signIn(env);
      const response = await worker.fetch(request(`/api/download?itemId=${PICO_ITEM_ID}`, { headers: { cookie } }), env);
      assert.equal(response.status, 502);
      assert.equal((await response.json()).error, 'apk_unavailable');
    });
  } finally { env.DB.close(); }
});
