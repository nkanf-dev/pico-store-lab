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

The download interface supports two store regions selected by the client and passed to search, item and download routes as `region=global` (default) or `region=cn`. The global region talks to the international store and authenticates with an email code (`/api/account/send-code`, `/api/account/login`); the China region talks to `appstore-cn.picoxr.com` and the official SSO web flow at `sso.picoxr.com`. Credentials for the two regions are sealed into separate slots of one server-side session vault (`session.js`), so a single browser cookie can hold both logins while each download is authorized against its own region; signing out of one region keeps the other. Search and item detail are anonymous and region-scoped; downloads require the matching region's session. A session lasts 30 days and renews on use; the browser cookie is long-lived, so a local web session survives restarts like the CLI keychain.

The **Global/China region toggle is in the page header right next to the language control** (with matching weight) rather than inside the search panel; it persists across pages and drives every search, detail and download request. Search also accepts a price filter — `price=free` or `price=paid`, omitted (or `all`) for every app — exposed by the **All / Free / Paid** segmented control above the results. A price that normalizes to zero (`0`, `0.00`) counts as free and a positive numeric amount counts as paid, matching the Python SDK's `--price` option; an unknown value returns HTTP 400 `invalid_price_filter`.

#### All-apps listing

The discovery section has an **All apps / 全部应用** page. `GET /api/apps` walks the storefront sections (`51` globally; `96` games plus `97` apps in China) at 100 items per page, merges duplicates by `item_id`, and exposes `itemId`, `packageName`, `name`, `price`, `currency`, `cover`, `score`, `versionCode`, `updatedAt`, `publisher` and `genres` for each item.

Query parameters:

- `region=global|cn` and `device=B3110|A9210|A8A10|A8110|A7H10`.
- `sort=updated|name|rating`; the default `updated` puts the newest `detail.app_update_time` first. An unsupported value returns HTTP 400 `invalid_sort`.
- `category` (`sports`, `simulation`, …), `price=all|free|paid`, and `q` for a name, publisher or genre search. Invalid filters return HTTP 400.
- `page` (1-based) and `pageSize` (20, 50, 100, or up to 500). Omitting both keeps the legacy behaviour of returning the complete merged list. The response includes `total`, `page`, `pageSize`, `pageTotal` and the sliced `items`.

List artwork uses the same square icon as the detail-page title. `GET /api/icons?region=…&device=…&items=itemId:packageName,…` resolves up to 50 icons per request (results are cached in process for ten minutes); the home featured cards and the catalog, search and favorites lists resolve those icons before rendering, so the first paint already shows the detail icon instead of the square cover.

The page requests one page at a time: 20/50/100 items per page or 100-item batches for **All**. Near the bottom of the current page it fetches the next page in the background and pre-renders it hidden, so **Previous/Next** switches without another request. **All** appends the next batch as the list is scrolled. Category, price, sort and text filters are resolved by the API, so a page never mixes results from a different filter. Responses are cached for five minutes with the Worker Cache API and use an in-process fallback cache when that API is unavailable, which keeps the local Node preview fast across reloads. The China list merges games and apps, then removes duplicates that appear in both sections.

#### China sign-in: official SSO web flow

The China panel uses the same web flow as `sso.picoxr.com`, not the native app's Matrix endpoint. PICO's app API (`matrix-cn.picovr.com/passport/mobile/send_code/v1`) is gated by device risk control and returns error 7 to a server that has no device registration; that endpoint is not used for browser sign-in.

The worker sends the six-digit code through `https://sso.picoxr.com/send_activation_code/v2/` with the official web query parameters, then signs in through `https://sso.picoxr.com/quick_login/v2/` with `service=https://store.picoxr.com/`. The send response carries a `mobile_ticket` that binds the code challenge and short-lived SSO cookies; `/api/account/cn/send-code` returns both to the page, and `/api/account/cn/login` presents them again. `quick_login` commonly answers with a passport session plus `redirect_url`; the worker follows that short redirect chain with the same cookie jar to collect the store session cookies, then verifies them against the China store before sealing the session into the China slot of the regional vault. A missing or stale ticket is rejected as `code_expired`, and a wrong code is reported as `invalid_code`.

The local browser-window fallback (`src/local-browser-login.js`, `POST /api/local/browser-login/start`, polled via `GET /api/local/browser-login/status`) remains available when the site runs under the Node dev server for diagnostics. It launches a temporary Chromium profile pointed at the official SSO page, lets the user complete any interactive challenge, reads the signed-in cookies over CDP, verifies them against the China store and stores the same regional session. The hosted worker cannot launch a browser, so those routes return HTTP 501 `browser_login_local_only`; the page no longer exposes this button, leaving the SMS path as the single web sign-in. Local-window login requires Node.js 22 or newer for its global `WebSocket`.

Only a successful login stores a session: D1 keeps the regional label (for example `+86 13000000000`) and the AES-GCM-sealed PICO credentials, never the SMS code or password. Raw cookies are not written to logs.

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
