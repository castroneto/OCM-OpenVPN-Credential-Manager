import { ACCESS_TOKEN_STORAGE_KEY, Routes } from './routes';
import type {
  AdminUser,
  AuthTokens,
  Paginated,
  SetupStatus,
  VpnCredential,
} from './types';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function getToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY);
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, token);
  else localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
}

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(path, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  const data = text ? (JSON.parse(text) as unknown) : undefined;

  if (!response.ok) {
    const message =
      extractMessage(data) ?? `Request failed (${response.status})`;
    if (response.status === 401) setToken(null);
    throw new ApiError(response.status, message);
  }
  return data as T;
}

function extractMessage(data: unknown): string | null {
  if (data && typeof data === 'object' && 'message' in data) {
    const message = (data as { message: unknown }).message;
    if (Array.isArray(message)) return message.join(', ');
    if (typeof message === 'string') return message;
  }
  return null;
}

export const api = {
  setupStatus: (): Promise<SetupStatus> =>
    request<SetupStatus>(Routes.auth.setup),

  setup: (username: string, password: string): Promise<AuthTokens> =>
    request<AuthTokens>(Routes.auth.setup, {
      method: 'POST',
      body: { username, password },
    }),

  login: (username: string, password: string): Promise<AuthTokens> =>
    request<AuthTokens>(Routes.auth.login, {
      method: 'POST',
      body: { username, password },
    }),

  me: (): Promise<AdminUser> => request<AdminUser>(Routes.auth.me),

  changePassword: (
    currentPassword: string,
    newPassword: string,
  ): Promise<void> =>
    request<void>(Routes.auth.changePassword, {
      method: 'POST',
      body: { currentPassword, newPassword },
    }),

  listCredentials: (
    page: number,
    pageSize: number,
  ): Promise<Paginated<VpnCredential>> =>
    request<Paginated<VpnCredential>>(
      `${Routes.vpn.root}?page=${page}&pageSize=${pageSize}`,
    ),

  createCredential: (
    name: string,
    description: string,
    password?: string,
  ): Promise<{ credential: VpnCredential; profile: string }> =>
    request<{ credential: VpnCredential; profile: string }>(Routes.vpn.root, {
      method: 'POST',
      body: {
        name,
        ...(description ? { description } : {}),
        ...(password ? { password } : {}),
      },
    }),

  renewCredential: (
    id: string,
    password?: string,
  ): Promise<{ credential: VpnCredential; profile: string }> =>
    request<{ credential: VpnCredential; profile: string }>(
      Routes.vpn.renew(id),
      { method: 'POST', body: password ? { password } : {} },
    ),

  revokeCredential: (id: string): Promise<VpnCredential> =>
    request<VpnCredential>(Routes.vpn.revoke(id), { method: 'POST' }),

  downloadProfile: async (id: string, fileName: string): Promise<void> => {
    const token = getToken();
    const response = await fetch(Routes.vpn.download(id), {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!response.ok) {
      throw new ApiError(
        response.status,
        `Download failed (${response.status})`,
      );
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${fileName}.ovpn`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  },

  listAdmins: (): Promise<AdminUser[]> =>
    request<AdminUser[]>(Routes.admins.root),

  createAdmin: (username: string, password: string): Promise<AdminUser> =>
    request<AdminUser>(Routes.admins.root, {
      method: 'POST',
      body: { username, password },
    }),

  deleteAdmin: (id: string): Promise<void> =>
    request<void>(Routes.admins.byId(id), { method: 'DELETE' }),
};
