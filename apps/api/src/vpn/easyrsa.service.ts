import { execFile } from 'node:child_process';
import { X509Certificate } from 'node:crypto';
import { readFile } from 'node:fs/promises';
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

  /** Issue a client certificate and return a ready-to-use inline profile. */
  async issueClient(commonName: string): Promise<IssuedCredential> {
    this.assertValidCommonName(commonName);
    return this.serialize(async () => {
      await this.runEasyRsa(['build-client-full', commonName, 'nopass']);
      const profile = await this.buildProfile(commonName);
      const expiresAt = await this.readCertExpiry(commonName);
      return { profile, expiresAt };
    });
  }

  /**
   * Regenerate the CRL to refresh its validity window. Best-effort: if the PKI
   * is not provisioned yet (e.g. dev), it is a no-op; failures are logged but
   * never thrown, so a scheduled refresh can't crash the app.
   */
  async regenerateCrl(): Promise<void> {
    if (!existsSync(join(this.config.pkiDir, 'ca.crt'))) return;
    try {
      await this.serialize(() => this.runEasyRsa(['gen-crl']));
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
   * tls-crypt key. The base template lives at `<openvpnDir>/client-template.ovpn`.
   */
  private async buildProfile(commonName: string): Promise<string> {
    const templatePath = join(this.config.openvpnDir, 'client-template.ovpn');
    if (!existsSync(templatePath)) {
      throw new InternalServerErrorException(
        'client-template.ovpn is missing; run the installer configuration',
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

    const tlsCryptPath = join(this.config.openvpnDir, 'ta.key');
    if (existsSync(tlsCryptPath)) {
      const tlsCrypt = await readFile(tlsCryptPath, 'utf8');
      sections.push(inlineTag('tls-crypt', tlsCrypt.trim()));
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
