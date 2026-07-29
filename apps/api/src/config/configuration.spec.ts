import { loadConfig } from './configuration';

const SECRET = 'a'.repeat(32);

describe('loadConfig', () => {
  it('applies defaults with a valid secret', () => {
    const config = loadConfig({ OCM_JWT_SECRET: SECRET });
    expect(config.port).toBe(3000);
    expect(config.bindAddr).toBe('0.0.0.0');
    expect(config.jwtTtlSeconds).toBe(1800);
    expect(config.loginMaxAttempts).toBe(5);
    expect(config.crlDays).toBe(3650);
    expect(config.nodeEnv).toBe('development');
  });

  it('rejects a missing or too-short JWT secret', () => {
    expect(() => loadConfig({})).toThrow(/Invalid OCM configuration/);
    expect(() => loadConfig({ OCM_JWT_SECRET: 'short' })).toThrow(
      /Invalid OCM configuration/,
    );
  });

  it('parses numeric env vars and rejects non-integers', () => {
    const config = loadConfig({
      OCM_JWT_SECRET: SECRET,
      OCM_PORT: '8080',
      OCM_CRL_DAYS: '90',
      OCM_LOGIN_MAX_ATTEMPTS: '3',
    });
    expect(config.port).toBe(8080);
    expect(config.crlDays).toBe(90);
    expect(config.loginMaxAttempts).toBe(3);

    expect(() =>
      loadConfig({ OCM_JWT_SECRET: SECRET, OCM_PORT: 'abc' }),
    ).toThrow(/Invalid OCM configuration/);
  });

  it('defaults the control channel to tls-crypt with derived paths', () => {
    const config = loadConfig({ OCM_JWT_SECRET: SECRET });
    expect(config.tlsMode).toBe('tls-crypt');
    expect(config.tlsKeyPath).toBe('');
    expect(config.clientTemplatePath).toBe('');
  });

  it('accepts every supported TLS mode and rejects anything else', () => {
    for (const mode of ['tls-crypt', 'tls-auth', 'none']) {
      expect(
        loadConfig({ OCM_JWT_SECRET: SECRET, OCM_TLS_MODE: mode }).tlsMode,
      ).toBe(mode);
    }
    expect(() =>
      loadConfig({ OCM_JWT_SECRET: SECRET, OCM_TLS_MODE: 'tls-none' }),
    ).toThrow(/Invalid OCM configuration/);
  });

  it('rejects an invalid NODE_ENV', () => {
    expect(() =>
      loadConfig({ OCM_JWT_SECRET: SECRET, NODE_ENV: 'staging' }),
    ).toThrow(/Invalid OCM configuration/);
  });
});
