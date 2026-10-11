import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CN_ACCOUNT_HOST, CN_STORE_HOST, encodeAccountField, makeAccountRequest, makeMobileAccountRequest,
  makeSearchRequest, storeOptionsForRegion, validateRegion,
} from '../dist/index.js';

// Reverse of the SDK's XOR field encoding so tests can assert the decoded form.
function decodeAccountField(value) {
  let text = '';
  for (let index = 0; index < value.length; index += 2) {
    text += String.fromCharCode(Number.parseInt(value.slice(index, index + 2), 16) ^ 5);
  }
  return text;
}

function formBody(spec) {
  return Object.fromEntries(new URLSearchParams(spec.body));
}

test('region presets select the validated China client identity', () => {
  assert.deepEqual(storeOptionsForRegion('global'), {});
  const cn = storeOptionsForRegion('cn');
  assert.equal(cn.storeHost, CN_STORE_HOST);
  assert.equal(cn.accountHost, CN_ACCOUNT_HOST);
  assert.equal(cn.webStoreHost, 'https://store.picoxr.com');
  assert.equal(cn.deviceName, 'B3110');
  assert.equal(cn.appId, '8562');
  assert.equal(cn.passportAid, '305817');
  assert.equal(cn.language, 'zh');
  assert.equal(cn.manifestVersionCode, '401000505');
  assert.equal(validateRegion('cn'), 'cn');
  assert.throws(() => validateRegion('eu'), /region must be/);
});

test('China search targets the CN aggregation endpoint', () => {
  const url = new URL(makeSearchRequest('互联', storeOptionsForRegion('cn')).url);
  assert.equal(url.host, 'appstore-cn.picoxr.com');
  assert.equal(url.pathname, '/api/app/v2/search/aggregation');
  assert.equal(url.searchParams.get('device_name'), 'B3110');
  assert.equal(url.searchParams.get('app_id'), '8562');
  assert.equal(url.searchParams.get('app_language'), 'zh');
});

test('China SMS send-code builds the Matrix endpoint with XOR-encoded fields', () => {
  const spec = makeMobileAccountRequest('send-code', '13800138000', undefined, {
    storeOptions: storeOptionsForRegion('cn'),
  });
  const url = new URL(spec.url);
  assert.equal(url.host, 'matrix-cn.picovr.com');
  assert.equal(url.pathname, '/passport/mobile/send_code/v1/');
  assert.equal(url.searchParams.get('aid'), '305817');
  assert.equal(url.searchParams.get('device_platform'), 'android');
  assert.equal(spec.headers['Content-Type'], 'application/x-www-form-urlencoded');
  const body = formBody(spec);
  assert.equal(body.mix_mode, '1');
  assert.equal(decodeAccountField(body.mobile), '+86 13800138000');
  assert.equal(decodeAccountField(body.type), '24');
  assert.equal(decodeAccountField(body.unbind_exist), '0');
  assert.equal(body.auto_read, '0');
});

test('China SMS login encodes the mobile number and six-digit code', () => {
  const spec = makeMobileAccountRequest('login', '13800138000', '123456', {
    countryCode: '86', storeOptions: storeOptionsForRegion('cn'),
  });
  const url = new URL(spec.url);
  assert.equal(url.pathname, '/passport/mobile/sms_login_only/');
  const body = formBody(spec);
  assert.equal(decodeAccountField(body.mobile), '+86 13800138000');
  assert.equal(decodeAccountField(body.code), '123456');
  assert.equal(body.mix_mode, '1');
});

test('mobile and email builders reject the wrong region or invalid input', () => {
  // Mobile verification only exists in China, so it targets Matrix-CN even when
  // no regional options are supplied.
  const forced = makeMobileAccountRequest('send-code', '13800138000');
  assert.equal(new URL(forced.url).host, 'matrix-cn.picovr.com');
  // An explicit non-China account host is a configuration error.
  assert.throws(
    () => makeMobileAccountRequest('send-code', '13800138000', undefined, {
      storeOptions: { accountHost: 'https://matrix-us.picovr.com' },
    }),
    /China region/,
  );
  // Email verification must not hit the China account host.
  assert.throws(
    () => makeAccountRequest('send-code', 'a@b.com', undefined, storeOptionsForRegion('cn')),
    /mobile verification for the China region/,
  );
  assert.throws(() => makeMobileAccountRequest('send-code', '123', undefined, {
    storeOptions: storeOptionsForRegion('cn'),
  }), /mobile number/);
  assert.throws(() => makeMobileAccountRequest('send-code', '1280013800', undefined, {
    countryCode: '86', storeOptions: storeOptionsForRegion('cn'),
  }), /mainland China mobile/);
  assert.throws(() => makeMobileAccountRequest('login', '13800138000', '12', {
    storeOptions: storeOptionsForRegion('cn'),
  }), /six-digit SMS/);
});

test('XOR field encoding stays symmetric', () => {
  const encoded = encodeAccountField('+86 13800138000');
  assert.equal(decodeAccountField(encoded), '+86 13800138000');
});
