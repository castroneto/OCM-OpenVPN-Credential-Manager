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
 * Printable characters only — no control characters, and crucially no newline.
 *
 * The passphrase is delivered to `openssl` on stdin, which reads a single line:
 * anything after a newline is silently dropped, so "a\nb" would encrypt the key
 * with just "a", and a leading newline would encrypt it with an EMPTY
 * passphrase while the credential still reports itself as password-protected.
 * Rejecting the input is the only way to keep the flag honest.
 */
const PASSPHRASE_PATTERN = /^[^\p{Cc}]+$/u;
const PASSPHRASE_MESSAGE =
  'password must not contain line breaks or control characters';

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

  /**
   * Optional passphrase to encrypt the client's private key. Never persisted
   * or logged — piped straight to `openssl` over stdin (see EasyRsaService)
   * and discarded. If omitted, the key ships unencrypted (`nopass`), as before.
   */
  @IsOptional()
  @IsString()
  @Length(8, 128)
  @Matches(PASSPHRASE_PATTERN, { message: PASSPHRASE_MESSAGE })
  password?: string;
}

/**
 * Body used to renew a credential. The name and description are inherited from
 * the credential being replaced; only the key passphrase can be chosen anew,
 * since it is never stored and so cannot be carried over.
 */
export class RenewVpnCredentialDto {
  @IsOptional()
  @IsString()
  @Length(8, 128)
  @Matches(PASSPHRASE_PATTERN, { message: PASSPHRASE_MESSAGE })
  password?: string;
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
