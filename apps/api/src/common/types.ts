/** Shared domain types for the OCM API. No `any` / `object` / `Record`. */

export const Role = {
  ADMIN: 'ADMIN',
} as const;
export type Role = (typeof Role)[keyof typeof Role];

/** Panel operator account (the human who logs into OCM). Admin only. */
export interface AdminUser {
  id: string;
  username: string;
  role: Role;
  createdAt: string;
  updatedAt: string;
}

export const VpnCredentialStatus = {
  ACTIVE: 'ACTIVE',
  REVOKED: 'REVOKED',
} as const;
export type VpnCredentialStatus =
  (typeof VpnCredentialStatus)[keyof typeof VpnCredentialStatus];

/** An OpenVPN client credential managed by OCM. */
export interface VpnCredential {
  id: string;
  /** Reusable human label (e.g. "alice"). Not unique across revoked entries. */
  name: string;
  /** Unique PKI Common Name (e.g. "alice-a1b2c3"). Immutable. */
  commonName: string;
  description: string | null;
  status: VpnCredentialStatus;
  /** Whether the client's private key is passphrase-encrypted. */
  hasPassword: boolean;
  createdAt: string;
  revokedAt: string | null;
  expiresAt: string | null;
  /**
   * Set when a renewal issued a replacement. The certificate remains valid —
   * so the holder is not cut off before receiving the new profile — but this
   * is no longer the current credential for that name.
   */
  supersededAt: string | null;
}

export interface AuthTokens {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
}

export interface JwtPayload {
  sub: string;
  username: string;
  role: Role;
}

/** First-run status: true until the first admin exists. */
export interface SetupStatus {
  needsSetup: boolean;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ApiErrorShape {
  statusCode: number;
  error: string;
  message: string | string[];
}
