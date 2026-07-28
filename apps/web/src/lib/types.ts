/** Wire types shared with the API (kept in sync manually — the app is small). */

export type Role = 'ADMIN';

export interface AdminUser {
  id: string;
  username: string;
  role: Role;
  createdAt: string;
  updatedAt: string;
}

export type VpnCredentialStatus = 'ACTIVE' | 'REVOKED';

export interface VpnCredential {
  id: string;
  name: string;
  commonName: string;
  description: string | null;
  status: VpnCredentialStatus;
  hasPassword: boolean;
  createdAt: string;
  revokedAt: string | null;
  expiresAt: string | null;
}

export interface AuthTokens {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
}

export interface SetupStatus {
  needsSetup: boolean;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
