import { execFile } from 'node:child_process';
import { X509Certificate } from 'node:crypto';
import { chmod, readFile, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { AppConfig } from '../config/configuration';

const execFileAsync = promisify(execFile);

/** Second-line-of-defence CN guard (the DTO is the first). */
const COMMON_NAME_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;

export interface IssuedCredential {
  /** Full inline `.ovpn` profile ready to hand to a client. */
  profile: string;
  /** Certificate expiry as ISO string, if derivable. */
  expiresAt: string | null;
}

/**
 * Thin, safe wrapper around easy-rsa / OpenVPN PKI tooling.
 *
 * SECURITY: every external process is invoked with {@link execFile} and an
 * explicit argument array — never a shell, never `exec`, never string
 * interpolation. Common names are re-validated here before use.
 */
@Injectable()
export class EasyRsaService {
  private readonly logger = new Logger(EasyRsaService.name);
  /** easy-rsa mutates a shared PKI; serialise all operations. */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly config: AppConfig) {}

  private assertValidCommonName(commonName: string): void {
    if (!COMMON_NAME_PATTERN.test(commonName) || commonName.includes('..')) {
      throw new InternalServerErrorException('Invalid common name');
    }
  }

  private serialize<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    // Keep the chain alive regardless of individual task outcome.
    this.queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private easyRsaEnv(): NodeJS.ProcessEnv {
    return {
      ...process.env,
      EASYRSA_PKI: this.config.pkiDir,
      EASYRSA_BATCH: '1',
      EASYRSA_CRL_DAYS: String(this.config.crlDays),
    };
  }

  /** Base `.ovpn` template; defaults to one inside the OpenVPN directory. */
  private get clientTemplatePath(): string {
    return (
      this.config.clientTemplatePath ||
      join(this.config.openvpnDir, 'client-template.ovpn')
    );
  }

  /** Control-channel key; defaults to `ta.key` in the OpenVPN directory. */
  private get tlsKeyPath(): string {
    return this.config.tlsKeyPath || join(this.config.openvpnDir, 'ta.key');
  }

  /**
   * Keep `crl.pem` world-readable.
   *
   * OpenVPN re-reads the CRL on every connection, but by then it has dropped to
   * an unprivileged user (`user nobody`), while easy-rsa writes the file with
   * `umask 077`. Left alone, a refresh makes the server unable to read its own
   * CRL and it rejects *every* client. A CRL is public data, so widening it is
   * safe. Best-effort: never let this break a revoke.
   */
  private async ensureCrlReadable(): Promise<void> {
    const crlPath = join(this.config.pkiDir, 'crl.pem');
    if (!existsSync(crlPath)) return;
    try {
      await chmod(crlPath, 0o644);
    } catch (err) {
      this.logger.warn(
        `Could not relax crl.pem permissions: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async runEasyRsa(args: string[]): Promise<void> {
    try {
      await execFileAsync(this.config.easyRsaBin, args, {
        cwd: this.config.openvpnDir,
        env: this.easyRsaEnv(),
        timeout: 120_000,
        maxBuffer: 4 * 1024 * 1024,
      });
    } catch (err) {
      this.logger.error(
        `easyrsa ${args[0]} failed`,
        err instanceof Error ? err.message : String(err),
      );
      throw new InternalServerErrorException('PKI operation failed');
    }
  }

  /**
   * Issue a client certificate and return a ready-to-use inline profile.
   *
   * The key is always generated `nopass` first (keeps easy-rsa's batch mode
   * deterministic — it has no non-interactive way to set a passphrase
   * itself), then re-encrypted in place with `openssl` when a password is
   * given. The passphrase is piped over stdin, never argv or an env var, so
   * it never appears in `ps` output or process logs.
   */
  async issueClient(
    commonName: string,
    password?: string,
  ): Promise<IssuedCredential> {
    this.assertValidCommonName(commonName);
    return this.serialize(async () => {
      await this.runEasyRsa(['build-client-full', commonName, 'nopass']);
      if (password) {
        await this.encryptPrivateKey(commonName, password);
      }
      const profile = await this.buildProfile(commonName);
      const expiresAt = await this.readCertExpiry(commonName);
      return { profile, expiresAt };
    });
  }

  /** Encrypt an already-issued private key in place with an AES-256 passphrase. */
  private async encryptPrivateKey(
    commonName: string,
    password: string,
  ): Promise<void> {
    const keyPath = join(this.config.pkiDir, 'private', `${commonName}.key`);
    const tmpPath = `${keyPath}.tmp`;
    try {
      const run = execFileAsync(
        'openssl',
        [
          'pkey',
          '-in',
          keyPath,
          '-out',
          tmpPath,
          '-aes256',
          '-passout',
          'stdin',
        ],
        { timeout: 30_000 },
      );
      run.child.stdin?.end(`${password}\n`);
      await run;
    } catch (err) {
      this.logger.error(
        'openssl key encryption failed',
        err instanceof Error ? err.message : String(err),
      );
      throw new InternalServerErrorException('PKI operation failed');
    }
    await rename(tmpPath, keyPath);
  }

  /**
   * Regenerate the CRL to refresh its validity window. Best-effort: if the PKI
   * is not provisioned yet (e.g. dev), it is a no-op; failures are logged but
   * never thrown, so a scheduled refresh can't crash the app.
   */
  async regenerateCrl(): Promise<void> {
    if (!existsSync(join(this.config.pkiDir, 'ca.crt'))) return;
    try {
      await this.serialize(async () => {
        await this.runEasyRsa(['gen-crl']);
        await this.ensureCrlReadable();
      });
      this.logger.log('CRL regenerated');
    } catch (err) {
      this.logger.warn(
        `CRL regeneration failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /** Revoke a client certificate and regenerate the CRL. */
  async revokeClient(commonName: string): Promise<void> {
    this.assertValidCommonName(commonName);
    await this.serialize(async () => {
      await this.runEasyRsa(['revoke', commonName]);
      await this.runEasyRsa(['gen-crl']);
      await this.ensureCrlReadable();
    });
  }

  /** Rebuild the inline profile for an already-issued client. */
  async getProfile(commonName: string): Promise<string> {
    this.assertValidCommonName(commonName);
    return this.serialize(() => this.buildProfile(commonName));
  }

  private async readPki(relativePath: string): Promise<string> {
    const full = join(this.config.pkiDir, relativePath);
    if (!existsSync(full)) {
      throw new InternalServerErrorException(
        `Required PKI file missing: ${relativePath}`,
      );
    }
    return readFile(full, 'utf8');
  }

  private async readCertExpiry(commonName: string): Promise<string | null> {
    try {
      const pem = await this.readPki(join('issued', `${commonName}.crt`));
      const cert = new X509Certificate(pem);
      const validTo = new Date(cert.validTo);
      return Number.isNaN(validTo.getTime()) ? null : validTo.toISOString();
    } catch {
      return null;
    }
  }

  /**
   * Assemble the inline `.ovpn`: base template + CA + client cert/key +
   * control-channel key. The template defaults to
   * `<openvpnDir>/client-template.ovpn` and mirrors the managed server.
   */
  private async buildProfile(commonName: string): Promise<string> {
    const templatePath = this.clientTemplatePath;
    if (!existsSync(templatePath)) {
      throw new InternalServerErrorException(
        `Client template is missing at ${templatePath}; run the installer configuration`,
      );
    }

    const [template, ca, cert, key] = await Promise.all([
      readFile(templatePath, 'utf8'),
      this.readPki('ca.crt'),
      this.readPki(join('issued', `${commonName}.crt`)),
      this.readPki(join('private', `${commonName}.key`)),
    ]);

    // Extract only the certificate block to keep the profile clean.
    const certBlock = extractPemBlock(cert, 'CERTIFICATE') ?? cert.trim();

    const sections = [
      template.trim(),
      inlineTag('ca', ca.trim()),
      inlineTag('cert', certBlock),
      inlineTag('key', key.trim()),
    ];

    // Control channel. `tls-auth` is directional — the client side is always
    // key-direction 1 — whereas `tls-crypt` has no direction at all.
    const { tlsMode } = this.config;
    if (tlsMode !== 'none' && existsSync(this.tlsKeyPath)) {
      const tlsKey = await readFile(this.tlsKeyPath, 'utf8');
      if (tlsMode === 'tls-auth') sections.push('key-direction 1');
      sections.push(inlineTag(tlsMode, tlsKey.trim()));
    }

    return sections.join('\n\n') + '\n';
  }
}

function inlineTag(tag: string, body: string): string {
  return `<${tag}>\n${body}\n</${tag}>`;
}

function extractPemBlock(pem: string, label: string): string | null {
  const begin = `-----BEGIN ${label}-----`;
  const end = `-----END ${label}-----`;
  const start = pem.indexOf(begin);
  const stop = pem.indexOf(end);
  if (start === -1 || stop === -1) return null;
  return pem.slice(start, stop + end.length);
}
