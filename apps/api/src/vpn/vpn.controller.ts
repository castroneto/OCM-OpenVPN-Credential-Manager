import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  CreateVpnCredentialDto,
  PaginationQueryDto,
  RenewVpnCredentialDto,
  VpnCredentialIdParamDto,
} from './vpn.dto';
import type { Paginated, VpnCredential } from '../common/types';
import { VpnService, type IssuedVpnCredential } from './vpn.service';

@Controller('vpn/credentials')
export class VpnController {
  constructor(private readonly vpn: VpnService) {}

  @Get()
  list(@Query() query: PaginationQueryDto): Paginated<VpnCredential> {
    return this.vpn.list(query);
  }

  @Get(':id')
  getById(@Param() params: VpnCredentialIdParamDto): VpnCredential {
    return this.vpn.getById(params.id);
  }

  @Post()
  create(@Body() dto: CreateVpnCredentialDto): Promise<IssuedVpnCredential> {
    return this.vpn.create(dto);
  }

  @Get(':id/config')
  @Header('Content-Type', 'application/x-openvpn-profile')
  async download(
    @Param() params: VpnCredentialIdParamDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    const { fileName, profile } = await this.vpn.downloadProfile(params.id);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${fileName}.ovpn"`,
    );
    return profile;
  }

  @Post(':id/renew')
  @HttpCode(200)
  renew(
    @Param() params: VpnCredentialIdParamDto,
    @Body() dto: RenewVpnCredentialDto,
  ): Promise<IssuedVpnCredential> {
    return this.vpn.renew(params.id, dto);
  }

  @Post(':id/revoke')
  @HttpCode(200)
  revoke(@Param() params: VpnCredentialIdParamDto): Promise<VpnCredential> {
    return this.vpn.revoke(params.id);
  }
}
