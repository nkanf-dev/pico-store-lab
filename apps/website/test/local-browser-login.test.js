import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CN_ACCOUNT_INFO_URL,
  CN_LOGIN_START_URL,
  canonicalDomain,
  domainOk,
  hasSessionCookie,
  pickSessionCookies,
} from '../src/local-browser-login.js';

test('official SSO and account-info endpoints target the China web/Matrix hosts', () => {
  assert.match(CN_LOGIN_START_URL, /^https:\/\/sso\.picoxr\.com\/passport\/\?/);
  assert.match(CN_LOGIN_START_URL, /aid=264297/);
  assert.match(CN_LOGIN_START_URL, /account_sdk_source=sso/);
  assert.match(CN_LOGIN_START_URL, /language=zh/);
  assert.match(CN_ACCOUNT_INFO_URL, /^https:\/\/matrix-cn\.picovr\.com\/passport\/account\/info\/v2\//);
  assert.match(CN_ACCOUNT_INFO_URL, /aid=305817/);
});

test('canonicalDomain strips leading/trailing dots and lower-cases', () => {
  assert.equal(canonicalDomain('.PICOXR.com.'), 'picoxr.com');
  assert.equal(canonicalDomain('sso.picoxr.com'), 'sso.picoxr.com');
});

test('domainOk accepts official roots and subdomains but rejects look-alikes', () => {
  for (const domain of ['picoxr.com', '.picoxr.com', 'sso.picoxr.com', 'picovr.com', '.picovr.com', 'matrix-cn.picovr.com']) {
    assert.equal(domainOk(domain), true, domain);
  }
  for (const domain of ['evil.com', 'notpicoxr.com', 'picoxr.com.evil.com', 'apicoxr.com', '']) {
    assert.equal(domainOk(domain), false, domain);
  }
});

test('hasSessionCookie only recognizes session cookies on official domains', () => {
  assert.equal(hasSessionCookie([{ name: 'sessionid', value: 'a', domain: '.picoxr.com' }]), true);
  assert.equal(hasSessionCookie([{ name: 'sessionid', value: 'a', domain: '.picovr.com' }]), true);
  assert.equal(hasSessionCookie([{ name: 'sessionid', value: 'a', domain: 'evil.com' }]), false);
  assert.equal(hasSessionCookie([{ name: 'other', value: 'a', domain: '.picoxr.com' }]), false);
  assert.equal(hasSessionCookie([{ name: 'sessionid', value: '', domain: '.picoxr.com' }]), false);
});

test('pickSessionCookies keeps session cookies and prefers the picoxr.com domain', () => {
  const cookies = [
    { name: 'sessionid', value: 'global-value', domain: '.picovr.com' },
    { name: 'sessionid', value: 'cn-value', domain: '.picoxr.com' },
    { name: 'sessionid_ss', value: 'cn-ss', domain: 'sso.picoxr.com' },
    { name: 'sid_tt', value: 'cn-tt', domain: '.picoxr.com' },
    { name: 'sid_guard', value: 'guard', domain: '.picoxr.com' },
    { name: 'evil', value: 'x', domain: 'evil.com' },
    { name: 'sessionid', value: 'attacker', domain: 'picoxr.com.evil.com' },
  ];
  assert.deepEqual(pickSessionCookies(cookies), {
    sessionid: 'cn-value',
    sessionid_ss: 'cn-ss',
    sid_tt: 'cn-tt',
    sid_guard: 'guard',
  });
});
