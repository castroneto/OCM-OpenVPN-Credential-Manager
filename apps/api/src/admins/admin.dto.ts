import { IsString, IsUUID, Length, Matches } from 'class-validator';

/** Body used to create a new panel admin from the web console. */
export class CreateAdminUserDto {
  @IsString()
  @Length(3, 64)
  @Matches(/^[a-zA-Z0-9._-]+$/, {
    message:
      'username must contain only letters, numbers, dot, underscore or dash',
  })
  username!: string;

  @IsString()
  @Length(12, 128)
  password!: string;
}

/** Route param `:id` for an admin user. Never accept a raw `:id`. */
export class AdminIdParamDto {
  @IsUUID('4')
  id!: string;
}
