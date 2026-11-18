import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import type { PublicUser } from './users/user.types.js';

import { requireToolContext, type ToolContext } from './jwt-auth.guard.js';
import type { UsersService } from './users/users.service.js';

export async function isCurrentAdmin(context: ToolContext | undefined, users: UsersService): Promise<boolean> {
  requireToolContext(context);
  const actor = await users.findById(context.userId);
  if (!actor || actor.status !== 'active') throw new UnauthorizedException('登录状态已失效');
  return context.isAdmin && actor.isAdmin;
}

export function requireAdmin(isAdmin: boolean | undefined): void {
  if (isAdmin !== true) throw new ForbiddenException('此操作需要管理员权限');
}

/** 岗位 role 与管理权限分离；权限取自本次查库结果，不能信任前端按钮或旧 JWT。 */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request & { user?: PublicUser }>();
    requireAdmin(request.user?.isAdmin);
    return true;
  }
}
