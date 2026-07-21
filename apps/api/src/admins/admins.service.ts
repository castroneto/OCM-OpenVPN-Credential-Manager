import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AdminUser } from '../common/types';
import type { CreateAdminUserDto } from './admin.dto';
import { AdminsRepository, type AdminUserRecord } from './admins.repository';
import { hashPassword, verifyPassword } from '../common/crypto/password';

/** Strips the password hash before an admin crosses the API boundary. */
function toPublic(record: AdminUserRecord): AdminUser {
  return {
    id: record.id,
    username: record.username,
    role: record.role,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

@Injectable()
export class AdminsService {
  constructor(private readonly repository: AdminsRepository) {}

  list(): AdminUser[] {
    return this.repository.list().map(toPublic);
  }

  getById(id: string): AdminUser {
    const record = this.repository.findById(id);
    if (!record) throw new NotFoundException('Admin not found');
    return toPublic(record);
  }

  /** Whether an admin still exists — used by the auth guard to revoke tokens
   *  of deleted admins on the next request. */
  exists(id: string): boolean {
    return this.repository.findById(id) !== null;
  }

  findRecordByUsername(username: string): AdminUserRecord | null {
    return this.repository.findByUsername(username);
  }

  /** Whether any admin exists — gates the public first-run setup endpoint. */
  hasAny(): boolean {
    return this.repository.count() > 0;
  }

  /** Creates the first admin. Refuses once any admin exists (setup is done). */
  async createFirstAdmin(dto: CreateAdminUserDto): Promise<AdminUser> {
    if (this.hasAny()) {
      throw new ForbiddenException('Setup already completed');
    }
    return this.create(dto);
  }

  async create(dto: CreateAdminUserDto): Promise<AdminUser> {
    if (this.repository.findByUsername(dto.username)) {
      throw new ConflictException('Username already exists');
    }
    const now = new Date().toISOString();
    const id = randomUUID();
    const passwordHash = await hashPassword(dto.password);
    this.repository.insert({
      id,
      username: dto.username,
      passwordHash,
      createdAt: now,
      updatedAt: now,
    });
    return this.getById(id);
  }

  async changePassword(
    id: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const record = this.repository.findById(id);
    if (!record) throw new NotFoundException('Admin not found');

    const valid = await verifyPassword(currentPassword, record.passwordHash);
    if (!valid) throw new BadRequestException('Current password is incorrect');

    const passwordHash = await hashPassword(newPassword);
    this.repository.updatePassword(id, passwordHash, new Date().toISOString());
  }

  delete(id: string, requestingUserId: string): void {
    const record = this.repository.findById(id);
    if (!record) throw new NotFoundException('Admin not found');
    if (id === requestingUserId) {
      throw new BadRequestException('You cannot delete your own account');
    }
    if (this.repository.count() <= 1) {
      throw new BadRequestException('Cannot delete the last remaining admin');
    }
    this.repository.delete(id);
  }
}
