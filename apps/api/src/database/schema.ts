import type Database from 'better-sqlite3';

/**
 * Table definitions (idempotent). `name` is the reusable human label; a
 * credential's PKI identity is the unique `common_name`.
 */
const TABLE_STATEMENTS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS admin_users (
     id          TEXT PRIMARY KEY,
     username    TEXT NOT NULL UNIQUE,
     password_hash TEXT NOT NULL,
     role        TEXT NOT NULL DEFAULT 'ADMIN',
     created_at  TEXT NOT NULL,
     updated_at  TEXT NOT NULL
   )`,

  `CREATE TABLE IF NOT EXISTS vpn_credentials (
     id           TEXT PRIMARY KEY,
     name         TEXT,
     common_name  TEXT NOT NULL UNIQUE,
     description  TEXT,
     status       TEXT NOT NULL DEFAULT 'ACTIVE',
     created_at   TEXT NOT NULL,
     revoked_at   TEXT,
     expires_at   TEXT
   )`,
];

/** Indexes — created after column migrations so they can reference new columns. */
const INDEX_STATEMENTS: readonly string[] = [
  `CREATE INDEX IF NOT EXISTS idx_vpn_credentials_status
     ON vpn_credentials (status)`,
  `CREATE INDEX IF NOT EXISTS idx_vpn_credentials_name
     ON vpn_credentials (name)`,
];

/** Runs an idempotent `ADD COLUMN`, ignoring the "already exists" error. */
function addColumnIfMissing(db: Database.Database, alter: string): void {
  try {
    db.exec(alter);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!/duplicate column name/i.test(message)) throw err;
  }
}

/**
 * Create the schema and apply idempotent migrations. Safe on every boot.
 *
 * Order matters: tables → column migrations → indexes, so an index on a
 * newly-added column (e.g. `name`) is only created after the column exists
 * on pre-existing databases.
 */
export function applySchema(db: Database.Database): void {
  for (const statement of TABLE_STATEMENTS) db.exec(statement);

  // `name` was added after `common_name`; backfill old rows with the CN.
  addColumnIfMissing(db, 'ALTER TABLE vpn_credentials ADD COLUMN name TEXT');
  db.exec('UPDATE vpn_credentials SET name = common_name WHERE name IS NULL');

  // Tracks whether the issued private key is passphrase-encrypted.
  addColumnIfMissing(
    db,
    'ALTER TABLE vpn_credentials ADD COLUMN has_password INTEGER NOT NULL DEFAULT 0',
  );

  // Set when a renewal replaced this credential. The certificate stays valid
  // until revoked or expired, so the holder keeps working while the new
  // profile is delivered.
  addColumnIfMissing(
    db,
    'ALTER TABLE vpn_credentials ADD COLUMN superseded_at TEXT',
  );

  for (const statement of INDEX_STATEMENTS) db.exec(statement);
}
