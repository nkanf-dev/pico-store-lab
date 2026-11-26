import assert from 'node:assert/strict';
import test from 'node:test';
import { makeSectionRequest, parseSectionPage } from '../dist/pico.js';

test('section request targets the official section endpoint with paging', () => {
  const request = makeSectionRequest(51, { language: 'en' }, 2, 100);
  assert.match(request.url, /\/api\/app\/v1\/section\/info\?/);
  assert.equal(request.method, 'POST');
  assert.deepEqual(JSON.parse(request.body), { section_id: 51, pageable: { page: 2, size: 100 } });
  assert.equal(request.headers.Locale, 'en');
});

test('section pages keep release time and skip malformed rows', () => {
  const page = parseSectionPage({
    code: 0,
    data: {
      has_more: true,
      items: [
        {
          item_id: '1199', package_name: 'com.example.app', name: 'Example',
          version_code: 12, price: '0', currency: 'USD', score: 4.2,
          cover: { square: 'https://cdn.example/icon.png' },
          detail: { app_update_time: '1653350400', app_publisher: 'Studio', app_genres: 'Casual' },
        },
        { item_id: '12', package_name: 'not-a-package', name: 'Broken' },
        { item_id: '1199', package_name: 'com.example.duplicate', name: 'Duplicate' },
      ],
    },
  });
  assert.equal(page.hasMore, true);
  assert.equal(page.items.length, 1);
  assert.deepEqual(page.items[0], {
    itemId: '1199', packageName: 'com.example.app', name: 'Example', versionCode: 12,
    price: '0', currency: 'USD', iconUrl: 'https://cdn.example/icon.png', score: 4.2,
    updatedAt: 1653350400, publisher: 'Studio', genres: 'Casual',
  });
});

test('section pages treat an exhausted section as an empty final page', () => {
  assert.deepEqual(parseSectionPage({ code: 110203, msg: 'section does not has any element', data: {} }),
    { items: [], hasMore: false });
  assert.deepEqual(parseSectionPage({ code: 0, data: { page: 6, size: 100 } }),
    { items: [], hasMore: false });
});

test('section pages reject an upstream business failure', () => {
  assert.throws(() => parseSectionPage({ code: 3 }), /PICO section lookup failed/);
});

test('section request validates the section and page window', () => {
  assert.throws(() => makeSectionRequest(0), /valid section id/);
  assert.throws(() => makeSectionRequest(51, {}, 0), /invalid section page/);
  assert.throws(() => makeSectionRequest(51, {}, 1, 101), /invalid section page size/);
});
