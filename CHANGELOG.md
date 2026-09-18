# Changelog

All notable changes follow [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and semantic versioning.

## [Unreleased]

### Added

- Browser APK download at `pico.kanglives.top`. Sign in with a PICO email code, pick any app, and the Worker streams that app's APK to the browser with its version, size, and MD5; the page also verifies a downloaded file against that MD5 in 4 MiB slices.
- `apps/website/src/delivery.js` composes item lookup, free-offer acquisition, and download-info through the pure protocol helpers, so the Worker never imports the Node-only SDK client.
- `apps/website/src/session.js` seals each visitor's PICO credentials with AES-GCM in D1 and hands the browser only an HttpOnly cookie holding a random token; D1 stores the token's SHA-256 hash.
- `GET /api/download?direct=1` answers with a `302` to PICO's own CDN URL, and `/api/download/info` exposes that URL as `directUrl` for the page's **PICO CDN link** action.

### Changed

- The downloader follows the signed-in PICO account's own entitlement, keyed by the exact item ID and package name; `contracts/v1/catalog.json` describes only what the catalog page lists. A paid app that the account does not own returns `402 entitlement_required` with the upstream price, since that is an account problem this API cannot solve by itself.
- Range requests pass through to PICO and responses carry `Content-Disposition`, `ETag`, `Digest`, and `X-Apk-*` metadata.
- Account posts are rejected when `Origin` does not match, verification-code mail and sign-in attempts are throttled in fixed windows, and the account flow returns `503` until `SESSION_SECRET` is set to 32+ characters.

### Fixed

- Accept alphanumeric email codes and report upstream send-code rejections accurately; unreadable or malformed upstream responses are reported as upstream failures.
- Keep account state visible after failed logout, invalidate old download links and file verification on app/account changes, and ignore stale asynchronous metadata.
- Require explicit same-origin `POST /api/download/acquire` to claim free apps; all download and metadata GET routes leave account entitlements unchanged.
- Honor `If-Range` against the MD5 ETag so a changed APK restarts as a complete download; redirect only for `direct=1`.
- Preserve the browser's host and port in the local development adapter, align fallback page copy with owned paid-app support, and remove a duplicate logout branch.

网页修复：支持字母数字验证码，正确报告上游失败与退出失败；切换应用或账号时清除旧下载状态；免费领取改为用户明确触发的同源 POST，GET 不再自动领取；续传检查版本校验值，仅 `direct=1` 重定向；修正本地同源请求、备用文案及重复退出分支。

## [0.1.1] - 2026-09-18

### Fixed

- Recheck account entitlement after a free claim that committed but returned no order ID; all four SDKs retain the ownership-before-download rule.
- Show the owned paid-app download state after sign-in, track real download progress, support system/light/dark themes with readable input text, and permit mixed-case verification codes on Android.

### Availability

- The Android client was tested on a PICO device by the user; these specific fixes are build-tested and await a fresh on-device check.
- Registry publication status is recorded in the GitHub Release and global project notes.

## [0.1.0] - 2026-09-18

### Added

- Python, TypeScript, Rust, and Kotlin SDKs for catalog search, account sign-in, item lookup, free-offer acquisition, authenticated download metadata, and verified APK downloads.
- Configurable store request profiles for device identity, language, region, and endpoints.
- Rust desktop and Python command-line clients.
- Native Kotlin/Jetpack Compose Android storefront with search, favorites, account sign-in, official listing details, and system-confirmed installation. Downloads are retained in `Downloads/PICO Store Lab`.
- English and Chinese documentation and Android UI.
- Cloudflare catalog and public release metadata at `pico.kanglives.top`.

### Availability

- Source and binary artifacts are published on GitHub. Package registries are not yet used.
- The Android client was subsequently tested on a PICO device by the user, who reported the issues addressed above.
