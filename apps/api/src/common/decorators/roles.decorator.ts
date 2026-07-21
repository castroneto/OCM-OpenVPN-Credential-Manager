import { SetMetadata } from '@nestjs/common';
import { Role } from '../types';

export const ROLES_KEY = 'ocm:roles';

/** Restrict a route to the given role(s). OCM only ever uses ADMIN. */
export const Roles = (...roles: Role[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);
