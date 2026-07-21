import { Module } from '@nestjs/common';
import { VpnController } from './vpn.controller';
import { VpnService } from './vpn.service';
import { VpnRepository } from './vpn.repository';
import { EasyRsaService } from './easyrsa.service';
import { CrlRefreshService } from './crl-refresh.service';

@Module({
  controllers: [VpnController],
  providers: [VpnService, VpnRepository, EasyRsaService, CrlRefreshService],
})
export class VpnModule {}
