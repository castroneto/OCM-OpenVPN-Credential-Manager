import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ChangePasswordDto, LoginDto } from './auth.dto';

/** Mirrors the global ValidationPipe options; returns failing property names. */
function invalidProps<T extends object>(
  cls: new () => T,
  payload: unknown,
): string[] {
  const instance = plainToInstance(cls, payload);
  return validateSync(instance, {
    whitelist: true,
    forbidNonWhitelisted: true,
    forbidUnknownValues: true,
  }).map((e) => e.property);
}

describe('LoginDto', () => {
  it('accepts a valid payload', () => {
    expect(
      invalidProps(LoginDto, { username: 'admin', password: 'password1' }),
    ).toEqual([]);
  });

  it('rejects a short password', () => {
    expect(
      invalidProps(LoginDto, { username: 'admin', password: 'short' }),
    ).toContain('password');
  });

  it('rejects invalid username characters', () => {
    expect(
      invalidProps(LoginDto, { username: 'ad min!', password: 'password1' }),
    ).toContain('username');
  });

  it('rejects unknown extra properties', () => {
    expect(
      invalidProps(LoginDto, {
        username: 'admin',
        password: 'password1',
        role: 'ADMIN',
      }),
    ).toContain('role');
  });
});

describe('ChangePasswordDto', () => {
  it('accepts valid current/new passwords', () => {
    expect(
      invalidProps(ChangePasswordDto, {
        currentPassword: 'oldpassword',
        newPassword: 'a-new-strong-password',
      }),
    ).toEqual([]);
  });

  it('requires the new password to be at least 12 chars', () => {
    expect(
      invalidProps(ChangePasswordDto, {
        currentPassword: 'oldpassword',
        newPassword: 'tooshort',
      }),
    ).toContain('newPassword');
  });
});
