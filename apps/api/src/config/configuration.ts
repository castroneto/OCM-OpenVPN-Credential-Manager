import { plainToInstance } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsString,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

export type NodeEnv = 'development' | 'production' | 'test';

/**
 * Strongly-typed, validated application configuration. Loaded once at boot;
 * a missing/weak value aborts startup — no insecure defaults in production.
 */
export class AppConfig {
  @IsIn(['development', 'production', 'test'])
  nodeEnv: NodeEnv = 'development';

  @IsInt()
  @Min(1)
  @Max(65535)
  port = 3000;

  /** Interface the HTTP server binds to. Restrict to the VPN NIC if desired. */
  @IsString()
  @MinLength(1)
  bindAddr = '0.0.0.0';

  /**
   * Directory of the built web console to serve. Empty disables static serving
   * (dev: Vite serves the SPA and proxies /api).
   */
  @IsString()
  webRoot = '';

  @IsString()
  @MinLength(1)
  databasePath = './data/ocm.sqlite';

  @IsString()
  @MinLength(32)
  jwtSecret!: string;

  @IsInt()
  @Min(60)
  jwtTtlSeconds = 1800;

  /** Failed logins allowed before an account is temporarily locked. */
  @IsInt()
  @Min(1)
  loginMaxAttempts = 5;

  /** How long an account stays locked after too many failures (seconds). */
  @IsInt()
  @Min(30)
  loginLockSeconds = 900;

  @IsString()
  @MinLength(1)
  pkiDir = '/etc/openvpn/ocm/pki';

  @IsString()
  @MinLength(1)
  easyRsaBin = '/usr/share/easy-rsa/easyrsa';

  @IsString()
  @MinLength(1)
  openvpnDir = '/etc/openvpn/ocm';

  /**
   * CRL validity in days. The API regenerates the CRL on boot and weekly, so a
   * long window is simply a safety net against expiry-induced outages.
   */
  @IsInt()
  @Min(1)
  crlDays = 3650;
}

function toInt(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : NaN;
}

/** Build and validate config from an environment map. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const config = plainToInstance(AppConfig, {
    nodeEnv: env.NODE_ENV ?? 'development',
    port: toInt(env.OCM_PORT, 3000),
    bindAddr: env.OCM_BIND_ADDR ?? '0.0.0.0',
    webRoot: env.OCM_WEB_ROOT ?? '',
    databasePath: env.OCM_DATABASE_PATH ?? './data/ocm.sqlite',
    jwtSecret: env.OCM_JWT_SECRET ?? '',
    jwtTtlSeconds: toInt(env.OCM_JWT_TTL_SECONDS, 1800),
    loginMaxAttempts: toInt(env.OCM_LOGIN_MAX_ATTEMPTS, 5),
    loginLockSeconds: toInt(env.OCM_LOGIN_LOCK_SECONDS, 900),
    pkiDir: env.OCM_PKI_DIR ?? '/etc/openvpn/ocm/pki',
    easyRsaBin: env.OCM_EASYRSA_BIN ?? '/usr/share/easy-rsa/easyrsa',
    openvpnDir: env.OCM_OPENVPN_DIR ?? '/etc/openvpn/ocm',
    crlDays: toInt(env.OCM_CRL_DAYS, 3650),
  });

  const errors = validateSync(config, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  if (errors.length > 0) {
    const details = errors
      .map((e) => Object.values(e.constraints ?? {}).join(', '))
      .join('; ');
    throw new Error(`Invalid OCM configuration: ${details}`);
  }
  return config;
}
