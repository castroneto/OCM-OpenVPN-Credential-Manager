/** API route paths (mirror of the NestJS controllers). */

const API = 'api';

export const Routes = {
  auth: {
    setup: `/${API}/auth/setup`,
    login: `/${API}/auth/login`,
    me: `/${API}/auth/me`,
    changePassword: `/${API}/auth/password`,
  },
  admins: {
    root: `/${API}/admins`,
    byId: (id: string) => `/${API}/admins/${id}`,
  },
  vpn: {
    root: `/${API}/vpn/credentials`,
    download: (id: string) => `/${API}/vpn/credentials/${id}/config`,
    revoke: (id: string) => `/${API}/vpn/credentials/${id}/revoke`,
  },
  health: `/${API}/health`,
} as const;

export const ACCESS_TOKEN_STORAGE_KEY = 'ocm.accessToken';
