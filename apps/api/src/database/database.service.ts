import { existsSync, mkdirSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import Database from 'better-sqlite3';
import { AppConfig } from '../config/configuration';
import { applySchema } from './schema';

/**
 * Owns the single better-sqlite3 connection. Enables WAL + foreign keys and
 * applies the schema on init. All repositories depend on {@link db}.
 */
@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private connection: Database.Database | null = null;

  constructor(private readonly config: AppConfig) {}

  onModuleInit(): void {
    const path = isAbsolute(this.config.databasePath)
      ? this.config.databasePath
      : resolve(process.cwd(), this.config.databasePath);

    const dir = dirname(path);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true, mode: 0o750 });
    }

    const db = new Database(path);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.pragma('busy_timeout = 5000');
    this.connection = db;

    this.migrate();
    this.logger.log(`SQLite database ready at ${path}`);
  }

  onModuleDestroy(): void {
    this.connection?.close();
    this.connection = null;
  }

  /** Apply schema DDL + migrations. Idempotent — safe to run on every boot. */
  migrate(): void {
    applySchema(this.db);
  }

  get db(): Database.Database {
    if (!this.connection) {
      throw new Error('Database connection is not initialised');
    }
    return this.connection;
  }
}
