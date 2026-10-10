// Local-development China sign-in through PICO's official browser window.
//
// The direct server-side SMS flow is rejected by PICO device risk control
// (upstream error 7) outside the official clients. The reliable path is to let
// the official SSO page run in a real local browser so its fingerprint and
// slider checks execute, then read the signed-in session cookies over the
// Chrome DevTools Protocol (CDP) — the same approach as the Python CLI's
// `login-window`.
//
// This module is imported ONLY by the Node dev server. It uses Node APIs
// (child_process, fs, os, net) that do not exist on Cloudflare Workers, so it
// must never be imported from worker.js.

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { randomUUID } from 'node:crypto';

const SESSION_COOKIE_NAMES = ['sessionid', 'sessionid_ss', 'sid_tt'];
// sid_guard carries the session lifetime; persist it alongside the session IDs.
const PERSIST_COOKIE_NAMES = [...SESSION_COOKIE_NAMES, 'sid_guard'];
const OFFICIAL_ROOTS = ['picoxr.com', 'picovr.com'];

// Official China web SSO entry (web aid 264297), matching PICO's own frontend.
export const CN_LOGIN_START_URL =
  'https://sso.picoxr.com/passport/?service=https%3A%2F%2Fstore.picoxr.com%2Fcn%2F'
  + '&aid=264297&account_sdk_source=sso&sdk_version=2.2.2&language=zh';
export const CN_ACCOUNT_INFO_URL =
  'https://matrix-cn.picovr.com/passport/account/info/v2/'
  + '?aid=305817&device_platform=android&account_sdk_source=app&passport-sdk-version=30490';

const LOGIN_TIMEOUT_MS = 300_000;
const POLL_MS = 800;

export class BrowserLoginError extends Error {
  constructor(code) {
    super(code);
    this.name = 'BrowserLoginError';
    this.code = code;
  }
}

export function canonicalDomain(domain) {
  let normalized = String(domain ?? '').trim().toLowerCase();
  if (normalized.startsWith('.')) normalized = normalized.slice(1);
  if (normalized.endsWith('.')) normalized = normalized.slice(0, -1);
  return normalized;
}

export function domainOk(domain) {
  const normalized = canonicalDomain(domain);
  if (normalized.startsWith('.') || normalized.endsWith('.')) return false;
  return OFFICIAL_ROOTS.some((root) => normalized === root || normalized.endsWith(`.${root}`));
}

export function hasSessionCookie(cookies) {
  return cookies.some(
    (cookie) => SESSION_COOKIE_NAMES.includes(cookie?.name) && domainOk(cookie?.domain) && cookie?.value,
  );
}

// Select persistable session cookies, preferring the picoxr.com domain when the
// same name is set on multiple official hosts.
export function pickSessionCookies(cookies) {
  const chosen = {};
  for (const cookie of cookies) {
    const { name, value } = cookie ?? {};
    const domain = String(cookie?.domain ?? '');
    if (!PERSIST_COOKIE_NAMES.includes(name) || !value || !domainOk(domain)) continue;
    const normalized = canonicalDomain(domain);
    const isPicoxr = normalized === 'picoxr.com' || normalized.endsWith('.picoxr.com');
    if (!(name in chosen) || isPicoxr) chosen[name] = String(value);
  }
  return chosen;
}

function exists(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function executableOnPath(names) {
  const separator = process.platform === 'win32' ? ';' : ':';
  const dirs = (process.env.PATH ?? '').split(separator).filter(Boolean);
  const exts = process.platform === 'win32'
    ? (process.env.PATHEXT ?? '.EXE;.CMD;.BAT').split(';')
    : [''];
  for (const dir of dirs) {
    for (const name of names) {
      for (const ext of exts) {
        const candidate = join(dir, name + ext);
        if (exists(candidate)) return candidate;
      }
    }
  }
  return null;
}

// Discover a Chromium-based browser, mirroring the Python CLI's preference
// order: explicit override, Edge/Chrome on well-known paths and PATH, then other
// Chromium-family browsers.
export function findBrowser(override = process.env.PICO_BROWSER_PATH) {
  if (override && exists(override)) return override;
  const pf = process.env.PROGRAMFILES ?? 'C:\\Program Files';
  const pf86 = process.env.PROGRAMFILES ?? 'C:\\Program Files (x86)';
  const localApp = process.env.LOCALAPPDATA ?? '';
  const candidates = process.platform === 'win32'
    ? [
        join(pf86, 'Microsoft\\Edge\\Application\\msedge.exe'),
        join(pf, 'Microsoft\\Edge\\Application\\msedge.exe'),
        join(pf, 'Google\\Chrome\\Application\\chrome.exe'),
        join(pf86, 'Google\\Chrome\\Application\\chrome.exe'),
        localApp && join(localApp, 'Google\\Chrome\\Application\\chrome.exe'),
        join(pf, 'BraveSoftware\\Brave-Browser\\Application\\brave.exe'),
        join(pf, 'Vivaldi\\Application\\vivaldi.exe'),
      ].filter(Boolean)
    : process.platform === 'darwin'
      ? [
          '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
          '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
          '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
          '/Applications/Vivaldi.app/Contents/MacOS/Vivaldi',
        ]
      : [];
  for (const candidate of candidates) if (exists(candidate)) return candidate;
  const pathCommands = process.platform === 'win32'
    ? ['msedge', 'chrome', 'brave', 'vivaldi', 'opera', 'thorium']
    : ['microsoft-edge', 'google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser',
      'brave-browser', 'vivaldi', 'opera'];
  return executableOnPath(pathCommands);
}

function freePort() {
  return new Promise((resolvePromise, rejectPromise) => {
    const server = createServer();
    server.unref();
    server.on('error', rejectPromise);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolvePromise(port));
    });
  });
}

async function httpJson(url, timeoutMs = 2000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function waitCdp(port, child, deadline) {
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new BrowserLoginError('window_closed');
    try {
      return await httpJson(`http://127.0.0.1:${port}/json/version`);
    } catch {
      await delay(200);
    }
  }
  throw new BrowserLoginError('cdp_unavailable');
}

async function pageTarget(port, deadline) {
  while (Date.now() < deadline) {
    let targets;
    try {
      targets = await httpJson(`http://127.0.0.1:${port}/json`);
    } catch {
      await delay(200);
      continue;
    }
    if (Array.isArray(targets)) {
      const page = targets.find((t) => t?.type === 'page' && t?.webSocketDebuggerUrl);
      if (page) return page.webSocketDebuggerUrl;
    }
    await delay(200);
  }
  throw new BrowserLoginError('no_page_target');
}

class CdpSession {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.nextId = 0;
  }

  connect() {
    if (typeof WebSocket === 'undefined') return Promise.reject(new BrowserLoginError('websocket_unavailable'));
    this.ws = new WebSocket(this.wsUrl);
    return new Promise((resolvePromise, rejectPromise) => {
      const fail = () => rejectPromise(new BrowserLoginError('cdp_closed'));
      this.ws.addEventListener('open', () => resolvePromise(), { once: true });
      this.ws.addEventListener('error', fail, { once: true });
    }).then(async () => {
      await this.call('Page.enable');
      await this.call('Network.enable');
    });
  }

  call(method, params = {}) {
    return new Promise((resolvePromise, rejectPromise) => {
      const id = ++this.nextId;
      const onMessage = (event) => {
        let message;
        try {
          message = JSON.parse(typeof event.data === 'string' ? event.data : event.data.toString());
        } catch {
          return;
        }
        if (message.id !== id) return;
        this.ws.removeEventListener('message', onMessage);
        if (message.error) rejectPromise(new BrowserLoginError('cdp_error'));
        else resolvePromise(message.result ?? {});
      };
      this.ws.addEventListener('message', onMessage);
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async cookies() {
    const result = await this.call('Network.getAllCookies');
    return Array.isArray(result.cookies) ? result.cookies : [];
  }

  close() {
    try { this.ws?.close(); } catch { /* ignore */ }
    this.ws = null;
  }
}

async function verifySession(cookies) {
  const cookieHeader = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
  const response = await fetch(CN_ACCOUNT_INFO_URL, {
    headers: { Cookie: cookieHeader, Accept: 'application/json' },
    signal: AbortSignal.timeout(25_000),
  });
  const payload = await response.json();
  if (!payload || payload.message !== 'success' || !payload.data) throw new BrowserLoginError('session_invalid');
  const uid = String(payload.data.user_id_str ?? payload.data.user_id ?? '');
  if (!/^[1-9][0-9]{0,19}$/.test(uid)) throw new BrowserLoginError('session_invalid');
  return uid;
}

async function closeBrowser(port, child, profileDir) {
  try {
    const version = await httpJson(`http://127.0.0.1:${port}/json/version`, 1500);
    if (version?.webSocketDebuggerUrl) {
      const ws = new WebSocket(version.webSocketDebuggerUrl);
      await new Promise((resolvePromise) => ws.addEventListener('open', resolvePromise, { once: true }));
      ws.send(JSON.stringify({ id: 1, method: 'Browser.close', params: {} }));
      await delay(200);
      ws.close();
    }
  } catch { /* CDP close is best-effort */ }
  if (child.exitCode === null) {
    child.terminate();
    setTimeout(() => { if (child.exitCode === null) child.kill(); }, 3000).unref?.();
  }
  rmSync(profileDir, { recursive: true, force: true });
}

// Open the official login window and resolve with the captured auth once the
// user finishes sign-in. The pure helper exports above are unit-tested; this
// runs a real browser and is not exercised by the automated suite.
async function runBrowserLogin() {
  const browser = findBrowser();
  if (!browser) throw new BrowserLoginError('browser_not_found');
  const port = await freePort();
  const profileDir = mkdtempSync(join(tmpdir(), 'pico-web-login-'));
  const child = spawn(browser, [
    `--remote-debugging-port=${port}`,
    '--remote-debugging-address=127.0.0.1',
    `--user-data-dir=${profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-sync',
    `--app=${CN_LOGIN_START_URL}`,
  ], { stdio: 'ignore' });
  let session = null;
  try {
    const deadline = Date.now() + LOGIN_TIMEOUT_MS;
    await waitCdp(port, child, deadline);
    while (Date.now() < deadline) {
      if (child.exitCode !== null) throw new BrowserLoginError('window_closed');
      try {
        if (!session) session = new CdpSession(await pageTarget(port, deadline));
        if (!session.ws) await session.connect();
        const cookies = await session.cookies();
        if (hasSessionCookie(cookies)) {
          const chosen = pickSessionCookies(cookies);
          const uid = await verifySession(chosen);
          return { uid, cookies: chosen };
        }
      } catch (error) {
        // Transient CDP errors (navigation, target swap): reconnect and keep polling.
        session?.close();
        session = null;
        if (error instanceof BrowserLoginError
          && ['window_closed', 'cdp_unavailable', 'browser_not_found', 'websocket_unavailable'].includes(error.code)) {
          throw error;
        }
      }
      await delay(POLL_MS);
    }
    throw new BrowserLoginError('login_timeout');
  } finally {
    session?.close();
    await closeBrowser(port, child, profileDir);
  }
}

// ---- Job registry so the browser can poll a long-lived interactive login ----
const jobs = new Map();

export function startBrowserLoginJob() {
  for (const [id, existing] of jobs) {
    if (existing.state === 'waiting' || existing.state === 'starting') {
      return { jobId: id, state: existing.state };
    }
  }
  const jobId = randomUUID();
  const job = { jobId, state: 'starting', auth: null, label: '', error: null, startedAt: Date.now() };
  jobs.set(jobId, job);
  runBrowserLogin()
    .then((auth) => {
      job.state = 'authenticated';
      job.auth = auth;
      job.label = `PICO ${auth.uid}`;
    })
    .catch((error) => {
      const code = error instanceof BrowserLoginError ? error.code : 'login_failed';
      job.state = code === 'login_timeout' ? 'timeout'
        : code === 'window_closed' ? 'cancelled' : 'error';
      job.error = code;
    })
    .finally(() => {
      setTimeout(() => jobs.delete(jobId), 10 * 60 * 1000).unref?.();
    });
  // The window takes a moment to launch; report "waiting" on the first poll.
  setImmediate(() => { if (job.state === 'starting') job.state = 'waiting'; });
  return { jobId, state: job.state };
}

export function getBrowserLoginJob(jobId) {
  return jobs.get(jobId) ?? null;
}
