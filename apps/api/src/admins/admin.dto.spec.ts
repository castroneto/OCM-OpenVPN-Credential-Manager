import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { AdminIdParamDto, CreateAdminUserDto } from './admin.dto';

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

describe('CreateAdminUserDto', () => {
  it('accepts a valid admin', () => {
    expect(
      invalidProps(CreateAdminUserDto, {
        username: 'alice',
        password: 'a-strong-password',
      }),
    ).toEqual([]);
  });

  it('requires a password of at least 12 characters', () => {
    expect(
      invalidProps(CreateAdminUserDto, {
        username: 'alice',
        password: 'short-pass',
      }),
    ).toContain('password');
  });

  it('rejects invalid usernames', () => {
    expect(
      invalidProps(CreateAdminUserDto, {
        username: 'a',
        password: 'a-strong-password',
      }),
    ).toContain('username');
  });
});

describe('AdminIdParamDto', () => {
  it('accepts a v4 UUID', () => {
    expect(
      invalidProps(AdminIdParamDto, {
        id: '3e13ef5c-df89-4fc1-b071-5c91bcca716e',
      }),
    ).toEqual([]);
  });

  it('rejects a non-UUID id', () => {
    expect(invalidProps(AdminIdParamDto, { id: '123' })).toContain('id');
    expect(invalidProps(AdminIdParamDto, { id: 'not-a-uuid' })).toContain('id');
  });
});
