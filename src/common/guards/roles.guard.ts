import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { Role } from '../../generated/prisma/client';
import { AuthUser } from '../types/auth-user';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthUser }>();
    const user: AuthUser | undefined = request.user;
    if (!user) {
      throw new ForbiddenException('Authentication required');
    }
    if (!user.role) {
      throw new ForbiddenException('Account has no role assigned');
    }
    const isAdmin = user.role === Role.ADMIN;
    if (isAdmin || requiredRoles.includes(user.role)) {
      return true;
    }
    throw new ForbiddenException(
      `Requires one of the following roles: ${requiredRoles.join(', ')}`,
    );
  }
}
