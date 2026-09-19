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
    replaceChildren(...children) { this.children = children; }, focus() {}, scrollIntoView() {},
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
  vm.runInNewContext(source, {
    URL, URLSearchParams, Intl, location, matchMedia: () => ({ matches: true }),
    navigator: { language: 'en' }, history: { replaceState(_state, _unused, url) { location.href = String(url); } },
    localStorage: { getItem: () => null, setItem() {} },
    document: { getElementById: id => elements.get(id), createElement: element,
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
      throw new Error(`unexpected browser request: ${path}`);
    },
  });
  await flush();
  return { get: id => elements.get(id), calls, location,
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
