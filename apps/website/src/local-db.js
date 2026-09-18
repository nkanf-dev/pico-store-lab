import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const migrationsDir = fileURLToPath(new URL('../migrations/', import.meta.url));

export function openLocalD1(path = ':memory:') {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const sqlite = new DatabaseSync(path);
  // Ordered by filename so a local database mirrors `wrangler d1 migrations apply`.
  for (const name of readdirSync(migrationsDir).filter(entry => entry.endsWith('.sql')).sort()) {
    sqlite.exec(readFileSync(join(migrationsDir, name), 'utf8'));
  }
  const prepare = sql => ({
    bind: (...params) => ({
      sql, params,
      async first() { return sqlite.prepare(sql).get(...params) ?? null; },
      async all() { return { results: sqlite.prepare(sql).all(...params) }; },
      async run() { return sqlite.prepare(sql).run(...params); },
    }),
  });
  return {
    prepare,
    async batch(statements) {
      sqlite.exec('BEGIN');
      try {
        for (const statement of statements) sqlite.prepare(statement.sql).run(...statement.params);
        sqlite.exec('COMMIT');
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
    close() { sqlite.close(); },
  };
}
