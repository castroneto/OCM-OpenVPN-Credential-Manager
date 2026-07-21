// The repository transitively imports better-sqlite3 (native); mock it so the
// binary is never loaded (these tests exercise pure logic with mocked deps).
jest.mock('better-sqlite3');

import { BadRequestException, ConflictException } from '@nestjs/common';
import { VpnService } from './vpn.service';
import type { VpnRepository } from './vpn.repository';
import type { EasyRsaService } from './easyrsa.service';
import { VpnCredentialStatus, type VpnCredential } from '../common/types';

function makeCredential(over: Partial<VpnCredential> = {}): VpnCredential {
  return {
    id: 'id-1',
    name: 'alice',
    commonName: 'alice-abc123',
    description: null,
    status: VpnCredentialStatus.ACTIVE,
    createdAt: '2026-01-01T00:00:00.000Z',
    revokedAt: null,
    expiresAt: null,
    ...over,
  };
}

interface RepoMock {
  findActiveByName: jest.Mock;
  findByCommonName: jest.Mock;
  findById: jest.Mock;
  insert: jest.Mock;
  markRevoked: jest.Mock;
  listPage: jest.Mock;
}

function setup() {
  const repo: RepoMock = {
    findActiveByName: jest.fn(),
    findByCommonName: jest.fn().mockReturnValue(null),
    findById: jest.fn(),
    insert: jest.fn(),
    markRevoked: jest.fn(),
    listPage: jest.fn(),
  };
  const easyRsa = {
    issueClient: jest
      .fn()
      .mockResolvedValue({ profile: 'PROFILE', expiresAt: null }),
    revokeClient: jest.fn().mockResolvedValue(undefined),
    getProfile: jest.fn().mockResolvedValue('PROFILE'),
  };
  const service = new VpnService(
    repo as unknown as VpnRepository,
    easyRsa as unknown as EasyRsaService,
  );
  return { service, repo, easyRsa };
}

describe('VpnService.create', () => {
  it('issues a credential with a unique CN derived from the name', async () => {
    const { service, repo, easyRsa } = setup();
    repo.findActiveByName.mockReturnValue(null);
    repo.findById.mockReturnValue(makeCredential());

    const result = await service.create({ name: 'alice' });

    expect(result.profile).toBe('PROFILE');
    const issuedCn = easyRsa.issueClient.mock.calls[0][0] as string;
    expect(issuedCn).toMatch(/^alice-[0-9a-f]{6}$/);
    expect(repo.insert).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'alice', commonName: issuedCn }),
    );
  });

  it('rejects a name that is still active (no PKI call)', async () => {
    const { service, repo, easyRsa } = setup();
    repo.findActiveByName.mockReturnValue(makeCredential());

    await expect(service.create({ name: 'alice' })).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(easyRsa.issueClient).not.toHaveBeenCalled();
    expect(repo.insert).not.toHaveBeenCalled();
  });

  it('retries the CN on collision', async () => {
    const { service, repo, easyRsa } = setup();
    repo.findActiveByName.mockReturnValue(null);
    repo.findById.mockReturnValue(makeCredential());
    // First candidate collides, second is free.
    repo.findByCommonName
      .mockReturnValueOnce(makeCredential())
      .mockReturnValueOnce(null);

    await service.create({ name: 'alice' });

    expect(repo.findByCommonName.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(easyRsa.issueClient).toHaveBeenCalledTimes(1);
    expect(repo.insert).toHaveBeenCalledTimes(1);
  });
});

describe('VpnService.revoke', () => {
  it('revokes an active credential and marks it in the DB', async () => {
    const { service, repo, easyRsa } = setup();
    repo.findById
      .mockReturnValueOnce(makeCredential())
      .mockReturnValueOnce(
        makeCredential({ status: VpnCredentialStatus.REVOKED }),
      );

    await service.revoke('id-1');

    expect(easyRsa.revokeClient).toHaveBeenCalledWith('alice-abc123');
    expect(repo.markRevoked).toHaveBeenCalledWith('id-1', expect.any(String));
  });

  it('refuses to revoke an already-revoked credential', async () => {
    const { service, repo, easyRsa } = setup();
    repo.findById.mockReturnValue(
      makeCredential({ status: VpnCredentialStatus.REVOKED }),
    );

    await expect(service.revoke('id-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(easyRsa.revokeClient).not.toHaveBeenCalled();
  });
});

describe('VpnService.downloadProfile', () => {
  it('returns the profile named after the label', async () => {
    const { service, repo, easyRsa } = setup();
    repo.findById.mockReturnValue(makeCredential({ name: 'alice' }));

    const result = await service.downloadProfile('id-1');

    expect(result.fileName).toBe('alice');
    expect(result.profile).toBe('PROFILE');
    expect(easyRsa.getProfile).toHaveBeenCalledWith('alice-abc123');
  });

  it('refuses to download a revoked credential', async () => {
    const { service, repo } = setup();
    repo.findById.mockReturnValue(
      makeCredential({ status: VpnCredentialStatus.REVOKED }),
    );
    await expect(service.downloadProfile('id-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
