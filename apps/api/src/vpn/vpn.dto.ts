import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Body used to issue a new OpenVPN credential. `name` is a reusable human label
 * — the service derives a unique PKI Common Name from it (name + random
 * suffix), so a name can be reused after its previous credential is revoked.
 *
 * The strict pattern is a second line of defence: the derived CN is passed to
 * easy-rsa via an `execFile` argument array, never interpolated into a shell.
 * Length is capped at 56 to leave room for the "-xxxxxx" suffix (CN max 64).
 */
export class CreateVpnCredentialDto {
  @IsString()
  @Length(1, 56)
  @Matches(/^[a-z0-9][a-z0-9._-]{0,55}$/, {
    message:
      'name must be lowercase alphanumeric and may contain dot, underscore or dash',
  })
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;
}

/** Route param `:id` for a VPN credential. */
export class VpnCredentialIdParamDto {
  @IsUUID('4')
  id!: string;
}

/** List query params. Rejects `?page=abc` via transform + `@IsInt`. */
export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20;
}
