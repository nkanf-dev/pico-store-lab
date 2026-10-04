import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const items = [
  { itemId: '111', packageName: 'com.example.a', name: 'App A' },
  { itemId: '222', packageName: 'com.example.b', name: 'App B' },
];
const metadata = item => ({ ...item, available: true, versionCode: 1, size: 8,
  md5: '11111111111111111111111111111111', fileName: `${item.packageName}.apk`,
  downloadUrl: `/api/download?itemId=${item.itemId}`, directUrl: `https://cdn.example.test/${item.itemId}.apk` });
const flush = async () => { for (let i = 0; i < 3; i++) await new Promise(resolve => setImmediate(resolve)); };
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

function element() {
  return { children: [], events: {}, attrs: {}, dataset: {}, value: '', files: [], textContent: '', hidden: false, disabled: false,
    addEventListener(name, handler) { this.events[name] = handler; },
    setAttribute(name, value) { this.attrs[name] = value; },
    removeAttribute(name) { delete this.attrs[name]; },
    append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = children; }, focus() {}, scrollIntoView() {}, click() {},
  };
}

async function browser(override = () => undefined, href = 'https://example.test/') {
  const elements = new Map([...html.matchAll(/id="([^"]+)"/g)].map(([, id]) => [id, element()]));
  const translated = [];
  const placeholders = [];
  for (const [tag] of html.matchAll(/<[^>]+>/g)) {
    const id = tag.match(/\bid="([^"]+)"/)?.[1];
    const node = elements.get(id) ?? element();
    const textKey = tag.match(/\bdata-i18n="([^"]+)"/)?.[1];
    const placeholderKey = tag.match(/\bdata-i18n-placeholder="([^"]+)"/)?.[1];
    if (textKey) { node.dataset.i18n = textKey; translated.push(node); }
    if (placeholderKey) { node.dataset.i18nPlaceholder = placeholderKey; placeholders.push(node); }
  }
  const location = { href };
  const calls = [];
  const copied = [], saved = [], blobs = new Map();
  class BrowserURL extends URL {
    static createObjectURL(blob) { const id = `blob:report-${blobs.size}`; blobs.set(id, blob); return id; }
    static revokeObjectURL() {}
  }
  vm.runInNewContext(source, {
    URL: BrowserURL, URLSearchParams, Blob, AbortSignal, Intl, location, matchMedia: () => ({ matches: true }),
    navigator: { language: 'en', userAgent: 'Fixture browser', clipboard: { writeText: async text => copied.push(text) } },
    history: { replaceState(_state, _unused, url) { location.href = String(url); } },
    localStorage: { getItem: () => null, setItem() {} },
    document: { getElementById: id => elements.get(id), createElement: () => {
      const node = element(); node.click = () => saved.push({ name: node.download, blob: blobs.get(node.href) }); return node;
    },
      querySelectorAll: selector => selector === '[data-i18n]' ? translated : placeholders, documentElement: {} },
    fetch: async (path, init = {}) => {
      calls.push({ path, init });
      const custom = override(path, init);
      if (custom !== undefined) return custom;
      if (path === '/api/catalog') return Response.json(items.map(item => ({ ...item, state: { ...item, releases: [] } })));
      if (path.startsWith('/api/item?')) {
        const item = items.find(item => new URL(path, 'https://example.test').searchParams.get('itemId') === item.itemId);
        return Response.json({ ...item, versionCode: 1 });
      }
      if (path === '/api/account/session') return Response.json({ authenticated: true, email: 'player@example.test' });
      if (path === '/api/account/logout') return Response.json({ authenticated: false });
      if (path === '/api/account/login') return Response.json({ authenticated: true });
      if (path.startsWith('/api/download/info')) {
        const item = items.find(item => new URL(path, 'https://example.test').searchParams.get('itemId') === item.itemId);
        return Response.json(metadata(item));
      }
      if (path.startsWith('/api/download/diagnostics')) return Response.json({ events: [{ stage: 'cdn_response', attempt: 1, httpStatus: 206 }],
        response: { httpStatus: 206, contentLength: '1', contentRange: 'bytes 0-0/8' } });
      throw new Error(`unexpected browser request: ${path}`);
    },
  });
  await flush();
  return { get: id => elements.get(id), calls, location, copied, saved,
    select: index => elements.get('catalog-items').children[index].events.click(),
    click: id => elements.get(id).events.click(),
    login: () => elements.get('account-form').events.submit({ preventDefault() {} }),
  };
}

test('switching languages preserves the signed-in account and works after reload', async () => {
  const page = await browser();
  const requestCount = page.calls.length;
  assert.equal(page.get('account-status').textContent, 'Signed in as player@example.test');
  await page.click('language');
  assert.equal(page.get('account-status').textContent, '已登录：player@example.test');
  assert.equal(page.get('download-card').hidden, false);
  assert.equal(page.get('download-apk').href, '/api/download?itemId=111');
  assert.equal(page.calls.length, requestCount, 'changing language does not change the session');
  const reloaded = await browser(undefined, page.location.href);
  assert.equal(reloaded.get('account-status').textContent, '已登录：player@example.test');
  await reloaded.click('language');
  assert.equal(reloaded.get('account-status').textContent, 'Signed in as player@example.test');
});

test('language switches preserve account progress and failed-logout warnings', async () => {
  const pending = deferred();
  const page = await browser(path => path === '/api/account/logout' ? pending.promise : undefined);
  const logout = page.click('sign-out');
  await page.click('language');
  assert.equal(page.get('account-status').textContent, '正在退出…');
  pending.resolve(Response.json({ error: 'internal_error' }, { status: 500 }));
  await logout;
  assert.equal(page.get('account-status').textContent, '退出失败，请重试。');
  await page.click('language');
  assert.equal(page.get('account-status').textContent, 'Could not sign out. Please try again.');
  assert.equal(page.get('download-card').hidden, false);
});

test('failed logout retains account state and supports a successful retry', async () => {
  let attempts = 0;
  const page = await browser(path => {
    if (path === '/api/account/logout' && ++attempts === 1) return Promise.reject(new TypeError('offline'));
  });
  await page.click('sign-out');
  assert.equal(page.get('download-card').hidden, false);
  assert.match(page.get('account-status').textContent, /sign.out.*fail|could not sign out/i);
  await page.click('sign-out');
  assert.equal(attempts, 2);
  assert.equal(page.get('download-card').hidden, true);
  assert.equal(page.get('account-status').textContent, 'Not signed in');
});

test('changing apps immediately disables old download links', async () => {
  const pending = deferred();
  const page = await browser(path => path.includes('/download/info?itemId=222') ? pending.promise : undefined);
  assert.equal(page.get('download-apk').href, '/api/download?itemId=111');
  page.select(1);
  assert.equal(page.get('download-apk').attrs['aria-disabled'], 'true');
  assert.equal(page.get('download-direct').hidden, true);
  page.select(0);
  await flush();
  pending.resolve(Response.json(metadata(items[1])));
  await flush();
  assert.equal(page.get('download-apk').href, '/api/download?itemId=111');
});

test('old account metadata cannot reappear after logout and a new login', async () => {
  const pending = deferred();
  const newMetadata = deferred();
  let metadataRequests = 0;
  const page = await browser(path => {
    if (path.startsWith('/api/download/info')) return ++metadataRequests === 1 ? pending.promise : newMetadata.promise;
  });
  await page.click('sign-out');
  pending.resolve(Response.json({ ...metadata(items[0]), directUrl: 'https://cdn.example.test/old-account.apk' }));
  await flush();
  assert.equal(page.get('download-card').hidden, true);
  page.get('account-email').value = 'other@example.test';
  page.get('account-code').value = 'aB3dE9';
  const login = page.login();
  await flush();
  assert.equal(page.get('download-direct').hidden, true);
  assert.equal(page.get('download-apk').attrs['aria-disabled'], 'true');
  newMetadata.resolve(Response.json(metadata(items[0])));
  await login;
});

test('an unowned free app is acquired only after the explicit button click', async () => {
  const page = await browser((path, init) => {
    if (path.startsWith('/api/download/info')) return Response.json({ error: 'entitlement_required', canAcquire: true }, { status: 402 });
    if (path === '/api/download/acquire') {
      assert.equal(init.method, 'POST');
      assert.deepEqual(JSON.parse(init.body), { itemId: '111', packageName: 'com.example.a' });
      return Response.json(metadata(items[0]));
    }
  });
  assert.equal(page.calls.filter(call => call.path === '/api/download/acquire').length, 0);
  assert.equal(page.get('acquire-apk')?.hidden, false);
  await page.click('acquire-apk');
  assert.equal(page.calls.filter(call => call.path === '/api/download/acquire').length, 1);
  assert.equal(page.get('download-apk').href, '/api/download?itemId=111');
  assert.equal(page.get('acquire-apk').hidden, true);
});


test('transient metadata failures recover before an error is shown and reports retain both attempts', async () => {
  let attempts = 0;
  const page = await browser(path => {
    if (path.startsWith('/api/download/info') && ++attempts === 1) return Response.json({ error: 'upstream_unreachable', upstreamStatus: 503 }, { status: 502 });
  });
  assert.equal(attempts, 2);
  assert.equal(page.get('download-apk').attrs['aria-disabled'], undefined);
  assert.equal(page.get('report-reference').hidden, true);
  const report = JSON.parse(page.get('diagnostic-report').textContent);
  assert.equal(report.events.length, 2);
  assert.equal(report.events[0].upstreamStatus, 503);
  assert.equal(report.events[1].result, 'ready');
  assert.doesNotMatch(JSON.stringify(report), /player@|cdn.example|directUrl|downloadUrl/);
  assert.equal(page.get('download-direct').href, '/api/download?itemId=111&direct=1');
});

test('final errors include safe detailed reports that can be copied and exported without another request', async () => {
  const page = await browser(path => path.startsWith('/api/download/info') ? Response.json({
    error: 'upstream_unreachable', upstreamStatus: 503, stage: 'download_info',
    cookies: { sessionid: 'private-session' }, url: 'https://cdn.invalid?token=secret', email: 'secret@example.test',
  }, { status: 502 }) : undefined);
  const text = page.get('diagnostic-report').textContent;
  const report = JSON.parse(text);
  assert.equal(report.events.length, 2);
  assert.equal(report.failure.httpStatus, 502);
  assert.equal(report.failure.upstreamStatus, 503);
  assert.equal(report.application.packageName, 'com.example.a');
  assert.equal(page.get('report-reference').hidden, false);
  assert.match(page.get('report-reference').textContent, new RegExp(report.reportId));
  assert.doesNotMatch(text, /private-session|secret|player@|https:|cookies/);
  const requestCount = page.calls.length;
  await page.click('copy-report');
  assert.equal(page.copied[0], text);
  await page.click('save-report');
  assert.match(page.saved[0].name, /pico-store-lab-report-.*\.json$/);
  assert.equal(await page.saved[0].blob.text(), text);
  assert.equal(page.calls.length, requestCount, 'reports are local; no upload or account request');
});

test('ownership rejection is not retried and old diagnostics disappear when selecting a different app', async () => {
  let failures = 0;
  const page = await browser(path => path.includes('/download/info?itemId=111') ?
    (failures++, Response.json({ error: 'entitlement_required', canAcquire: true }, { status: 402 })) : undefined);
  assert.equal(failures, 1);
  assert.equal(JSON.parse(page.get('diagnostic-report').textContent).failure.httpStatus, 402);
  page.select(1);
  assert.equal(page.get('download-diagnostics').hidden, true);
  await flush();
  const report = JSON.parse(page.get('diagnostic-report').textContent);
  assert.equal(report.application.itemId, '222');
  assert.equal(report.failure, undefined);
});


test('a report for a browser download probes once and exports safe CDN response details', async () => {
  const page = await browser(path => path.startsWith('/api/download/diagnostics') ? Response.json({
    events: [{ stage: 'cdn_response', attempt: 1, httpStatus: 403, url: 'https://secret.invalid' },
      { stage: 'cdn_retry', attempt: 1, reason: 'apk_unavailable' }],
    error: 'apk_unavailable', stage: 'cdn_download', attempts: 2, upstreamStatus: 403,
    url: 'https://private.invalid?token=secret',
  }, { status: 502 }) : undefined);
  await page.click('copy-report');
  const report = JSON.parse(page.copied[0]);
  assert.equal(report.connection.upstreamStatus, 403);
  assert.equal(report.connection.events[0].httpStatus, 403);
  assert.equal(report.connection.events[0].attempt, 1);
  assert.equal(report.connection.events[1].reason, 'apk_unavailable');
  assert.doesNotMatch(page.copied[0], /secret|private|https:/);
  await page.click('save-report');
  assert.equal(page.calls.filter(call => call.path.startsWith('/api/download/diagnostics')).length, 1);
  assert.equal(await page.saved[0].blob.text(), page.copied[0]);
});
