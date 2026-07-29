import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  CreateVpnCredentialDto,
  PaginationQueryDto,
  RenewVpnCredentialDto,
  VpnCredentialIdParamDto,
} from './vpn.dto';

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

describe('CreateVpnCredentialDto', () => {
  it('accepts a valid lowercase name', () => {
    expect(invalidProps(CreateVpnCredentialDto, { name: 'alice' })).toEqual([]);
    expect(
      invalidProps(CreateVpnCredentialDto, {
        name: 'alice.laptop-1',
        description: 'x',
      }),
    ).toEqual([]);
  });

  it('rejects uppercase and leading dashes (flag-injection guard)', () => {
    expect(invalidProps(CreateVpnCredentialDto, { name: 'Alice' })).toContain(
      'name',
    );
    expect(invalidProps(CreateVpnCredentialDto, { name: '-alice' })).toContain(
      'name',
    );
  });

  it('caps the name length at 56 (room for the -xxxxxx suffix)', () => {
    expect(
      invalidProps(CreateVpnCredentialDto, { name: 'a'.repeat(57) }),
    ).toContain('name');
    expect(
      invalidProps(CreateVpnCredentialDto, { name: 'a'.repeat(56) }),
    ).toEqual([]);
  });

  it('rejects unknown properties', () => {
    expect(
      invalidProps(CreateVpnCredentialDto, {
        name: 'alice',
        commonName: 'hack',
      }),
    ).toContain('commonName');
  });

  it('accepts an omitted password (key ships unencrypted)', () => {
    expect(invalidProps(CreateVpnCredentialDto, { name: 'alice' })).toEqual([]);
  });

  it('accepts a password of at least 8 characters', () => {
    expect(
      invalidProps(CreateVpnCredentialDto, {
        name: 'alice',
        password: 'longenough',
      }),
    ).toEqual([]);
  });

  // openssl reads the passphrase as a single line from stdin. A newline would
  // silently truncate it — a leading one leaving the key encrypted with an
  // EMPTY passphrase while the credential still claims to be protected.
  it('rejects a password containing a newline (silent truncation)', () => {
    expect(
      invalidProps(CreateVpnCredentialDto, {
        name: 'alice',
        password: 'primeira\nsegunda',
      }),
    ).toContain('password');
  });

  it('rejects a password starting with a newline (would become empty)', () => {
    expect(
      invalidProps(CreateVpnCredentialDto, {
        name: 'alice',
        password: '\nSenhaForte1',
      }),
    ).toContain('password');
  });

  it('still accepts spaces and punctuation in a passphrase', () => {
    expect(
      invalidProps(CreateVpnCredentialDto, {
        name: 'alice',
        password: 'uma frase secreta com espaços!',
      }),
    ).toEqual([]);
  });

  it('rejects a password shorter than 8 characters', () => {
    expect(
      invalidProps(CreateVpnCredentialDto, {
        name: 'alice',
        password: 'short',
      }),
    ).toContain('password');
  });
});

describe('RenewVpnCredentialDto', () => {
  it('allows renewing without changing the passphrase', () => {
    expect(invalidProps(RenewVpnCredentialDto, {})).toEqual([]);
  });

  it('applies the same passphrase rules as issuing', () => {
    expect(
      invalidProps(RenewVpnCredentialDto, { password: '\nSenhaForte1' }),
    ).toContain('password');
    expect(
      invalidProps(RenewVpnCredentialDto, { password: 'curta' }),
    ).toContain('password');
    expect(
      invalidProps(RenewVpnCredentialDto, { password: 'senha valida 123' }),
    ).toEqual([]);
  });

  it('rejects smuggling a different name or description', () => {
    expect(invalidProps(RenewVpnCredentialDto, { name: 'outro' })).toContain(
      'name',
    );
  });
});

describe('VpnCredentialIdParamDto', () => {
  it('rejects a non-UUID id', () => {
    expect(invalidProps(VpnCredentialIdParamDto, { id: 'abc' })).toContain(
      'id',
    );
  });
});

describe('PaginationQueryDto', () => {
  it('coerces numeric strings', () => {
    const dto = plainToInstance(PaginationQueryDto, {
      page: '2',
      pageSize: '10',
    });
    expect(validateSync(dto)).toHaveLength(0);
    expect(dto.page).toBe(2);
    expect(dto.pageSize).toBe(10);
  });

  it('rejects a non-numeric page (?page=abc)', () => {
    const dto = plainToInstance(PaginationQueryDto, { page: 'abc' });
    expect(validateSync(dto).map((e) => e.property)).toContain('page');
  });

  it('applies defaults when omitted', () => {
    const dto = plainToInstance(PaginationQueryDto, {});
    expect(validateSync(dto)).toHaveLength(0);
    expect(dto.page).toBe(1);
    expect(dto.pageSize).toBe(20);
  });

  it('enforces the pageSize maximum', () => {
    const dto = plainToInstance(PaginationQueryDto, { pageSize: '1000' });
    expect(validateSync(dto).map((e) => e.property)).toContain('pageSize');
  });
});
