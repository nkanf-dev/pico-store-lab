// Server-side session handling for the web downloader.
//
// Design: the visitor's PICO credentials stay on the server. The browser holds
// only an opaque random token in an HttpOnly cookie; D1 keeps the token's
// SHA-256 hash and an AES-GCM sealed copy of the credentials. A leaked database
// dump therefore exposes neither a usable cookie nor a usable PICO session.

export const SESSION_COOKIE = 'psl_session';
export const SESSION_TTL_SECONDS = 12 * 60 * 60;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesToBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function base64UrlToBytes(text) {
  const padded = text.replaceAll('-', '+').replaceAll('_', '/');
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='));
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

function toHex(buffer) {
  return [...new Uint8Array(buffer)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export function requireSessionSecret(secret) {
  if (typeof secret !== 'string' || secret.length < 32) {
    throw new Error('SESSION_SECRET of at least 32 characters is required');
  }
  return secret;
}

// Any-length operator secret is stretched into a 256-bit AES key.
export async function deriveSessionKey(secret) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(requireSessionSecret(secret)));
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function sealCredentials(key, value) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(JSON.stringify(value)));
  return bytesToBase64Url(new Uint8Array([...iv, ...new Uint8Array(sealed)]));
}

export async function openCredentials(key, sealed) {
  const bytes = base64UrlToBytes(sealed);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.subarray(0, 12) }, key, bytes.subarray(12));
  return JSON.parse(decoder.decode(plain));
}

export async function hashToken(token) {
  return toHex(await crypto.subtle.digest('SHA-256', encoder.encode(token)));
}

export function parseCookies(header) {
  const cookies = {};
  for (const part of (header ?? '').split(';')) {
    const separator = part.indexOf('=');
    if (separator > 0) cookies[part.slice(0, separator).trim()] = part.slice(separator + 1).trim();
  }
  return cookies;
}

function isLocal(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

// `Secure` is dropped for loopback so `npm run dev` works over plain HTTP.
export function sessionCookie(url, token, maxAge = SESSION_TTL_SECONDS) {
  const attributes = ['Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAge}`];
  if (url.protocol === 'https:' || !isLocal(url.hostname)) attributes.push('Secure');
  return `${SESSION_COOKIE}=${token}; ${attributes.join('; ')}`;
}

export function clearedSessionCookie(url) {
  return sessionCookie(url, '', 0);
}

export const REGIONS = ['global', 'cn'];

function emptyVault() {
  return { global: null, cn: null };
}

// Rows sealed before region support held a bare global PicoAuth; keep them valid.
function normalizeVault(value) {
  const vault = emptyVault();
  if (value && typeof value === 'object' && ('global' in value || 'cn' in value)) {
    for (const region of REGIONS) {
      const entry = value[region];
      if (entry && typeof entry === 'object' && entry.auth) vault[region] = { label: String(entry.label ?? ''), auth: entry.auth };
    }
  } else if (value && typeof value === 'object' && (value.cookies || value.x_tt_token || value.uid)) {
    vault.global = { label: '', auth: value };
  }
  return vault;
}

function primaryLabel(vault, fallback = '') {
  return vault.global?.label || vault.cn?.label || fallback;
}

export async function createSession(db, key, { region = 'global', label = '', auth, now = new Date() }) {
  if (!REGIONS.includes(region)) throw new Error('unsupported region');
  const token = bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  const time = now.toISOString();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_SECONDS * 1000).toISOString();
  const vault = emptyVault();
  vault[region] = { label, auth };
  await db.prepare(`
    INSERT INTO sessions (token_hash, email, credentials, created_at, last_used_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(await hashToken(token), label, await sealCredentials(key, vault), time, time, expiresAt).run();
  return { token, expiresAt };
}

// Store one region's sign-in under an existing visitor cookie, so the
// international and China sessions coexist like the native keychain slots.
export async function saveRegionSession(db, key, { token, region, label = '', auth, now = new Date() }) {
  if (!token || !REGIONS.includes(region)) return null;
  const row = await db.prepare('SELECT * FROM sessions WHERE token_hash = ?').bind(await hashToken(token)).first();
  if (!row || row.expires_at <= now.toISOString()) return null;
  let vault;
  try {
    vault = normalizeVault(await openCredentials(key, row.credentials));
  } catch {
    await deleteSession(db, token);
    return null;
  }
  vault[region] = { label, auth };
  const expiresAt = new Date(now.getTime() + SESSION_TTL_SECONDS * 1000).toISOString();
  await db.prepare('UPDATE sessions SET email = ?, credentials = ?, last_used_at = ?, expires_at = ? WHERE token_hash = ?')
    .bind(label || primaryLabel(vault), await sealCredentials(key, vault), now.toISOString(), expiresAt, row.token_hash).run();
  return { expiresAt };
}

export async function readSession(db, key, cookieHeader, now = new Date()) {
  const token = parseCookies(cookieHeader)[SESSION_COOKIE];
  if (!token) return null;
  const row = await db.prepare('SELECT * FROM sessions WHERE token_hash = ?').bind(await hashToken(token)).first();
  if (!row || row.expires_at <= now.toISOString()) return null;
  let vault;
  try {
    vault = normalizeVault(await openCredentials(key, row.credentials));
  } catch {
    // Secret rotated or row tampered with: drop the session instead of failing open.
    await deleteSession(db, token);
    return null;
  }
  await db.prepare('UPDATE sessions SET last_used_at = MAX(last_used_at, ?) WHERE token_hash = ?')
    .bind(now.toISOString(), row.token_hash).run();
  return { token, regions: vault, email: primaryLabel(vault, row.email), expiresAt: row.expires_at };
}

export function regionEntry(session, region) {
  if (!session || !REGIONS.includes(region)) return null;
  return session.regions?.[region] ?? null;
}

export async function deleteSession(db, token, now = new Date()) {
  if (!token) return;
  await db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await hashToken(token)).run();
  await pruneSessions(db, now);
}

// Clear just one region while preserving the other region's sign-in.
export async function clearRegionSession(db, key, token, region, now = new Date()) {
  if (!token || !REGIONS.includes(region)) return;
  const hash = await hashToken(token);
  const row = await db.prepare('SELECT * FROM sessions WHERE token_hash = ?').bind(hash).first();
  if (!row) return;
  let vault;
  try {
    vault = normalizeVault(await openCredentials(key, row.credentials));
  } catch {
    await db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(hash).run();
    return;
  }
  vault[region] = null;
  if (!vault.global && !vault.cn) {
    await db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(hash).run();
    return;
  }
  await db.prepare('UPDATE sessions SET email = ?, credentials = ? WHERE token_hash = ?')
    .bind(primaryLabel(vault), await sealCredentials(key, vault), hash).run();
}

export async function pruneSessions(db, now = new Date()) {
  const time = now.toISOString();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  await db.batch([
    db.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(time),
    db.prepare('DELETE FROM login_attempts WHERE window_start <= ?').bind(dayAgo),
  ]);
}

// Fixed-window throttle. D1 is not strongly consistent, so this is a cheap
// first line of defence in front of PICO's own account rate limits.
export async function consumeRateLimit(db, scope, limit, windowSeconds, now = new Date()) {
  const windowStart = new Date(Math.floor(now.getTime() / (windowSeconds * 1000)) * windowSeconds * 1000).toISOString();
  await db.prepare(`
    INSERT INTO login_attempts (scope, window_start, attempts) VALUES (?, ?, 1)
    ON CONFLICT(scope, window_start) DO UPDATE SET attempts = attempts + 1
  `).bind(scope, windowStart).run();
  const row = await db.prepare('SELECT attempts FROM login_attempts WHERE scope = ? AND window_start = ?')
    .bind(scope, windowStart).first();
  return { allowed: (row?.attempts ?? 1) <= limit, attempts: row?.attempts ?? 1 };
}

export async function scopeHash(prefix, value) {
  return `${prefix}:${await hashToken(String(value ?? 'unknown'))}`;
}
