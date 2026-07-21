import { hashPassword, verifyPassword } from './password';

describe('password hashing', () => {
  it('produces a self-describing scrypt hash', async () => {
    const hash = await hashPassword('correct horse battery');
    const parts = hash.split('$');
    expect(parts[0]).toBe('scrypt');
    expect(parts).toHaveLength(6);
    expect(Number(parts[1])).toBeGreaterThan(0); // N
  });

  it('uses a random salt (same password -> different hashes)', async () => {
    const a = await hashPassword('same-password-123');
    const b = await hashPassword('same-password-123');
    expect(a).not.toBe(b);
  });

  it('verifies a correct password', async () => {
    const hash = await hashPassword('s3cret-passphrase');
    await expect(verifyPassword('s3cret-passphrase', hash)).resolves.toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('s3cret-passphrase');
    await expect(verifyPassword('wrong', hash)).resolves.toBe(false);
  });

  it('rejects a tampered hash', async () => {
    const hash = await hashPassword('s3cret-passphrase');
    const tampered = hash.slice(0, -2) + (hash.endsWith('aa') ? 'bb' : 'aa');
    await expect(verifyPassword('s3cret-passphrase', tampered)).resolves.toBe(
      false,
    );
  });

  it('rejects malformed stored values without throwing', async () => {
    await expect(verifyPassword('x', 'not-a-hash')).resolves.toBe(false);
    await expect(verifyPassword('x', 'scrypt$16384$8$1$$')).resolves.toBe(
      false,
    );
    await expect(verifyPassword('x', '')).resolves.toBe(false);
  });
});
