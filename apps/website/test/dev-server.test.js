import assert from 'node:assert/strict';
import { request } from 'node:http';
import test from 'node:test';
import { createDevServer } from '../src/dev-server.js';
import { openLocalD1 } from '../src/local-db.js';

function post(url, origin, body, cookie) {
  return new Promise((resolve, reject) => {
    const req = request(url, { method: 'POST', agent: false, headers: {
      Origin: origin, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}),
    } }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(Buffer.concat(chunks).toString()) }));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.end(JSON.stringify(body));
  });
}

test('local browser account POSTs retain their origin, port, body, and cookie', async () => {
  const env = { DB: openLocalD1(), SESSION_SECRET: 'test-local-account-secret-at-least-32-characters' };
  const server = createDevServer(env);
  const originalFetch = globalThis.fetch;
  let loginCalls = 0;
  globalThis.fetch = async (url, init) => {
    assert.match(url, /\/code_login\//);
    assert.ok(new URLSearchParams(init.body).get('code'));
    loginCalls++;
    return Response.json({ message: 'success', data: { user_id_str: '4711' } }, { headers: { 'x-tt-token': 'test-token' } });
  };
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const body = { email: 'player@example.test', code: 'aB3dE9' };
    const crossed = await post(`${origin}/api/account/login`, 'https://evil.test', body);
    assert.equal(crossed.status, 403);
    assert.equal(loginCalls, 0);
    const signedIn = await post(`${origin}/api/account/login`, origin, body);
    assert.equal(signedIn.status, 200);
    assert.equal(signedIn.body.authenticated, true);
    assert.equal(loginCalls, 1);
    const cookie = signedIn.headers['set-cookie'][0];
    assert.doesNotMatch(cookie, /; Secure/);
    const signedOut = await post(`${origin}/api/account/logout`, origin, {}, cookie.split(';')[0]);
    assert.equal(signedOut.status, 200);
    assert.equal(signedOut.body.authenticated, false);
    assert.equal(await env.DB.prepare('SELECT token_hash FROM sessions').bind().first(), null);
  } finally {
    globalThis.fetch = originalFetch;
    await new Promise(resolve => server.close(resolve));
    env.DB.close();
  }
});
