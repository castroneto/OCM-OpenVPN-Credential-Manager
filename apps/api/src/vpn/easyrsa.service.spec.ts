import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EasyRsaService } from './easyrsa.service';
import { AppConfig, type TlsMode } from '../config/configuration';

/**
 * Profile assembly is pure file I/O — no easy-rsa binary is involved — so a
 * throwaway PKI on disk exercises it faithfully.
 */
function setup(over: Partial<AppConfig> = {}) {
  const root = mkdtempSync(join(tmpdir(), 'ocm-pki-'));
  const pkiDir = join(root, 'pki');
  mkdirSync(join(pkiDir, 'issued'), { recursive: true });
  mkdirSync(join(pkiDir, 'private'), { recursive: true });

  writeFileSync(join(pkiDir, 'ca.crt'), 'CA-PEM');
  writeFileSync(
    join(pkiDir, 'issued', 'alice-abc123.crt'),
    '-----BEGIN CERTIFICATE-----\nCERT\n-----END CERTIFICATE-----',
  );
  writeFileSync(join(pkiDir, 'private', 'alice-abc123.key'), 'KEY-PEM');
  writeFileSync(join(root, 'client-template.ovpn'), 'client\ndev tun');
  writeFileSync(join(root, 'ta.key'), 'TA-KEY');

  const config = Object.assign(new AppConfig(), {
    pkiDir,
    openvpnDir: root,
    ...over,
  });
  return { service: new EasyRsaService(config), root };
}

describe('EasyRsaService.getProfile', () => {
  const dirs: string[] = [];
  afterAll(() => {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  });

  function build(over: Partial<AppConfig> = {}): Promise<string> {
    const { service, root } = setup(over);
    dirs.push(root);
    return service.getProfile('alice-abc123');
  }

  it('inlines the template, CA, certificate and key', async () => {
    const profile = await build({ tlsMode: 'none' });
    expect(profile).toContain('client\ndev tun');
    expect(profile).toContain('<ca>\nCA-PEM\n</ca>');
    expect(profile).toContain('<cert>');
    expect(profile).toContain('<key>\nKEY-PEM\n</key>');
  });

  it('emits a tls-crypt block with no key-direction', async () => {
    const profile = await build({ tlsMode: 'tls-crypt' });
    expect(profile).toContain('<tls-crypt>\nTA-KEY\n</tls-crypt>');
    expect(profile).not.toContain('key-direction');
  });

  it('emits tls-auth with key-direction 1 (the client side)', async () => {
    const profile = await build({ tlsMode: 'tls-auth' });
    expect(profile).toContain('key-direction 1');
    expect(profile).toContain('<tls-auth>\nTA-KEY\n</tls-auth>');
    expect(profile).not.toContain('<tls-crypt>');
  });

  it('omits the control-channel block entirely when disabled', async () => {
    const profile = await build({ tlsMode: 'none' });
    expect(profile).not.toContain('tls-crypt');
    expect(profile).not.toContain('tls-auth');
  });

  it('honours explicit template and TLS key paths outside the OpenVPN dir', async () => {
    const external = mkdtempSync(join(tmpdir(), 'ocm-ext-'));
    dirs.push(external);
    const templatePath = join(external, 'custom.ovpn');
    const keyPath = join(external, 'custom-ta.key');
    writeFileSync(templatePath, 'client\nremote vpn.example.com 1194');
    writeFileSync(keyPath, 'EXTERNAL-TA');

    const profile = await build({
      tlsMode: 'tls-auth',
      clientTemplatePath: templatePath,
      tlsKeyPath: keyPath,
    });

    expect(profile).toContain('remote vpn.example.com 1194');
    expect(profile).toContain('<tls-auth>\nEXTERNAL-TA\n</tls-auth>');
  });

  it('fails clearly when the template is missing', async () => {
    const { service, root } = setup({
      clientTemplatePath: join(tmpdir(), 'ocm-does-not-exist.ovpn'),
    });
    dirs.push(root);
    await expect(service.getProfile('alice-abc123')).rejects.toThrow(
      /template is missing/i,
    );
  });

  it.each<TlsMode>(['tls-crypt', 'tls-auth'])(
    'skips the %s block when the key file is absent',
    async (tlsMode) => {
      const profile = await build({
        tlsMode,
        tlsKeyPath: join(tmpdir(), 'ocm-no-such-ta.key'),
      });
      expect(profile).not.toContain(`<${tlsMode}>`);
    },
  );
});
