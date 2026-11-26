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

The **Global/China region toggle is in the page header right next to the language control** (with matching weight) rather than inside the search panel; it persists across pages and drives every search, detail and download request. Search also accepts a price filter — `price=free` or `price=paid`, omitted (or `all`) for every app — exposed by the **All / Free / Paid** segmented control above the results. A price that normalizes to zero (`0`, `0.00`) counts as free and a positive numeric amount counts as paid, matching the Python SDK's `--price` option; an unknown value returns HTTP 400 `invalid_price_filter`.

#### All-apps listing

The discovery section has an **All apps / 全部应用** panel. `GET /api/apps?region=global|cn&sort=updated|name|rating` walks the storefront sections (`51` globally; `96` games plus `97` apps in China) at 100 items per page, merges duplicates by `item_id`, and returns one JSON list with `itemId`, `packageName`, `name`, `price`, `currency`, `cover`, `score`, `versionCode`, `updatedAt`, `publisher` and `genres`. The default sort is `updated` (newest `detail.app_update_time` first); `name` is A–Z and `rating` is highest score first. An unsupported sort returns HTTP 400 `invalid_sort`.

Responses are cached for five minutes when the Worker Cache API is available. The page loads the full merged list on demand, sorts it in place and shows the update time on every card, so switching between time, name and rating order does not trigger another upstream crawl. The China list merges games and apps, then removes duplicates that appear in both sections.

#### China sign-in: official SSO web flow

The China panel uses the same web flow as `sso.picoxr.com`, not the native app's Matrix endpoint. PICO's app API (`matrix-cn.picovr.com/passport/mobile/send_code/v1`) is gated by device risk control and returns error 7 to a server that has no device registration; that endpoint is not used for browser sign-in.

The worker sends the six-digit code through `https://sso.picoxr.com/send_activation_code/v2/` with the official web query parameters, then signs in through `https://sso.picoxr.com/quick_login/v2/`. The send response carries a `mobile_ticket` that binds the code challenge; `/api/account/cn/send-code` returns it to the page, and `/api/account/cn/login` requires the same ticket together with the code. The SSO response sets the session cookies; the worker verifies them against the China store before sealing the session into the China slot of the regional vault. A missing or stale ticket is rejected as `code_expired`, and a wrong code is reported as `invalid_code`.

The local browser-window fallback (`src/local-browser-login.js`, `POST /api/local/browser-login/start`, polled via `GET /api/local/browser-login/status`) remains available when the site runs under the Node dev server. It launches a temporary Chromium profile pointed at the official SSO page, lets the user complete any interactive challenge, reads the signed-in cookies over CDP, verifies them against the China store and stores the same regional session. The hosted worker cannot launch a browser, so those routes return HTTP 501 `browser_login_local_only`; the UI labels that button as a local-only fallback. Local-window login requires Node.js 22 or newer for its global `WebSocket`.

Both paths only store the PICO session after a successful login. No phone number, code, password or cookie is written to D1 or logs.

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
