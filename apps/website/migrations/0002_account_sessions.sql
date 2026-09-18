-- Server-side PICO account sessions for the web downloader.
-- The raw session token only ever lives in the visitor's HttpOnly cookie;
-- D1 stores its SHA-256 hash plus the AES-GCM sealed PICO credentials.
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  credentials TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_used_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions (expires_at);

-- Fixed-window throttle for verification-code mail and sign-in attempts.
CREATE TABLE IF NOT EXISTS login_attempts (
  scope TEXT NOT NULL,
  window_start TEXT NOT NULL,
  attempts INTEGER NOT NULL,
  PRIMARY KEY (scope, window_start)
);
