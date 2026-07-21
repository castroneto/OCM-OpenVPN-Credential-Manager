import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'ocm:isPublic';

/** Marks a route as accessible without authentication. */
export const Public = (): MethodDecorator & ClassDecorator =>
  SetMetadata(IS_PUBLIC_KEY, true);
