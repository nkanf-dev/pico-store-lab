# Website

Run from the repository root:

```sh
npm ci
npm run build:ts
npm run dev -w @pico-store/website
```

Public app copy and installation guidance live in `content/pages.mjs`. `scripts/build.mjs` generates Chinese and English HTML pages, metadata and the sitemap from this content and the existing download interface. Keep app names, paths and official sources accurate when updating the catalog. `content/app-media.json` contains public PICO media metadata; it contains no account data. Generated files go to the ignored `dist/` directory.

The website uses ordinary links for app selection and language switching. Account and download requests use the existing same-origin API. Public pages remain readable when PICO is unavailable.

### Store regions and accounts

The download interface supports two store regions selected by the client and passed to search, item and download routes as `region=global` (default) or `region=cn`. The global region talks to the international store and authenticates with an email code (`/api/account/send-code`, `/api/account/login`); the China region talks to `appstore-cn.picoxr.com` / `matrix-cn.picovr.com`. Credentials for the two regions are sealed into separate slots of one server-side session vault (`session.js`), so a single browser cookie can hold both logins while each download is authorized against its own region; signing out of one region keeps the other. Search and item detail are anonymous and region-scoped; downloads require the matching region's session.

#### China sign-in: official browser window (recommended)

PICO's direct mobile-SMS endpoint is gated by device risk control (a native device registration, fingerprint headers and a slider challenge). A server that simply replays the SMS request is rejected with upstream error 7, both from the hosted worker and from a local dev server; requesting codes repeatedly does not help. The reliable path is to let the **official PICO SSO page run in a real local browser**, where its human-verification step actually executes.

When you run the site locally with `npm run dev -w @pico-store/website`, the China panel shows **"Sign in through the official PICO window (recommended)"**. Clicking it (`POST /api/local/browser-login/start`, polled via `GET /api/local/browser-login/status`) makes the Node dev server:

1. discover a Chromium-based browser (Microsoft Edge and Google Chrome first, then Brave/Vivaldi/other Chromium builds; override with the `PICO_BROWSER_PATH` environment variable),
2. launch it with a temporary profile and the Chrome DevTools Protocol on `127.0.0.1`, pointed at the official China SSO page,
3. wait while you complete mobile-number + SMS sign-in (including any slider) yourself — the window closes automatically when done,
4. read the signed-in cookies over CDP, verify them against `matrix-cn.picovr.com`, and store the China session in the same regional vault slot as the SMS flow.

This lives in `src/local-browser-login.js`, which is imported **only** by the Node dev server (`src/dev-server.js`); it uses Node APIs that do not exist on Cloudflare Workers and must never be imported from `src/worker.js`. The hosted site cannot launch a browser on your machine, so those two routes return HTTP 501 `browser_login_local_only` in production, and the UI points you to the Python CLI instead: `pico-store-py --region cn login-window`. The on-page China SMS form (`/api/account/cn/send-code`, `/api/account/cn/login`) is retained but is expected to fail with error 7 outside the official clients. Local-window login requires a Node runtime with a global `WebSocket` (Node.js 22 or newer).

## Deploy

```sh
cd apps/website
npx wrangler d1 migrations apply pico-store-lab-releases --remote
npx wrangler deploy
node scripts/submit-indexnow.mjs
```

Wrangler builds the TypeScript SDK and public website before deploying. IndexNow sends only changed or removed public page URLs; it checks the deployed ownership file before submission. HTTP 200/202 means receipt, not indexing. The key is a public ownership file, not an account credential. Rebuild before submitting a changed page set. Keep Google and Bing verification files in `public/` across deployments.

## Aggregate discovery counts

The optional browser measurement records fixed page/source/event categories as daily counters in D1. It honors Do Not Track and does not run on localhost. It sends no visitor ID, email, IP, form contents or full URL. Measurement failure does not interrupt use of the site. Events are counts, not unique visitors, completed downloads or installations.

```sh
npx wrangler d1 execute pico-store-lab-releases --remote --command "SELECT day, page, source, event, count FROM discovery_counts ORDER BY day DESC, page, source, event LIMIT 200"
```

Google Search Console and Bing Webmaster Tools provide search and citation reports independently of these product events. See the project repository for SDK and client documentation.
