import { fileURLToPath } from 'node:url';
import { checkForRelease } from './worker.js';
import { createDevServer } from './dev-server.js';
import { openLocalD1 } from './local-db.js';

const dbPath = fileURLToPath(new URL('../.local/releases.sqlite', import.meta.url));
const db = openLocalD1(dbPath);
// Local-only fallback so `npm run dev` can exercise the account flow.
// Production reads the value from `wrangler secret put SESSION_SECRET`.
const devSecret = process.env.SESSION_SECRET ?? 'local-development-session-secret-please-rotate';
if (!process.env.SESSION_SECRET) console.warn('SESSION_SECRET unset; using a local development secret');
const env = { DB: db, SESSION_SECRET: devSecret };
const server = createDevServer(env);

const port = Number(process.env.PORT || 8787);
server.listen(port, '127.0.0.1', () => console.log(`Release page: http://127.0.0.1:${port}`));
checkForRelease(env).then(result => {
  console.log(result.ok ? 'PICO public release checked' : 'PICO public release unavailable; showing last snapshot');
}).catch(() => console.error('Release database unavailable'));

process.on('SIGINT', () => { db.close(); server.close(); });
