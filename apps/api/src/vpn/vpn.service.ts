import { randomBytes, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import {
  VpnCredentialStatus,
  type Paginated,
  type VpnCredential,
} from '../common/types';
import type { CreateVpnCredentialDto, PaginationQueryDto } from './vpn.dto';
import { VpnRepository } from './vpn.repository';
import { EasyRsaService } from './easyrsa.service';

export interface IssuedVpnCredential {
  credential: VpnCredential;
  profile: string;
}

@Injectable()
export class VpnService {
  constructor(
    private readonly repository: VpnRepository,
    private readonly easyRsa: EasyRsaService,
  ) {}

  list(query: PaginationQueryDto): Paginated<VpnCredential> {
    const offset = (query.page - 1) * query.pageSize;
    const { items, total } = this.repository.listPage(query.pageSize, offset);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  getById(id: string): VpnCredential {
    const credential = this.repository.findById(id);
    if (!credential) throw new NotFoundException('Credential not found');
    return credential;
  }

  async create(dto: CreateVpnCredentialDto): Promise<IssuedVpnCredential> {
    // A name can be reused once its previous credential is revoked; only an
    // ACTIVE credential with the same name is a conflict.
    if (this.repository.findActiveByName(dto.name)) {
      throw new ConflictException(
        'An active credential with this name already exists',
      );
    }

    // Derive a globally-unique PKI Common Name from the reusable label, so a
    // revoked "alice" stays in the CRL while a new "alice" gets a fresh cert.
    const commonName = this.uniqueCommonName(dto.name);
    const issued = await this.easyRsa.issueClient(commonName);

    const id = randomUUID();
    this.repository.insert({
      id,
      name: dto.name,
      commonName,
      description: dto.description ?? null,
      createdAt: new Date().toISOString(),
      expiresAt: issued.expiresAt,
    });

    return { credential: this.getById(id), profile: issued.profile };
  }

  /** `<name>-<6 hex>`, retried on the astronomically unlikely collision. */
  private uniqueCommonName(name: string): string {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = `${name}-${randomBytes(3).toString('hex')}`;
      if (!this.repository.findByCommonName(candidate)) return candidate;
    }
    throw new InternalServerErrorException(
      'Could not allocate a unique common name',
    );
  }

  async downloadProfile(
    id: string,
  ): Promise<{ fileName: string; profile: string }> {
    const credential = this.getById(id);
    if (credential.status === VpnCredentialStatus.REVOKED) {
      throw new BadRequestException('Credential has been revoked');
    }
    const profile = await this.easyRsa.getProfile(credential.commonName);
    return { fileName: credential.name, profile };
  }

  async revoke(id: string): Promise<VpnCredential> {
    const credential = this.getById(id);
    if (credential.status === VpnCredentialStatus.REVOKED) {
      throw new BadRequestException('Credential is already revoked');
    }
    await this.easyRsa.revokeClient(credential.commonName);
    this.repository.markRevoked(id, new Date().toISOString());
    return this.getById(id);
  }
}
