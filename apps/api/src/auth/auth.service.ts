import {
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AppConfig } from '../config/configuration';
import { Role, type AuthTokens, type JwtPayload } from '../common/types';
import type { LoginDto } from './auth.dto';
import { AdminsService } from '../admins/admins.service';
import { verifyPassword } from '../common/crypto/password';
import { LoginThrottleService } from './login-throttle.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly admins: AdminsService,
    private readonly jwtService: JwtService,
    private readonly config: AppConfig,
    private readonly throttle: LoginThrottleService,
  ) {}

  async login(dto: LoginDto): Promise<AuthTokens> {
    const lockedFor = this.throttle.retryAfterSeconds(dto.username);
    if (lockedFor > 0) {
      throw new HttpException(
        `Too many failed attempts. Try again in ${lockedFor}s.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const record = this.admins.findRecordByUsername(dto.username);

    // Always run a verification to keep timing uniform between the
    // "unknown user" and "wrong password" cases.
    const hash =
      record?.passwordHash ??
      'scrypt$16384$8$1$00000000000000000000000000000000$00';
    const valid = await verifyPassword(dto.password, hash);

    if (!record || !valid) {
      this.throttle.recordFailure(dto.username);
      throw new UnauthorizedException('Invalid username or password');
    }

    this.throttle.reset(dto.username);

    const payload: JwtPayload = {
      sub: record.id,
      username: record.username,
      role: Role.ADMIN,
    };
    const accessToken = await this.jwtService.signAsync(payload);

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: this.config.jwtTtlSeconds,
    };
  }
}
