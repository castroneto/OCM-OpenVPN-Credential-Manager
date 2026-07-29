/**
 * Read-only helpers for an existing easy-rsa PKI.
 *
 * OCM attaches to a CA that predates it, so the clients it must manage already
 * live in the OpenSSL certificate database (`index.txt`). Nothing here writes.
 */
import { X509Certificate } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Extended Key Usage OIDs distinguishing a client from the server cert. */
const EKU_CLIENT_AUTH = '1.3.6.1.5.5.7.3.2';
const EKU_SERVER_AUTH = '1.3.6.1.5.5.7.3.1';

export interface PkiEntry {
  commonName: string;
  revoked: boolean;
  /** Certificate expiry, ISO string. */
  expiresAt: string | null;
  /** Revocation timestamp, ISO string; null while valid. */
  revokedAt: string | null;
}

/**
 * Convert an ASN.1 UTCTime (`YYMMDDHHMMSSZ`) to an ISO string.
 * Per RFC 5280 a two-digit year < 50 means 20xx, otherwise 19xx.
 */
export function utcTimeToIso(value: string): string | null {
  const match = /^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})Z?$/.exec(
    value.trim(),
  );
  if (!match) return null;
  const [, yy, mm, dd, hh, mi, ss] = match;
  const year = Number(yy) < 50 ? 2000 + Number(yy) : 1900 + Number(yy);
  const date = new Date(
    Date.UTC(
      year,
      Number(mm) - 1,
      Number(dd),
      Number(hh),
      Number(mi),
      Number(ss),
    ),
  );
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Pull the Common Name out of an OpenSSL DN such as `/C=BR/CN=alice`. */
export function extractCommonName(dn: string): string | null {
  const match = /\/CN=([^/]+)/.exec(dn);
  return match?.[1]?.trim() || null;
}

/**
 * Parse `index.txt`. Columns are tab-separated:
 * `status  expiry  revocation  serial  filename  DN`
 * (the revocation column is empty while the certificate is valid).
 */
export function parseIndex(contents: string): PkiEntry[] {
  const entries: PkiEntry[] = [];
  for (const line of contents.split('\n')) {
    if (!line.trim()) continue;
    const fields = line.split('\t');
    if (fields.length < 6) continue;

    const commonName = extractCommonName(fields[5] ?? '');
    if (!commonName) continue;

    // A revocation date may carry a reason suffix: `250630185156Z,keyCompromise`.
    const revocationField = (fields[2] ?? '').split(',')[0] ?? '';

    entries.push({
      commonName,
      revoked: fields[0] === 'R',
      expiresAt: utcTimeToIso(fields[1] ?? ''),
      revokedAt: revocationField ? utcTimeToIso(revocationField) : null,
    });
  }
  return entries;
}

/**
 * True when the certificate is a VPN *client*. The server certificate lives in
 * the same database and must never be imported as a credential.
 */
export function isClientCertificate(certPath: string): boolean {
  try {
    const usage = new X509Certificate(readFileSync(certPath)).keyUsage ?? [];
    if (usage.includes(EKU_SERVER_AUTH)) return false;
    // easy-rsa's client profile sets clientAuth; treat an absent EKU as a
    // client so unusual profiles are still manageable.
    return usage.length === 0 || usage.includes(EKU_CLIENT_AUTH);
  } catch {
    return false;
  }
}

/** Whether a private key on disk is passphrase-protected. */
export function isKeyEncrypted(keyPath: string): boolean {
  try {
    const pem = readFileSync(keyPath, 'utf8');
    return pem.includes('ENCRYPTED');
  } catch {
    return false;
  }
}

export interface PkiPaths {
  indexPath: string;
  certPath: (commonName: string) => string;
  keyPath: (commonName: string) => string;
}

export function pkiPaths(pkiDir: string): PkiPaths {
  return {
    indexPath: join(pkiDir, 'index.txt'),
    certPath: (cn) => join(pkiDir, 'issued', `${cn}.crt`),
    keyPath: (cn) => join(pkiDir, 'private', `${cn}.key`),
  };
}

export function readIndex(pkiDir: string): PkiEntry[] {
  const { indexPath } = pkiPaths(pkiDir);
  if (!existsSync(indexPath)) return [];
  return parseIndex(readFileSync(indexPath, 'utf8'));
}
