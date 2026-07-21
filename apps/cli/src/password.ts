import {
  randomBytes,
  scrypt as scryptCallback,
  type ScryptOptions,
} from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: ScryptOptions,
) => Promise<Buffer>;

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 } as const;

/**
 * Hash a password with scrypt. Output format: `scrypt$N$r$p$saltHex$hashHex`.
 *
 * The API's verifier ([apps/api] common/crypto/password.ts) reads N/r/p from
 * this self-describing string, so only the *format* must stay in sync — the
 * params here are independent. No external dependency.
 */
export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const derived = await scrypt(plain, salt, KEY_LENGTH, SCRYPT_PARAMS);
  const { N, r, p } = SCRYPT_PARAMS;
  return `scrypt$${N}$${r}$${p}$${salt.toString('hex')}$${derived.toString('hex')}`;
}
