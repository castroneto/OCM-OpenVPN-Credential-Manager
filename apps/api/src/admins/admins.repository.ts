import { Injectable } from '@nestjs/common';
import { Role, type AdminUser } from '../common/types';
import { DatabaseService } from '../database/database.service';

/** Internal row including the password hash (never leaves the service layer). */
export interface AdminUserRecord extends AdminUser {
  passwordHash: string;
}

interface AdminRow {
  id: string;
  username: string;
  password_hash: string;
  role: string;
  created_at: string;
  updated_at: string;
}

function mapRow(row: AdminRow): AdminUserRecord {
  return {
    id: row.id,
    username: row.username,
    passwordHash: row.password_hash,
    role: Role.ADMIN,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

@Injectable()
export class AdminsRepository {
  constructor(private readonly database: DatabaseService) {}

  findByUsername(username: string): AdminUserRecord | null {
    const row = this.database.db
      .prepare('SELECT * FROM admin_users WHERE username = ?')
      .get(username) as AdminRow | undefined;
    return row ? mapRow(row) : null;
  }

  findById(id: string): AdminUserRecord | null {
    const row = this.database.db
      .prepare('SELECT * FROM admin_users WHERE id = ?')
      .get(id) as AdminRow | undefined;
    return row ? mapRow(row) : null;
  }

  list(): AdminUserRecord[] {
    const rows = this.database.db
      .prepare('SELECT * FROM admin_users ORDER BY created_at ASC')
      .all() as AdminRow[];
    return rows.map(mapRow);
  }

  insert(record: {
    id: string;
    username: string;
    passwordHash: string;
    createdAt: string;
    updatedAt: string;
  }): void {
    this.database.db
      .prepare(
        `INSERT INTO admin_users (id, username, password_hash, role, created_at, updated_at)
         VALUES (?, ?, ?, 'ADMIN', ?, ?)`,
      )
      .run(
        record.id,
        record.username,
        record.passwordHash,
        record.createdAt,
        record.updatedAt,
      );
  }

  updatePassword(id: string, passwordHash: string, updatedAt: string): void {
    this.database.db
      .prepare(
        'UPDATE admin_users SET password_hash = ?, updated_at = ? WHERE id = ?',
      )
      .run(passwordHash, updatedAt, id);
  }

  delete(id: string): void {
    this.database.db.prepare('DELETE FROM admin_users WHERE id = ?').run(id);
  }

  count(): number {
    const row = this.database.db
      .prepare('SELECT COUNT(*) AS count FROM admin_users')
      .get() as { count: number };
    return row.count;
  }
}
