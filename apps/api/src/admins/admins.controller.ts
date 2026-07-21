import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common';
import { AdminIdParamDto, CreateAdminUserDto } from './admin.dto';
import type { AdminUser } from '../common/types';
import { AdminsService } from './admins.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../common/types';

@Controller('admins')
export class AdminsController {
  constructor(private readonly admins: AdminsService) {}

  @Get()
  list(): AdminUser[] {
    return this.admins.list();
  }

  @Get(':id')
  getById(@Param() params: AdminIdParamDto): AdminUser {
    return this.admins.getById(params.id);
  }

  @Post()
  create(@Body() dto: CreateAdminUserDto): Promise<AdminUser> {
    return this.admins.create(dto);
  }

  @Delete(':id')
  @HttpCode(204)
  delete(
    @Param() params: AdminIdParamDto,
    @CurrentUser() user: JwtPayload,
  ): void {
    this.admins.delete(params.id, user.sub);
  }
}
