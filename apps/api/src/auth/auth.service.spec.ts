jest.mock('better-sqlite3');

import {
  HttpException,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import type { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import type { AdminsService } from '../admins/admins.service';
import type { LoginThrottleService } from './login-throttle.service';
import type { AppConfig } from '../config/configuration';
import type { AdminUserRecord } from '../admins/admins.repository';
import { Role } from '../common/types';
import { hashPassword } from '../common/crypto/password';

async function setup(over: Partial<AdminUserRecord> | null = {}) {
  const record: AdminUserRecord | null =
    over === null
      ? null
      : {
          id: 'id-1',
          username: 'alice',
          role: Role.ADMIN,
          createdAt: '',
          updatedAt: '',
          passwordHash: await hashPassword('right-password'),
          ...over,
        };

  const admins = { findRecordByUsername: jest.fn().mockReturnValue(record) };
  const jwtService = { signAsync: jest.fn().mockResolvedValue('jwt-token') };
  const throttle = {
    retryAfterSeconds: jest.fn().mockReturnValue(0),
    recordFailure: jest.fn(),
    reset: jest.fn(),
  };
  const config = { jwtTtlSeconds: 1800 } as AppConfig;

  const service = new AuthService(
    admins as unknown as AdminsService,
    jwtService as unknown as JwtService,
    config,
    throttle as unknown as LoginThrottleService,
  );
  return { service, admins, jwtService, throttle };
}

describe('AuthService.login', () => {
  it('returns a token for valid credentials and resets the throttle', async () => {
    const { service, jwtService, throttle } = await setup();

    const tokens = await service.login({
      username: 'alice',
      password: 'right-password',
    });

    expect(tokens).toEqual({
      accessToken: 'jwt-token',
      tokenType: 'Bearer',
      expiresIn: 1800,
    });
    expect(jwtService.signAsync).toHaveBeenCalledWith({
      sub: 'id-1',
      username: 'alice',
      role: Role.ADMIN,
    });
    expect(throttle.reset).toHaveBeenCalledWith('alice');
  });

  it('rejects a wrong password and records the failure', async () => {
    const { service, throttle } = await setup();

    await expect(
      service.login({ username: 'alice', password: 'wrong-password' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(throttle.recordFailure).toHaveBeenCalledWith('alice');
    expect(throttle.reset).not.toHaveBeenCalled();
  });

  it('rejects an unknown user (still records the failure)', async () => {
    const { service, throttle } = await setup(null);

    await expect(
      service.login({ username: 'ghost', password: 'whatever-pass' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(throttle.recordFailure).toHaveBeenCalledWith('ghost');
  });

  it('returns 429 when the account is locked (no credential check)', async () => {
    const { service, admins, throttle } = await setup();
    throttle.retryAfterSeconds.mockReturnValue(42);

    const err = await service
      .login({ username: 'alice', password: 'right-password' })
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(HttpException);
    expect((err as HttpException).getStatus()).toBe(
      HttpStatus.TOO_MANY_REQUESTS,
    );
    expect(admins.findRecordByUsername).not.toHaveBeenCalled();
  });
});
