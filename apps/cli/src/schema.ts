/**
 * The `admin_users` table — the only table the CLI touches. Idempotent, so it
 * is a no-op once the API's migration has created the full schema. Kept in sync
 * with [apps/api] database/schema.ts.
 */
export const ADMIN_USERS_SCHEMA: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS admin_users (
     id          TEXT PRIMARY KEY,
     username    TEXT NOT NULL UNIQUE,
     password_hash TEXT NOT NULL,
     role        TEXT NOT NULL DEFAULT 'ADMIN',
     created_at  TEXT NOT NULL,
     updated_at  TEXT NOT NULL
   )`,
];
