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

The download interface supports two store regions selected by the client and passed to search, item and download routes as `region=global` (default) or `region=cn`. The global region talks to the international store and authenticates with an email code (`/api/account/send-code`, `/api/account/login`); the China region talks to `appstore-cn.picoxr.com` / `matrix-cn.picovr.com` and authenticates with a mobile SMS code (`/api/account/cn/send-code`, `/api/account/cn/login`). Credentials for the two regions are sealed into separate slots of one server-side session vault (`session.js`), so a single browser cookie can hold both logins while each download is authorized against its own region; signing out of one region keeps the other. Search and item detail are anonymous and region-scoped; downloads require the matching region's session. China SMS requests are rate-limited per mobile number and per IP, and PICO's Matrix endpoint may itself return a rate-limit error.

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
