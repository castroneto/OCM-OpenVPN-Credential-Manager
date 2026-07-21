import { Injectable } from '@nestjs/common';
import { VpnCredentialStatus, type VpnCredential } from '../common/types';
import { DatabaseService } from '../database/database.service';

interface VpnRow {
  id: string;
  name: string | null;
  common_name: string;
  description: string | null;
  status: string;
  created_at: string;
  revoked_at: string | null;
  expires_at: string | null;
}

function mapRow(row: VpnRow): VpnCredential {
  return {
    id: row.id,
    // Older rows may predate the `name` column; fall back to the common name.
    name: row.name ?? row.common_name,
    commonName: row.common_name,
    description: row.description,
    status:
      row.status === VpnCredentialStatus.REVOKED
        ? VpnCredentialStatus.REVOKED
        : VpnCredentialStatus.ACTIVE,
    createdAt: row.created_at,
    revokedAt: row.revoked_at,
    expiresAt: row.expires_at,
  };
}

@Injectable()
export class VpnRepository {
  constructor(private readonly database: DatabaseService) {}

  findById(id: string): VpnCredential | null {
    const row = this.database.db
      .prepare('SELECT * FROM vpn_credentials WHERE id = ?')
      .get(id) as VpnRow | undefined;
    return row ? mapRow(row) : null;
  }

  findByCommonName(commonName: string): VpnCredential | null {
    const row = this.database.db
      .prepare('SELECT * FROM vpn_credentials WHERE common_name = ?')
      .get(commonName) as VpnRow | undefined;
    return row ? mapRow(row) : null;
  }

  /** An active credential currently using this label, if any. */
  findActiveByName(name: string): VpnCredential | null {
    const row = this.database.db
      .prepare(
        `SELECT * FROM vpn_credentials WHERE name = ? AND status = 'ACTIVE' LIMIT 1`,
      )
      .get(name) as VpnRow | undefined;
    return row ? mapRow(row) : null;
  }

  listPage(
    limit: number,
    offset: number,
  ): { items: VpnCredential[]; total: number } {
    const rows = this.database.db
      .prepare(
        'SELECT * FROM vpn_credentials ORDER BY created_at DESC LIMIT ? OFFSET ?',
      )
      .all(limit, offset) as VpnRow[];
    const totalRow = this.database.db
      .prepare('SELECT COUNT(*) AS count FROM vpn_credentials')
      .get() as { count: number };
    return { items: rows.map(mapRow), total: totalRow.count };
  }

  insert(record: {
    id: string;
    name: string;
    commonName: string;
    description: string | null;
    createdAt: string;
    expiresAt: string | null;
  }): void {
    this.database.db
      .prepare(
        `INSERT INTO vpn_credentials
           (id, name, common_name, description, status, created_at, revoked_at, expires_at)
         VALUES (?, ?, ?, ?, 'ACTIVE', ?, NULL, ?)`,
      )
      .run(
        record.id,
        record.name,
        record.commonName,
        record.description,
        record.createdAt,
        record.expiresAt,
      );
  }

  markRevoked(id: string, revokedAt: string): void {
    this.database.db
      .prepare(
        `UPDATE vpn_credentials SET status = 'REVOKED', revoked_at = ? WHERE id = ?`,
      )
      .run(revokedAt, id);
  }
}
