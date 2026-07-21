import { IsString, Length, Matches } from 'class-validator';

/** Credentials submitted at login. */
export class LoginDto {
  @IsString()
  @Length(3, 64)
  @Matches(/^[a-zA-Z0-9._-]+$/, {
    message:
      'username must contain only letters, numbers, dot, underscore or dash',
  })
  username!: string;

  @IsString()
  @Length(8, 128)
  password!: string;
}

/** Body used by an admin to rotate their own password. */
export class ChangePasswordDto {
  @IsString()
  @Length(8, 128)
  currentPassword!: string;

  @IsString()
  @Length(12, 128)
  newPassword!: string;
}
