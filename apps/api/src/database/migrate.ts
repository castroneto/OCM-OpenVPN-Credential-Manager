/**
 * Standalone schema migration. Run by systemd pre-start and via
 * `pnpm --filter @ocm/api migrate`. The system starts with no admin — create
 * the first one with the `ocm-admin` CLI.
 */
import 'reflect-metadata';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import Database from 'better-sqlite3';
import { loadConfig } from '../config/configuration';
import { applySchema } from './schema';

function main(): void {
  const config = loadConfig(process.env);
  const path = isAbsolute(config.databasePath)
    ? config.databasePath
    : resolve(process.cwd(), config.databasePath);

  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o750 });

  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  applySchema(db);
  db.close();

  // eslint-disable-next-line no-console
  console.log('Schema applied.');
}

try {
  main();
} catch (err) {
  // eslint-disable-next-line no-console
  console.error('Migration failed:', err instanceof Error ? err.message : err);
  process.exit(1);
}
