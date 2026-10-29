import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import type { PublicUser } from './users/user.types.js';

/** 岗位 role 与管理权限分离；权限取自本次查库结果，不能信任前端按钮或旧 JWT。 */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request & { user?: PublicUser }>();
    if (!request.user?.isAdmin) throw new ForbiddenException('此操作需要管理员权限');
    return true;
  }
}
