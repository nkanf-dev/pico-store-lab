import assert from 'node:assert/strict';
import test from 'node:test';
import {
  filterSearchItems, isFreePrice, isPaidPrice, validatePriceFilter,
} from '../dist/index.js';

function item(itemId, price) {
  return {
    itemId, packageName: `com.example.${itemId}`, name: `App ${itemId}`,
    versionCode: 1, price, iconUrl: null,
  };
}

const items = [
  item('1', '0'),
  item('2', '0.00'),
  item('3', '68'),
  item('4', '12.50'),
  item('5', ''),
];

test('isFreePrice only matches zero amounts with optional whitespace', () => {
  assert.equal(isFreePrice('0'), true);
  assert.equal(isFreePrice(' 0.00 '), true);
  assert.equal(isFreePrice('68'), false);
  assert.equal(isFreePrice(''), false);
});

test('isPaidPrice only matches positive numeric amounts', () => {
  assert.equal(isPaidPrice('68'), true);
  assert.equal(isPaidPrice('0.01'), true);
  assert.equal(isPaidPrice('0'), false);
  assert.equal(isPaidPrice('0.00'), false);
  assert.equal(isPaidPrice(''), false);
});

test('validatePriceFilter accepts free/paid and rejects anything else', () => {
  assert.equal(validatePriceFilter('free'), 'free');
  assert.equal(validatePriceFilter('paid'), 'paid');
  assert.throws(() => validatePriceFilter('all'), /free or paid/);
  assert.throws(() => validatePriceFilter(''), /free or paid/);
});

test('filterSearchItems keeps free or paid items to match the Python SDK', () => {
  assert.deepEqual(filterSearchItems(items, 'free').map(entry => entry.itemId), ['1', '2']);
  assert.deepEqual(filterSearchItems(items, 'paid').map(entry => entry.itemId), ['3', '4']);
});
