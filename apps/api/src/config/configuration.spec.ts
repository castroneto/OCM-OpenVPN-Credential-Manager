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

  it('rejects an invalid NODE_ENV', () => {
    expect(() =>
      loadConfig({ OCM_JWT_SECRET: SECRET, NODE_ENV: 'staging' }),
    ).toThrow(/Invalid OCM configuration/);
  });
});
