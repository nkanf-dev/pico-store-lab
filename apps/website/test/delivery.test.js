import assert from 'node:assert/strict';
import test from 'node:test';
import { apkResponse } from '../src/delivery.js';
const bytes = new Uint8Array([0x50, 0x4b, 3, 4, 5, 6, 7, 8]);
const info = { url: 'https://cdn.example.test/app.apk', size: 99, md5: '0'.repeat(32), versionCode: 1, version: '1' };
const request = headers => new Request('https://example.test/api/download', { headers });

test('stale size and digest metadata does not block completed original bytes', async () => {
  const response = await apkResponse(info, 'app.apk', request(), async () => new Response(bytes, { headers: { 'Content-Length': '8' } }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-length'), '8');
  assert.equal(response.headers.get('x-apk-metadata-notice'), 'size_changed');
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes);
});

test('invalid and wrong-offset resumes recover with a full fetch', async () => {
  for (const [headers, contentRange] of [ [{}, 'bytes 0-3/8'], [{ Range: 'bytes=4-' }, undefined],
    [{ Range: 'bytes=4-' }, 'bytes 0-3/8'], [{ Range: 'bytes=4-5' }, 'bytes 4-7/8'] ]) {
    let attempts = 0;
    const response = await apkResponse(info, 'app.apk', request(headers), async (_url, init) => {
      if (++attempts === 1) return new Response(bytes.subarray(4), { status: 206, headers: contentRange ? { 'Content-Range': contentRange } : {} });
      assert.equal(new Headers(init.headers).get('range'), null);
      return new Response(bytes);
    });
    assert.equal(attempts, 2);
    assert.equal(response.status, 200);
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes);
  }
});

test('CDN ranges use actual total when store metadata differs', async () => {
  const response = await apkResponse(info, 'app.apk', request({ Range: 'bytes=4-' }), async () =>
    new Response(bytes.subarray(4), { status: 206, headers: { 'Content-Range': 'bytes 4-7/8' } }));
  assert.equal(response.headers.get('content-length'), '4');
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes.subarray(4));
});

test('transient CDN errors recover before reporting failure', async () => {
  let attempts = 0;
  const response = await apkResponse(info, 'app.apk', request(), async () => {
    if (++attempts === 1) throw new Error('connection interrupted');
    return new Response(bytes);
  });
  assert.equal(attempts, 2);
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes);
});

test('final CDN error has stage, attempts and status without private link', async () => {
  await assert.rejects(apkResponse(info, 'app.apk', request(), async () => new Response('gone', { status: 403 })), error => {
    assert.deepEqual(error.details, { stage: 'cdn_download', attempts: 2, upstreamStatus: 403, reason: 'apk_unavailable' });
    assert.equal(JSON.stringify(error.details).includes('https:'), false);
    return true;
  });
});


test('a resumed object with stale If-Range metadata restarts instead of mixing versions', async () => {
  let attempts = 0;
  const response = await apkResponse(info, 'app.apk', request({ Range: 'bytes=4-', 'If-Range': `"${info.md5}"` }), async (_url, init) => {
    if (++attempts === 1) return new Response(bytes.subarray(4), { status: 206, headers: { 'Content-Range': 'bytes 4-7/8' } });
    assert.equal(new Headers(init.headers).get('range'), null);
    return new Response(bytes);
  });
  assert.equal(attempts, 2);
  assert.equal(response.status, 200);
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes);
});

test('contradictory CDN range length recovers rather than publishing the wrong response framing', async () => {
  let attempts = 0;
  const response = await apkResponse({ ...info, size: 8 }, 'app.apk', request({ Range: 'bytes=4-' }), async () => {
    if (++attempts === 1) return new Response(bytes.subarray(4), { status: 206,
      headers: { 'Content-Range': 'bytes 4-7/8', 'Content-Length': '8' } });
    return new Response(bytes);
  });
  assert.equal(attempts, 2);
  assert.equal(response.status, 200);
});


test('a later transport failure does not inherit the previous attempt HTTP status', async () => {
  let attempts = 0;
  await assert.rejects(apkResponse(info, 'app.apk', request(), async () => {
    if (++attempts === 1) return new Response('gone', { status: 403 });
    throw new Error('private download URL');
  }), error => {
    assert.equal(error.details.reason, 'transport_failed');
    assert.equal(error.details.upstreamStatus, undefined);
    assert.equal(error.details.attempts, 2);
    return true;
  });
});
