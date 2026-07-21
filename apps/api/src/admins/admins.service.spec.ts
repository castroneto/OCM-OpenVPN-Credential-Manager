jest.mock('better-sqlite3');

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AdminsService } from './admins.service';
import type { AdminsRepository, AdminUserRecord } from './admins.repository';
import { Role } from '../common/types';
import { hashPassword } from '../common/crypto/password';

function makeRecord(over: Partial<AdminUserRecord> = {}): AdminUserRecord {
  return {
    id: 'id-1',
    username: 'alice',
    role: Role.ADMIN,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    passwordHash: 'scrypt$16384$8$1$00$00',
    ...over,
  };
}

interface RepoMock {
  findByUsername: jest.Mock;
  findById: jest.Mock;
  insert: jest.Mock;
  updatePassword: jest.Mock;
  delete: jest.Mock;
  count: jest.Mock;
  list: jest.Mock;
}

function setup() {
  const repo: RepoMock = {
    findByUsername: jest.fn(),
    findById: jest.fn(),
    insert: jest.fn(),
    updatePassword: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
    list: jest.fn(),
  };
  const service = new AdminsService(repo as unknown as AdminsRepository);
  return { service, repo };
}

describe('AdminsService.create', () => {
  it('hashes the password and inserts a new admin', async () => {
    const { service, repo } = setup();
    repo.findByUsername.mockReturnValue(null);
    repo.findById.mockReturnValue(makeRecord());

    const admin = await service.create({
      username: 'alice',
      password: 'a-strong-pass1',
    });

    expect(admin).not.toHaveProperty('passwordHash');
    const inserted = repo.insert.mock.calls[0][0];
    expect(inserted.passwordHash).toMatch(/^scrypt\$/);
    expect(inserted.username).toBe('alice');
  });

  it('rejects a duplicate username', async () => {
    const { service, repo } = setup();
    repo.findByUsername.mockReturnValue(makeRecord());
    await expect(
      service.create({ username: 'alice', password: 'a-strong-pass1' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(repo.insert).not.toHaveBeenCalled();
  });
});

describe('AdminsService.changePassword', () => {
  it('updates the password when the current one is correct', async () => {
    const { service, repo } = setup();
    const passwordHash = await hashPassword('current-pass-1');
    repo.findById.mockReturnValue(makeRecord({ passwordHash }));

    await service.changePassword('id-1', 'current-pass-1', 'a-brand-new-pass');

    expect(repo.updatePassword).toHaveBeenCalledWith(
      'id-1',
      expect.stringMatching(/^scrypt\$/),
      expect.any(String),
    );
  });

  it('rejects a wrong current password', async () => {
    const { service, repo } = setup();
    const passwordHash = await hashPassword('current-pass-1');
    repo.findById.mockReturnValue(makeRecord({ passwordHash }));

    await expect(
      service.changePassword('id-1', 'wrong-pass', 'a-brand-new-pass'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.updatePassword).not.toHaveBeenCalled();
  });
});

describe('AdminsService.delete', () => {
  it('deletes another admin when more than one remains', () => {
    const { service, repo } = setup();
    repo.findById.mockReturnValue(makeRecord({ id: 'id-2' }));
    repo.count.mockReturnValue(2);

    service.delete('id-2', 'id-1');
    expect(repo.delete).toHaveBeenCalledWith('id-2');
  });

  it('refuses to delete your own account', () => {
    const { service, repo } = setup();
    repo.findById.mockReturnValue(makeRecord({ id: 'id-1' }));
    repo.count.mockReturnValue(2);
    expect(() => service.delete('id-1', 'id-1')).toThrow(BadRequestException);
  });

  it('refuses to delete the last remaining admin', () => {
    const { service, repo } = setup();
    repo.findById.mockReturnValue(makeRecord({ id: 'id-2' }));
    repo.count.mockReturnValue(1);
    expect(() => service.delete('id-2', 'id-1')).toThrow(BadRequestException);
  });

  it('throws NotFound for an unknown admin', () => {
    const { service, repo } = setup();
    repo.findById.mockReturnValue(null);
    expect(() => service.delete('missing', 'id-1')).toThrow(NotFoundException);
  });
});

describe('AdminsService.exists', () => {
  it('reflects whether the admin is present', () => {
    const { service, repo } = setup();
    repo.findById.mockReturnValueOnce(makeRecord()).mockReturnValueOnce(null);
    expect(service.exists('id-1')).toBe(true);
    expect(service.exists('id-1')).toBe(false);
  });
});

describe('AdminsService.createFirstAdmin', () => {
  it('creates the first admin when none exist', async () => {
    const { service, repo } = setup();
    repo.count.mockReturnValue(0);
    repo.findByUsername.mockReturnValue(null);
    repo.findById.mockReturnValue(makeRecord());

    await service.createFirstAdmin({
      username: 'alice',
      password: 'a-strong-pass1',
    });

    expect(repo.insert).toHaveBeenCalledTimes(1);
  });

  it('refuses once any admin exists (and inserts nothing)', async () => {
    const { service, repo } = setup();
    repo.count.mockReturnValue(1);

    await expect(
      service.createFirstAdmin({
        username: 'mallory',
        password: 'a-strong-pass1',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repo.insert).not.toHaveBeenCalled();
  });
});
