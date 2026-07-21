import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ChangePasswordDto, LoginDto } from './auth.dto';
import { CreateAdminUserDto } from '../admins/admin.dto';
import type {
  AdminUser,
  AuthTokens,
  JwtPayload,
  SetupStatus,
} from '../common/types';
import { AuthService } from './auth.service';
import { AdminsService } from '../admins/admins.service';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly admins: AdminsService,
  ) {}

  /** First-run: whether the initial admin still needs to be created. */
  @Public()
  @Get('setup')
  setupStatus(): SetupStatus {
    return { needsSetup: !this.admins.hasAny() };
  }

  /** First-run: create the initial admin and log in. Rejected once one exists. */
  @Public()
  @Post('setup')
  @HttpCode(201)
  async setup(@Body() dto: CreateAdminUserDto): Promise<AuthTokens> {
    await this.admins.createFirstAdmin(dto);
    return this.auth.login({ username: dto.username, password: dto.password });
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto): Promise<AuthTokens> {
    return this.auth.login(dto);
  }

  @Get('me')
  me(@CurrentUser() user: JwtPayload): AdminUser {
    return this.admins.getById(user.sub);
  }

  @Post('password')
  @HttpCode(204)
  async changePassword(
    @CurrentUser() user: JwtPayload,
    @Body() dto: ChangePasswordDto,
  ): Promise<void> {
    await this.admins.changePassword(
      user.sub,
      dto.currentPassword,
      dto.newPassword,
    );
  }
}
