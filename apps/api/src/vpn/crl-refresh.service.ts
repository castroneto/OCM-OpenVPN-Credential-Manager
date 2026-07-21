import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EasyRsaService } from './easyrsa.service';

/**
 * Keeps the OpenVPN CRL fresh so it never expires and locks out every client.
 *
 * The CRL is regenerated once at startup and weekly thereafter. OpenVPN 2.4+
 * re-reads `crl.pem` on each new connection, so no server reload is needed and
 * active connections are untouched.
 */
@Injectable()
export class CrlRefreshService implements OnApplicationBootstrap {
  private readonly logger = new Logger(CrlRefreshService.name);

  constructor(private readonly easyRsa: EasyRsaService) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.easyRsa.regenerateCrl();
  }

  @Cron(CronExpression.EVERY_WEEK)
  async refresh(): Promise<void> {
    this.logger.log('Scheduled CRL refresh');
    await this.easyRsa.regenerateCrl();
  }
}
