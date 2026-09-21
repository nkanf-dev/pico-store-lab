import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  makePublicItemRequest, makeSearchRequest, mirrorDecision, parseDownloadInfo, parseOfficialJson, parsePublicItem, parseSearchResults,
} from '../dist/index.js';

const fixtures = JSON.parse(readFileSync(fileURLToPath(new URL('../../../contracts/v1/fixtures.json', import.meta.url)), 'utf8'));

test('contract fixture matches exact IDs, requests, responses and mirror default', () => {
  assert.equal(JSON.parse(makePublicItemRequest().body).package_name, fixtures.packageName);
  const publicItem = parsePublicItem(parseOfficialJson(fixtures.publicResponse));
  const download = parseDownloadInfo(parseOfficialJson(fixtures.downloadResponse));
  assert.equal(publicItem.itemId, fixtures.itemId);
  assert.equal(publicItem.versionCode, fixtures.versionCode);
  assert.equal(download.size, fixtures.apkSize);
  assert.equal(download.md5, fixtures.md5);
  assert.deepEqual(mirrorDecision({ price: publicItem.price, size: download.size }), { eligible: true, reason: 'eligible' });
});

test('search uses official aggregation and preserves a non-seed app ID', () => {
  assert.equal(new URL(makeSearchRequest('YouTube').url).pathname, '/api/app/v2/search/aggregation');
  const response = parseOfficialJson('{"code":0,"data":{"search_list":[{"items":[{"item_id":7270207384512020485,"package_name":"com.google.android.apps.youtube.vr.pico","name":"YouTube VR"}]}]}}');
  assert.equal(parseSearchResults(response).items[0].itemId, '7270207384512020485');
});

test('media URLs are not restricted to a product domain or HTTPS', () => {
  const item = parsePublicItem({ code: 0, data: {
    item_id: fixtures.itemId, package_name: fixtures.packageName, name: 'VRChat',
    version_code: fixtures.versionCode, icon: 'http://cdn.example.com/icon.jpg',
    cover: { landscape: 'https://images.example.net/cover.jpg' },
    images: [
      { image_url: 'https://images.example.net/shot.jpg' },
      { image_url: 'http://cdn.example.com/shot-2.jpg' },
      { image_url: 'file:///tmp/not-supported.jpg' },
    ],
  }});
  assert.equal(item.iconUrl, 'http://cdn.example.com/icon.jpg');
  assert.equal(item.coverUrl, 'https://images.example.net/cover.jpg');
  assert.deepEqual(item.screenshots, [
    'https://images.example.net/shot.jpg',
    'http://cdn.example.com/shot-2.jpg',
  ]);
});
