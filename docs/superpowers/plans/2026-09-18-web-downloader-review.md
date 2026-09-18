# Web Downloader Review Implementation Plan

> Execute the accepted review fixes inline in the isolated PR checkout. The
> referenced optional Superpowers execution helper skills are not installed.

**Goal:** Fix all seven reproduced issues in PR #1 and update its source branch.

**Architecture:** Keep the pure PICO SDK unchanged. Separate read-only download
resolution from explicit acquisition in the Worker; use request generations to
keep asynchronous browser results tied to the current account and selection.

**Tech Stack:** Node 25, browser JavaScript, Cloudflare Workers/D1, node:test.

## Task 1: Account and HTTP behavior

Files: `apps/website/src/worker.js`, `apps/website/src/delivery.js`,
`apps/website/test/worker.test.js`.

- [x] Add regression tests for an alphanumeric code accepted by upstream, an
  HTTP-200 business rejection from send-code, and stale/matching If-Range values.
  Assert `status === 200` for `code: 'aB3dE9'`, `status === 502` when send-code
  returns `{message: 'error'}`, and no forwarded Range for a stale validator.
- [x] Run `node --test apps/website/test/worker.test.js` and confirm failures.
- [x] Use `/^[A-Za-z0-9]{4,8}$/` for codes, require `message === 'success'` for
  send-code, and forward Range only when If-Range is absent or exactly equals
  `JSON.stringify(info.md5)`.
- [x] Add GET tests asserting zero `/item/price` requests for unowned free apps.
  Add POST acquisition tests for same-origin success and missing/foreign Origin
  rejection before any upstream request.
- [x] Make `resolveDownload(..., {acquire: false})` read account entitlement only.
  Use the existing acquisition/polling flow only with `acquire: true`. Expose it
  as `POST /api/download/acquire`, validate the target from the JSON body, and
  return the same metadata as `/api/download/info`.

## Task 2: Browser state and explicit acquisition

Files: `apps/website/public/{app.js,index.html,i18n.css}`,
`apps/website/test/public-app.test.js`.

- [x] Exercise the actual script's event handlers with a minimal DOM and deferred
  fetch responses. Verify failed logout retains account UI and can be retried;
  switching selection immediately removes prior links and ignores old responses.
- [x] Invalidate download generations, links, and verification state on context
  changes. Only apply metadata when both the request and account context match.
  Clear authentication after logout success; show a translated error on failure.
- [x] Add the translated explicit acquisition button. Show it only when the
  authenticated metadata error says `canAcquire: true`; submit a same-origin
  POST with `{itemId, packageName}` and display the returned metadata.
- [x] Update the HTML code input to the alphanumeric pattern and text input mode.
- [x] Run `node --test apps/website/test/public-app.test.js`.

## Task 3: Local request adapter

Files: `apps/website/src/{dev.js,dev-server.js}`,
`apps/website/test/dev-server.test.js`.

- [x] Extract server creation from startup so tests can listen on an ephemeral
  loopback port with an in-memory DB and mock PICO transport.
- [x] Construct the incoming URL with `new URL(req.url, 'http://' + req.headers.host)`.
  Test a real local POST with its matching Origin: it must reach validation/
  mocked upstream rather than return `origin_rejected`. Foreign Origin stays 403.
- [x] Run `node --test apps/website/test/dev-server.test.js`.

## Task 4: Documentation, verification, and PR update

- [x] Update `README.md`, `README.zh-CN.md`, and `CHANGELOG.md` to explain the
  explicit acquisition action, code format, and corrected failure behavior.
- [x] Run `npm test`, `npm run typecheck -w @nkanf-dev/pico-store-sdk`, and
  `git diff --check`. Inspect the resulting diff for unrelated changes.
- Commit the fix, verify the remote PR branch is still based on the reviewed
  commit, and push normally to `Verdspair/pico-store-lab:web-apk-download`.
- Verify the updated PR head and required CI results. Report actual evidence
  and keep live PICO/Cloudflare behavior explicitly unverified.

## Additional review scope

Copilot review 5248022842 was inspected. Its direct flag, fallback text, and dead
logout branch findings were corrected. JSON parse failures were already caught by
callers, but login misclassified them as rejected credentials; upstream parse and
body-read failures now retain HTTP 502. Added regression cases pass.
