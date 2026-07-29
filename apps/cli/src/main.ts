#!/usr/bin/env node
/**
 * ocm-admin — local administration CLI (app: @ocm/cli).
 *
 * Runs on the server (or inside the container) against the same SQLite file
 * as the API. The system ships with NO admin; create the first one here:
 *
 *   ocm-admin create <username>
 *   ocm-admin reset-password <username>
 *   ocm-admin list
 *   ocm-admin delete <username>
 *   ocm-admin import-clients [--dry-run]
 *
 * Passwords are read interactively (never passed as arguments).
 */
import { existsSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, isAbsolute, resolve } from 'node:path';
import * as readline from 'node:readline';
import Database from 'better-sqlite3';
import { ADMIN_USERS_SCHEMA } from './schema';
import { hashPassword } from './password';
import {
  isClientCertificate,
  isKeyEncrypted,
  pkiPaths,
  readIndex,
} from './pki';

const USERNAME_PATTERN = /^[a-zA-Z0-9._-]{3,64}$/;
const MIN_PASSWORD_LENGTH = 12;

let sharedReadline: readline.Interface | null = null;
const lineQueue: string[] = [];
let lineWaiter: ((line: string) => void) | null = null;

/** Lazily create a readline that buffers lines so none are lost between the
 *  two password prompts (readline emits 'line' regardless of a pending read). */
function readLine(): Promise<string> {
  if (!sharedReadline) {
    sharedReadline = readline.createInterface({ input: process.stdin });
    sharedReadline.on('line', (line) => {
      if (lineWaiter) {
        const waiter = lineWaiter;
        lineWaiter = null;
        waiter(line);
      } else {
        lineQueue.push(line);
      }
    });
  }
  const queued = lineQueue.shift();
  if (queued !== undefined) return Promise.resolve(queued);
  return new Promise((resolvePromise) => {
    lineWaiter = resolvePromise;
  });
}

function openDb(): Database.Database {
  const raw = process.env.OCM_DATABASE_PATH ?? './data/ocm.sqlite';
  const path = isAbsolute(raw) ? raw : resolve(process.cwd(), raw);
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o750 });

  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  const apply = db.transaction((statements: readonly string[]) => {
    for (const statement of statements) db.exec(statement);
  });
  apply(ADMIN_USERS_SCHEMA);
  return db;
}

/**
 * Read a password. Masks input on a real TTY; falls back to line-buffered
 * reads for piped/non-interactive input (so multiple prompts stay in sync).
 */
function promptHidden(question: string): Promise<string> {
  if (!process.stdin.isTTY) {
    process.stdout.write(question);
    return readLine();
  }

  return new Promise((resolvePromise) => {
    const { stdin, stdout } = process;
    stdout.write(question);
    let value = '';

    const finish = (): void => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener('data', onData);
      stdout.write('\n');
      resolvePromise(value);
    };

    const onData = (chunk: Buffer): void => {
      if (chunk.includes(0x03)) {
        stdout.write('\n');
        process.exit(130);
      }
      if (chunk.length === 1 && (chunk[0] === 0x7f || chunk[0] === 0x08)) {
        if (value.length > 0) {
          value = value.slice(0, -1);
          stdout.write('\b \b');
        }
        return;
      }
      const text = chunk.toString('utf8');
      const newlineAt = text.search(/[\r\n]/);
      if (newlineAt >= 0) {
        value += text.slice(0, newlineAt);
        finish();
        return;
      }
      value += text;
      stdout.write('*'.repeat(text.length));
    };

    stdin.setEncoding('utf8');
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on('data', onData);
  });
}

function closeReadline(): void {
  sharedReadline?.close();
  sharedReadline = null;
}

async function readNewPassword(): Promise<string> {
  const password = await promptHidden('New password: ');
  if (password.length < MIN_PASSWORD_LENGTH) {
    fail(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  const confirm = await promptHidden('Confirm password: ');
  if (password !== confirm) fail('Passwords do not match.');
  return password;
}

function assertUsername(
  username: string | undefined,
): asserts username is string {
  if (!username || !USERNAME_PATTERN.test(username)) {
    fail('Invalid or missing username (3-64 chars: letters, numbers, . _ -).');
  }
}

function fail(message: string): never {
  // eslint-disable-next-line no-console
  console.error(`Error: ${message}`);
  process.exit(1);
}

async function createAdmin(username: string | undefined): Promise<void> {
  assertUsername(username);
  const db = openDb();
  const existing = db
    .prepare('SELECT id FROM admin_users WHERE username = ?')
    .get(username);
  if (existing) fail(`Admin "${username}" already exists.`);

  const password = await readNewPassword();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO admin_users (id, username, password_hash, role, created_at, updated_at)
     VALUES (?, ?, ?, 'ADMIN', ?, ?)`,
  ).run(randomUUID(), username, await hashPassword(password), now, now);
  db.close();
  // eslint-disable-next-line no-console
  console.log(`Admin "${username}" created.`);
}

async function resetPassword(username: string | undefined): Promise<void> {
  assertUsername(username);
  const db = openDb();
  const row = db
    .prepare('SELECT id FROM admin_users WHERE username = ?')
    .get(username) as { id: string } | undefined;
  if (!row) fail(`Admin "${username}" not found.`);

  const password = await readNewPassword();
  db.prepare(
    'UPDATE admin_users SET password_hash = ?, updated_at = ? WHERE username = ?',
  ).run(await hashPassword(password), new Date().toISOString(), username);
  db.close();
  // eslint-disable-next-line no-console
  console.log(`Password for "${username}" updated.`);
}

function listAdmins(): void {
  const db = openDb();
  const rows = db
    .prepare(
      'SELECT username, created_at FROM admin_users ORDER BY created_at ASC',
    )
    .all() as { username: string; created_at: string }[];
  db.close();
  if (rows.length === 0) {
    // eslint-disable-next-line no-console
    console.log('No admins. Create one with: ocm-admin create <username>');
    return;
  }
  for (const row of rows) {
    // eslint-disable-next-line no-console
    console.log(`${row.username}\t${row.created_at}`);
  }
}

function deleteAdmin(username: string | undefined): void {
  assertUsername(username);
  const db = openDb();
  const count = (
    db.prepare('SELECT COUNT(*) AS c FROM admin_users').get() as { c: number }
  ).c;
  if (count <= 1) fail('Refusing to delete the last remaining admin.');
  const result = db
    .prepare('DELETE FROM admin_users WHERE username = ?')
    .run(username);
  db.close();
  if (result.changes === 0) fail(`Admin "${username}" not found.`);
  // eslint-disable-next-line no-console
  console.log(`Admin "${username}" deleted.`);
}

/**
 * Adopt the clients of an existing CA into OCM's database.
 *
 * OCM manages a PKI that predates it, so the certificates in `index.txt` are
 * the source of truth. This only inserts the metadata rows the console lists —
 * it never touches a certificate, a key or the CA. Re-runnable: entries already
 * known are skipped, so it can be repeated after the CA issues more clients.
 */
function importClients(dryRun: boolean): void {
  const pkiDir = process.env.OCM_PKI_DIR;
  if (!pkiDir) {
    fail(
      'OCM_PKI_DIR is not set. Run via the ocm-admin wrapper, or export it first.',
    );
  }
  if (!existsSync(pkiDir)) fail(`PKI directory not found: ${pkiDir}`);

  const entries = readIndex(pkiDir);
  if (entries.length === 0) fail(`No certificate index found under ${pkiDir}.`);

  const db = openDb();
  const hasTable = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
    .get('vpn_credentials');
  if (!hasTable) {
    db.close();
    fail('Schema missing. Start the API once (or run its migration) first.');
  }

  const paths = pkiPaths(pkiDir);
  const known = db.prepare(
    'SELECT id FROM vpn_credentials WHERE common_name = ?',
  );
  const insert = db.prepare(
    `INSERT INTO vpn_credentials
       (id, name, common_name, description, status, created_at, revoked_at, expires_at, has_password)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  let imported = 0;
  let skipped = 0;
  const now = new Date().toISOString();

  for (const entry of entries) {
    const { commonName } = entry;
    if (known.get(commonName)) {
      skipped += 1;
      continue;
    }
    // The server certificate shares the database but is not a credential.
    if (!isClientCertificate(paths.certPath(commonName))) {
      skipped += 1;
      continue;
    }

    const status = entry.revoked ? 'REVOKED' : 'ACTIVE';
    const hasPassword = isKeyEncrypted(paths.keyPath(commonName));
    // eslint-disable-next-line no-console
    console.log(
      `${dryRun ? 'would import' : 'imported'}  ${commonName}\t${status}${
        hasPassword ? '\tpassword-protected' : ''
      }`,
    );

    if (!dryRun) {
      insert.run(
        randomUUID(),
        commonName,
        commonName,
        'Imported from the existing PKI',
        status,
        now,
        entry.revokedAt,
        entry.expiresAt,
        hasPassword ? 1 : 0,
      );
    }
    imported += 1;
  }

  db.close();
  // eslint-disable-next-line no-console
  console.log(
    `\n${dryRun ? 'Would import' : 'Imported'} ${imported} credential(s); ${skipped} skipped (already known, or not a client certificate).`,
  );
}

function usage(): void {
  // eslint-disable-next-line no-console
  console.log(
    [
      'ocm-admin — OCM administrator management',
      '',
      'Usage:',
      '  ocm-admin create <username>',
      '  ocm-admin reset-password <username>',
      '  ocm-admin list',
      '  ocm-admin delete <username>',
      '',
      'OpenVPN clients:',
      '  ocm-admin import-clients [--dry-run]   adopt clients already in the PKI',
    ].join('\n'),
  );
}

async function main(): Promise<void> {
  const [command, arg] = process.argv.slice(2);
  switch (command) {
    case 'create':
      await createAdmin(arg);
      break;
    case 'reset-password':
      await resetPassword(arg);
      break;
    case 'list':
      listAdmins();
      break;
    case 'delete':
      deleteAdmin(arg);
      break;
    case 'import-clients':
      importClients(arg === '--dry-run');
      break;
    default:
      usage();
      closeReadline();
      process.exit(command ? 1 : 0);
  }
  closeReadline();
}

main().catch((err: unknown) => {
  closeReadline();
  fail(err instanceof Error ? err.message : String(err));
});
